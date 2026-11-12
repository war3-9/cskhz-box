use std::{fs::{self, File, OpenOptions}, io::{self, Write}, path::{Path, PathBuf}};

const NORMAL: &str = "CommandButtons";
const DISABLED: &str = "CommandButtonsDisabled";
const LIMIT: u32 = 100_000;

fn child_directory(parent: &Path, name: &str) -> Result<PathBuf, String> {
    let child = parent.join(name);
    match fs::create_dir(&child) {
        Ok(()) => {},
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {},
        Err(error) => return Err(error.to_string()),
    }
    let metadata = fs::symlink_metadata(&child).map_err(|e| e.to_string())?;
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 { return Err("图标目录不能是链接或重解析点".into()); }
    }
    if !metadata.is_dir() || metadata.file_type().is_symlink() { return Err("图标目录必须是普通文件夹".into()); }
    Ok(child)
}
pub fn prepare(directory: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = Path::new(directory);
    if !root.is_absolute() || !root.is_dir() { return Err("请选择有效的保存目录".into()); }
    let parent = child_directory(root, "ReplaceableTextures")?;
    Ok((child_directory(&parent, NORMAL)?, child_directory(&parent, DISABLED)?))
}
fn names(prefix: &str, sequence: u32) -> Result<(String, String), String> {
    if prefix.trim().is_empty() || prefix.chars().count() > 80 || prefix.ends_with(['.', ' ']) ||
        prefix.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)) || !(1..=LIMIT).contains(&sequence) {
        return Err("文件头或序号无效".into());
    }
    Ok((format!("BTN{prefix}({sequence}).blp"), format!("DISBTN{prefix}({sequence}).blp")))
}
pub fn next_sequence(directory: &str, prefix: &str, start: u32) -> Result<u32, String> {
    names(prefix, start)?;
    let (normal, disabled) = prepare(directory)?;
    for sequence in start..=LIMIT {
        let (a, b) = names(prefix, sequence)?;
        if !normal.join(a).try_exists().map_err(|e| e.to_string())? &&
            !disabled.join(b).try_exists().map_err(|e| e.to_string())? { return Ok(sequence); }
    }
    Err("可用图标序号已用完".into())
}
fn create(path: &Path) -> io::Result<File> { OpenOptions::new().write(true).create_new(true).open(path) }
fn remove_owned(paths: &[&Path]) -> Result<(), String> {
    for path in paths { fs::remove_file(path).map_err(|e| format!("清理未完成的图标失败（{}）：{e}", path.display()))?; }
    Ok(())
}
fn finish_pair(mut normal_file: File, mut disabled_file: File, normal: &[u8], disabled: &[u8], paths: &[&Path]) -> Result<(), String> {
    let result = normal_file.write_all(normal).and_then(|_| disabled_file.write_all(disabled))
        .and_then(|_| normal_file.sync_all()).and_then(|_| disabled_file.sync_all());
    drop(normal_file);
    drop(disabled_file);
    if let Err(error) = result { remove_owned(paths)?; return Err(error.to_string()); }
    Ok(())
}
// None means a collision; callers choose another sequence and rerender text if needed.
pub fn write_pair(directory: &str, prefix: &str, sequence: u32, normal: &[u8], disabled: &[u8]) -> Result<Option<Vec<String>>, String> {
    let (a, b) = names(prefix, sequence)?;
    let (normal_dir, disabled_dir) = prepare(directory)?;
    let normal_path = normal_dir.join(&a);
    let disabled_path = disabled_dir.join(&b);
    let normal_file = match create(&normal_path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let disabled_file = match create(&disabled_path) {
        Ok(file) => file,
        Err(error) => {
            drop(normal_file);
            remove_owned(&[&normal_path])?;
            return if error.kind() == io::ErrorKind::AlreadyExists { Ok(None) } else { Err(error.to_string()) };
        },
    };
    finish_pair(normal_file, disabled_file, normal, disabled, &[&normal_path, &disabled_path])?;
    Ok(Some(vec![format!("ReplaceableTextures/{NORMAL}/{a}"), format!("ReplaceableTextures/{DISABLED}/{b}")]))
}

#[cfg(test)]
#[path = "icons_tests.rs"]
mod tests;
