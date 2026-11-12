mod index;
mod came;
#[cfg(test)]
mod came_tests;
pub mod terrain;
mod analysis;
pub(crate) mod content;
pub(crate) mod codec;
mod map_metadata;
pub mod map_catalog;
mod model_group;
mod name_candidates;
pub(crate) mod storm;
mod scan_profile;
pub(crate) mod references;
pub mod export;
mod export_rename;
pub mod game_resources;
pub mod persistence;
mod import_files;
mod folder_ops;
mod map_ops;
mod delete_backup;
mod delete_map;
mod delete_resources;
pub mod duplicates;
mod duplicates_paths;
mod duplicates_progress;
mod duplicates_references;
mod duplicates_merge;
mod duplicates_transaction;
#[cfg(test)]
mod duplicates_tests;
#[cfg(test)]
mod duplicates_performance_tests;
pub mod mutations;
pub mod file_clipboard;
pub mod console_replace;
pub mod console_save;
pub mod console_font;
#[cfg(test)]
mod mutation_tests;
#[cfg(test)]
mod map_delete_tests;
#[cfg(test)]
mod delete_tests;
#[cfg(test)]
mod export_tests;
#[cfg(test)]
mod export_game_tests;
#[cfg(test)]
mod picker_tests;
use std::{collections::HashMap, fs::{self, OpenOptions}, io::Write, path::PathBuf, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}};
use index::Source;
pub(crate) fn recovered_archive_names(path: &std::path::Path) -> Result<HashMap<Vec<u8>, String>, String> {
    let indexed = index::scan(path.to_string_lossy().into_owned(), uuid::Uuid::new_v4().to_string(), &AtomicBool::new(false))?;
    Ok(indexed.entries.into_iter().filter_map(|entry| entry.raw_name.map(|raw| (raw, entry.path))).collect())
}
#[derive(Default)]
pub struct ViewerState { sources: Mutex<HashMap<String, Source>>, jobs: Mutex<HashMap<String, Arc<AtomicBool>>>, mutations: Arc<Mutex<()>> }
#[tauri::command]
pub async fn viewer_open(path: String, id: String, quick: Option<bool>, state: tauri::State<'_, ViewerState>) -> Result<Source, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state.jobs.lock().unwrap().insert(id.clone(), cancel.clone());
    let scan_id = id.clone();
    let worker_cancel = cancel.clone();
    let result = tauri::async_runtime::spawn_blocking(move || index::scan_mode(path, scan_id, &worker_cancel, quick.unwrap_or(false))).await.map_err(|e| e.to_string());
    let mut jobs = state.jobs.lock().unwrap();
    if jobs.get(&id).is_some_and(|job| Arc::ptr_eq(job, &cancel)) { jobs.remove(&id); }
    drop(jobs);
    if cancel.load(Ordering::Relaxed) { return Err("扫描已取消".into()); }
    let result = result?;
    if let Ok(source) = &result { state.sources.lock().unwrap().insert(id, source.clone()); }
    result
}
#[tauri::command]
pub fn viewer_cancel(id: String, state: tauri::State<ViewerState>) {
    if let Some(cancel) = state.jobs.lock().unwrap().get(&id) { cancel.store(true, Ordering::Relaxed); }
}
#[tauri::command]
pub fn viewer_close(id: String, state: tauri::State<ViewerState>) { state.jobs.lock().unwrap().remove(&id).map(|cancel| cancel.store(true, Ordering::Relaxed)); state.sources.lock().unwrap().remove(&id); }
#[tauri::command]
pub async fn viewer_read(id: String, path: String, state: tauri::State<'_, ViewerState>) -> Result<tauri::ipc::Response, String> {
    let source = state.sources.lock().unwrap().get(&id).cloned().ok_or("来源已关闭")?;
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let bytes = index::read(&source, &path)?;
        codec::convert(&bytes).map(|value| value.into_owned())
    }).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}
#[tauri::command]
pub fn viewer_write(directory: String, relative: String, bytes: Vec<u8>) -> Result<String, String> {
    let bytes = codec::convert(&bytes)?;
    let root = PathBuf::from(directory);
    if !root.is_absolute() { return Err("请选择绝对输出目录".into()); }
    let relative = index::safe_relative(&relative)?;
    let path = root.join(relative);
    fs::create_dir_all(path.parent().ok_or("输出路径无效")?).map_err(|e| e.to_string())?;
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    if !path.parent().unwrap().canonicalize().map_err(|e| e.to_string())?.starts_with(&canonical_root) { return Err("输出路径越过目标目录".into()); }
    let mut file = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| format!("拒绝覆盖或无法写入 {}：{e}", path.display()))?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into())
}

#[tauri::command]
pub async fn viewer_decode_resource(bytes: Vec<u8>) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || codec::convert(&bytes).map(|value| value.into_owned())).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}
