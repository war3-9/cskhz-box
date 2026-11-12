mod storage;
mod settings;
mod migration;
#[cfg(test)] mod tests;
use std::{fs, sync::Mutex};
use settings::{context, DirectoryInfo};
use storage::DesignMeta;
static LOCK: Mutex<()> = Mutex::new(());

#[tauri::command]
pub fn ui_design_directory(app: tauri::AppHandle) -> Result<DirectoryInfo, String> {
    let _lock = LOCK.lock().map_err(|e| e.to_string())?;
    let context = context(&app)?; context.info(&context.load()?)
}
#[tauri::command]
pub fn ui_design_list(app: tauri::AppHandle) -> Result<Vec<DesignMeta>, String> {
    let _lock = LOCK.lock().map_err(|e| e.to_string())?;
    let context = context(&app)?; let root = context.root(&context.load()?)?;
    let mut designs = vec![];
    for file in storage::files(&root)? { designs.push(storage::parse(&storage::read(&file)?)?.1); }
    designs.sort_by(|a, b| b.updated_at.cmp(&a.updated_at)); Ok(designs)
}
#[tauri::command]
pub fn ui_design_read(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let _lock = LOCK.lock().map_err(|e| e.to_string())?;
    let context = context(&app)?; let root = context.root(&context.load()?)?;
    storage::read(&storage::path(&root, &id)?)
}
#[tauri::command]
pub fn ui_design_save(app: tauri::AppHandle, text: String) -> Result<DesignMeta, String> {
    let _lock = LOCK.lock().map_err(|e| e.to_string())?;
    let context = context(&app)?; let root = storage::directory(&context.root(&context.load()?)?)?;
    let (_, meta) = storage::parse(&text)?;
    storage::atomic(&storage::path(&root, &meta.id)?, &text)?; Ok(meta)
}
#[tauri::command]
pub fn ui_design_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let _lock = LOCK.lock().map_err(|e| e.to_string())?;
    let context = context(&app)?; let root = context.root(&context.load()?)?;
    let path = storage::path(&root, &id)?;
    storage::parse(&storage::read(&path)?)?;
    fs::remove_file(&path).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn ui_design_change_directory(app: tauri::AppHandle, directory: Option<String>) -> Result<DirectoryInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = LOCK.lock().map_err(|e| e.to_string())?;
        migration::migrate(&context(&app)?, directory)
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn ui_design_retry_cleanup(app: tauri::AppHandle) -> Result<DirectoryInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = LOCK.lock().map_err(|e| e.to_string())?;
        let context = context(&app)?; let mut preferences = context.load()?;
        migration::cleanup(&context, &mut preferences)?; context.info(&preferences)
    }).await.map_err(|e| e.to_string())?
}
