use tauri::{AppHandle, Emitter, Manager, menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}};

pub fn restore(app: &AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("主窗口不可用")?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") { tray.set_visible(false).map_err(|e| e.to_string())?; }
    Ok(())
}

pub fn initialize(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let minimum = tauri::PhysicalSize::new(1570_u32, 962_u32);
        window.set_min_size(Some(minimum))?;
        window.set_size(minimum)?;
        let handle = window.clone();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::ScaleFactorChanged { .. }) {
                let _ = handle.set_min_size(Some(tauri::PhysicalSize::new(1570_u32, 962_u32)));
            }
        });
    }
    let show = MenuItem::with_id(app, "show", "打开超时空盒子开源版", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "退出软件", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &exit])?;
    let mut builder = TrayIconBuilder::with_id("main-tray").tooltip("超时空盒子开源版").menu(&menu).show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => { let _ = restore(app); }
            "exit" => { let _ = restore(app); let _ = app.emit("app-exit-requested", ()); }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }) {
                let _ = restore(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() { builder = builder.icon(icon.clone()); }
    builder.build(app)?.set_visible(false)?;
    Ok(())
}

#[tauri::command]
pub fn desktop_hide_to_tray(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("主窗口不可用")?;
    let tray = app.tray_by_id("main-tray").ok_or("系统托盘不可用")?;
    tray.set_visible(true).map_err(|e| e.to_string())?;
    if let Err(error) = window.hide() {
        let _ = tray.set_visible(false);
        return Err(error.to_string());
    }
    Ok(())
}

// Isolated previews and final EXE checks must never activate the user's production window.
pub fn context() -> tauri::Context<tauri::Wry> {
    let mut context = tauri::generate_context!();
    if let Some(directory) = std::env::var_os("BOX_TEST_DATA_DIR") {
        use sha2::{Digest, Sha256};
        let path = std::path::PathBuf::from(directory);
        let test_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results");
        let private_release_test = path.canonicalize().ok().zip(test_root.canonicalize().ok())
            .is_some_and(|(path, root)| path.starts_with(root));
        if !cfg!(debug_assertions) && !private_release_test { return context; }
        let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();
        let digest = format!("{:x}", Sha256::digest(normalized.as_bytes()));
        context.config_mut().identifier.push_str(&format!(".test-{}", &digest[..16]));
    }
    context
}
