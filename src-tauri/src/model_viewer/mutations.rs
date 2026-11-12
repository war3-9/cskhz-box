use std::{collections::{BTreeMap, HashSet}, sync::atomic::AtomicBool};
use serde::{Deserialize, Serialize};
use super::{folder_ops, import_files::{self, ImportInput}, index::{self, Source}, map_ops, ViewerState};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mutation { pub operation: String, pub paths: Vec<String>, #[serde(default)] pub prefix: String, #[serde(default)] pub start: u64, #[serde(default)] pub inputs: Vec<ImportInput>, pub destination: Option<String>, pub new_id: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult { pub source: Source, pub renamed: BTreeMap<String, String>, pub backup: Option<String>, pub changed: usize }
pub fn execute(source: &Source, mutation: Mutation) -> Result<MutationResult, String> {
    execute_with_backups(source, mutation, None)
}
pub(super) fn execute_with_backups(source: &Source, mutation: Mutation, backup_root: Option<&std::path::Path>) -> Result<MutationResult, String> {
    if mutation.paths.len() > 100000 || mutation.inputs.len() > 10000 { return Err("文件数量超过限制".into()); }
    if mutation.paths.iter().map(|path| path.replace('\\', "/").to_lowercase()).collect::<HashSet<_>>().len() != mutation.paths.len() { return Err("文件列表包含重复路径".into()); }
    if mutation.operation != "import" && mutation.paths.is_empty() { return Err("请先勾选文件".into()); }
    if mutation.operation != "import" { for path in &mutation.paths { if !source.entries.iter().any(|e| e.path.replace('\\', "/").eq_ignore_ascii_case(&path.replace('\\', "/")) && import_files::resource_path(path)) { return Err(format!("文件不在来源中或格式不支持：{path}")); } } }
    let mut renamed = BTreeMap::new(); let mut backup = None;
    if mutation.operation == "delete" && source.kind == "archive" {
        let (source, backup) = super::delete_map::execute(source, &mutation.paths, backup_root)?;
        return Ok(MutationResult { source, renamed, backup: Some(backup), changed: mutation.paths.len() });
    }
    let (path, id, changed) = if source.kind == "folder" {
        let changed = match mutation.operation.as_str() {
            "delete" => { backup = Some(folder_ops::delete(source, &mutation.paths, backup_root)?); mutation.paths.len() },
            "rename" => { let result = folder_ops::rename(source, &mutation.paths, &mutation.prefix, mutation.start)?; renamed = result.0; backup = Some(result.1); renamed.len() },
            "import" => folder_ops::import(&folder_ops::root(source)?, &import_files::prepare(&mutation.inputs, false)?)?,
            _ => return Err("不支持的文件操作".into()),
        };
        (source.path.clone(), source.id.clone(), changed)
    } else {
        if !["delete", "import"].contains(&mutation.operation.as_str()) { return Err("此来源不支持重命名".into()); }
        let destination = mutation.destination.ok_or("请选择新地图路径")?;
        let files = if mutation.operation == "import" { import_files::prepare(&mutation.inputs, true)? } else { BTreeMap::new() };
        let changed = map_ops::mutate(source, &destination, &mutation.paths, &files, mutation.operation == "delete")?;
        (destination, mutation.new_id, changed)
    };
    Ok(MutationResult { source: index::scan(path, id, &AtomicBool::new(false))?, renamed, backup, changed })
}
#[tauri::command]
pub async fn viewer_input_read(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || import_files::input_read(&path)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}
#[tauri::command]
pub async fn viewer_mutate(id: String, operation: String, paths: Vec<String>, prefix: Option<String>, start: Option<u64>, inputs: Option<Vec<ImportInput>>, destination: Option<String>, new_id: String, state: tauri::State<'_, ViewerState>) -> Result<MutationResult, String> {
    let source = state.sources.lock().unwrap().get(&id).cloned().ok_or("来源已关闭")?;
    let lock = state.mutations.clone();
    let mutation = Mutation { operation, paths, prefix: prefix.unwrap_or_default(), start: start.unwrap_or(0), inputs: inputs.unwrap_or_default(), destination, new_id };
    let result = tauri::async_runtime::spawn_blocking(move || { let _guard = lock.lock().map_err(|e| e.to_string())?; execute(&source, mutation) }).await.map_err(|e| e.to_string())??;
    state.sources.lock().unwrap().insert(result.source.id.clone(), result.source.clone());
    Ok(result)
}
