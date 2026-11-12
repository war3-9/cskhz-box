use std::{fs::{self, OpenOptions}, io::Write, time::{SystemTime, UNIX_EPOCH}};

pub fn save(kind: &str, text: &str) -> Result<String, String> {
    let (name, extension) = match kind {
        "project" => ("layout", "war3ui"),
        "jass" => ("War3LabUI", "j"),
        _ => return Err("保存内容类型无效".into()),
    };
    if text.len() > 32 * 1024 * 1024 { return Err("文件超过 32 MB".into()); }
    let root = super::runtime_root::root().canonicalize().map_err(|e| e.to_string())?;
    let directory = root.join("exports");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    if directory.canonicalize().map_err(|e| e.to_string())? != directory {
        return Err("保存目录不能是符号链接".into());
    }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let target = directory.join(format!("{name}-{stamp}.{extension}"));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(target.display().to_string().trim_start_matches(r"\\?\").to_string())
}
