use std::{collections::{BTreeMap, BTreeSet}, sync::atomic::AtomicBool};
use aho_corasick::AhoCorasickBuilder;
use super::{duplicates::{check_cancel, key, texture, Snapshot}, duplicates_progress::Progress, index};

// Match all duplicate paths together: metadata is read once regardless of texture count.
pub(super) fn find(snapshot: &Snapshot, paths: &[String], cancel: &AtomicBool, progress: &Progress) -> Result<BTreeMap<String, Vec<String>>, String> {
    let mut result: BTreeMap<String, Vec<String>> = BTreeMap::new();
    if paths.is_empty() { return Ok(result); }
    let mut patterns: BTreeMap<Vec<u8>, BTreeSet<usize>> = BTreeMap::new();
    let mut lookup: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (index, path) in paths.iter().enumerate() {
        check_cancel(cancel)?;
        lookup.entry(key(path)).or_default().push(index);
        let backslash = path.replace('/', "\\");
        for variant in [path.replace('\\', "/"), backslash.clone(), backslash.replace('\\', "\\\\")] {
            for needle in [variant.as_bytes().to_vec(), variant.encode_utf16().flat_map(u16::to_le_bytes).collect()] {
                if !needle.is_empty() { patterns.entry(needle).or_default().insert(index); }
            }
        }
    }
    if patterns.is_empty() { return Ok(result); }
    let overlap = patterns.keys().map(Vec::len).max().unwrap_or(1) - 1;
    let matcher = AhoCorasickBuilder::new().ascii_case_insensitive(true).build(patterns.keys()).map_err(|error| format!("建立贴图引用索引失败：{error}"))?;
    let owners: Vec<_> = patterns.values().collect();
    let metadata: Vec<_> = snapshot.files.iter().filter(|(name, _)| !index::model_path(name) && !texture(name) && !matches!(key(name).as_str(), "war3map.imp" | "(listfile)" | "(attributes)" | "(signature)")).collect();
    let total: usize = metadata.iter().map(|(_, bytes)| bytes.len()).sum();
    let mut done = 0; progress.update("external", 0, total);
    for (name, bytes) in metadata {
        check_cancel(cancel)?;
        let mut found = BTreeSet::new();
        for reference in super::references::references_with_cancel(bytes, cancel)? {
            if let Some(indices) = lookup.get(&key(&reference)) { found.extend(indices.iter().copied()); }
        }
        let mut offset: usize = 0;
        while offset < bytes.len() {
            check_cancel(cancel)?;
            let end = offset.saturating_add(1024 * 1024).saturating_add(overlap).min(bytes.len());
            for (count, matched) in matcher.find_overlapping_iter(&bytes[offset..end]).enumerate() {
                if count % 2048 == 0 { check_cancel(cancel)?; }
                found.extend(owners[matched.pattern().as_usize()].iter().copied());
            }
            let next = (offset + 1024 * 1024).min(bytes.len());
            progress.update("external", done + next, total);
            if end == bytes.len() { break; }
            offset = next;
        }
        for index in found { result.entry(paths[index].clone()).or_default().push(name.clone()); }
        done += bytes.len(); progress.update("external", done, total);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot(files: BTreeMap<String, Vec<u8>>) -> Snapshot {
        Snapshot { source: index::Source { id: "test".into(), path: "test".into(), name: "test".into(), kind: "folder".into(), entries: vec![], complete: true, warning: None, analysis: None }, files, fingerprint: String::new(), references: BTreeMap::new(), failures: vec![], hashes: BTreeMap::new() }
    }
    #[test]
    fn batch_keeps_mixed_slashes_escaped_ascii_utf16_and_overlapping_matches() {
        let paths: Vec<_> = ["Textures/skin.blp", "skin.blp", "Textures/mixed/skin.dds", "Textures/中文.jpg"].map(String::from).into();
        let encoded = "Textures\\中文.jpg".encode_utf16().flat_map(u16::to_le_bytes).collect();
        let snapshot = snapshot(BTreeMap::from([
            ("metadata.bin".into(), br#""TEXTURES\\skin.BLP" "Textures/mixed\skin.dds""#.to_vec()),
            ("unicode.bin".into(), encoded),
            ("war3map.imp".into(), b"Textures/skin.blp".to_vec()),
            ("ignored.mdx".into(), b"Textures/skin.blp".to_vec()),
        ]));
        let found = find(&snapshot, &paths, &AtomicBool::new(false), &Progress::default()).unwrap();
        assert_eq!(found.len(), 4);
        for path in &paths[..3] { assert_eq!(found[path], ["metadata.bin"]); }
        assert_eq!(found[&paths[3]], ["unicode.bin"]);
    }
    #[test]
    fn batch_matches_a_path_crossing_the_search_chunk_boundary() {
        let path = "Textures/中文.blp".to_string();
        let mut bytes = vec![b'x'; 1024 * 1024 - 3]; bytes.extend(path.as_bytes());
        let snapshot = snapshot(BTreeMap::from([("metadata.bin".into(), bytes)]));
        let found = find(&snapshot, &[path.clone()], &AtomicBool::new(false), &Progress::default()).unwrap();
        assert_eq!(found[&path], ["metadata.bin"]);
        assert!(find(&snapshot, &[path], &AtomicBool::new(true), &Progress::default()).is_err());
    }
    #[test]
    fn hundreds_of_duplicate_paths_share_one_large_metadata_pass() {
        let paths: Vec<_> = (0..400).map(|index| format!("Textures/skin_{index:04}.blp")).collect();
        let mut bytes = vec![b'x'; 8 * 1024 * 1024]; bytes.push(0);
        for path in &paths { bytes.extend(path.as_bytes()); bytes.push(0); }
        let snapshot = snapshot(BTreeMap::from([("metadata.bin".into(), bytes)]));
        let start = std::time::Instant::now();
        let found = find(&snapshot, &paths, &AtomicBool::new(false), &Progress::default()).unwrap();
        eprintln!("DUPLICATE_BATCH paths=400 metadata_mib=8 elapsed_ms={}", start.elapsed().as_millis());
        assert_eq!(found.len(), 400);
        assert!(found.values().all(|names| names == &["metadata.bin"]));
        assert!(start.elapsed() < std::time::Duration::from_secs(10));
    }
}
