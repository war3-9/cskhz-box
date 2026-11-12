use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

pub const MAX_FILE: usize = 32 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DesignMeta { pub id: String, pub name: String, pub updated_at: u64 }
pub fn parse(text: &str) -> Result<(Value, DesignMeta), String> {
    if text.len() > MAX_FILE { return Err("保存稿超过 32 MB".into()); }
    let value: Value = serde_json::from_str(text).map_err(|e| format!("保存稿 JSON 无效：{e}"))?;
    if value["format"] != "war3-ui-lab" || (value["version"] != 1 && value["version"] != 2) || !value["nodes"].is_array() {
        return Err("保存稿格式不兼容".into());
    }
    let meta: DesignMeta = serde_json::from_value(value["design"].clone()).map_err(|e| format!("保存稿信息无效：{e}"))?;
    uuid::Uuid::parse_str(&meta.id).map_err(|_| "保存稿 ID 无效")?;
    if meta.name.trim().is_empty() || meta.name.chars().count() > 100 { return Err("设计名称应为 1–100 个字符".into()); }
    Ok((value, meta))
}
pub fn path(root: &Path, id: &str) -> Result<PathBuf, String> {
    let id = uuid::Uuid::parse_str(id).map_err(|_| "保存稿 ID 无效")?;
    Ok(root.join(format!("{id}.war3ui")))
}
pub fn check_regular(path: &Path) -> Result<(), String> {
    let info = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if info.file_attributes() & 0x400 != 0 { return Err("保存稿路径不能是链接或联接点".into()); }
    }
    if info.file_type().is_symlink() { return Err("保存稿路径不能是链接".into()); }
    Ok(())
}
pub fn directory(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() { return Err("保存目录必须使用绝对路径".into()); }
    if path.exists() { check_regular(path)?; }
    else { fs::create_dir_all(path).map_err(|e| format!("无法创建保存目录：{e}"))?; }
    if !path.is_dir() { return Err("保存路径不是文件夹".into()); }
    path.canonicalize().map_err(|e| e.to_string())
}
pub fn read(path: &Path) -> Result<String, String> {
    check_regular(path)?;
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_FILE as u64 { return Err("保存稿超过 32 MB".into()); }
    fs::read_to_string(path).map_err(|e| e.to_string())
}
pub fn atomic(path: &Path, text: &str) -> Result<(), String> {
    if path.exists() { check_regular(path)?; }
    fs::create_dir_all(path.parent().ok_or("保存路径无效")?).map_err(|e| e.to_string())?;
    let temporary = path.with_extension(format!("{}.pending", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}
pub fn files(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.exists() { return Ok(vec![]); }
    check_regular(root)?;
    let mut files = vec![];
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file = entry.path();
        if file.extension().is_some_and(|extension| extension == "war3ui") {
            let (_, meta) = parse(&read(&file)?)?;
            if file.file_name() != path(root, &meta.id)?.file_name() { return Err(format!("保存稿文件名与 ID 不一致：{}", file.display())); }
            files.push(file);
        }
    }
    Ok(files)
}
pub fn fingerprint(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
pub fn display(path: &Path) -> String { path.display().to_string().trim_start_matches(r"\\?\").to_string() }
