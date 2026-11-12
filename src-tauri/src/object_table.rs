use std::{fs, path::{Path, PathBuf}, sync::Mutex};
static WRITER: Mutex<()> = Mutex::new(());
const LIMIT: u64 = 256 * 1024 * 1024;
fn checked(path: &str, extensions: &[&str]) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
    if !p.is_absolute() || !extensions.contains(&ext.as_str()) { return Err("不支持的物编文件路径".into()); }
    Ok(p)
}
fn validate(text: &str) -> Result<(), String> {
    if text.len() as u64 > LIMIT { return Err("物编文件超过 256MB".into()); }
    let v: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if v["format"] != "war3-objects" || (v["version"] != 1 && v["version"] != 2 && v["version"] != 3) || !v["sheets"].is_object() { return Err("无效的物编文件".into()); }
    Ok(())
}
pub(crate) fn atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let pending = path.with_extension(format!("{}.pending", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&pending).map_err(|e| e.to_string())?;
        file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&pending, path).map_err(|e| e.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&pending); }
    result
}
#[tauri::command]
pub fn object_read_file(path: String) -> Result<tauri::ipc::Response, String> {
    let path = checked(&path, &["xlsx", "xlsm", "war3objects"])?;
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > LIMIT { return Err("物编文件超过 256MB".into()); }
    Ok(tauri::ipc::Response::new(fs::read(path).map_err(|e| e.to_string())?))
}
#[tauri::command]
pub fn object_save_file(path: String, text: String) -> Result<(), String> {
    let _guard = WRITER.lock().map_err(|e| e.to_string())?;
    validate(&text)?; atomic(&checked(&path, &["war3objects"])?, text.as_bytes())
}
#[tauri::command]
pub fn object_read_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = crate::app_data::directory(&app)?.join("object-table/workspace.json");
    if !path.exists() { return Ok(None); }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > LIMIT { return Err("物编恢复文件过大".into()); }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn object_write_workspace(app: tauri::AppHandle, text: String) -> Result<(), String> {
    let _guard = WRITER.lock().map_err(|e| e.to_string())?;
    validate_workspace(&text)?;
    let dir = crate::app_data::directory(&app)?.join("object-table");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("workspace.json");
    if path.exists() { fs::copy(&path, dir.join("workspace.backup.json")).map_err(|e| e.to_string())?; }
    atomic(&path, text.as_bytes())
}
fn validate_workspace(text: &str) -> Result<(), String> {
    if text.len() as u64 > LIMIT { return Err("物编恢复文件过大".into()); }
    let v: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if v["format"] == "war3-object-workspace" && v["version"] == 2 {
        let tasks = v["tasks"].as_array().ok_or("无效的物编任务列表")?;
        if tasks.len() > 100 { return Err("物编任务数量过多".into()); }
        for task in tasks { validate(&task["project"].to_string())?; }
    } else { validate(&v["project"].to_string())?; }
    Ok(())
}
#[derive(serde::Deserialize)]
pub struct MacroFile { name: String, text: String }
#[tauri::command]
pub fn object_export(directory: String, files: Vec<MacroFile>, overwrite: bool) -> Result<Vec<String>, String> {
    let _guard = WRITER.lock().map_err(|e| e.to_string())?;
    let dir = PathBuf::from(directory);
    if !dir.is_absolute() || !dir.is_dir() { return Err("请选择有效的导出目录".into()); }
    let allowed = ["Xm_item.lua", "Xm_unit.lua", "Xm_ability.lua", "Xm_upgrade.lua", "Xm_doodad.lua", "Xm_buff.lua"];
    let mut names = std::collections::HashSet::new();
    for f in &files { if !allowed.contains(&f.name.as_str()) || !names.insert(&f.name) || f.text.len() as u64 > LIMIT { return Err("无效的宏导出文件".into()); } }
    let existing: Vec<String> = files.iter().filter(|f| dir.join(&f.name).exists()).map(|f| f.name.clone()).collect();
    if !overwrite && !existing.is_empty() { return Ok(existing); }
    let mut written = Vec::new();
    for f in files {
        atomic(&dir.join(&f.name), f.text.as_bytes()).map_err(|e| format!("已写入 {}；{} 失败：{}", written.join("、"), f.name, e))?;
        written.push(f.name);
    }
    Ok(Vec::new())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn validates_extensions_and_document() {
        assert!(checked("relative.xlsx", &["xlsx"]).is_err());
        assert!(checked("C:/test.exe", &["xlsx"]).is_err());
        assert!(validate("{}").is_err());
        assert!(validate(r#"{"format":"war3-objects","version":1,"sheets":{}}"#).is_ok());
    }
    #[test] fn atomic_replaces_existing() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results").join(format!("box-objects-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap(); let path = dir.join("test.war3objects");
        atomic(&path, b"old").unwrap(); atomic(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new"); fs::remove_dir_all(dir).unwrap();
    }
    #[test] fn accepts_supported_workbooks_in_current_and_legacy_workspaces() {
        for version in [1, 2, 3] {
            let project = serde_json::json!({ "format": "war3-objects", "version": version, "sheets": {} });
            assert!(validate(&project.to_string()).is_ok());
            assert!(validate_workspace(&serde_json::json!({ "project": project }).to_string()).is_ok());
            assert!(validate_workspace(&serde_json::json!({ "format": "war3-object-workspace", "version": 2, "tasks": [{ "project": project }] }).to_string()).is_ok());
        }
        for project in [
            serde_json::json!({ "format": "war3-objects", "version": 4, "sheets": {} }),
            serde_json::json!({ "format": "other", "version": 3, "sheets": {} }),
            serde_json::json!({ "format": "war3-objects", "version": 3, "sheets": [] }),
        ] {
            assert!(validate(&project.to_string()).is_err());
            assert!(validate_workspace(&serde_json::json!({ "format": "war3-object-workspace", "version": 2, "tasks": [{ "project": project }] }).to_string()).is_err());
        }
        assert!(validate_workspace(r#"{"format":"war3-object-workspace","version":2,"tasks":{}}"#).is_err());
        assert!(validate_workspace(&serde_json::json!({ "format": "war3-object-workspace", "version": 2, "tasks": vec![serde_json::json!({}); 101] }).to_string()).is_err());
    }
    #[test] fn saves_v3_colored_text_and_variables_without_losing_bytes() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results").join(format!("box-object-v3-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("colors.war3objects");
        let text = serde_json::json!({ "format": "war3-objects", "version": 3, "sheets": { "item": { "rows": [{ "cells": { "item:D": "|cffffff00无色神光|r" } }] } }, "variables": { "rows": [], "baseline": [] } }).to_string();
        object_save_file(path.to_string_lossy().into_owned(), text.clone()).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
        let invalid = text.replace("\"version\":3", "\"version\":4");
        assert!(object_save_file(path.to_string_lossy().into_owned(), invalid).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test] fn export_conflicts_validation_and_partial_failure() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results").join(format!("box-object-export-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap(); let directory = dir.to_string_lossy().to_string();
        let files = || vec![MacroFile { name: "Xm_item.lua".into(), text: "first".into() }];
        assert!(object_export(directory.clone(), files(), false).unwrap().is_empty());
        assert_eq!(object_export(directory.clone(), files(), false).unwrap(), vec!["Xm_item.lua"]);
        assert!(object_export(directory.clone(), files(), true).unwrap().is_empty());
        assert!(object_export(directory.clone(), vec![MacroFile { name: "../outside.lua".into(), text: "bad".into() }], true).is_err());
        fs::create_dir(dir.join("Xm_unit.lua")).unwrap();
        let mut partial = files(); partial.push(MacroFile { name: "Xm_unit.lua".into(), text: "new".into() });
        let error = object_export(directory, partial, true).unwrap_err();
        assert!(error.contains("Xm_item.lua") && error.contains("Xm_unit.lua"));
        assert_eq!(fs::read(dir.join("Xm_item.lua")).unwrap(), b"first"); fs::remove_dir_all(dir).unwrap();
    }
}
