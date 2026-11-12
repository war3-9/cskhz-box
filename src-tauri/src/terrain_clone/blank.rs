use super::session::MapDocument;

pub(super) const LOGIC: [&str; 5] = ["war3map.j", "scripts/war3map.j", "war3map.lua", "scripts/war3map.lua", "war3map.wct"];

pub(super) fn initialize(doc: &mut MapDocument, template: &MapDocument) {
    // The geometry template is a file backing, not a playable trigger template.
    // Do not inherit code referring to the source's deleted/reassigned entities.
    for path in LOGIC { doc.removed_members.insert(path.into()); }
    let mut wtg = b"WTG!".to_vec();
    for number in [7u32, 0, 2, 0, 0] { wtg.extend_from_slice(&number.to_le_bytes()); }
    doc.members.insert("war3map.wtg".into(), wtg);
    // WCT v1: empty comment, no global custom code, no trigger bodies.
    doc.members.insert("war3map.wct".into(), vec![1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    doc.removed_members.remove("war3map.wct");
    // Metadata contains dimensions, player settings and random item tables,
    // but no executable code. Object text is resolved separately when opened.
    for name in ["war3map.w3i", "war3map.wts"] {
        if let Some(bytes) = template.members.get(name) { doc.members.insert(name.into(), bytes.clone()); }
    }
    doc.members.insert("war3map.imp".into(), [1u32.to_le_bytes(), 0u32.to_le_bytes()].concat());
    for (name, units) in [("war3map.doo", false), ("war3mapUnits.doo", true)] {
        let mut bytes = b"W3do\x08\0\0\0\x0b\0\0\0\0\0\0\0".to_vec();
        if !units { bytes.extend_from_slice(&[0; 8]); }
        doc.members.insert(name.into(), bytes);
    }
    doc.members.insert("war3map.w3r".into(), [5u32.to_le_bytes(), 0u32.to_le_bytes()].concat());
    for name in ["war3map.wpm", "war3map.shd"] {
        if let Some(bytes) = template.members.get(name) {
            let mut empty = vec![0; bytes.len()];
            if name.ends_with("wpm") && bytes.len() >= 16 { empty[..16].copy_from_slice(&bytes[..16]); }
            doc.members.insert(name.into(), empty);
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::model_viewer::storm::Archive;
    use super::super::{resources, save, tests::archive_fixture};

    #[test] fn blank_template_does_not_keep_source_logic() {
        let mut doc = super::MapDocument::new("missing-map.w3x".into(), vec![]);
        let template = doc.clone();
        super::initialize(&mut doc, &template);
        assert!(doc.removed_members.contains("war3map.j"));
        assert!(doc.removed_members.contains("scripts/war3map.lua"));
        assert_eq!(&doc.members["war3map.wtg"][..8], b"WTG!\x07\0\0\0");
        assert_eq!(doc.members["war3map.wtg"].len(), 24);
    }

    #[test]
    fn fresh_archive_contains_assets_but_no_source_code_or_unselected_members() {
        let source = archive_fixture();
        let archive = Archive::writable_copy(&source).unwrap();
        for name in ["war3map.j", "scripts/war3map.j", "custom.lua", "AI/test.ai", "custom.wtg", "unselected.txt"] {
            archive.write(name, b"SOURCE_LOGIC_MUST_NOT_TRANSFER", false).unwrap();
        }
        archive.write("texture.blp", b"texture bytes", false).unwrap();
        let imports = super::super::imports::merge(None, &[], &[(13, b"custom.lua".to_vec()), (13, b"AI\\test.ai".to_vec()), (13, b"custom.wtg".to_vec()), (13, b"texture.blp".to_vec())]).unwrap();
        archive.write("war3map.imp", &imports, false).unwrap();
        archive.flush().unwrap();
        let terrain = archive.read("war3map.w3e").unwrap();
        drop(archive);
        let template = super::MapDocument::new(source.clone(), terrain.clone());
        let mut doc = template.clone();
        doc.blank = true;
        super::initialize(&mut doc, &template);
        resources::copy_assets(&source, &source, &mut doc.members, true).unwrap();
        let output = source.with_extension("blank.w3x");
        save::write_map_copy(&doc, &output).unwrap();
        let result = Archive::open(&output).unwrap();
        assert_eq!(result.read("texture.blp").unwrap(), b"texture bytes");
        for name in ["war3map.j", "scripts/war3map.j", "custom.lua", "AI\\test.ai", "custom.wtg", "unselected.txt"] { assert!(!result.has(name), "{name}"); }
        assert_eq!(result.read("war3map.wtg").unwrap().len(), 24);
        assert_eq!(result.read("war3map.wct").unwrap().len(), 13);
        let manifest = String::from_utf8_lossy(&result.read("war3map.imp").unwrap()).into_owned();
        assert!(!manifest.contains("lua") && !manifest.contains("test.ai") && !manifest.contains("custom.wtg"));
        drop(result);
        doc.mark_saved(output.clone());
        save::write_map_in_place(&doc).unwrap();
        let result = Archive::open(&output).unwrap();
        assert_eq!(result.read("texture.blp").unwrap(), b"texture bytes");
        assert!(!result.has("war3map.j"));
        drop(result);
        std::fs::remove_file(output).unwrap();
        std::fs::remove_file(source).unwrap();
    }
}
