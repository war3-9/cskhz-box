use std::{fs, path::{Path, PathBuf}};

pub(super) fn resolve(root: &Path, name: Option<&str>) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let Some(name) = name else { return Ok(root); };
    let name = name.trim_end_matches(['\\', '/']);
    let reserved = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty() || name.chars().count() > 100 || name.ends_with(['.', ' '])
        || name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"].contains(&reserved.as_str()) {
        return Err("导出路径必须是一个有效文件夹名称".into());
    }
    let output = root.join(name);
    if let Ok(metadata) = fs::symlink_metadata(&output) {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 { return Err("导出子目录不能是目录链接".into()); }
    }
    fs::create_dir_all(&output).map_err(|e| e.to_string())?;
    let resolved = output.canonicalize().map_err(|e| e.to_string())?;
    if !resolved.starts_with(&root) || resolved == root { return Err("导出子目录越过保存地址".into()); }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn writes_into_child_folder_without_overwriting_and_rejects_escape() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-results/icon-output-rust").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let result = (|| {
            for invalid in ["", "..", "../escape", "a/b", "C:\\tmp", "CON", "NUL.png", "folder.", "folder "] {
                assert!(resolve(&root, Some(invalid)).is_err(), "{invalid}");
            }
            let output = resolve(&root, Some("war3mapImported\\")).unwrap();
            assert_eq!(output, root.canonicalize().unwrap().join("war3mapImported"));
            for (bytes, expected) in [(vec![1,2], "图标.png"), (vec![3,4], "图标 (2).png")] {
                assert_eq!(crate::batch::write_batch_image(root.to_string_lossy().into(), "图标.png".into(), bytes.clone(), Some("war3mapImported\\".into())).unwrap(), expected);
                assert_eq!(fs::read(output.join(expected)).unwrap(), bytes);
            }
            assert!(!root.join("图标.png").exists());
            assert!(resolve(&root, Some("自定义文件夹")).unwrap().is_dir());
        })();
        fs::remove_dir_all(root).unwrap(); result
    }
}
