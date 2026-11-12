use std::fs;
#[tauri::command]
pub fn read_warcraft_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = crate::app_data::directory(&app)?.join("warcraft-ui/workspace.json");
    if !path.exists() { return Ok(None); }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 256 * 1024 * 1024 { return Err("UI workspace exceeds 256 MB".into()); }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn write_warcraft_workspace(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if text.len() > 256 * 1024 * 1024 { return Err("UI workspace exceeds 256 MB".into()); }
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if value["format"] != "war3-ui-lab" || (value["version"] != 1 && value["version"] != 2) || !value["nodes"].is_array() { return Err("Invalid UI workspace".into()); }
    let directory = crate::app_data::directory(&app)?.join("warcraft-ui");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let path = directory.join("workspace.json");
    let pending = directory.join("workspace.pending.json");
    fs::write(&pending, text).map_err(|e| e.to_string())?;
    if path.exists() { fs::copy(&path, directory.join("workspace.backup.json")).map_err(|e| e.to_string())?; }
    fs::rename(pending, path).map_err(|e| e.to_string())
}
