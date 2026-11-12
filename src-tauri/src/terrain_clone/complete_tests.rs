use super::*;
use crate::model_viewer::storm::Archive;

#[test]
#[ignore = "requires TERRAIN_COMPLETE_ROOT private fixtures"]
fn actual_full_resource_copy_and_repeated_target_save() {
    let root = PathBuf::from(std::env::var("TERRAIN_COMPLETE_ROOT").unwrap());
    for source_name in ["测试图1.w3x", "测试图2.w3x"] {
        let source_path = root.join(source_name);
        let output = root.join(format!("result-{source_name}"));
        fs::copy(root.join("空白图.w3x"), &output).unwrap();
        let src = Archive::open(&source_path).unwrap();
        let target = Archive::open(&output).unwrap();
        let mut doc = MapDocument::new(output.clone(), target.read("war3map.w3e").unwrap());
        optimized_objects::load(&target, &mut doc.members).unwrap();
        let mut source = MapDocument::new(source_path.clone(), src.read("war3map.w3e").unwrap());
        optimized_objects::load(&src, &mut source.members).unwrap();
        for name in ["war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"] {
            if src.has(name) { source.members.insert(name.into(),src.read(name).unwrap()); }
        }
        for name in ["war3map.w3i", "war3map.wts"] { if src.has(name) { source.members.insert(name.into(),src.read(name).unwrap()); } }
        normalizer::normalize(&mut source, &root.join("normalizer-runtime")).unwrap();
        for name in ["war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"] {
            if let Some(bytes) = source.members.get(name) { doc.members.insert(name.into(),object_data::merge(bytes,None,["war3map.w3a", "war3map.w3d", "war3map.w3q"].contains(&name)).unwrap()); }
        }
        drop(target);
        let (count, _, _) = resources::copy_all(&source_path, &output, &mut doc.members).unwrap();
        assert!(count > 100, "{source_name}: {count}");
        let terrain = w3e::parse(&src.read("war3map.w3e").unwrap()).unwrap();
        let rect = SelectionRect { x0: 0, y0: 0, x1: terrain.width - 1, y1: terrain.height - 1, mask: None };
        copy::copy_region(&terrain.to_bytes(), &mut doc.w3e, &rect, [0,0], true, true).unwrap();
        for name in ["war3map.doo", "war3mapUnits.doo", "war3map.wpm", "war3map.shd"] { if src.has(name) { source.members.insert(name.into(), src.read(name).unwrap()); } }
        let dst = Archive::open(&output).unwrap(); for name in ["war3map.doo", "war3mapUnits.doo", "war3map.wpm", "war3map.shd"] { if dst.has(name) { doc.members.insert(name.into(), dst.read(name).unwrap()); } } drop(dst);
        let mut log = vec![]; for (name, units) in [("war3map.doo",false),("war3mapUnits.doo",true)] { copy_entity_member(name, &source, &mut doc, &rect, [0,0], units, &mut log).unwrap(); }
        for (name, header) in [("war3map.wpm",true),("war3map.shd",false)] { copy_grid_member(name,&source,&mut doc,&rect,[0,0],header,&mut log).unwrap(); }
        save::write_map_in_place(&doc).unwrap();
        doc.mark_saved(output.clone());
        for iteration in 0..2 {
            let saved = Archive::open(&output).unwrap();
            assert_eq!(saved.read("war3map.w3e").unwrap(), doc.w3e);
            for (name, bytes) in &doc.members { if mpq_identity::parse_key(name).is_none() { assert_eq!(saved.read(&name.replace('/',"\\")).unwrap(), *bytes, "{name}"); } }
            let hashes = saved.hashes().unwrap();
            for name in doc.members.keys().filter(|name| mpq_identity::parse_key(name).is_some()) { let identity = mpq_identity::parse_key(name).unwrap(); assert!(hashes.iter().any(|entry| entry[..3] == identity && entry[3] < 0xfffffffe)); }
            if iteration == 0 {
                let mut references = std::collections::HashSet::new();
                src.enumerate(|_, raw, _, _| {
                    if let Ok(bytes) = src.read_raw(&raw) {
                        if bytes.starts_with(b"MDLX") {
                            let mut at = 4;
                            while at + 8 <= bytes.len() {
                                let length = u32::from_le_bytes(bytes[at+4..at+8].try_into().unwrap()) as usize;
                                if at + 8 + length > bytes.len() { break; }
                                if &bytes[at..at+4] == b"TEXS" { for texture in bytes[at+8..at+8+length].chunks_exact(268) { let path = texture[4..264].split(|b| *b == 0).next().unwrap(); if !path.is_empty() { references.insert(path.to_vec()); } } }
                                at += 8 + length;
                            }
                        }
                    }
                    true
                });
                let mut missing_source = vec![]; let mut copied = 0;
                for name in references {
                    match src.read_raw(&name) {
                        Ok(bytes) => { assert_eq!(saved.read_raw(&name).unwrap_or_else(|e| panic!("DEPENDENCY {}: {e}",String::from_utf8_lossy(&name))), bytes, "{}", String::from_utf8_lossy(&name)); copied += 1; }
                        Err(_) => missing_source.push(String::from_utf8_lossy(&name).into_owned()),
                    }
                }
                fs::write(root.join(format!("dependencies-{source_name}.json")),serde_json::to_vec_pretty(&serde_json::json!({"copied":copied,"notInSource":missing_source})).unwrap()).unwrap();
                println!("TEXTURE DEPENDENCIES {source_name}: {copied} existing verified; {} not in source",missing_source.len());
            }
            drop(saved);
            if iteration == 0 { save::write_map_in_place(&doc).unwrap(); }
        }
        println!("FULL COPY {source_name}: {count} resources; {:?}; {}", log, output.display());
    }
}
