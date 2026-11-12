mod probe;
pub mod resource_directory;
mod save;
mod triggers;
mod runtime_root;
pub mod workspace;
pub mod designs;
pub use runtime_root::initialize;

#[tauri::command]
pub fn save_lab_triggers(wtg: Vec<u8>, wct: Vec<u8>) -> Result<String, String> { triggers::save(&wtg, &wct) }
#[tauri::command]
pub fn open_lab_export_folder(directory_name: String) -> Result<(), String> { triggers::open_folder(&directory_name) }
#[tauri::command]
pub fn save_lab_text(kind: String, text: String) -> Result<String, String> { save::save(&kind, &text) }
#[tauri::command]
pub fn bridge_probe() -> Result<probe::BridgeSnapshot, String> { probe::inspect() }
