use crate::model_viewer::storm::Archive;
use std::collections::{HashMap, HashSet};

const SETTINGS: [&str; 2] = ["war3mapSkin.txt", "war3mapMisc.txt"];

// Skin paths survive a cloned container, but anonymous/unregistered fonts do
// not survive a World Editor save unless materialized in the import manager.
pub(super) fn references(archive: &Archive) -> Result<HashSet<Vec<u8>>, String> {
    let mut paths = HashSet::new();
    for name in SETTINGS {
        if !archive.has(name) { continue; }
        let bytes = archive.read(name)?;
        for path in crate::model_viewer::references::references(&bytes) {
            paths.insert(path.into_bytes());
        }
        paths.extend(setting_references(&bytes));
    }
    Ok(paths)
}

fn setting_references(bytes: &[u8]) -> HashSet<Vec<u8>> {
    const EXTENSIONS: [&str; 11] = [".ttf", ".otf", ".ttc", ".blp", ".tga", ".dds", ".png", ".jpg", ".jpeg", ".mdx", ".mdl"];
    bytes.split(|byte| matches!(byte, b'\r' | b'\n')).filter_map(|line| {
        let split = line.iter().position(|byte| *byte == b'=')?;
        let value = std::str::from_utf8(&line[split + 1..]).ok()?.trim().trim_matches('"');
        let lower = value.to_ascii_lowercase();
        // INI values are complete paths. Parentheses and spaces belong to a
        // filename here, unlike delimiters in generic binary token scanning.
        EXTENSIONS.iter().any(|extension| lower.ends_with(extension))
            .then(|| value.replace("\\\\", "\\").into_bytes())
    }).collect()
}

pub(super) fn preserve(archive: &Archive, members: &mut HashMap<String, Vec<u8>>) -> Result<(), String> {
    let paths = references(archive)?;
    let mut imports = Vec::new();
    for raw in paths {
        let name = String::from_utf8(raw).map_err(|_| "地图界面资源路径不是 UTF-8")?;
        let safe = super::resources::safe_archive_path(&name).ok_or_else(|| format!("地图界面资源路径不安全：{name}"))?;
        let path = safe.replace('/', "\\");
        if !members.keys().any(|key| key.eq_ignore_ascii_case(&safe)) {
            if !archive.has(&path) { continue; } // Built-in assets remain in the game MPQs.
            members.insert(safe, archive.read(&path)?);
        }
        imports.push((13, path.into_bytes()));
    }
    if imports.is_empty() { return Ok(()); }
    let existing = match members.get("war3map.imp") {
        Some(bytes) => Some(bytes.clone()),
        None if archive.has("war3map.imp") => Some(archive.read("war3map.imp")?),
        _ => None,
    };
    let manifest = super::imports::merge(existing.as_deref(), &[], &imports)?;
    members.insert("war3map.imp".into(), manifest);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extracts_custom_fonts_with_spaces_and_deduplicates_repeated_fields() {
        let bytes = b"[CustomSkin]\r\nMasterFont=fonts\\custom font.ttf\r\nChatFont=fonts\\custom font.ttf\nOther=\"fonts\\ui.otf\"\nBuiltIn=Fonts\\FRIZQT__.TTF\nNotFont=wrong.ttf.exe\n";
        let result = setting_references(bytes);
        assert_eq!(result.len(), 3);
        assert!(result.contains(b"fonts\\custom font.ttf".as_slice()));
        assert!(result.contains(b"fonts\\ui.otf".as_slice()));
    }

    #[test]
    fn unquoted_skin_texture_paths_keep_spaces_and_parentheses() {
        let bytes = b"[CustomSkin]\nUpperMenuButtonTexture=war3mapImported\\UI-DDAN (5).tga\nOther=\"ui\\button (hover).blp\"\n";
        let paths = setting_references(bytes);
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(b"war3mapImported\\UI-DDAN (5).tga".as_slice()));
        assert!(paths.contains(b"ui\\button (hover).blp".as_slice()));
    }

    #[test]
    fn unlisted_skin_font_survives_copy_save_and_repeated_save_as_a_registered_import() {
        use super::super::{session::MapDocument, save, resources, imports};
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        let fixture = super::super::tests::archive_fixture();
        let job = root.join("test-results/terrain-runtime-crash-20261012").join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&job).unwrap();
        let source = job.join("source.w3m");
        std::fs::copy(&fixture, &source).unwrap();
        super::super::mpq_identity::reserve(&source, 16).unwrap();
        let archive = Archive::writable_copy(&source).unwrap();
        let font = b"\x00\x01\x00\x00private font bytes";
        archive.write("fonts/ziti.ttf", font, false).unwrap();
        let texture_path = "war3mapImported/UI-DDAN (5).tga";
        let texture = b"private skin TGA bytes";
        archive.write(texture_path, texture, false).unwrap();
        archive.write("war3mapSkin.txt", b"[CustomSkin]\nMasterFont=fonts\\ziti.ttf\nChatFont=fonts\\ziti.ttf\nUpperMenuButtonTexture=war3mapImported\\UI-DDAN (5).tga\n", false).unwrap();
        if archive.has("war3map.imp") { archive.remove(b"war3map.imp").unwrap(); }
        if archive.has("(listfile)") { archive.remove(b"(listfile)").unwrap(); }
        archive.flush().unwrap();
        drop(archive);
        let original = std::fs::read(&source).unwrap();
        let archive = Archive::open(&source).unwrap();
        let mut copied = HashMap::new();
        resources::copy_all(&source, &fixture, &mut copied).unwrap();
        assert_eq!(copied["fonts/ziti.ttf"], font);
        assert_eq!(copied[texture_path], texture);
        let mut doc = MapDocument::new(source.clone(), archive.read("war3map.w3e").unwrap());
        drop(archive);
        // Save without a resource copy also preserves a font inherited in the container.
        for name in ["first.w3m", "second.w3m"] {
            let output = job.join(name);
            save::write_map_copy(&doc, &output).unwrap();
            let saved = Archive::open(&output).unwrap();
            assert_eq!(saved.read("fonts\\ziti.ttf").unwrap(), font);
            assert_eq!(saved.read(&texture_path.replace('/', "\\")).unwrap(), texture);
            let entries = imports::parse(&saved.read("war3map.imp").unwrap()).unwrap();
            assert_eq!(entries.iter().filter(|(flag, raw)| imports::member_path(*flag, raw).eq_ignore_ascii_case("fonts/ziti.ttf")).count(), 1);
            assert_eq!(entries.iter().filter(|(flag, raw)| imports::member_path(*flag, raw).eq_ignore_ascii_case(texture_path)).count(), 1);
            drop(saved);
            doc.mark_saved(output);
        }
        assert_eq!(std::fs::read(source).unwrap(), original);
    }
}
