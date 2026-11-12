use super::{map_metadata, storm::Archive};
use serde::Serialize;
use std::{collections::HashMap, fs, path::{Path, PathBuf}, sync::{Mutex, OnceLock}, time::UNIX_EPOCH};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEntry { pub path: String, pub file_name: String, pub name: String, pub directory: String, pub size: u64, pub error: Option<String> }
type Cache = HashMap<PathBuf, (u64, u128, MapEntry)>;
static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
fn entry(path: &Path) -> Result<MapEntry, String> {
    let metadata = path.metadata().map_err(|e| e.to_string())?; let size = metadata.len();
    let modified = metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |t| t.as_nanos());
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some((old_size, old_modified, value)) = cache.lock().unwrap().get(path) { if *old_size == size && *old_modified == modified { return Ok(value.clone()); } }
    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let (name, error) = match Archive::open(path) { Ok(archive) => (map_metadata::name(path, &archive).unwrap_or_else(|| file_name.clone()), None), Err(error) => (file_name.clone(), Some(error)) };
    let value = MapEntry { path: path.to_string_lossy().into(), directory: path.parent().unwrap_or(path).to_string_lossy().into(), file_name, name, size, error };
    let mut cache = cache.lock().unwrap(); if cache.len() >= 512 { cache.clear(); } cache.insert(path.into(), (size, modified, value.clone())); Ok(value)
}
fn walk(directory: &Path, depth: u32, values: &mut Vec<MapEntry>) -> Result<(), String> {
    if depth > 64 { return Err("地图目录层级超过 64 层".into()); }
    for item in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?; let kind = item.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() { continue; }
        if kind.is_dir() { walk(&item.path(), depth + 1, values)?; }
        else if matches!(item.path().extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("w3x" | "w3m")) {
            if values.len() >= 10000 { return Err("请缩小目录范围，最多浏览 10000 张地图".into()); }
            values.push(entry(&item.path())?);
        }
    } Ok(())
}
#[tauri::command]
pub async fn viewer_map_catalog(directory: String) -> Result<Vec<MapEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || { let root = PathBuf::from(directory); if !root.is_absolute() || !root.is_dir() { return Err("请选择有效的绝对地图目录".into()); } let mut values = vec![]; walk(&root, 0, &mut values)?; values.sort_by_key(|value| value.file_name.to_lowercase()); Ok(values) }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn viewer_map_preview(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(path); if !root.is_absolute() { return Err("请选择绝对地图路径".into()); }
        let archive = Archive::open(&root)?;
        for name in ["war3mapPreview.tga", "war3mapMap.blp", "war3mapMap.tga"] { if let Ok(bytes) = archive.prefix_limit(name.as_bytes(), 16 * 1024 * 1024) { return Ok(tauri::ipc::Response::new(bytes)); } }
        Err("地图没有可读取的预览图".into())
    }).await.map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires the original reference map in BOX_VIEWER_TEST_MAP"]
    fn real_map_metadata() { let path = PathBuf::from(std::env::var_os("BOX_VIEWER_TEST_MAP").expect("set BOX_VIEWER_TEST_MAP to the reference map")); let value = entry(&path).unwrap(); assert!(value.error.is_none()); assert_eq!(value.name, "天命西游"); assert!(value.size > 300 * 1024 * 1024); }
}
