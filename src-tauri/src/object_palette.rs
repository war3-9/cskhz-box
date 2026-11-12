use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct PaletteState(pub Mutex<Option<serde_json::Value>>, pub AtomicBool);

#[tauri::command]
pub async fn object_palette_prepare(app: tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window("object-palette").is_some() { return Ok(()); }
    app.state::<PaletteState>().1.store(false, Ordering::Release);
    let mut builder = tauri::WebviewWindowBuilder::new(&app, "object-palette", tauri::WebviewUrl::App("index.html?object-palette".into()))
        .title("文字色板").inner_size(440.0, 380.0).min_inner_size(400.0, 360.0)
        .visible(false).always_on_top(true).skip_taskbar(true).decorations(false).resizable(true);
    if let Some(g) = crate::object_palette_geometry::load(&app) {
        builder = builder.inner_size(g.width, g.height).position(g.x, g.y);
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    crate::object_palette_geometry::remember(&window);
    let handle = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.emit("object-palette-close-requested", ());
        }
    });
    Ok(())
}

#[tauri::command]
pub fn object_palette_ready(app: tauri::AppHandle, state: tauri::State<PaletteState>) -> Result<(), String> {
    state.1.store(true, Ordering::Release);
    if state.0.lock().map_err(|e| e.to_string())?.is_some() {
        object_palette_reveal(app)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn object_palette_open(app: tauri::AppHandle, target: serde_json::Value, state: tauri::State<'_, PaletteState>) -> Result<(), String> {
    if target.to_string().len() > 2_000_000 || !target["token"].is_string() || !target["raw"].is_string() { return Err("无效的色板单元格".into()); }
    *state.0.lock().map_err(|e| e.to_string())? = Some(target.clone());
    object_palette_prepare(app.clone()).await?;
    if let Some(window) = app.get_webview_window("object-palette") {
        window.emit("object-palette-target", target).map_err(|e| e.to_string())?;
        if state.1.load(Ordering::Acquire) { object_palette_reveal(app)?; }
        return Ok(());
    }
    Err("色板窗口尚未创建，请重试".into())
}
#[tauri::command]
pub fn object_palette_target(state: tauri::State<PaletteState>) -> Result<Option<serde_json::Value>, String> {
    state.0.lock().map(|value| value.clone()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn object_palette_reveal(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("object-palette").ok_or("色板窗口尚未创建，请重试")?;
    window.unminimize().map_err(|e| e.to_string())?;
    crate::object_palette_geometry::ensure_visible(&window)?;
    window.show().and_then(|_| window.set_focus()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn object_palette_hide(app: tauri::AppHandle, state: tauri::State<PaletteState>, token: Option<String>) -> Result<(), String> {
    let mut target = state.0.lock().map_err(|e| e.to_string())?;
    // A delayed close of the previous cell must not hide a newly opened cell.
    if target.is_some() && token.as_deref().is_some_and(|token| target.as_ref().and_then(|value| value["token"].as_str()) != Some(token)) { return Ok(()); }
    crate::object_palette_geometry::save_current(&app)?;
    *target = None;
    if let Some(window) = app.get_webview_window("object-palette") { window.hide().map_err(|e| e.to_string())?; }
    Ok(())
}
#[tauri::command]
pub fn object_palette_remember(app: tauri::AppHandle) -> Result<(), String> {
    crate::object_palette_geometry::save_current(&app)
}
