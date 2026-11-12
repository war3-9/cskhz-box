use std::{collections::BTreeMap, fs::{self, OpenOptions}, io::{Read, Seek, SeekFrom}, os::windows::{ffi::OsStrExt, fs::OpenOptionsExt}, path::Path};
use sha2::{Digest, Sha256};
use super::{delete_backup, index::{self, Source}, map_ops, storm::Archive};

fn digest(path: &Path) -> Result<[u8; 32], String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new(); let mut buffer = [0; 65536];
    loop { let count = file.read(&mut buffer).map_err(|e| e.to_string())?; if count == 0 { break; } hash.update(&buffer[..count]); }
    Ok(hash.finalize().into())
}

pub(super) fn execute(source: &Source, paths: &[String], base: Option<&Path>) -> Result<(Source, String), String> {
    let path = Path::new(&source.path);
    if source.kind != "archive" || !path.is_absolute() || !matches!(path.extension().and_then(|ext| ext.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("w3x" | "w3m")) { return Err("删除资源只支持当前 W3X/W3M 地图".into()); }
    if fs::metadata(path).map_err(|e| e.to_string())?.permissions().readonly() { return Err("地图为只读，未执行删除".into()); }
    let mut prefix = [0; 0x820];
    let read = fs::File::open(path).and_then(|mut file| file.read(&mut prefix)).map_err(|e| e.to_string())?;
    if super::content::has_hm3w_external_payload(&prefix[..read], fs::metadata(path).map_err(|e| e.to_string())?.len()) { return Err("外置保护地图仅支持只读预览和资源导出，不能删除资源".into()); }
    let expected = digest(path)?;
    let archive = Archive::open(path)?;
    if archive.external_count().is_some() { return Err("保护地图仅支持只读预览和资源导出，不能删除资源".into()); }
    for name in paths {
        let entry = source.entries.iter().find(|entry| entry.path.replace('\\', "/").eq_ignore_ascii_case(&name.replace('\\', "/"))).ok_or("资源不在当前地图")?;
        let bytes = archive.read_raw(entry.raw_name.as_deref().ok_or("缺少资源归档标识，请重新打开地图")?)?;
        if bytes.len() as u64 != entry.size { return Err("地图资源已变化，请重新打开地图".into()); }
    }
    drop(archive);
    let resources = super::delete_resources::collect(source, paths)?;
    let mut original = OpenOptions::new().read(true).share_mode(1 | 4).open(path)
        .map_err(|e| format!("地图被占用或只读，请关闭使用此地图的编辑器后重试：{e}"))?;
    if digest(path)? != expected { return Err("地图已变化，未执行删除，请重新打开地图".into()); }
    let backup = delete_backup::create(&source.path, base)?;
    for (name, bytes) in &resources { delete_backup::write(&backup, name, bytes)?; }
    // This recovery file is an exact original, not a new playable map or edited copy.
    let recovery = backup.join("原地图恢复.boxbackup");
    let mut copy = OpenOptions::new().write(true).create_new(true).open(&recovery).map_err(|e| e.to_string())?;
    original.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    std::io::copy(&mut original, &mut copy).map_err(|e| e.to_string())?; copy.sync_all().map_err(|e| e.to_string())?; drop(copy);
    if digest(&recovery)? != expected { return Err("原地图备份校验失败，未执行删除".into()); }
    let stage = path.with_file_name(format!(".box-delete-{}.{}", uuid::Uuid::new_v4(), path.extension().unwrap_or_default().to_string_lossy()));
    let result = (|| {
        map_ops::mutate(source, stage.to_str().ok_or("地图路径无法编码")?, paths, &BTreeMap::new(), true)?;
        let verify = Archive::open(&stage)?;
        for name in paths {
            let raw = source.entries.iter().find(|entry| entry.path.replace('\\', "/").eq_ignore_ascii_case(&name.replace('\\', "/"))).and_then(|entry| entry.raw_name.as_deref()).ok_or("缺少资源标识")?;
            // Anonymous FileNNNN tokens name block indices. StormLib may reuse a
            // freed block for its listfile, so require the deleted bytes to be gone.
            if verify.read_raw(raw).ok().as_deref() == resources.get(name).map(Vec::as_slice) { return Err("删除资源读回校验失败，原地图保留".into()); }
        }
        drop(verify);
        let mut refreshed = index::scan(stage.to_string_lossy().into_owned(), source.id.clone(), &std::sync::atomic::AtomicBool::new(false))?;
        refreshed.path = source.path.clone(); refreshed.name = source.name.clone();
        if digest(path)? != expected { return Err("删除期间地图已变化，原地图保留".into()); }
        let staged_hash = digest(&stage)?;
        let replaced = path.with_file_name(format!(".box-delete-original-{}.boxbackup", uuid::Uuid::new_v4()));
        let wide = |path: &Path| path.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>();
        if unsafe { windows_sys::Win32::Storage::FileSystem::ReplaceFileW(wide(path).as_ptr(), wide(&stage).as_ptr(), wide(&replaced).as_ptr(), 0, std::ptr::null(), std::ptr::null()) } == 0 {
            return Err(format!("地图替换失败，原地图与下载备份保留：{}", std::io::Error::last_os_error()));
        }
        // Capture and verify the exact file replaced, including the final rename race.
        if digest(&replaced)? != expected {
            if digest(path)? != staged_hash { return Err(format!("检测到其他程序并发替换，当前地图与原图备份保留：{}", replaced.display())); }
            let restored = unsafe { windows_sys::Win32::Storage::FileSystem::ReplaceFileW(wide(path).as_ptr(), wide(&replaced).as_ptr(), std::ptr::null(), 0, std::ptr::null(), std::ptr::null()) };
            return Err(if restored != 0 { "检测到并发替换，已恢复其他程序修改的地图".into() } else { format!("并发修改恢复失败，原图备份保留：{}", replaced.display()) });
        }
        let _ = fs::remove_file(&replaced);
        Ok((refreshed, backup.to_string_lossy().into_owned()))
    })();
    if stage.exists() { let _ = fs::remove_file(&stage); }
    result.map_err(|error| format!("{error}；备份：{}", backup.display()))
}
