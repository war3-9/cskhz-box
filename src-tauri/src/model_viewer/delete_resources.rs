use std::collections::{BTreeMap, HashMap};
use super::{index::{self, Source}, storm::Archive};

fn normal(path: &str) -> String { path.replace('\\', "/").trim_start_matches("./").to_lowercase() }
fn candidates(path: &str, model: &str) -> Vec<String> {
    let path = path.replace('\\', "/"); let model = model.replace('\\', "/");
    let mut result = vec![path.clone()];
    let mut directory: Vec<_> = model.split('/').collect(); directory.pop();
    let mut relative = directory.clone();
    for part in path.split('/') { match part { "" | "." => (), ".." => { if relative.pop().is_none() { return result; } }, _ => relative.push(part) } }
    result.push(relative.join("/")); directory.push(path.rsplit('/').next().unwrap_or(&path)); result.push(directory.join("/")); result
}

// Back up companion textures even when a batch delete retains those shared files.
// Resolve only against this source; installed game files and other sources stay out.
pub(super) fn collect(source: &Source, paths: &[String]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let archive = if source.kind == "archive" { Some(Archive::open(std::path::Path::new(&source.path))?) } else { None };
    let blocks: HashMap<_, _> = archive.as_ref().map(|archive| source.entries.iter().filter_map(|entry| entry.raw_name.as_deref().and_then(|raw| archive.block_raw(raw)).map(|block| (block, entry))).collect()).unwrap_or_default();
    let read = |name: &str| -> Result<Vec<u8>, String> {
        let entry = source.entries.iter().find(|entry| normal(&entry.path) == normal(name)).ok_or("资源不在来源内")?;
        match &archive { Some(archive) => archive.read_raw(entry.raw_name.as_deref().ok_or("缺少资源归档标识")?), None => index::read(source, name) }
    };
    let mut files = BTreeMap::new();
    for name in paths { files.insert(name.clone(), read(name)?); }
    let models: Vec<_> = files.iter().filter(|(name, _)| index::model_path(name)).map(|(name, bytes)| (name.clone(), bytes.clone())).collect();
    for (model, bytes) in models {
        let decoded = super::codec::convert(&bytes)?;
        for texture in super::analysis::model_references(&decoded) {
            for candidate in candidates(&texture, &model) {
                if index::safe_relative(&candidate).is_err() || !super::import_files::resource_path(&candidate) { continue; }
                let entry = source.entries.iter().find(|entry| normal(&entry.path) == normal(&candidate)).or_else(|| archive.as_ref().and_then(|archive| archive.block(&candidate)).and_then(|block| blocks.get(&block).copied()));
                if let Some(entry) = entry {
                    let bytes = read(&entry.path)?;
                    // Named companion paths preserve MDX/MDL references in anonymous maps.
                    if !files.keys().any(|name| normal(name) == normal(&candidate)) { files.insert(candidate, bytes); }
                    break;
                }
            }
        }
    }
    Ok(files)
}
