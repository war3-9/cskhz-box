use std::path::{Path, PathBuf};

// Discover ordinary game resources from process metadata and install registration.
// This only reads directory entries; it never loads or modifies an editor module.
#[tauri::command]
pub fn detect_editor_resource_directory() -> Result<String, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(snapshot) = super::probe::inspect() {
        for executable in [snapshot.editor_path, snapshot.game_path].into_iter().flatten() {
            if let Some(parent) = Path::new(&executable).parent() {
                candidates.push(parent.to_owned());
            }
        }
    }
    #[cfg(windows)]
    candidates.extend(crate::model_viewer::game_resources::registered_game_paths());
    for candidate in candidates {
        if !candidate.is_absolute() { continue; }
        for directory in candidate.ancestors() {
            let Ok(paths) = crate::model_viewer::persistence::viewer_game_archives(directory.to_string_lossy().into_owned()) else { continue; };
            if !paths.is_empty() {
                return directory.canonicalize().map(|path| path.display().to_string().trim_start_matches(r"\\?\").to_owned()).map_err(|error| error.to_string());
            }
        }
    }
    Err("未找到经典魔兽 MPQ 资源目录，请在图标设置中选择游戏目录。".into())
}
