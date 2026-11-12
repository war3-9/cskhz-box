#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::{Path, PathBuf}};
use tauri::{Emitter, Manager};
mod ai;
mod builtin;
mod desktop_brand;
mod batch;
mod image_conversion;
mod asset_folders;
mod icon_images;
mod model_viewer;
mod terrain_clone;
mod app_data;
mod workspace_recovery;
mod desktop_lifecycle;
mod warcraft_ui;
mod object_table;
mod object_maps;
mod map_format;
mod object_palette;
mod object_palette_geometry;

fn workspace_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_data::directory(app).map(|p| p.join("workspace.json"))
}

#[tauri::command]
fn read_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let _lock = workspace_recovery::IO.lock().map_err(|_| "工作区保存锁不可用")?;
    let path = workspace_path(&app)?;
    if !path.exists() {
        for candidate in [path.with_extension("pending.json"), path.with_extension("backup.json")] {
            if let Ok(text) = fs::read_to_string(candidate) { if serde_json::from_str::<serde_json::Value>(&text).is_ok() { return Ok(Some(text)); } }
        }
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_workspace(app: tauri::AppHandle, text: String) -> Result<(), String> {
    let _lock = workspace_recovery::IO.lock().map_err(|_| "工作区保存锁不可用")?;
    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| e.to_string())?;
    let path = workspace_path(&app)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let pending = path.with_extension("pending.json");
    use std::io::Write;
    let mut output = fs::OpenOptions::new().create(true).truncate(true).write(true).open(&pending).map_err(|e|e.to_string())?;
    output.write_all(text.as_bytes()).and_then(|_|output.sync_all()).map_err(|e|e.to_string())?;
    drop(output);
    if fs::read(&pending).map_err(|e|e.to_string())? != text.as_bytes() { return Err("工作区待提交文件核验失败".into()); }
    if path.exists() { fs::copy(&path, path.with_extension("backup.json")).map_err(|e| e.to_string())?; }
    fs::rename(pending, path).map_err(|e| e.to_string())
}

fn allowed_path(path: &str) -> Result<&Path, String> {
    let path = Path::new(path);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if !path.is_absolute() || !["layerforge", "boxtemplate", "zip", "png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff", "blp", "tga", "json", "txt"].contains(&ext.as_str()) {
        return Err("保存路径必须是绝对路径，并包含支持的文件扩展名".into());
    }
    Ok(path)
}

#[tauri::command]
fn write_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = allowed_path(&path)?;
    fs::write(path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    let path = allowed_path(&path)?;
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 200 * 1024 * 1024 {
        return Err("Project exceeds 200 MB".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}


fn main() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("box-image", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(icon_images::response(&app, request.uri().path()));
            });
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| { let _ = desktop_lifecycle::restore(app); }))
        .manage(object_palette::PaletteState::default())
        .manage(model_viewer::ViewerState::default())
        .manage(terrain_clone::TerrainCloneState::default())
        .manage(asset_folders::FolderWatches::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            desktop_lifecycle::initialize(app.handle())?;
            warcraft_ui::initialize(app.handle()).map_err(std::io::Error::other)?;
            if let Some(window) = app.get_webview_window("main") {
                desktop_brand::apply(&window)?;
                let handle = app.handle().clone();
                let event_window = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Destroyed = event {
                        if let Some(palette) = handle.get_webview_window("object-palette") { let _ = palette.destroy(); }
                    }
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = handle.emit("app-close-requested", ());
                    }
                    if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position }) = event {
                        let scale_factor = event_window.scale_factor().unwrap_or(1.0);
                        let mut terrain_drop_sent = false;
                        for path in paths {
                            let id = format!("drop-{}", uuid_like(path));
                            let path_text = path.to_string_lossy();
                            let _ = handle.emit("viewer-drop-path", serde_json::json!({ "path": path_text, "id": id }));
                            let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
                            if !terrain_drop_sent && ["w3m", "w3x"].contains(&extension.as_str()) {
                                let _ = handle.emit("terrain-clone-drop-path", serde_json::json!({ "path": path_text, "position": [position.x / scale_factor, position.y / scale_factor] }));
                                terrain_drop_sent = true;
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler({
            let commands: Box<tauri::ipc::InvokeHandler<tauri::Wry>> = Box::new(tauri::generate_handler![object_maps::object_map_read,
                object_maps::object_map_resource,
                object_table::object_read_file,
                object_table::object_save_file,
                object_table::object_read_workspace,
                object_table::object_write_workspace,
                object_table::object_export,
                warcraft_ui::designs::ui_design_directory,
                warcraft_ui::designs::ui_design_list,
                warcraft_ui::designs::ui_design_read,
                warcraft_ui::designs::ui_design_save,
                warcraft_ui::designs::ui_design_delete,
                warcraft_ui::designs::ui_design_change_directory,
                warcraft_ui::designs::ui_design_retry_cleanup,
                warcraft_ui::bridge_probe,
                warcraft_ui::resource_directory::detect_editor_resource_directory,
                warcraft_ui::save_lab_text,
                warcraft_ui::save_lab_triggers,
                warcraft_ui::open_lab_export_folder,
                warcraft_ui::workspace::read_warcraft_workspace,
                warcraft_ui::workspace::write_warcraft_workspace,
                model_viewer::console_replace::console_replace_map,
                model_viewer::console_font::console_font_input,
                model_viewer::console_font::console_font_snapshot,
                model_viewer::console_save::console_map_fingerprint,
                model_viewer::console_save::console_save_map,
                model_viewer::mutations::viewer_input_read,
                model_viewer::mutations::viewer_mutate,
                model_viewer::duplicates::viewer_find_duplicates,
                model_viewer::duplicates::viewer_merge_duplicate_textures,
                model_viewer::duplicates::viewer_delete_duplicate_models,
                model_viewer::file_clipboard::viewer_copy_model_files,
                model_viewer::map_catalog::viewer_map_catalog,
                model_viewer::map_catalog::viewer_map_preview,
                model_viewer::terrain::viewer_terrain_resources,
                model_viewer::viewer_open,
                model_viewer::viewer_cancel,
                model_viewer::viewer_close,
                model_viewer::viewer_read,
                model_viewer::viewer_decode_resource,
                model_viewer::viewer_write,
                model_viewer::export::viewer_export_raw,
                model_viewer::game_resources::viewer_game_resources,
                model_viewer::persistence::viewer_load_settings,
                model_viewer::persistence::viewer_save_settings,
                model_viewer::persistence::viewer_game_archives,
                terrain_clone::terrain_clone_open_map,
                terrain_clone::terrain_clone_new_blank,
                terrain_clone::terrain_clone_copy_region,
                terrain_clone::terrain_clone_adjust_height,
                terrain_clone::terrain_clone_undo,
                terrain_clone::terrain_clone_save_map,
                terrain_clone::terrain_clone_close_map,
                terrain_clone::terrain_clone_export_table,
                workspace_recovery::workspace_recovery_interrupted,
                workspace_recovery::workspace_recovery_preserve,
                workspace_recovery::workspace_recovery_list,
                workspace_recovery::workspace_recovery_read,
                workspace_recovery::workspace_recovery_open,
                workspace_recovery::workspace_recovery_missing_images,
                read_workspace,
                write_workspace,
                write_file,
                read_text,
                ai::load_ai_config,
                ai::save_ai_config,
                ai::test_ai_config,
                ai::delete_ai_config,
                ai::ai_models,
                ai::ai_quota,
                ai::begin_ai_batch,
                ai::ai_batch_name,
                ai::ai_batch_quota,
                ai::end_ai_batch,
                batch::write_batch_image,
                batch::prepare_icon_pair_directory,
                batch::next_icon_pair_sequence,
                batch::write_icon_pair,
                builtin::load_builtin_library]);
            let lifecycle_commands: Box<tauri::ipc::InvokeHandler<tauri::Wry>> = Box::new(tauri::generate_handler![desktop_lifecycle::desktop_hide_to_tray]);
            let palette_commands: Box<tauri::ipc::InvokeHandler<tauri::Wry>> = Box::new(tauri::generate_handler![object_palette::object_palette_prepare, object_palette::object_palette_ready, object_palette::object_palette_open, object_palette::object_palette_target, object_palette::object_palette_hide, object_palette::object_palette_reveal, object_palette::object_palette_remember]);
            let conversion_commands: Box<tauri::ipc::InvokeHandler<tauri::Wry>> = Box::new(tauri::generate_handler![image_conversion::image_conversion_prepare, image_conversion::image_conversion_scan, image_conversion::image_conversion_read, image_conversion::image_conversion_open]);
            let folder_commands: Box<tauri::ipc::InvokeHandler<tauri::Wry>> = Box::new(tauri::generate_handler![asset_folders::asset_folder_bind, asset_folders::asset_folder_scan, asset_folders::asset_folder_create, asset_folders::asset_folder_import, asset_folders::asset_folder_recycle, asset_folders::asset_folder_watch]);
            let icon_commands: Box<tauri::ipc::InvokeHandler<tauri::Wry>> = Box::new(tauri::generate_handler![icon_images::icon_image_store]);
            move |invoke: tauri::ipc::Invoke<tauri::Wry>| {
                let command = invoke.message.command();
                if command.starts_with("asset_folder_") { folder_commands(invoke) }
                else if command == "icon_image_store" { icon_commands(invoke) }
                else if command.starts_with("image_conversion_") { conversion_commands(invoke) }
                else if command.starts_with("object_palette_") { palette_commands(invoke) }
                else if command == "desktop_hide_to_tray" {
                    lifecycle_commands(invoke)
                } else { commands(invoke) }
            }
        })
        .run(desktop_lifecycle::context())
        .expect("启动超时空盒子源码公开免费版失败");
}

fn uuid_like(path: &Path) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new(); path.hash(&mut hasher); format!("{:x}", hasher.finish())
}

#[cfg(test)]
mod file_tests {
    use super::*;

    #[test]
    fn single_image_formats_write_exact_bytes() {
        let directory = std::env::temp_dir().join(format!("layerforge-single-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        for ext in ["png", "PNG", "jpg", "jpeg", "blp", "tga", "webp", "bmp", "gif", "tif", "tiff", "layerforge", "boxtemplate"] {
            let path = directory.join(format!("游戏图标.{ext}"));
            let bytes = vec![0, 128, 255, 42];
            write_file(path.to_string_lossy().into(), bytes.clone()).unwrap();
            assert_eq!(fs::read(&path).unwrap(), bytes);
            fs::remove_file(path).unwrap();
        }
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn rejects_invalid_paths_and_reports_write_errors() {
        assert!(allowed_path("relative.png").is_err());
        let directory = std::env::temp_dir();
        assert!(allowed_path(directory.join("missing-extension").to_str().unwrap()).is_err());
        assert!(allowed_path(directory.join("bad.exe").to_str().unwrap()).is_err());
        assert!(write_file(directory.to_string_lossy().into(), vec![0]).is_err());
        let missing = directory.join(format!("layerforge-no-parent-{}", std::process::id())).join("image.png");
        assert!(write_file(missing.to_string_lossy().into(), vec![0]).is_err());
    }
}

