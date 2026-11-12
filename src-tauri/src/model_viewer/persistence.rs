use std::{fs, path::PathBuf};
fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> { Ok(crate::app_data::directory(app)?.join("model-viewer/settings.json")) }
#[tauri::command]
pub fn viewer_load_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    if !path.exists() { return Ok(None); }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 { return Err("查看器设置文件过大".into()); }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn viewer_save_settings(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if text.len() > 16 * 1024 * 1024 { return Err("查看器设置文件过大".into()); }
    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| e.to_string())?;
    let path = settings_path(&app)?; fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let pending = path.with_extension("pending.json"); fs::write(&pending, text).map_err(|e| e.to_string())?;
    if path.exists() { fs::copy(&path, path.with_extension("backup.json")).map_err(|e| e.to_string())?; }
    fs::rename(pending, path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn viewer_game_archives(directory: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(directory);
    if !root.is_absolute() || !root.is_dir() { return Err("请选择经典游戏目录".into()); }
    let priorities = ["war3patch.mpq", "war3xlocal.mpq", "war3x.mpq", "war3local.mpq", "war3.mpq"];
    let mut archives: Vec<_> = fs::read_dir(root).map_err(|e| e.to_string())?.filter_map(Result::ok).filter(|e| e.file_type().is_ok_and(|t| t.is_file()) && priorities.contains(&e.file_name().to_string_lossy().to_lowercase().as_str())).map(|e| e.path().to_string_lossy().into_owned()).collect();
    archives.sort_by_key(|p| priorities.iter().position(|name| p.to_lowercase().ends_with(name)).unwrap_or(5));
    Ok(archives)
}
