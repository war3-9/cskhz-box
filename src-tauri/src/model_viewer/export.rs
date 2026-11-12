use super::{index::{self, Source}, storm::Archive, ViewerState};
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, fs::{self, OpenOptions}, io::Write, path::PathBuf, sync::{Arc, atomic::{AtomicBool, Ordering}}};
use tauri::ipc::Channel;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item { pub source_id: String, pub path: String, pub output: String, #[serde(default)] pub dependency: bool, #[serde(default)] pub rename_textures: bool }
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress { pub done: usize, pub total: usize, pub models: usize, pub textures: usize, pub message: String, pub failed: Vec<Failure>, pub missing: Vec<String>, pub stopped: bool }
#[derive(Clone, Serialize)]
pub struct Failure { pub work: Item, pub error: String }

// Only the bounded TEXS chunk is parsed for raw export; malformed animation data cannot block copying a model.
pub fn texture_paths(bytes: &[u8], path: &str) -> Vec<String> {
    if !bytes.starts_with(b"MDLX") && path.to_ascii_lowercase().ends_with(".mdl") { return super::references::references(bytes).into_iter().filter(|p| !index::model_path(p)).collect(); }
    if !bytes.starts_with(b"MDLX") { return vec![]; }
    let mut offset = 4;
    while offset + 8 <= bytes.len() {
        let length = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
        let Some(end) = (offset + 8).checked_add(length).filter(|end| *end <= bytes.len()) else { break; };
        if &bytes[offset..offset + 4] == b"TEXS" {
            return bytes[offset + 8..end].chunks_exact(268).filter_map(|texture| {
                let name = &texture[4..264]; let end = name.iter().position(|b| *b == 0).unwrap_or(name.len());
                (end > 0).then(|| String::from_utf8_lossy(&name[..end]).into_owned())
            }).collect();
        }
        offset = end;
    }
    vec![]
}

struct Reader { source: Source, archive: Option<Archive>, raw: HashMap<String, Vec<u8>> }
fn key(path: &str) -> String { path.replace('\\', "/").to_ascii_lowercase() }
impl Reader {
    fn new(source: Source) -> Result<Self, String> {
        let archive = if source.kind == "archive" { Some(Archive::open(PathBuf::from(&source.path).as_path())?) } else { None };
        let raw = source.entries.iter().filter_map(|entry| entry.raw_name.as_ref().map(|raw| (key(&entry.path), raw.clone()))).collect();
        Ok(Self { source, archive, raw })
    }
    fn has(&self, path: &str) -> bool {
        if let Some(archive) = &self.archive { return self.raw.contains_key(&key(path)) || archive.has(&path.replace('/', "\\")); }
        let root = PathBuf::from(&self.source.path);
        let root = if self.source.kind == "file" { root.parent().unwrap().to_path_buf() } else { root };
        index::safe_relative(path).is_ok_and(|relative| root.join(relative).is_file())
    }
    fn read(&self, path: &str) -> Result<Vec<u8>, String> {
        if let Some(archive) = &self.archive {
            if let Some(raw) = self.raw.get(&key(path)) { return archive.read_raw(raw); }
            return archive.read(&path.replace('/', "\\"));
        }
        index::read(&self.source, path)
    }
}

fn write(root: &PathBuf, output: &str, bytes: &[u8]) -> Result<(), String> {
    let path = root.join(index::safe_relative(output)?);
    fs::create_dir_all(path.parent().ok_or("输出路径无效")?).map_err(|e| e.to_string())?;
    if !path.parent().unwrap().canonicalize().map_err(|e| e.to_string())?.starts_with(root) { return Err("输出路径越过目标目录".into()); }
    if path.exists() {
        if !path.canonicalize().map_err(|e| e.to_string())?.starts_with(root) { return Err("输出文件越过目标目录".into()); }
        if fs::read(&path).map_err(|e| e.to_string())? == bytes { return Ok(()); }
        return Err(format!("目标文件内容不同，保留原文件：{}", path.display()));
    }
    let mut file = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
    if let Err(error) = file.write_all(bytes) { drop(file); let _ = fs::remove_file(&path); return Err(error.to_string()); }
    Ok(())
}

pub fn run(sources: Vec<Source>, mut items: Vec<Item>, directory: String, dependencies: bool, cancel: &AtomicBool, mut report: impl FnMut(Progress)) -> Result<Progress, String> {
    let root = PathBuf::from(directory);
    if !root.is_absolute() || items.len() > 100000 { return Err("输出目录或任务数量无效".into()); }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut readers = HashMap::new();
    let order: Vec<_> = sources.iter().map(|s| s.id.clone()).collect();
    let mut unavailable = HashMap::new();
    for source in sources { let id = source.id.clone(); match Reader::new(source) { Ok(reader) => { readers.insert(id, reader); }, Err(error) => { unavailable.insert(id, error); } } }
    let mut progress = Progress { total: items.len(), ..Default::default() };
    report(progress.clone());
    let mut seen: HashMap<String, (String, String)> = items.iter().map(|i| (key(&i.output), (i.source_id.clone(), key(&i.path)))).collect();
    let mut completed = HashSet::new();
    let mut index = 0;
    while index < items.len() {
        if cancel.load(Ordering::Relaxed) { progress.stopped = true; break; }
        let item = items[index].clone(); index += 1;
        progress.message = item.output.clone();
        let result = (|| {
            let bytes = readers.get(&item.source_id).ok_or_else(|| unavailable.get(&item.source_id).cloned().unwrap_or_else(|| "来源已关闭".into()))?.read(&item.path)?;
            let bytes = super::codec::convert(&bytes)?;
            let mut renamed = None;
            let output = item.output.replace('\\', "/").to_ascii_lowercase();
            if !completed.insert(output) { return Err("不同资源产生相同输出路径".into()); }
            let mut pending = vec![];
            let mut pending_seen = HashMap::new();
            if (dependencies || item.rename_textures) && !item.dependency && index::model_path(&item.path) {
                let paths = if item.rename_textures { super::export_rename::texture_paths(&bytes, &item.path)? } else { texture_paths(&bytes, &item.path) };
                let names = if item.rename_textures { super::export_rename::names(paths, &item.output) } else { paths.into_iter().map(|path| (path.clone(), path)).collect() };
                let mut resolved_names = vec![];
                for (path, output) in names {
                    let resolved = resolve_texture(&readers, &order, &item, &path);
                    if let Some((source_id, resolved_path)) = resolved {
                        let identity = (source_id.clone(), key(&resolved_path));
                        if let Some(existing) = seen.get(&key(&output)).or_else(|| pending_seen.get(&key(&output))) {
                            if *existing != identity { return Err(format!("贴图输出名称冲突：{output}")); }
                        } else {
                            pending_seen.insert(key(&output), identity);
                            pending.push(Item { source_id, path: resolved_path, output: output.clone(), dependency: true, rename_textures: false });
                        }
                        resolved_names.push((path, output));
                    } else if !progress.missing.contains(&path) { progress.missing.push(path); }
                }
                if item.rename_textures { renamed = Some(super::export_rename::rewrite(&bytes, &item.path, &resolved_names)?); }
            }
            write(&root, &item.output, renamed.as_deref().unwrap_or(&bytes))?;
            seen.extend(pending_seen);
            items.extend(pending);
            Ok(())
        })();
        match result { Ok(()) => { progress.done += 1; if index::model_path(&item.path) { progress.models += 1; } else { progress.textures += 1; } }, Err(error) => progress.failed.push(Failure { work: item, error }) }
        progress.total = items.len();
        if index % 20 == 0 { report(progress.clone()); }
    }
    report(progress.clone());
    Ok(progress)
}

fn resolve_texture(readers: &HashMap<String, Reader>, order: &[String], item: &Item, path: &str) -> Option<(String, String)> {
    let path = path.replace('\\', "/"); let mut candidates = vec![path.clone()];
    if let Some((directory, _)) = item.path.replace('\\', "/").rsplit_once('/') {
        let mut parts: Vec<_> = directory.split('/').collect(); let mut valid = true;
        for part in path.split('/') {
            match part { "" | "." => {}, ".." => { if parts.pop().is_none() { valid = false; break; } }, _ => parts.push(part) }
        }
        if valid { candidates.push(parts.join("/")); }
        if let Some(name) = path.rsplit('/').next() { candidates.push(format!("{directory}/{name}")); }
    }
    for candidate in candidates {
        for id in std::iter::once(&item.source_id).chain(order.iter().filter(|id| *id != &item.source_id)) {
            if readers.get(id).is_some_and(|reader| reader.has(&candidate)) { return Some((id.clone(), candidate)); }
        }
    }
    None
}

#[tauri::command]
pub async fn viewer_export_raw(id: String, items: Vec<Item>, directory: String, dependencies: bool, source_ids: Vec<String>, progress: Channel<Progress>, state: tauri::State<'_, ViewerState>) -> Result<Progress, String> {
    let sources: Vec<_> = { let mounted = state.sources.lock().unwrap(); source_ids.iter().filter_map(|id| mounted.get(id).cloned()).collect() };
    let cancel = Arc::new(AtomicBool::new(false)); state.jobs.lock().unwrap().insert(id.clone(), cancel.clone());
    let result = tauri::async_runtime::spawn_blocking(move || run(sources, items, directory, dependencies, &cancel, |value| { let _ = progress.send(value); })).await.map_err(|e| e.to_string());
    state.jobs.lock().unwrap().remove(&id);
    result?
}
