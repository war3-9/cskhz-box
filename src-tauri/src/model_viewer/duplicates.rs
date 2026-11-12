use std::{collections::{BTreeMap, BTreeSet}, fs::File, io::Read, path::Path, sync::atomic::{AtomicBool, Ordering}, thread, time::Duration};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use super::{duplicates_paths::TexturePaths, duplicates_progress::Progress, export_rename, index::{self, Source}, ViewerState};
pub use super::duplicates_progress::DuplicateProgress;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DuplicateKind { Models, Textures }

pub(super) fn key(path: &str) -> String { export_rename::key(path).trim_start_matches("./").to_string() }
pub(super) fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
pub(super) fn texture(path: &str) -> bool { [".blp", ".tga", ".dds", ".png", ".jpg", ".jpeg"].iter().any(|ext| path.to_ascii_lowercase().ends_with(ext)) }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateReference { pub texture: String, pub models: Vec<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub key: String, pub paths: Vec<String>, pub bytes: u64, pub reclaim_bytes: u64,
    pub references: Vec<DuplicateReference>, pub blocked_reason: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateScan {
    pub fingerprint: String, pub models: Vec<DuplicateGroup>, pub textures: Vec<DuplicateGroup>,
    pub warnings: Vec<String>, pub can_merge: bool,
}
#[derive(Deserialize)]
pub struct MergeGroup { pub keep: String, pub remove: Vec<String> }
pub(super) struct Snapshot {
    pub source: Source, pub files: BTreeMap<String, Vec<u8>>, pub fingerprint: String,
    pub references: BTreeMap<String, Vec<(String, String)>>, pub failures: Vec<String>,
    pub hashes: BTreeMap<String, String>,
}

pub(super) fn texture_paths(bytes: &[u8], path: &str) -> Result<Vec<String>, String> {
    if bytes.starts_with(b"MDLX") {
        let mut offset = 4usize; let mut texture_chunks = 0;
        while offset < bytes.len() {
            let header = bytes.get(offset..offset + 8).ok_or("MDX 数据块头被截断")?;
            let length = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
            let end = offset.checked_add(8).and_then(|n| n.checked_add(length)).filter(|end| *end <= bytes.len()).ok_or("MDX 数据块被截断")?;
            if &header[..4] == b"TEXS" {
                texture_chunks += 1;
                if texture_chunks > 1 || length % 268 != 0 { return Err("MDX 存在重复或损坏的贴图表".into()); }
                for record in bytes[offset + 8..end].chunks_exact(268) {
                    let field = &record[4..264]; let length = field.iter().position(|byte| *byte == 0).unwrap_or(260);
                    std::str::from_utf8(&field[..length]).map_err(|_| "MDX 贴图路径编码不可安全改写")?;
                }
            }
            offset = end;
        }
    } else { std::str::from_utf8(bytes).map_err(|_| "MDL 编码不可安全改写")?; }
    export_rename::texture_paths(bytes, path)
}

pub(super) fn snapshot(source: &Source) -> Result<Snapshot, String> {
    snapshot_with_cancel(source, &AtomicBool::new(false))
}
pub(super) fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) { Err("查重已取消".into()) } else { Ok(()) }
}
pub(super) fn snapshot_with_cancel(source: &Source, cancel: &AtomicBool) -> Result<Snapshot, String> {
    snapshot_reported(source, cancel, &Progress::default())
}
fn snapshot_reported(source: &Source, cancel: &AtomicBool, progress: &Progress) -> Result<Snapshot, String> {
    progress.update("indexing", 0, 0);
    let source = index::scan_mode(source.path.clone(), source.id.clone(), cancel, true)?;
    check_cancel(cancel)?;
    if source.entries.len() > 100000 { return Err("查重文件超过 100000 个，请缩小来源范围".into()); }
    let mut files = BTreeMap::new(); let mut total = 0u64;
    let archive = if source.kind == "archive" { Some(super::storm::Archive::open(Path::new(&source.path))?) } else { None };
    progress.update("reading", 0, source.entries.len());
    for (index, entry) in source.entries.iter().enumerate() {
        check_cancel(cancel)?;
        total = total.checked_add(entry.size).ok_or("资源大小超出范围")?;
        if entry.size > 256 * 1024 * 1024 || total > 1024 * 1024 * 1024 { return Err("查重资源超过 1 GiB 或单文件超过 256 MiB，请缩小来源范围".into()); }
        let bytes = match &archive { Some(archive) => archive.read_raw(entry.raw_name.as_deref().ok_or("缺少归档资源标识")?)?, None => index::read(&source, &entry.path)? };
        files.insert(entry.path.clone(), bytes);
        progress.update("reading", index + 1, source.entries.len());
    }
    let mut hash = Sha256::new(); let mut hashes = BTreeMap::new();
    let hash_total = files.values().map(Vec::len).sum(); let mut hashed = 0;
    progress.update("hashing", 0, hash_total);
    for (path, bytes) in &files {
        check_cancel(cancel)?;
        let mut file_hash = Sha256::new();
        for chunk in bytes.chunks(1024 * 1024) {
            check_cancel(cancel)?; file_hash.update(chunk); hashed += chunk.len(); progress.update("hashing", hashed, hash_total);
        }
        let file_hash = file_hash.finalize();
        hash.update((path.len() as u64).to_le_bytes()); hash.update(path.as_bytes()); hash.update((bytes.len() as u64).to_le_bytes()); hash.update(file_hash);
        hashes.insert(path.clone(), format!("{file_hash:x}"));
    }
    if source.kind == "archive" {
        let mut file = File::open(&source.path).map_err(|error| error.to_string())?;
        let mut buffer = vec![0; 1024 * 1024];
        let archive_size = file.metadata().map_err(|error| error.to_string())?.len() as usize; let mut done = 0;
        progress.update("fingerprint", 0, archive_size);
        loop {
            check_cancel(cancel)?;
            let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
            if count == 0 { break; }
            hash.update(&buffer[..count]);
            done += count; progress.update("fingerprint", done, archive_size);
        }
    }
    let fingerprint = format!("{:x}", hash.finalize());
    let mut references = BTreeMap::new(); let mut failures = vec![];
    let texture_lookup = TexturePaths::new(&files);
    let models: Vec<_> = source.entries.iter().filter(|entry| entry.model).collect();
    progress.update("references", 0, models.len());
    for (index, entry) in models.iter().enumerate() {
        check_cancel(cancel)?;
        let bytes = &files[&entry.path];
        // Protected model encodings stay readable but are never rewritten in place.
        let result = if super::content::protected_format(bytes).is_some() { Err("特殊编码模型仅支持读取".into()) } else { texture_paths(bytes, &entry.path) };
        match result {
            Ok(paths) => {
                for name in paths { if let Some(target) = texture_lookup.resolve(&entry.path, &name) { references.entry(target.clone()).or_insert_with(Vec::new).push((entry.path.clone(), name)); } }
            }
            Err(error) => failures.push(format!("{}：{error}", entry.path)),
        }
        progress.update("references", index + 1, models.len());
    }
    Ok(Snapshot { source, files, fingerprint, references, failures, hashes })
}

#[cfg(test)]
pub(super) fn external_references(snapshot: &Snapshot, path: &str) -> Vec<String> {
    super::duplicates_references::find(snapshot, &[path.to_string()], &AtomicBool::new(false), &Progress::default()).unwrap().remove(path).unwrap_or_default()
}
fn groups_with_cancel(snapshot: &Snapshot, model: bool, cancel: &AtomicBool, progress: &Progress) -> Result<Vec<DuplicateGroup>, String> {
    let mut grouped: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut replacements_by_model: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    if model {
        for (texture, references) in &snapshot.references {
            check_cancel(cancel)?;
            let replacement = format!("__box_content_{}", snapshot.hashes[texture]);
            for (path, original) in references { replacements_by_model.entry(path.clone()).or_default().push((original.clone(), replacement.clone())); }
        }
    }
    let entries: Vec<_> = snapshot.source.entries.iter().filter(|entry| if model { entry.model } else { texture(&entry.path) }).collect();
    let stage = if model { "models" } else { "textures" }; progress.update(stage, 0, entries.len());
    for (index, entry) in entries.iter().enumerate() {
        check_cancel(cancel)?;
        let bytes = &snapshot.files[&entry.path];
        let content_hash = if model {
            let replacements = replacements_by_model.get(&entry.path).map(Vec::as_slice).unwrap_or(&[]);
            if replacements.is_empty() { snapshot.hashes[&entry.path].clone() }
            else { export_rename::rewrite(bytes, &entry.path, replacements).map(|canonical| digest(&canonical)).unwrap_or_else(|_| snapshot.hashes[&entry.path].clone()) }
        } else { snapshot.hashes[&entry.path].clone() };
        grouped.entry(content_hash).or_default().push(entry.path.clone());
        progress.update(stage, index + 1, entries.len());
    }
    let duplicate_paths: Vec<_> = if model { vec![] } else { grouped.values().filter(|paths| paths.len() > 1).flatten().cloned().collect() };
    let external = super::duplicates_references::find(snapshot, &duplicate_paths, cancel, progress)?;
    let mut result = vec![];
    for (key, mut paths) in grouped {
        check_cancel(cancel)?;
        if paths.len() <= 1 { continue; }
        paths.sort(); let sizes: Vec<_> = paths.iter().map(|path| snapshot.files[path].len() as u64).collect();
        let bytes = sizes.iter().sum(); let reclaim_bytes = bytes - sizes.iter().max().copied().unwrap_or(0);
        let references = if model { vec![] } else { paths.iter().map(|path| DuplicateReference { texture: path.clone(), models: snapshot.references.get(path).map(|refs| refs.iter().map(|(model, _)| model.clone()).collect()).unwrap_or_default() }).collect() };
        let external: BTreeSet<_> = paths.iter().filter_map(|path| external.get(path)).flatten().cloned().collect();
        let blocked_reason = (!external.is_empty()).then(|| format!("还被非模型资源引用（{}），为避免破坏地图暂不合并", external.into_iter().collect::<Vec<_>>().join("、")));
        result.push(DuplicateGroup { key, paths, bytes, reclaim_bytes, references, blocked_reason });
    }
    Ok(result)
}
pub(super) fn scan(snapshot: &Snapshot) -> DuplicateScan {
    scan_with_cancel(snapshot, &AtomicBool::new(false)).expect("uncancellable duplicate scan")
}
pub(super) fn scan_with_cancel(snapshot: &Snapshot, cancel: &AtomicBool) -> Result<DuplicateScan, String> {
    scan_selected(snapshot, None, cancel, &Progress::default())
}
pub(super) fn scan_selected(snapshot: &Snapshot, kind: Option<DuplicateKind>, cancel: &AtomicBool, progress: &Progress) -> Result<DuplicateScan, String> {
    check_cancel(cancel)?;
    let writable = super::duplicates_transaction::writable(&snapshot.source);
    let can_merge = snapshot.failures.is_empty() && writable.is_ok();
    let mut warnings = snapshot.failures.clone(); if let Err(error) = writable { warnings.push(error); }
    let models = if matches!(kind, None | Some(DuplicateKind::Models)) { groups_with_cancel(snapshot, true, cancel, progress)? } else { vec![] };
    let textures = if matches!(kind, None | Some(DuplicateKind::Textures)) { groups_with_cancel(snapshot, false, cancel, progress)? } else { vec![] };
    check_cancel(cancel)?;
    Ok(DuplicateScan { fingerprint: snapshot.fingerprint.clone(), models, textures, warnings, can_merge })
}

#[tauri::command]
pub async fn viewer_find_duplicates(id: String, kind: Option<DuplicateKind>, progress: Option<tauri::ipc::JavaScriptChannelId>, webview: tauri::Webview, state: tauri::State<'_, ViewerState>) -> Result<DuplicateScan, String> {
    let progress = progress.map(|channel| channel.channel_on::<_, DuplicateProgress>(webview));
    let source = state.sources.lock().map_err(|e| e.to_string())?.get(&id).cloned().ok_or("来源已关闭")?;
    let cancel = std::sync::Arc::new(AtomicBool::new(false));
    {
        let mut jobs = state.jobs.lock().map_err(|e| e.to_string())?;
        if jobs.contains_key(&id) { return Err("当前来源仍有扫描任务，请稍后重试".into()); }
        jobs.insert(id.clone(), cancel.clone());
    }
    let lock = state.mutations.clone();
    let worker_cancel = cancel.clone();
    let worker_result = tauri::async_runtime::spawn_blocking(move || {
        let progress = Progress::new(progress); progress.update("waiting", 0, 0);
        let _guard = loop {
            check_cancel(&worker_cancel)?;
            match lock.try_lock() {
                Ok(guard) => break guard,
                Err(std::sync::TryLockError::WouldBlock) => thread::sleep(Duration::from_millis(25)),
                Err(std::sync::TryLockError::Poisoned(_)) => return Err("文件操作锁已损坏".into()),
            }
        };
        let snapshot = snapshot_reported(&source, &worker_cancel, &progress)?;
        scan_selected(&snapshot, kind, &worker_cancel, &progress)
    }).await;
    let mut jobs = state.jobs.lock().map_err(|e| e.to_string())?;
    if jobs.get(&id).is_some_and(|job| std::sync::Arc::ptr_eq(job, &cancel)) { jobs.remove(&id); }
    drop(jobs);
    worker_result.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn viewer_merge_duplicate_textures(id: String, fingerprint: String, groups: Vec<MergeGroup>, state: tauri::State<'_, ViewerState>) -> Result<super::mutations::MutationResult, String> {
    let source = state.sources.lock().map_err(|e| e.to_string())?.get(&id).cloned().ok_or("来源已关闭")?;
    let lock = state.mutations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || { let _guard = lock.lock().map_err(|e| e.to_string())?; super::duplicates_merge::execute(&source, &fingerprint, &groups, None) }).await.map_err(|e| e.to_string())??;
    state.sources.lock().map_err(|e| e.to_string())?.insert(result.source.id.clone(), result.source.clone());
    Ok(result)
}

#[tauri::command]
pub async fn viewer_delete_duplicate_models(id: String, fingerprint: String, groups: Vec<MergeGroup>, state: tauri::State<'_, ViewerState>) -> Result<super::mutations::MutationResult, String> {
    let source = state.sources.lock().map_err(|e| e.to_string())?.get(&id).cloned().ok_or("来源已关闭")?;
    let lock = state.mutations.clone();
    let result = tauri::async_runtime::spawn_blocking(move || { let _guard = lock.lock().map_err(|e| e.to_string())?; super::duplicates_merge::delete_models(&source, &fingerprint, &groups, None) }).await.map_err(|e| e.to_string())??;
    state.sources.lock().map_err(|e| e.to_string())?.insert(result.source.id.clone(), result.source.clone());
    Ok(result)
}
