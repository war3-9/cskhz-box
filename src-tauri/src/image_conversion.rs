use std::{fs, io::Read, path::{Path, PathBuf}};
use serde::Serialize;

const MAX_IMAGE_BYTES: u64 = 128 * 1024 * 1024;

#[derive(Serialize)]
pub struct ImageFile { path: String, name: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSource {
    directory: String,
    output_directory: String,
    files: Vec<ImageFile>,
}

fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") { return format!(r"\\{unc}"); }
    text.trim_start_matches(r"\\?\").to_string()
}

fn supported(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str())
        .is_some_and(|ext| ["blp", "tga", "png", "jpg", "jpeg"].contains(&ext.to_ascii_lowercase().as_str()))
}

fn plain_metadata(path: &Path) -> Result<fs::Metadata, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| format!("无法访问图片路径：{error}"))?;
    use std::os::windows::fs::MetadataExt;
    if metadata.file_attributes() & 0x400 != 0 { return Err("请选择实际文件或文件夹，不能使用链接".into()); }
    Ok(metadata)
}

fn image_file(path: &Path) -> Result<ImageFile, String> {
    if !supported(path) || !plain_metadata(path)?.is_file() {
        return Err("请选择 BLP、TGA、PNG 或 JPG 图片文件".into());
    }
    Ok(ImageFile { path: display_path(path), name: path.file_name().unwrap().to_string_lossy().into_owned() })
}

fn scan(path: &str) -> Result<ImageSource, String> {
    let selected = Path::new(path);
    if !selected.is_absolute() { return Err("图片路径必须是绝对路径".into()); }
    let metadata = plain_metadata(selected)?;
    let resolved = selected.canonicalize().map_err(|error| error.to_string())?;
    let (directory, mut files) = if metadata.is_dir() {
        let mut files = Vec::new();
        for entry in fs::read_dir(&resolved).map_err(|error| format!("无法读取图片文件夹：{error}"))? {
            let entry = entry.map_err(|error| error.to_string())?;
            if supported(&entry.path()) && entry.file_type().map_err(|error| error.to_string())?.is_file() {
                if let Ok(file) = image_file(&entry.path()) { files.push(file); }
                if files.len() > 10_000 { return Err("文件夹中图片超过 10000 张，请分批转换".into()); }
            }
        }
        (resolved, files)
    } else {
        let file = image_file(&resolved)?;
        (resolved.parent().ok_or("图片所在文件夹无效")?.to_path_buf(), vec![file])
    };
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.name.cmp(&b.name)));
    Ok(ImageSource { output_directory: display_path(&directory.join("转换图片")), directory: display_path(&directory), files })
}

fn read_image(path: &str) -> Result<Vec<u8>, String> {
    let path = Path::new(path);
    if !path.is_absolute() { return Err("图片路径必须是绝对路径".into()); }
    image_file(path)?;
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    if file.metadata().map_err(|error| error.to_string())?.len() > MAX_IMAGE_BYTES {
        return Err("单张图片不能超过 128 MB".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_BYTES + 1).read_to_end(&mut bytes).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES { return Err("单张图片不能超过 128 MB".into()); }
    Ok(bytes)
}

fn output_path(directory: &str) -> Result<PathBuf, String> {
    let path = Path::new(directory);
    if !path.is_absolute() || path.file_name().is_none_or(|name| name != "转换图片") || !plain_metadata(path)?.is_dir() {
        return Err("转换图片目录不存在或无效".into());
    }
    path.canonicalize().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn image_conversion_prepare(directory: String) -> Result<String, String> {
    let root = Path::new(&directory);
    if !root.is_absolute() || !plain_metadata(root)?.is_dir() { return Err("图片目录无效".into()); }
    let output = root.join("转换图片");
    if !output.exists() { fs::create_dir(&output).map_err(|e| e.to_string())?; }
    let resolved = output_path(&display_path(&output))?;
    crate::batch::prepare_icon_pair_directory(display_path(&resolved))?;
    Ok(display_path(&resolved))
}

#[tauri::command]
pub async fn image_conversion_scan(path: String) -> Result<ImageSource, String> {
    tauri::async_runtime::spawn_blocking(move || scan(&path)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn image_conversion_read(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || read_image(&path)).await.map_err(|error| error.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn image_conversion_open(directory: String) -> Result<(), String> {
    use std::{os::windows::process::CommandExt, process::Command};
    let target = output_path(&directory)?;
    Command::new("explorer.exe").arg(display_path(&target)).creation_flags(0x08000000).spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests;
