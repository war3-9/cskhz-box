use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}, sync::Mutex};
use sha2::{Digest, Sha256};
pub static IO: Mutex<()> = Mutex::new(());
const FILES: [&str; 3] = ["workspace.json", "workspace.backup.json", "workspace.pending.json"];
fn valid_id(id: &str) -> bool { id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit()) }
fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> { Ok(crate::app_data::directory(app)?.join("workspace-recovery")) }
fn regular(path: &Path, directory: bool) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 { return Err("恢复路径不能使用重解析链接".into()); }
    }
    if metadata.file_type().is_symlink() || metadata.is_dir() != directory || (!directory && !metadata.is_file()) { return Err("恢复路径类型无效".into()); }
    Ok(())
}
fn preserve_at(base: &Path) -> Result<String, String> {
    let mut entries = Vec::new(); let mut digest = Sha256::new();
    for name in FILES {
        if base.join(name).exists() { regular(&base.join(name), false)?; }
        match fs::read(base.join(name)) {
            Ok(bytes) => { digest.update(name); digest.update((bytes.len() as u64).to_le_bytes()); digest.update(&bytes); entries.push((name, bytes)); }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
            Err(e) => return Err(format!("保全 {name} 失败：{e}")),
        }
    }
    let id = format!("{:x}", digest.finalize());
    let recovery = base.join("workspace-recovery");
    if recovery.exists() { regular(&recovery, true)?; }
    let directory = recovery.join(id);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    regular(&directory, true)?;
    let verified = directory.join("verified").exists();
    for (name, bytes) in entries {
        let target = directory.join(name);
        if target.exists() {
            regular(&target, false)?;
            if fs::read(&target).map_err(|e|e.to_string())? != bytes && !verified {
                // Retain an interrupted write rather than destroying any recovery bytes.
                fs::rename(&target, directory.join(format!("{name}.interrupted-{}", uuid::Uuid::new_v4()))).map_err(|e|e.to_string())?;
            }
        }
        if !target.exists() {
            let mut file = OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e| e.to_string())?;
            file.write_all(&bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
        }
        if fs::read(&target).map_err(|e| e.to_string())? != bytes { return Err("恢复副本逐字节核验失败，保留原工作区".into()); }
    }
    let marker = directory.join("verified");
    if marker.exists() { regular(&marker, false)?; }
    let mut file = OpenOptions::new().write(true).create(true).truncate(true).open(marker).map_err(|e| e.to_string())?;
    file.write_all(b"Box.WorkspaceRecovery.v1").and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    Ok(directory.display().to_string())
}
#[tauri::command]
pub fn workspace_recovery_preserve(app: tauri::AppHandle) -> Result<String, String> {
    let _lock = IO.lock().map_err(|_| "工作区保存锁不可用")?;
    preserve_at(&crate::app_data::directory(&app)?)
}
#[tauri::command]
pub fn workspace_recovery_list(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let directory = root(&app)?;
    if !directory.exists() { return Ok(Vec::new()); }
    let mut entries: Vec<_> = fs::read_dir(directory).map_err(|e| e.to_string())?.filter_map(Result::ok)
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink()) && valid_id(&e.file_name().to_string_lossy()) && e.path().join("verified").is_file())
        .collect();
    entries.sort_by_key(|e| std::cmp::Reverse(e.metadata().and_then(|m| m.modified()).ok()));
    Ok(entries.into_iter().map(|e| e.file_name().to_string_lossy().into_owned()).collect())
}
fn selected(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) { return Err("恢复副本编号无效".into()); }
    let recovery = root(app)?;
    regular(&recovery, true)?;
    let directory = recovery.join(id);
    regular(&directory, true)?;
    regular(&directory.join("verified"), false)?;
    let mut digest = Sha256::new();
    for name in FILES {
        let path = directory.join(name);
        if path.exists() {
            regular(&path, false)?;
            let bytes = fs::read(path).map_err(|e|e.to_string())?;
            digest.update(name); digest.update((bytes.len() as u64).to_le_bytes()); digest.update(&bytes);
        }
    }
    if format!("{:x}", digest.finalize()) != id.to_ascii_lowercase() { return Err("恢复副本摘要核验失败，保留文件供手动恢复".into()); }
    Ok(directory)
}
#[tauri::command]
pub fn workspace_recovery_read(app: tauri::AppHandle, id: String, filename: Option<String>) -> Result<String, String> {
    let directory = selected(&app, &id)?;
    if let Some(name) = filename {
        if !FILES.contains(&name.as_str()) { return Err("恢复文件名无效".into()); }
        return fs::read_to_string(directory.join(name)).map_err(|e|e.to_string());
    }
    for name in FILES {
        if let Ok(text) = fs::read_to_string(directory.join(name)) {
            if serde_json::from_str::<serde_json::Value>(text.trim_start_matches('\u{feff}')).is_ok() { return Ok(text); }
        }
    }
    Err("副本中的 JSON 无法直接恢复，可查看原始文件".into())
}
#[tauri::command]
pub fn workspace_recovery_interrupted(app: tauri::AppHandle) -> Result<bool, String> {
    let base = crate::app_data::directory(&app)?;
    Ok(base.join(FILES[2]).exists() || (!base.join(FILES[0]).exists() && base.join(FILES[1]).exists()))
}
#[tauri::command]
pub fn workspace_recovery_open(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let directory = selected(&app, &id)?;
    std::process::Command::new("explorer.exe").arg(directory).spawn().map(|_| ()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workspace_recovery_missing_images(app: tauri::AppHandle, hashes: Vec<String>) -> Result<Vec<String>, String> {
    if hashes.len() > 20000 || hashes.iter().any(|h| !valid_id(h)) { return Err("素材引用列表无效".into()); }
    let root = crate::app_data::directory(&app)?.join("icon-images");
    Ok(hashes.into_iter().filter(|h| !root.join(h).is_file()).collect())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn preserves_all_original_bytes_and_reuses_verified_archive() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results/workspace-preserve").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        for (i, name) in FILES.iter().enumerate() { fs::write(root.join(name), [255, i as u8, 0, 123]).unwrap(); }
        let directory = preserve_at(&root).unwrap();
        assert_eq!(preserve_at(&root).unwrap(), directory);
        for name in FILES { assert_eq!(fs::read(root.join(name)).unwrap(), fs::read(Path::new(&directory).join(name)).unwrap()); }
        fs::remove_file(Path::new(&directory).join("verified")).unwrap();
        fs::write(Path::new(&directory).join(FILES[0]), b"interrupted").unwrap();
        assert_eq!(preserve_at(&root).unwrap(), directory);
        assert!(fs::read_dir(&directory).unwrap().filter_map(Result::ok).any(|e|e.file_name().to_string_lossy().contains("interrupted-")));
        fs::write(Path::new(&directory).join(FILES[0]), b"damaged").unwrap();
        assert!(preserve_at(&root).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
