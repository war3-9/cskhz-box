use super::{export::{self, Item}, index::{self, Source}, ViewerState};
use serde::Serialize;
use std::{collections::HashSet, fs, path::{Path, PathBuf}, sync::atomic::AtomicBool};

#[cfg(windows)]
mod windows;
#[cfg(test)]
mod tests;
#[cfg(all(test, windows))]
mod private_station;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopiedFiles { pub directory: String, pub models: usize, pub textures: usize, pub files: usize }

fn validate(sources: &[Source], items: &[Item]) -> Result<(), String> {
    if items.is_empty() || items.len() > 10000 { return Err("请选择 1 到 10000 个模型".into()); }
    let mut outputs = HashSet::new();
    for item in items {
        let source = sources.iter().find(|source| source.id == item.source_id).ok_or("模型来源已关闭")?;
        if item.dependency || !source.entries.iter().any(|entry| entry.model && entry.path == item.path) { return Err("只能复制已打开来源中的模型".into()); }
        if !index::model_path(&item.output) || item.output.trim().is_empty() { return Err("模型输出名称无效".into()); }
        index::safe_relative(&item.output)?;
        if !outputs.insert(item.output.replace('\\', "/").to_lowercase()) { return Err("模型输出名称冲突，请先调整导出名称".into()); }
    }
    Ok(())
}

fn safe_stage(root: &Path) -> Result<PathBuf, String> {
    if !root.is_absolute() { return Err("剪贴板临时目录必须是绝对路径".into()); }
    // Never write a retained clipboard package through a user-created directory link.
    let mut ancestor = Some(root);
    while let Some(path) = ancestor {
        if let Ok(metadata) = fs::symlink_metadata(path) {
            #[cfg(windows)] { use std::os::windows::fs::MetadataExt; if metadata.file_attributes() & 0x400 != 0 { return Err("剪贴板目录不能经过链接".into()); } }
            #[cfg(not(windows))] if metadata.file_type().is_symlink() { return Err("剪贴板目录不能经过链接".into()); }
        }
        ancestor = path.parent();
    }
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let stage = root.join(uuid::Uuid::new_v4().to_string());
    fs::create_dir(&stage).map_err(|error| error.to_string())?;
    Ok(stage)
}

fn prepare(sources: Vec<Source>, mut items: Vec<Item>, root: &Path) -> Result<(CopiedFiles, Vec<PathBuf>), String> {
    validate(&sources, &items)?;
    // Give every model its own texture names and rewrite references using the existing
    // raw exporter. This also disambiguates same-named skins from different sources.
    for item in &mut items { item.rename_textures = true; }
    let stage = safe_stage(root)?;
    let result = (|| {
        let progress = export::run(sources, items, stage.to_string_lossy().into_owned(), true, &AtomicBool::new(false), |_| {})?;
        if let Some(failure) = progress.failed.first() { return Err(format!("未复制，原剪贴板保留：{}：{}", failure.work.path, failure.error)); }
        if !progress.missing.is_empty() { return Err(format!("未复制，原剪贴板保留；请先补齐贴图或打开游戏资源来源：{}", progress.missing.join("、"))); }
        let mut paths = fs::read_dir(&stage).map_err(|error| error.to_string())?.map(|entry| entry.map(|entry| entry.path()).map_err(|error| error.to_string())).collect::<Result<Vec<_>, _>>()?;
        paths.sort();
        if paths.is_empty() { return Err("没有可复制的模型文件".into()); }
        Ok((CopiedFiles { directory: stage.to_string_lossy().into_owned(), models: progress.models, textures: progress.textures, files: progress.done }, paths))
    })();
    // This unique directory was just created here and is never exposed until success.
    if result.is_err() { let _ = fs::remove_dir_all(&stage); }
    result
}

#[tauri::command]
pub async fn viewer_copy_model_files(window: tauri::WebviewWindow, app: tauri::AppHandle, items: Vec<Item>, source_ids: Vec<String>, state: tauri::State<'_, ViewerState>) -> Result<CopiedFiles, String> {
    #[cfg(windows)] {
        let owner = window.hwnd().map_err(|error| error.to_string())?.0 as usize;
        let sources = {
            let mounted = state.sources.lock().map_err(|error| error.to_string())?;
            source_ids.iter().map(|id| mounted.get(id).cloned().ok_or("模型来源已关闭")).collect::<Result<Vec<_>, _>>()?
        };
        let root = crate::app_data::directory(&app)?.join("model-file-clipboard");
        tauri::async_runtime::spawn_blocking(move || {
            let (copied, paths) = prepare(sources, items, &root)?;
            windows::write(&paths, owner)?;
            // Retain the package across app exit so Explorer can paste later. The
            // ordinary generated-file cleanup intentionally does not touch AppData.
            Ok(copied)
        }).await.map_err(|error| error.to_string())?
    }
    #[cfg(not(windows))] { let _ = (window, app, items, source_ids, state); Err("文件剪贴板需要 Windows 桌面版".into()) }
}
