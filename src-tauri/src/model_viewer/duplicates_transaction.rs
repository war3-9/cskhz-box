use std::{collections::BTreeMap, fs::{self, OpenOptions}, io::{Read, Write}, os::windows::{ffi::OsStrExt, fs::OpenOptionsExt}, path::{Path, PathBuf}};
use super::{duplicates::{self, Snapshot}, index::{self, Source}, storm::Archive};

pub(super) fn writable(source: &Source) -> Result<(), String> {
    if source.kind == "folder" { return Ok(()); }
    let path = Path::new(&source.path);
    if source.kind != "archive" || !source.complete || source.entries.iter().any(|entry| entry.anonymous) || !path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("w3x") || ext.eq_ignore_ascii_case("w3m")) { return Err("修改重复资源仅支持本地文件夹或文件清单完整的普通地图".into()); }
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let length = file.metadata().map_err(|e| e.to_string())?.len();
    let mut prefix = vec![0; length.min(0x820) as usize]; file.read_exact(&mut prefix).map_err(|e| e.to_string())?;
    if super::content::has_hm3w_external_payload(&prefix, length) || Archive::open(path)?.external_count().is_some() { return Err("保护地图仅支持查重预览，不能修改资源".into()); }
    if fs::metadata(path).map_err(|e| e.to_string())?.permissions().readonly() { return Err("地图为只读，未执行修改".into()); }
    Ok(())
}
fn wide(path: &Path) -> Vec<u16> { path.as_os_str().encode_wide().chain(Some(0)).collect() }
fn replace(original: &Path, stage: &Path, backup: Option<&Path>) -> Result<(), String> {
    let saved = backup.map(wide);
    if unsafe { windows_sys::Win32::Storage::FileSystem::ReplaceFileW(wide(original).as_ptr(), wide(stage).as_ptr(), saved.as_ref().map_or(std::ptr::null(), |path| path.as_ptr()), 0, std::ptr::null(), std::ptr::null()) } == 0 { return Err(format!("资源替换失败：{}", std::io::Error::last_os_error())); }
    Ok(())
}
fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path).map_err(|e| e.to_string())?;
    file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    if fs::read(path).map_err(|e| e.to_string())? != bytes { return Err("暂存资源读回失败".into()); }
    Ok(())
}

pub(super) fn apply(snapshot: &Snapshot, removed: &[String], changed: &BTreeMap<String, Vec<u8>>, base: Option<&Path>) -> Result<String, String> {
    writable(&snapshot.source)?;
    let backup = super::delete_backup::create(&snapshot.source.path, base)?;
    let originals: Vec<_> = removed.iter().chain(changed.keys()).cloned().collect();
    for (name, bytes) in super::delete_resources::collect(&snapshot.source, &originals)? { super::delete_backup::write(&backup, &name, &bytes)?; }
    let result = if snapshot.source.kind == "folder" { folder(snapshot, removed, changed) } else { map(snapshot, removed, changed, &backup) };
    result.map_err(|error| format!("{error}；恢复备份：{}", backup.display()))?;
    Ok(backup.to_string_lossy().into())
}

fn map(snapshot: &Snapshot, removed: &[String], changed: &BTreeMap<String, Vec<u8>>, backup: &Path) -> Result<(), String> {
    let path = Path::new(&snapshot.source.path);
    let _hold = OpenOptions::new().read(true).share_mode(1 | 4).open(path).map_err(|e| format!("地图被占用，未执行修改：{e}"))?;
    let original = fs::read(path).map_err(|e| e.to_string())?;
    if duplicates::snapshot(&snapshot.source)?.fingerprint != snapshot.fingerprint { return Err("地图已变化，未执行修改".into()); }
    super::delete_backup::write(backup, "原地图恢复.boxbackup", &original)?;
    let stage = path.with_file_name(format!(".box-merge-{}.{}", uuid::Uuid::new_v4(), path.extension().unwrap().to_string_lossy()));
    let replaced = path.with_file_name(format!(".box-merge-original-{}.boxbackup", uuid::Uuid::new_v4()));
    let result: Result<(), String> = (|| {
        super::map_ops::mutate(&snapshot.source, stage.to_str().ok_or("地图路径编码失败")?, removed, &BTreeMap::new(), true)?;
        let archive = Archive::writable_copy(&stage)?;
        for (name, bytes) in changed { archive.write(name, bytes, true)?; }
        archive.flush()?; drop(archive);
        let verify = Archive::open(&stage)?;
        for (name, bytes) in changed { if verify.read(&name.replace('/', "\\"))? != *bytes { return Err("模型写回校验失败，原地图保留".into()); } }
        for name in removed { if verify.has(&name.replace('/', "\\")) { return Err("重复贴图删除校验失败，原地图保留".into()); } }
        drop(verify);
        // Validate a readable final index before committing the staged archive.
        index::scan(stage.to_string_lossy().into_owned(), snapshot.source.id.clone(), &std::sync::atomic::AtomicBool::new(false))?;
        if fs::read(path).map_err(|e| e.to_string())? != original { return Err("地图已被其他程序修改，原地图保留".into()); }
        let staged_hash = duplicates::digest(&fs::read(&stage).map_err(|e| e.to_string())?);
        replace(path, &stage, Some(&replaced))?;
        if fs::read(&replaced).map_err(|e| e.to_string())? != original {
            if duplicates::digest(&fs::read(path).map_err(|e| e.to_string())?) == staged_hash { replace(path, &replaced, None)?; }
            return Err(format!("检测到并发替换，旧文件保留于 {}", replaced.display()));
        }
        let _ = fs::remove_file(&replaced);
        Ok(())
    })();
    if stage.exists() { let _ = fs::remove_file(stage); }
    result
}

struct Change { path: PathBuf, stage: PathBuf, saved: PathBuf, delete: bool, committed: bool }
fn folder(snapshot: &Snapshot, removed: &[String], changed: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    let root = super::folder_ops::root(&snapshot.source)?;
    let mut handles = vec![];
    // Keep every model and texture stable while planning and applying the merge.
    for name in snapshot.files.keys().filter(|name| index::model_path(name) || duplicates::texture(name)) {
        handles.push(OpenOptions::new().read(true).share_mode(1 | 4).open(super::folder_ops::resolve(&root, name)?).map_err(|e| format!("资源被占用，未执行合并：{name}：{e}"))?);
    }
    if duplicates::snapshot(&snapshot.source)?.fingerprint != snapshot.fingerprint { return Err("文件夹内容已变化，未执行合并".into()); }
    let mut changes = vec![];
    for name in changed.keys().chain(removed) {
        let path = super::folder_ops::resolve(&root, name)?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.permissions().readonly() { return Err(format!("文件只读：{name}")); }
        let token = uuid::Uuid::new_v4();
        changes.push(Change { stage: path.with_file_name(format!(".box-merge-{token}.stage")), saved: path.with_file_name(format!(".box-merge-{token}.boxbackup")), path, delete: !changed.contains_key(name), committed: false });
    }
    let result: Result<(), String> = (|| {
        for (change, name) in changes.iter().zip(changed.keys().chain(removed)) { if !change.delete { write(&change.stage, &changed[name])?; } }
        for (change, name) in changes.iter_mut().zip(changed.keys().chain(removed)) {
            if change.delete { fs::rename(&change.path, &change.saved).map_err(|e| e.to_string())?; }
            else { replace(&change.path, &change.stage, Some(&change.saved))?; }
            change.committed = true;
            if fs::read(&change.saved).map_err(|e| e.to_string())? != snapshot.files[name] { return Err("资源发生并发替换，正在恢复".into()); }
        }
        Ok(())
    })();
    if let Err(error) = result {
        // ReplaceFileW opens its replacement with write access to transfer file
        // metadata. Our read-only stability handles now refer to the originals
        // in `saved`, so release them before using those files as replacements.
        drop(handles);
        for change in changes.iter_mut().rev().filter(|change| change.committed) {
            let restored = if change.delete { fs::rename(&change.saved, &change.path).map_err(|e| e.to_string()) } else { replace(&change.path, &change.saved, None) };
            if let Err(rollback) = restored { return Err(format!("{error}；回滚失败：{rollback}；原件：{}", change.saved.display())); }
        }
        for change in &changes { if change.stage.exists() { let _ = fs::remove_file(&change.stage); } }
        return Err(format!("合并失败，已恢复原文件：{error}"));
    }
    drop(handles);
    for change in &changes { let _ = fs::remove_file(&change.saved); }
    Ok(())
}
