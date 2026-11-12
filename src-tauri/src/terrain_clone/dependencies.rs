use crate::model_viewer::storm::Archive;
use std::collections::{HashMap, HashSet};

fn without_import_prefix(path: &str) -> &str {
    const PREFIX: &str = "war3mapImported/";
    if path.get(..PREFIX.len()).is_some_and(|prefix| prefix.eq_ignore_ascii_case(PREFIX)) {
        &path[PREFIX.len()..]
    } else { path }
}

pub(super) fn resolve(source: &Archive, raw: &[u8], imported_members: &[String], recovered_names: &HashMap<Vec<u8>, String>) -> Result<Option<(String, u32, Vec<u8>)>, String> {
    let reference = String::from_utf8_lossy(raw).replace('\\', "/");
    let Some(reference) = super::resources::safe_archive_path(&reference) else {
        return Err(format!("模型依赖路径不安全：{}", String::from_utf8_lossy(raw)));
    };
    // The actual model path always wins over import-manager aliases.
    let relative = without_import_prefix(&reference);
    let mut candidates = vec![reference.clone()];
    if relative == reference { candidates.push(format!("war3mapImported/{reference}")); }
    for imported in imported_members {
        if without_import_prefix(imported).eq_ignore_ascii_case(relative) { candidates.push(imported.clone()); }
    }
    let mut seen = HashSet::new();
    for candidate in candidates {
        if !seen.insert(candidate.to_ascii_lowercase()) { continue; }
        let archive_path = candidate.replace('/', "\\");
        if let (Ok(bytes), Some(block)) = (source.read(&archive_path), source.block(&candidate)) {
            return Ok(Some((reference, block, bytes)));
        }
    }
    let basename = reference.rsplit('/').next().unwrap_or(&reference);
    let mut named = Vec::new();
    let mut exact = Vec::new();
    for (source_raw, name) in recovered_names {
        let name = name.replace('\\', "/");
        let name = without_import_prefix(&name);
        if name.eq_ignore_ascii_case(relative) { exact.push(source_raw); }
        else if name.rsplit('/').next().is_some_and(|leaf| leaf.eq_ignore_ascii_case(basename)) { named.push(source_raw); }
    }
    let matches = if exact.is_empty() { named } else { exact };
    let mut resolved: Option<(Vec<u8>, u32)> = None;
    for source_raw in matches {
        let bytes = source.read_raw(source_raw)?;
        let block = source.block_raw(source_raw).ok_or_else(|| format!("无法确认模型依赖的归档身份：{reference}"))?;
        if resolved.as_ref().is_some_and(|(existing, _)| existing != &bytes) {
            return Err(format!("模型依赖 {reference} 对应多个不同的导入文件，无法安全选择"));
        }
        resolved = Some((bytes, block));
    }
    Ok(resolved.map(|(bytes, block)| (reference, block, bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actual_path_wins_and_ambiguous_recovered_dependencies_are_reported() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let source = super::super::tests::archive_fixture();
        let output = root.join(format!("test-results/terrain-clone-repair-20261012/dependency-{}.w3m", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(output.parent().unwrap()).unwrap();
        std::fs::copy(&source, &output).unwrap();
        super::super::mpq_identity::reserve(&output, 16).unwrap();
        let archive = Archive::writable_copy(&output).unwrap();
        for (name, bytes) in [("z/skin.blp", &b"original"[..]), ("war3mapImported/z/skin.blp", &b"prefixed"[..]), ("a/skin.blp", &b"different"[..])] {
            archive.write(name, bytes, false).unwrap();
        }
        let mut model = b"MDLXTEXS".to_vec();
        model.extend_from_slice(&268u32.to_le_bytes());
        let mut texture = vec![0; 268];
        texture[4..14].copy_from_slice(b"z\\skin.blp");
        model.extend_from_slice(&texture);
        archive.write("z/model.mdx", &model, false).unwrap();
        archive.flush().unwrap();
        drop(archive);
        let archive = Archive::open(&output).unwrap();
        assert_eq!(resolve(&archive, b"z\\skin.blp", &[], &HashMap::new()).unwrap().unwrap().2, b"original");
        let names = HashMap::from([(b"z\\skin.blp".to_vec(), "WAR3MAPIMPORTED/z/skin.blp".into()), (b"a\\skin.blp".to_vec(), "a/skin.blp".into())]);
        assert_eq!(resolve(&archive, b"WAR3MAPIMPORTED\\z\\skin.blp", &[], &names).unwrap().unwrap().2, b"prefixed");
        assert!(resolve(&archive, b"other\\skin.blp", &[], &names).unwrap_err().contains("无法安全选择"));
        assert_eq!(resolve(&archive, b"z/skin.blp", &[], &names).unwrap().unwrap().2, b"original");
        assert!(resolve(&archive, b"../skin.blp", &[], &names).is_err());
        drop(archive);
        let mut members = HashMap::new();
        super::super::resources::copy_all(&output, &source, &mut members).unwrap();
        let imports = super::super::imports::parse(&members["war3map.imp"]).unwrap();
        for path in ["z/model.mdx", "z/skin.blp", "a/skin.blp"] {
            assert!(members.contains_key(path), "logical resource missing: {path}");
            assert!(imports.iter().any(|(flag, raw)| super::super::imports::member_path(*flag, raw) == path), "logical import missing: {path}");
        }
        assert!(!members.contains_key("war3mapImported/z/model.mdx"));
    }
}
