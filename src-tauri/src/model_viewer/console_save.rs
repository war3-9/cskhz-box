use std::{collections::HashSet, fs::{self, File, OpenOptions}, io::{Read, Seek, SeekFrom, Write}, os::windows::{ffi::OsStrExt, fs::OpenOptionsExt}, path::Path};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use super::{console_font, console_replace, map_ops, storm::Archive, ViewerState};

#[derive(Deserialize)]
pub struct Change { pub path: String, pub bytes: Option<Vec<u8>> }
#[derive(Serialize)]
pub struct Saved { pub fingerprint: String, pub backup: String }
const EXTRA: &[&str] = &[r"ReplaceableTextures\CommandButtons\BTNMove.blp", r"ReplaceableTextures\CommandButtons\BTNStop.blp",
    r"ReplaceableTextures\CommandButtons\BTNHoldPosition.blp", r"ReplaceableTextures\CommandButtons\BTNAttack.blp", "war3mapMap.blp"];
fn valid_map(path: &Path) -> bool { path.is_absolute() && path.extension().and_then(|s| s.to_str()).is_some_and(|s| s.eq_ignore_ascii_case("w3x") || s.eq_ignore_ascii_case("w3m")) }
fn hash(file: &mut File) -> Result<String, String> {
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut sha = Sha256::new(); let mut buf = [0u8; 65536];
    loop { let count = file.read(&mut buf).map_err(|e| e.to_string())?; if count == 0 { break; } sha.update(&buf[..count]); }
    Ok(format!("{:x}", sha.finalize()))
}
pub fn fingerprint(path: &Path) -> Result<String, String> {
    if !valid_map(path) { return Err("请选择魔兽地图绝对路径".into()); }
    hash(&mut File::open(path).map_err(|e| e.to_string())?)
}
fn same(a: &str, b: &str) -> bool { a.replace('/', "\\").eq_ignore_ascii_case(&b.replace('/', "\\")) }
fn validate(changes: &[Change]) -> Result<(), String> {
    if changes.is_empty() || changes.len() > 21 { return Err("没有可保存的资源或数量过多".into()); }
    let mut names = HashSet::new(); let mut total = 0usize;
    for change in changes {
        let font = same(&change.path, console_font::FILE);
        let skin = same(&change.path, console_font::SKIN);
        if !(font || skin || console_replace::PATHS.iter().chain(EXTRA).any(|name| same(name, &change.path))) || !names.insert(change.path.replace('/', "\\").to_lowercase()) {
            return Err("保存列表包含未知或重复资源路径".into());
        }
        if let Some(bytes) = &change.bytes {
            total += bytes.len();
            if skin { console_font::validate_skin(bytes)?; continue; }
            if font { if bytes.len() > 20 * 1024 * 1024 { return Err("字体文件超过20MB".into()); } continue; }
            if bytes.len() < 156 || bytes.len() > 20 * 1024 * 1024 || !matches!(&bytes[..4], b"BLP1" | b"BLP2") { return Err("保存贴图必须为有效的 BLP".into()); }
            let width = u32::from_le_bytes(bytes[12..16].try_into().unwrap()); let height = u32::from_le_bytes(bytes[16..20].try_into().unwrap());
            if !width.is_power_of_two() || !height.is_power_of_two() || width > 8192 || height > 8192 { return Err("贴图尺寸无效".into()); }
        }
    }
    if total > 102 * 1024 * 1024 { return Err("保存资源总量超过102MB".into()); }
    Ok(())
}
pub fn save(path: &Path, expected: &str, changes: &[Change]) -> Result<Saved, String> {
    if !valid_map(path) { return Err("请选择魔兽地图绝对路径".into()); }
    validate(changes)?;
    let source = Archive::open(path)?;
    let had_imports = source.has("war3map.imp");
    let mut imports = if had_imports { map_ops::import_list(&source.read("war3map.imp")?)? } else { vec![] };
    imports.retain(|(flag, raw)| {
        let name = String::from_utf8_lossy(raw); let full = if *flag == 5 || *flag == 8 { format!("war3mapImported\\{name}") } else { name.into_owned() };
        !changes.iter().any(|change| same(&full, &change.path))
    });
    for change in changes { if change.bytes.is_some() { imports.push((13, change.path.replace('/', "\\").into_bytes())); } }
    drop(source);
    // Read StormLib metadata before taking the writer handle: StormLib's reader
    // does not share writes. The fingerprint below also validates that metadata.
    let mut original = OpenOptions::new().read(true).write(true).share_mode(1 | 4).open(path)
        .map_err(|e| format!("地图被占用、只读或无法写入，请关闭占用该地图的编辑器后重试：{e}"))?;
    if hash(&mut original)? != expected { return Err("地图已被其他程序修改，请重新打开地图后再保存".into()); }
    let parent = path.parent().ok_or("地图目录无效")?; let name = path.file_name().ok_or("地图名称无效")?.to_string_lossy();
    let token = uuid::Uuid::new_v4();
    let stage = parent.join(format!(".{name}.ui-stage-{token}"));
    let backup = parent.join(format!("{}.ui-backup-{token}.{}", path.file_stem().unwrap().to_string_lossy(), path.extension().unwrap().to_string_lossy()));
    let result = (|| {
        let mut output = OpenOptions::new().write(true).create_new(true).open(&stage).map_err(|e| e.to_string())?;
        original.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        std::io::copy(&mut original, &mut output).map_err(|e| e.to_string())?; output.flush().map_err(|e| e.to_string())?; drop(output);
        let archive = Archive::writable_copy(&stage)?;
        for change in changes { match &change.bytes {
            Some(bytes) => archive.write(&change.path, bytes, true)?,
            None if archive.has(&change.path) => archive.remove(change.path.as_bytes())?,
            None => (),
        } }
        if had_imports || changes.iter().any(|change| change.bytes.is_some()) { archive.write("war3map.imp", &map_ops::encode_list(&imports), true)?; }
        archive.flush()?; drop(archive);
        let verify = Archive::open(&stage)?;
        for change in changes { match &change.bytes {
            Some(bytes) if verify.read(&change.path)? != *bytes => return Err("保存后贴图校验失败".into()),
            None if verify.has(&change.path) => return Err("重置贴图校验失败".into()),
            _ => (),
        } }
        drop(verify);
        let new_hash = hash(&mut File::open(&stage).map_err(|e| e.to_string())?)?;
        if fingerprint(path)? != expected { return Err("保存期间地图已变化，已停止覆盖".into()); }
        let wide = |p: &Path| p.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>();
        #[link(name = "kernel32")]
        extern "system" { fn ReplaceFileW(target: *const u16, replacement: *const u16, backup: *const u16, flags: u32, exclude: *mut std::ffi::c_void, reserved: *mut std::ffi::c_void) -> i32; }
        if unsafe { ReplaceFileW(wide(path).as_ptr(), wide(&stage).as_ptr(), wide(&backup).as_ptr(), 0, std::ptr::null_mut(), std::ptr::null_mut()) } == 0 {
            return Err(format!("地图替换失败，原文件或其备份仍保留：{}", std::io::Error::last_os_error()));
        }
        Ok(Saved { fingerprint: new_hash, backup: backup.to_string_lossy().into_owned() })
    })();
    if stage.exists() { let _ = fs::remove_file(&stage); }
    result
}
#[tauri::command]
pub async fn console_map_fingerprint(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || fingerprint(Path::new(&path))).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn console_save_map(path: String, fingerprint: String, mut changes: Vec<Change>, font: Option<console_font::Edit>, state: tauri::State<'_, ViewerState>) -> Result<Saved, String> {
    let lock = state.mutations.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        if changes.iter().any(|change| same(&change.path, console_font::FILE) || same(&change.path, console_font::SKIN)) {
            return Err("字体修改必须使用字体保存参数".into());
        }
        if let Some(font) = font { changes.extend(console_font::changes(Path::new(&path), font)?); }
        save(Path::new(&path), &fingerprint, &changes)
    }).await.map_err(|e| e.to_string())?
}
#[cfg(test)]
#[path = "console_save_tests.rs"]
mod tests;
