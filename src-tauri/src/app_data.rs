use std::path::PathBuf;
use tauri::Manager;
pub fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("BOX_TEST_DATA_DIR") {
        let path = PathBuf::from(path);
        if !path.is_absolute() { return Err("测试数据目录必须使用绝对路径".into()); }
        return Ok(path);
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}
