use std::{fs::OpenOptions, io::Write, path::{Path, Component}};
mod icons;
mod output_folder;

#[tauri::command]
pub fn prepare_icon_pair_directory(directory: String) -> Result<(), String> {
    icons::prepare(&directory).map(|_| ())
}
#[tauri::command]
pub fn next_icon_pair_sequence(directory: String, prefix: String, start: u32) -> Result<u32, String> {
    icons::next_sequence(&directory, &prefix, start)
}
#[tauri::command]
pub fn write_icon_pair(directory: String, prefix: String, sequence: u32, normal: Vec<u8>, disabled: Vec<u8>) -> Result<Option<Vec<String>>, String> {
    icons::write_pair(&directory, &prefix, sequence, &normal, &disabled)
}

fn valid_filename(filename: &str) -> bool {
    let path = Path::new(filename);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let reserved = stem.split('.').next().unwrap_or("").to_ascii_uppercase();
    path.components().count() == 1 && matches!(path.components().next(), Some(Component::Normal(_)))
        && !filename.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        && !filename.ends_with(['.', ' ']) && !stem.is_empty()
        && !["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"].contains(&reserved.as_str())
        && ["png", "jpg", "webp", "bmp", "gif", "tif", "blp", "tga"].contains(&ext.as_str())
}

#[tauri::command]
pub fn write_batch_image(directory: String, filename: String, bytes: Vec<u8>, subdirectory: Option<String>) -> Result<String, String> {
    let root = Path::new(&directory);
    if !root.is_absolute() || !root.is_dir() || !valid_filename(&filename) {
        return Err("Invalid batch output path".into());
    }
    let resolved = output_folder::resolve(root, subdirectory.as_deref())?;
    let directory = resolved.as_path();
    if !directory.is_absolute() || !directory.is_dir() || !valid_filename(&filename) {
        return Err("Invalid batch output path".into());
    }
    let file = Path::new(&filename);
    let stem = file.file_stem().unwrap().to_string_lossy();
    let ext = file.extension().unwrap().to_string_lossy();
    for suffix in 1..100_000 {
        let name = if suffix == 1 { filename.clone() } else { format!("{} ({}).{}", stem, suffix, ext) };
        let target = directory.join(&name);
        match OpenOptions::new().write(true).create_new(true).open(&target) {
            Ok(mut output) => {
                if let Err(error) = output.write_all(&bytes) {
                    drop(output);
                    let _ = std::fs::remove_file(&target);
                    return Err(error.to_string());
                }
                return Ok(name);
            },
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Too many duplicate filenames".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_paths_and_unsupported_formats() {
        for name in ["../a.png", "..\\a.png", "C:\\a.png", "CON.png", "a:stream.png", "a.png "] { assert!(!valid_filename(name), "{name}"); }
        for name in ["中文 (2).png", "a.jpg", "a.webp", "a.bmp", "a.gif", "a.tif", "a.blp", "a.tga"] { assert!(valid_filename(name), "{name}"); }
        assert!(!valid_filename("a.exe"));
    }
    #[test]
    fn preserves_existing_files() {
        let directory = std::env::temp_dir().join(format!("box-batch-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        for ext in ["png", "blp", "tga"] {
            let filename = format!("a.{ext}");
            std::fs::write(directory.join(&filename), [1]).unwrap();
            let name = write_batch_image(directory.to_string_lossy().into(), filename.clone(), vec![2], None).unwrap();
            assert_eq!(name, format!("a (2).{ext}"));
            assert_eq!(std::fs::read(directory.join(&filename)).unwrap(), [1]);
            assert_eq!(std::fs::read(directory.join(&name)).unwrap(), [2]);
            std::fs::remove_file(directory.join(filename)).unwrap();
            std::fs::remove_file(directory.join(name)).unwrap();
        }
        std::fs::remove_dir(directory).unwrap();
    }
}
