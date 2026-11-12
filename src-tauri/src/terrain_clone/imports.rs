use std::collections::HashSet;

pub(super) fn parse(bytes: &[u8]) -> Result<Vec<(u8, Vec<u8>)>, String> {
    if bytes.len() < 8 { return Err("地图导入清单已损坏".into()); }
    let count = u32::from_le_bytes(bytes[4..8].try_into().map_err(|_| "地图导入清单已损坏")?);
    if count > 100_000 { return Err("地图导入清单条目数越界".into()); }
    let mut offset = 8usize;
    let mut entries = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let flag = *bytes.get(offset).ok_or("地图导入清单被截断")?;
        offset += 1;
        let end = bytes.get(offset..).ok_or("地图导入路径被截断")?.iter().position(|byte| *byte == 0).map(|length| length + offset).ok_or("地图导入路径未终止")?;
        if end == offset { return Err("地图导入路径为空".into()); }
        entries.push((flag, bytes[offset..end].to_vec()));
        offset = end + 1;
    }
    if offset != bytes.len() { return Err("地图导入清单含无法识别的尾随数据".into()); }
    Ok(entries)
}

pub(super) fn member_path(flag: u8, path: &[u8]) -> String {
    let path = String::from_utf8_lossy(path).replace('\\', "/");
    if flag == 5 || flag == 8 { format!("war3mapImported/{path}") } else { path }
}

pub(super) fn resolve_paths(archive: &crate::model_viewer::storm::Archive, entries: Vec<(u8, Vec<u8>)>) -> Vec<(u8, Vec<u8>)> {
    entries.into_iter().map(|(flag, path)| {
        // Some editors leave a default-directory flag after moving a resource
        // to a custom path. Only accept the exact stored path, never a basename.
        let logical = member_path(flag, &path).replace('/', "\\");
        let actual = String::from_utf8_lossy(&path).replace('/', "\\");
        let flag = if [5, 8].contains(&flag) && !archive.has(&logical) && archive.has(&actual) { 13 } else { flag };
        (flag, path)
    }).collect()
}

pub(super) fn normalize(archive: &crate::model_viewer::storm::Archive, bytes: &[u8]) -> Result<Vec<u8>, String> {
    merge(None, &resolve_paths(archive, parse(bytes)?), &[])
}

pub(super) fn merge(existing: Option<&[u8]>, source: &[(u8, Vec<u8>)], added: &[(u8, Vec<u8>)]) -> Result<Vec<u8>, String> {
    let mut entries = existing.map(parse).transpose()?.unwrap_or_default();
    let mut known = entries.iter().map(|(flag, path)| member_path(*flag, path).to_ascii_lowercase()).collect::<HashSet<_>>();
    for entry in source.iter().chain(added) {
        if known.insert(member_path(entry.0, &entry.1).to_ascii_lowercase()) { entries.push(entry.clone()); }
    }
    let count = u32::try_from(entries.len()).map_err(|_| "地图导入清单条目数越界")?;
    let mut bytes = 1u32.to_le_bytes().to_vec();
    bytes.extend_from_slice(&count.to_le_bytes());
    for (flag, path) in entries { bytes.push(flag); bytes.extend_from_slice(&path); bytes.push(0); }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_source_and_new_imports_while_preserving_existing_flags() {
        let existing = [1u32.to_le_bytes().as_slice(), 1u32.to_le_bytes().as_slice(), &[13], b"war3mapImported\\old.blp\0"].concat();
        let source = vec![(5, b"source.mdx".to_vec()), (13, b"war3mapImported\\old.blp".to_vec())];
        let added = vec![(13, b"war3mapImported\\new.data".to_vec())];
        let result = merge(Some(&existing), &source, &added).unwrap();
        let parsed = parse(&result).unwrap();
        assert_eq!(parsed.len(), 3);
        assert!(parsed.contains(&(5, b"source.mdx".to_vec())));
        assert!(parsed.contains(&(13, b"war3mapImported\\old.blp".to_vec())));
        assert!(parsed.contains(&(13, b"war3mapImported\\new.data".to_vec())));
        assert_eq!(member_path(5, b"source.mdx"), "war3mapImported/source.mdx");
    }

    #[test]
    fn rejects_trailing_or_truncated_manifest_data() {
        let version = 1u32.to_le_bytes();
        let count = 1u32.to_le_bytes();
        let trailing = [version.as_slice(), count.as_slice(), &[13], b"file\0x"].concat();
        let truncated = [version.as_slice(), count.as_slice(), &[13], b"file"].concat();
        assert!(parse(&trailing).is_err());
        assert!(parse(&truncated).is_err());
    }

}
