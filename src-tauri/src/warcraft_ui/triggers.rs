use std::{fs, os::windows::process::CommandExt, process::Command, time::{SystemTime, UNIX_EPOCH}};

pub fn open_folder(directory_name: &str) -> Result<(), String> {
    if !directory_name.starts_with("T-") || directory_name.len() > 100 || !directory_name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') { return Err("导出目录无效".into()); }
    let root = super::runtime_root::root().canonicalize().map_err(|e| e.to_string())?;
    let exports = root.join("exports");
    fs::create_dir_all(&exports).map_err(|e| e.to_string())?;
    if exports.canonicalize().map_err(|e| e.to_string())? != exports { return Err("导出目录无效".into()); }
    let target = exports.join(directory_name);
    let metadata = fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() || target.canonicalize().map_err(|e| e.to_string())? != target {
        return Err("导出目录无效".into());
    }
    for name in ["war3map.wtg", "war3map.wct"] {
        let path = target.join(name);
        let file = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if !file.is_file() || file.file_type().is_symlink() { return Err("触发器文件不完整".into()); }
    }
    Command::new("explorer.exe").arg(target).creation_flags(0x08000000).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save(wtg: &[u8], wct: &[u8]) -> Result<String, String> {
    if wtg.len() > 1024 * 1024 || wtg.len() < 8 || &wtg[..4] != b"WTG!" || wtg[4..8] != [7, 0, 0, 0] || wct.len() != 17 || wct[..4] != [1, 0, 0, 0] {
        return Err("触发文件格式无效".into());
    }
    let root = super::runtime_root::root().canonicalize().map_err(|e| e.to_string())?;
    let exports = root.join("exports"); fs::create_dir_all(&exports).map_err(|e| e.to_string())?;
    if exports.canonicalize().map_err(|e| e.to_string())? != exports { return Err("导出目录不能是符号链接".into()); }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let target = exports.join(format!("T-{stamp}")); fs::create_dir(&target).map_err(|e| e.to_string())?;
    fs::write(target.join("war3map.wtg"), wtg).map_err(|e| e.to_string())?;
    fs::write(target.join("war3map.wct"), wct).map_err(|e| e.to_string())?;
    Ok(target.display().to_string().trim_start_matches(r"\\?\").to_string())
}
