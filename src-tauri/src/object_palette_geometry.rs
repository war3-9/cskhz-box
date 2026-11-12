use std::{fs, path::PathBuf, sync::mpsc, time::Duration};
use tauri::Manager;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct Geometry { pub x: f64, pub y: f64, pub width: f64, pub height: f64 }
impl Geometry {
    fn fit_minimum(mut self) -> Self {
        self.height = self.height.max(360.0);
        self
    }
    fn valid(&self) -> bool {
        [self.x, self.y, self.width, self.height].iter().all(|v| v.is_finite())
            && self.width >= 400.0 && self.width <= 4000.0 && self.height >= 310.0 && self.height <= 4000.0
    }
}
fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::app_data::directory(app)?.join("object-table/palette-window.json"))
}
pub fn load(app: &tauri::AppHandle) -> Option<Geometry> {
    let geometry: Geometry = serde_json::from_slice(&fs::read(path(app).ok()?).ok()?).ok()?;
    if !geometry.valid() { return None; }
    let geometry = geometry.fit_minimum();
    // A disconnected monitor must not leave the floating window off the desktop.
    let monitors = app.available_monitors().ok()?;
    let visible = monitors.iter().any(|monitor| {
        let scale = monitor.scale_factor();
        let p = monitor.position().to_logical::<f64>(scale);
        let s = monitor.size().to_logical::<f64>(scale);
        geometry.x >= p.x && geometry.x < p.x + s.width - 40.0
            && geometry.y >= p.y && geometry.y < p.y + s.height - 40.0
    });
    visible.then_some(geometry)
}
pub fn remember(window: &tauri::WebviewWindow) {
    let (sender, receiver) = mpsc::channel::<Geometry>();
    let app = window.app_handle().clone();
    // One background writer coalesces the entire drag/resize gesture.
    std::thread::spawn(move || {
        while let Ok(mut geometry) = receiver.recv() {
            loop {
                match receiver.recv_timeout(Duration::from_millis(250)) {
                    Ok(latest) => geometry = latest,
                    Err(_) => break,
                }
            }
            if let Ok(path) = path(&app) {
                let result = (|| -> Result<(), String> {
                    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
                    crate::object_table::atomic(&path, &serde_json::to_vec(&geometry).map_err(|e| e.to_string())?)
                })();
                if let Err(error) = result {
                    use tauri::Emitter;
                    let _ = app.emit("object-palette-geometry-error", error);
                }
            }
        }
    });
    let handle = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) | tauri::WindowEvent::CloseRequested { .. }) {
            if handle.is_minimized().unwrap_or(true) { return; }
            if let (Ok(position), Ok(size), Ok(scale)) = (handle.outer_position(), handle.inner_size(), handle.scale_factor()) {
                let p = position.to_logical::<f64>(scale); let s = size.to_logical::<f64>(scale);
                let geometry = Geometry { x: p.x, y: p.y, width: s.width, height: s.height };
                if geometry.valid() { let _ = sender.send(geometry); }
            }
        }
    });
}
pub fn save_current(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("object-palette") else { return Ok(()); };
    if window.is_minimized().map_err(|e| e.to_string())? { return Ok(()); }
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let p = window.outer_position().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let s = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let path = path(app)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    crate::object_table::atomic(&path, &serde_json::to_vec(&Geometry { x: p.x, y: p.y, width: s.width, height: s.height }).map_err(|e| e.to_string())?)
}
pub fn ensure_visible(window: &tauri::WebviewWindow) -> Result<(), String> {
    let p = window.outer_position().map_err(|e| e.to_string())?;
    let visible = window.available_monitors().map_err(|e| e.to_string())?.iter().any(|monitor| {
        let origin = monitor.position(); let size = monitor.size();
        p.x >= origin.x && p.y >= origin.y
            && i64::from(p.x) + 80 < i64::from(origin.x) + i64::from(size.width)
            && i64::from(p.y) + 40 < i64::from(origin.y) + i64::from(size.height)
    });
    if !visible { window.center().map_err(|e| e.to_string())?; }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_unusable_geometry() {
        let mut g = Geometry { x: -1000.0, y: 0.0, width: 440.0, height: 340.0 };
        assert!(g.valid()); g.height = 0.0; assert!(!g.valid());
        g.height = 340.0; g.x = f64::NAN; assert!(!g.valid());
    }
    #[test] fn upgrades_old_size_without_losing_position() {
        let g = Geometry { x: 120.0, y: 230.0, width: 440.0, height: 310.0 }.fit_minimum();
        assert_eq!((g.x, g.y, g.width, g.height), (120.0, 230.0, 440.0, 360.0));
        assert_eq!(Geometry { height: 650.0, ..g }.fit_minimum().height, 650.0);
    }
}
