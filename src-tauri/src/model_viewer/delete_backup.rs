use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}};
use super::index::safe_relative;

pub(super) const MARKER: &str = ".box-deleted-resources";

fn downloads() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("BOX_TEST_DATA_DIR") {
        let root = PathBuf::from(root);
        if !root.is_absolute() { return Err("隔离测试数据目录必须为绝对路径".into()); }
        return Ok(root.join("Downloads"));
    }
    use std::os::windows::ffi::OsStringExt;
    #[repr(C)]
    struct Guid { a: u32, b: u16, c: u16, d: [u8; 8] }
    #[link(name = "shell32")]
    extern "system" { fn SHGetKnownFolderPath(id: *const Guid, flags: u32, token: *mut std::ffi::c_void, path: *mut *mut u16) -> i32; }
    #[link(name = "ole32")]
    extern "system" { fn CoTaskMemFree(memory: *mut std::ffi::c_void); }
    let id = Guid { a: 0x374de290, b: 0x123f, c: 0x4565, d: [0x91, 0x64, 0x39, 0xc4, 0x92, 0x5e, 0x46, 0x7b] };
    let mut value = std::ptr::null_mut();
    if unsafe { SHGetKnownFolderPath(&id, 0, std::ptr::null_mut(), &mut value) } < 0 || value.is_null() { return Err("无法取得系统下载文件夹，未执行删除".into()); }
    let mut length = 0;
    unsafe { while *value.add(length) != 0 { length += 1; } }
    let path = PathBuf::from(std::ffi::OsString::from_wide(unsafe { std::slice::from_raw_parts(value, length) }));
    unsafe { CoTaskMemFree(value.cast()); }
    Ok(path)
}

pub(super) fn create(source: &str, base: Option<&Path>) -> Result<PathBuf, String> {
    let base = match base { Some(path) => path.to_path_buf(), None => downloads()? }.join("已删除模型");
    fs::create_dir_all(&base).map_err(|e| format!("无法创建下载备份目录，未执行删除：{e}"))?;
    if !base.join(MARKER).exists() { write(&base, MARKER, b"Box deleted model resources")?; }
    let name = Path::new(source).file_stem().unwrap_or_default().to_string_lossy();
    let name: String = name.chars().take(60).map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
    let directory = base.join(format!("{name}-{stamp}-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&directory).map_err(|e| e.to_string())?;
    Ok(directory)
}

pub(super) fn write(directory: &Path, name: &str, bytes: &[u8]) -> Result<(), String> {
    let path = directory.join(safe_relative(name)?);
    fs::create_dir_all(path.parent().ok_or("备份路径无效")?).map_err(|e| e.to_string())?;
    if !path.parent().unwrap().canonicalize().map_err(|e| e.to_string())?.starts_with(directory.canonicalize().map_err(|e| e.to_string())?) { return Err("备份路径越过目标目录".into()); }
    let mut file = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
    file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    if fs::read(&path).map_err(|e| e.to_string())? != bytes { return Err("删除资源备份读回失败，未执行删除".into()); }
    Ok(())
}
