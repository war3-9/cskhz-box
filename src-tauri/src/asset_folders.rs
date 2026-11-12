use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, io::Write, path::{Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::UNIX_EPOCH};
use tauri::{Emitter, State};

#[derive(Default)]
pub struct FolderWatches(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn empty_binding_scans_external_files_and_rejects_unsafe_names() {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/ui-model-fixtures").join(uuid::Uuid::new_v4().to_string()); fs::create_dir_all(&directory).unwrap(); let base=directory.canonicalize().unwrap(); let path=display(&base);
        assert!(asset_folder_bind(path.clone()).is_ok());
        for name in ["..", ".", "CON", "LPT1.png", "a/b", "a.", "a ", "a:b"] { assert!(child(&base,name).is_err(),"{name}"); }
        fs::write(base.join("hidden.txt"),b"x").unwrap(); assert!(asset_folder_bind(path.clone()).is_err());
        fs::create_dir(base.join("素材")).unwrap();fs::write(base.join("素材/image.PNG"),b"png").unwrap();
        let a=scan("bound",&path).unwrap();assert_eq!(a.children.len(),1);assert_eq!(a.children[0].files.len(),1);
        let id=a.children[0].files[0].id.clone();fs::write(base.join("素材/image.PNG"),b"updated").unwrap();
        let b=scan("bound",&path).unwrap();assert_eq!(b.children[0].files[0].id,id);assert_ne!(a.children[0].files[0].revision,b.children[0].files[0].revision);
        fs::remove_file(base.join("素材/image.PNG")).unwrap();assert!(scan("bound",&path).unwrap().children[0].files.is_empty());
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderFile { id: String, path: String, name: String, revision: String }
#[derive(Serialize)]
pub struct ChildFolder { id: String, name: String, files: Vec<FolderFile> }
#[derive(Serialize)]
pub struct FolderSnapshot { name: String, path: String, children: Vec<ChildFolder> }
fn display(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") { format!(r"\\{unc}") } else { text.trim_start_matches(r"\\?\").into() }
}
fn plain(path: &Path) -> Result<fs::Metadata, String> {
    use std::os::windows::fs::MetadataExt;
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if meta.file_attributes() & 0x400 != 0 { return Err("不能使用目录链接或链接文件".into()); }
    Ok(meta)
}
fn root(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.is_absolute() || path.parent().is_none() || path.file_name().is_none() { return Err("请选择实际分类文件夹".into()); }
    for ancestor in path.ancestors().filter(|p| p.parent().is_some()) { plain(ancestor)?; }
    if !plain(path)?.is_dir() { return Err("分类文件夹不存在或已离线".into()); }
    path.canonicalize().map_err(|e| e.to_string())
}
fn child(root: &Path, name: &str) -> Result<PathBuf, String> {
    let upper = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty() || name.len() > 200 || name.ends_with([' ', '.']) || name.chars().any(|c| c < ' ' || "<>:\"/\\|?*".contains(c)) || ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str()) || (1..=9).any(|n| upper == format!("COM{n}") || upper == format!("LPT{n}")) { return Err("文件夹名称无效".into()); }
    let target = root.join(name);
    if target.exists() { plain(&target)?; if !target.canonicalize().map_err(|e| e.to_string())?.starts_with(root) { return Err("分类路径越界".into()); } }
    Ok(target)
}
fn identity(id: &str, relative: &str) -> String { format!("folder-{:x}", Sha256::digest(format!("{id}|{}", relative.to_lowercase()).as_bytes())) }
fn supported(path: &Path) -> bool { path.extension().and_then(|x| x.to_str()).is_some_and(|x| ["png", "jpg", "jpeg"].contains(&x.to_ascii_lowercase().as_str())) }
fn scan(id: &str, path: &str) -> Result<FolderSnapshot, String> {
    let base = root(path)?; let mut children = Vec::new(); let mut total = 0;
    for item in fs::read_dir(&base).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let Ok(meta) = plain(&item.path()) else { continue; }; if !meta.is_dir() { continue; }
        let name = item.file_name().to_string_lossy().into_owned(); let category = identity(id, &name); let mut files = Vec::new();
        for entry in fs::read_dir(item.path()).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?; if !supported(&entry.path()) { continue; }
            let Ok(meta) = plain(&entry.path()) else { continue; }; if !meta.is_file() { continue; }
            total += 1; if total > 5000 { return Err("分类文件夹超过5000张图片，请拆分分类".into()); }
            let filename = entry.file_name().to_string_lossy().into_owned();
            let modified = meta.modified().map_err(|e| e.to_string())?.duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
            files.push(FolderFile { id: identity(id, &format!("{name}/{filename}")), path: display(&entry.path()), name: filename, revision: format!("{}:{modified}", meta.len()) });
        }
        files.sort_by(|a,b| a.name.cmp(&b.name)); children.push(ChildFolder { id: category, name, files });
    }
    children.sort_by(|a,b| a.name.cmp(&b.name));
    Ok(FolderSnapshot { name: base.file_name().unwrap().to_string_lossy().into_owned(), path: display(&base), children })
}
#[tauri::command]
pub async fn asset_folder_scan(id: String, path: String) -> Result<FolderSnapshot, String> { tauri::async_runtime::spawn_blocking(move || scan(&id, &path)).await.map_err(|e| e.to_string())? }
#[tauri::command]
pub fn asset_folder_bind(path: String) -> Result<String, String> {
    let base = root(&path)?;
    if fs::read_dir(&base).map_err(|e| e.to_string())?.next().is_some() { return Err("新建大分类必须选择空文件夹（包括隐藏文件）".into()); }
    Ok(display(&base))
}
#[tauri::command]
pub fn asset_folder_create(path: String, name: String) -> Result<(), String> { let base = root(&path)?; fs::create_dir(child(&base, name.trim())?).map_err(|e| format!("创建小分类失败：{e}")) }
#[tauri::command]
pub async fn asset_folder_import(path: String, category: String, files: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = root(&path)?; let target = child(&base, &category)?; if !plain(&target)?.is_dir() { return Err("小分类不存在".into()); }
        if files.is_empty() || files.len() > 5000 { return Err("请选择1至5000张图片".into()); }
        let inputs: Vec<_> = files.iter().map(|file| {
            let p = Path::new(file); let m = plain(p)?;
            if !p.is_absolute() || !m.is_file() || !supported(p) || m.len() > 20 * 1024 * 1024 { return Err("请选择20MB以内的PNG或JPG图片".to_string()); }
            Ok(p.to_path_buf())
        }).collect::<Result<_, String>>()?;
        let mut created = Vec::new();
        let result = (|| {
            for input in inputs {
                let name = input.file_stem().unwrap().to_string_lossy(); let ext = input.extension().unwrap().to_string_lossy(); let mut sequence = 0;
                loop {
                    let filename = if sequence == 0 { format!("{name}.{ext}") } else { format!("{name}-{sequence}.{ext}") };
                    let output = child(&target, &filename)?;
                    match fs::OpenOptions::new().write(true).create_new(true).open(&output) {
                        Ok(mut file) => { created.push(output); let mut source = fs::File::open(&input).map_err(|e| e.to_string())?; std::io::copy(&mut source, &mut file).map_err(|e| e.to_string())?; file.flush().map_err(|e| e.to_string())?; break; }
                        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => { sequence += 1; if sequence > 10000 { return Err("同名图片过多".into()); } }
                        Err(e) => return Err(e.to_string()),
                    }
                }
            } Ok(())
        })();
        if result.is_err() { for file in created { let _ = fs::remove_file(file); } }
        result
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn asset_folder_recycle(path: String) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::{SHFileOperationW, SHFILEOPSTRUCTW, FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT};
    let base = root(&path)?; let text = display(&base); if text.len() > 245 { return Err("路径过长，未移动文件夹，请使用仅移除关联".into()); }
    let from: Vec<u16> = text.encode_utf16().chain([0,0]).collect();
    let mut op: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() }; op.wFunc = FO_DELETE; op.pFrom = from.as_ptr(); op.fFlags = (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT) as u16;
    let result = unsafe { SHFileOperationW(&mut op) };
    if result != 0 || op.fAnyOperationsAborted != 0 || base.exists() { return Err(format!("移入回收站失败，分类关联已保留（{result}）")); } Ok(())
}
#[tauri::command]
pub fn asset_folder_watch(app: tauri::AppHandle, state: State<FolderWatches>, id: String, path: Option<String>) -> Result<(), String> {
    let mut watches = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(old) = watches.remove(&id) { old.store(true, Ordering::Relaxed); }
    let Some(path) = path else { return Ok(()); }; let base = root(&path)?;
    let stop = Arc::new(AtomicBool::new(false)); watches.insert(id.clone(), stop.clone());
    std::thread::spawn(move || {
        use windows_sys::Win32::{Storage::FileSystem::{FindFirstChangeNotificationW, FindNextChangeNotification, FindCloseChangeNotification}, System::Threading::WaitForSingleObject, Foundation::INVALID_HANDLE_VALUE};
        let wide: Vec<u16> = base.as_os_str().to_string_lossy().encode_utf16().chain([0]).collect();
        let handle = unsafe { FindFirstChangeNotificationW(wide.as_ptr(), 1, 1 | 2 | 8 | 16) };
        if handle == INVALID_HANDLE_VALUE { let _ = app.emit("asset-folder-changed", &id); return; }
        while !stop.load(Ordering::Relaxed) {
            if unsafe { WaitForSingleObject(handle, 1000) } == 0 {
                let _ = app.emit("asset-folder-changed", &id);
                if unsafe { FindNextChangeNotification(handle) } == 0 { break; }
            }
        }
        unsafe { FindCloseChangeNotification(handle); }
    }); Ok(())
}
