use std::{fs, path::PathBuf, sync::OnceLock};
static ROOT: OnceLock<PathBuf> = OnceLock::new();

pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    let root = crate::app_data::directory(app)?.join("warcraft-ui");
    fs::create_dir_all(root.join("exports")).map_err(|e| e.to_string())?;
    ROOT.set(root).map_err(|_| "UI workspace already initialized".to_string())
}

pub fn root() -> PathBuf { ROOT.get().expect("UI workspace initialized before commands").clone() }
