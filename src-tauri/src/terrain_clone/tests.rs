use super::{w3e, SelectionRect};

pub(super) fn archive_fixture() -> std::path::PathBuf {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/terrain-clone-fixtures").join(format!("{}.w3m", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let archive = crate::model_viewer::storm::Archive::create_fixture(&path, true);
    archive.write("war3map.w3e", &fixture(5, 5, &[*b"Lgrs", *b"Ygsb", *b"Fgrs", *b"Dbrk"], &[*b"CLgr"], 2), false).unwrap();
    archive.flush().unwrap();
    drop(archive);
    path
}

pub(super) fn fixture(width: u32, height: u32, ground: &[[u8; 4]], cliff: &[[u8; 4]], layer: u8) -> Vec<u8> {
    let mut bytes = b"W3E!".to_vec();
    bytes.extend_from_slice(&11i32.to_le_bytes()); bytes.push(b'L'); bytes.extend_from_slice(&0i32.to_le_bytes());
    bytes.extend_from_slice(&(ground.len() as i32).to_le_bytes());
    for id in ground { bytes.extend_from_slice(id); }
    bytes.extend_from_slice(&(cliff.len() as i32).to_le_bytes());
    for id in cliff { bytes.extend_from_slice(id); }
    bytes.extend_from_slice(&(width as i32).to_le_bytes()); bytes.extend_from_slice(&(height as i32).to_le_bytes());
    bytes.extend_from_slice(&(-4096f32).to_le_bytes()); bytes.extend_from_slice(&(-4096f32).to_le_bytes());
    for _ in 0..width * height { bytes.extend_from_slice(&8192u16.to_le_bytes()); bytes.extend_from_slice(&8192u16.to_le_bytes()); bytes.extend_from_slice(&[0,0,layer]); }
    bytes
}

#[test]
fn parses_known_header_and_renders_one_rgb_pixel_per_tilepoint() {
    let bytes = fixture(4, 3, &[ *b"Ldrt" ], &[ *b"CLdi" ], 2);
    let map = w3e::parse(&bytes).unwrap();
    assert_eq!((map.width, map.height), (4,3));
    assert_eq!(map.rgb().len(), 4 * 3 * 3);
    assert_eq!(map.to_bytes(), bytes);
}

#[test]
fn copies_selected_rectangle_and_leaves_everything_outside_untouched() {
    let source = fixture(5,5,&[*b"Ldrt"],&[*b"CLdi"],2);
    let mut target = fixture(6,6,&[*b"Lrok"],&[*b"CLgr"],2);
    let outside_before = w3e::parse(&target).unwrap().cell(0,0).to_vec();
    let selection = SelectionRect { x0:1,y0:1,x1:2,y1:2,mask:None };
    let (changed, _) = super::copy::copy_region(&source,&mut target,&selection,[2,2],false,false).unwrap();
    assert_eq!(changed,4);
    let result = w3e::parse(&target).unwrap();
    assert_eq!(result.width, 6);
    assert_eq!(result.height, 6);
    assert_eq!(result.to_bytes(), target);
    assert_eq!(result.cell(2,2)[4] & 15,0);
    assert_eq!(result.cell(0,0),outside_before);
}

#[test]
fn rotates_selected_terrain_clockwise_and_swaps_target_dimensions() {
    let mut source = fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let source_start = source.len() - 5 * 5 * 7;
    for y in 0..5 { for x in 0..5 { source[source_start + (y * 5 + x) * 7] = (x + y * 5) as u8; } }
    let mut target = fixture(7, 7, &[*b"Lrok"], &[*b"CLgr"], 2);
    let selection = SelectionRect { x0: 1, y0: 1, x1: 2, y1: 3, mask: None };
    let (changed, _) = super::copy::copy_region_rotated(&source, &mut target, &selection, [3, 2], false, false, 90).unwrap();
    assert_eq!(changed, 6);
    let result = w3e::parse(&target).unwrap();
    assert_eq!(result.cell(5, 2)[0], 6); // source (1,1) -> local (2,0)
    assert_eq!(result.cell(4, 2)[0], 11); // source (1,2) -> local (1,0)
    assert_eq!(result.cell(3, 3)[0], 17); // source (2,3) -> local (0,1)
}

#[test]
fn rejects_a_palette_merge_that_would_silently_change_live_target_tiles() {
    let mut source_ids = Vec::new();
    let mut target_ids = Vec::new();
    for i in 0..9u8 { source_ids.push([b'A', b'A', b'A', b'0' + i]); }
    for i in 0..9u8 { target_ids.push([b'B', b'B', b'B', b'0' + i]); }
    let mut source = fixture(3, 3, &source_ids, &[*b"CLdi"], 2);
    let mut target = fixture(5, 5, &target_ids, &[*b"CLdi"], 2);
    let source_cells = 13 + 4 + source_ids.len() * 4 + 4 + 4 + 16;
    let target_cells = 13 + 4 + target_ids.len() * 4 + 4 + 4 + 16;
    for index in 0..9 { source[source_cells + index * 7 + 4] = index as u8; }
    for index in 0..25 { target[target_cells + index * 7 + 4] = (index % 9) as u8; }
    let selection = SelectionRect { x0: 0, y0: 0, x1: 2, y1: 2, mask: None };
    let before = target.clone();
    let error = super::copy::copy_region(&source, &mut target, &selection, [0, 0], true, false).unwrap_err();
    assert!(error.contains("超过 16 种"), "unexpected error: {error}");
    assert_eq!(target, before);
}

#[test]
fn copies_doodads_by_selection_and_evicts_entities_under_the_target_rectangle() {
    let source_terrain = fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let target_terrain = fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let source = doodad(-4032.0, -4032.0, 17.0);
    let target = doodad(-3776.0, -3776.0, 99.0);
    let selection = SelectionRect { x0: 0, y0: 0, x1: 1, y1: 1, mask: None };
    let (result, count) = super::entities::copy(&source, &target, &source_terrain, &target_terrain, &selection, [2, 2], false).unwrap();
    assert_eq!(count, 1);
    assert_eq!(i32::from_le_bytes(result[12..16].try_into().unwrap()), 1);
    assert_eq!(f32::from_le_bytes(result[24..28].try_into().unwrap()), -3776.0);
    assert_eq!(f32::from_le_bytes(result[28..32].try_into().unwrap()), -3776.0);
    assert_eq!(f32::from_le_bytes(result[32..36].try_into().unwrap()), 17.0);
}

#[test]
fn copies_only_the_matching_four_by_four_pathing_cells() {
    let source_terrain = fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let target_terrain = fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let mut source = b"MP3W".to_vec();
    source.extend_from_slice(&0u32.to_le_bytes()); source.extend_from_slice(&16u32.to_le_bytes()); source.extend_from_slice(&16u32.to_le_bytes()); source.extend_from_slice(&vec![0xaa; 256]);
    let mut target = source[..16].to_vec(); target.extend_from_slice(&vec![0x11; 256]);
    let selection = SelectionRect { x0: 1, y0: 1, x1: 1, y1: 1, mask: None };
    let (result, count) = super::grids::copy(&source, &target, &source_terrain, &target_terrain, &selection, [2, 2], true).unwrap();
    assert_eq!(count, 16);
    for y in 0..16usize { for x in 0..16usize {
        let byte = result[16 + y * 16 + x];
        assert_eq!(byte, if (8..12).contains(&x) && (8..12).contains(&y) { 0xaa } else { 0x11 });
    } }
}

#[test]
fn copies_only_regions_fully_contained_in_the_selection() {
    let source_terrain = fixture(8, 8, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let target_terrain = fixture(8, 8, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let source = regions(&[("Area", (-4096.0, -4096.0, -3968.0, -3968.0)), ("Partial", (-4096.0, -4096.0, -3712.0, -3712.0))]);
    let target = regions(&[]);
    let selection = SelectionRect { x0: 0, y0: 0, x1: 1, y1: 1, mask: None };
    let (result, copied, skipped) = super::regions::copy(&source, &target, &source_terrain, &target_terrain, &selection, [3, 3]).unwrap();
    assert_eq!((copied, skipped), (1, 1));
    assert_eq!(i32::from_le_bytes(result[4..8].try_into().unwrap()), 1);
    assert!(String::from_utf8_lossy(&result).contains("Area"));
}

#[test]
fn honors_freehand_mask_and_rejects_out_of_bounds_geometry() {
    let source = fixture(4,4,&[*b"Ldrt"],&[*b"CLdi"],2);
    let mut target = fixture(4,4,&[*b"Ldrt"],&[*b"CLdi"],2);
    let mut mask=vec![false;16]; mask[5]=true; mask[10]=true;
    let selection=SelectionRect{x0:1,y0:1,x1:2,y1:2,mask:Some(mask)};
    assert_eq!(super::copy::copy_region(&source,&mut target,&selection,[0,0],false,false).unwrap().0,2);
    let invalid=SelectionRect{x0:0,y0:0,x1:4,y1:2,mask:None};
    assert!(super::copy::copy_region(&source,&mut target,&invalid,[0,0],false,false).is_err());
}

#[test]
fn rejects_truncated_and_mismatched_tilepoint_payloads() {
    let mut bytes=fixture(2,2,&[*b"Ldrt"],&[*b"CLdi"],2);
    bytes.pop();
    assert!(w3e::parse(&bytes).is_err());
    let mut bytes=fixture(2,2,&[*b"Ldrt"],&[*b"CLdi"],2);
    bytes[29..33].copy_from_slice(&3i32.to_le_bytes());
    assert!(w3e::parse(&bytes).is_err());
}

#[test]
#[ignore = "requires TERRAIN_CLONE_PRIVATE_MAP to point at a private Warcraft map copy"]
fn private_mpq_copy_can_be_saved_and_reopened_without_changing_its_source() {
    use sha2::{Digest, Sha256};
    use std::{fs, path::PathBuf};
    use super::session::MapDocument;
    use crate::model_viewer::storm::Archive;

    let source_path = PathBuf::from(std::env::var_os("TERRAIN_CLONE_PRIVATE_MAP").expect("set TERRAIN_CLONE_PRIVATE_MAP"));
    let target_path = std::env::var_os("TERRAIN_CLONE_PRIVATE_TARGET_MAP").map(PathBuf::from).unwrap_or_else(|| source_path.clone());
    let source_hash = || Sha256::digest(fs::read(&source_path).unwrap()).to_vec();
    let target_hash = || Sha256::digest(fs::read(&target_path).unwrap()).to_vec();
    let before_source_hash = source_hash();
    let before_target_hash = target_hash();
    let source = Archive::open(&source_path).unwrap();
    let target = Archive::open(&target_path).unwrap();
    let source_imports = if source.has("war3map.imp") { super::imports::parse(&source.read("war3map.imp").unwrap()).unwrap() } else { Vec::new() };
    let imported_members = source_imports.iter().map(|(flag, path)| super::imports::member_path(*flag, path)).collect::<Vec<_>>();
    let recovered_names = crate::model_viewer::recovered_archive_names(&source_path).unwrap();
    let mut model_texture_refs = std::collections::HashSet::new();
    source.enumerate(|_, raw, _, _| {
        if let Ok(bytes) = source.read_raw(&raw) {
            if bytes.starts_with(b"MDLX") {
                let mut offset = 4;
                while offset + 8 <= bytes.len() {
                    let size = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
                    let Some(end) = offset.checked_add(8).and_then(|start| start.checked_add(size)).filter(|end| *end <= bytes.len()) else { break; };
                    if &bytes[offset..offset + 4] == b"TEXS" {
                        for texture in bytes[offset + 8..end].chunks_exact(268) {
                            let path = texture[4..264].split(|byte| *byte == 0).next().unwrap();
                            if !path.is_empty() { model_texture_refs.insert(path.to_vec()); }
                        }
                    }
                    offset = end;
                }
            } else if bytes.starts_with(b"Version") {
                for path in crate::model_viewer::references::references(&bytes) {
                    if ["blp", "tga", "dds", "png", "jpg", "jpeg"].iter().any(|extension| path.to_ascii_lowercase().ends_with(&format!(".{extension}"))) {
                        model_texture_refs.insert(path.into_bytes());
                    }
                }
            }
        }
        true
    });
    let source_terrain = source.read("war3map.w3e").unwrap();
    let mut document = MapDocument::new(target_path.clone(), super::w3e::clear(&target.read("war3map.w3e").unwrap()).unwrap());
    let mut source_document = MapDocument::new(source_path.clone(), source_terrain.clone());
    for member in ["war3map.doo", "war3mapUnits.doo", "war3map.wpm", "war3map.shd", "war3map.w3r", "war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"] {
        if source.has(member) { source_document.members.insert(member.into(), source.read(member).unwrap()); }
    }
    for member in ["war3map.doo", "war3mapUnits.doo", "war3map.wpm", "war3map.shd", "war3map.w3r", "war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"] {
        if target.has(member) { document.members.insert(member.into(), target.read(member).unwrap()); }
    }
    document.saved_members = document.members.clone();
    source_document.saved_members = source_document.members.clone();
    let source_map = super::w3e::parse(&source_terrain).unwrap();
    let selection = SelectionRect { x0: 0, y0: 0, x1: source_map.width - 1, y1: source_map.height - 1, mask: None };
    let (changed_tilepoints, _) = super::copy::copy_region(&source_terrain, &mut document.w3e, &selection, [0, 0], true, true).unwrap();
    assert_eq!(changed_tilepoints, source_map.width * source_map.height);
    let target_terrain_before_entities = document.w3e.clone();
    let mut copy_log = vec![];
    for (member, units) in [("war3map.doo", false), ("war3mapUnits.doo", true)] {
        if source_document.members.contains_key(member) { super::copy_entity_member(member, &source_document, &mut document, &selection, [0, 0], units, &mut copy_log).unwrap(); }
    }
    for (member, has_header) in [("war3map.wpm", true), ("war3map.shd", false)] {
        if source_document.members.contains_key(member) { super::copy_grid_member(member, &source_document, &mut document, &selection, [0, 0], has_header, &mut copy_log).unwrap(); }
    }
    super::copy_region_member(&source_document, &mut document, &selection, [0, 0], &mut copy_log).unwrap();
    for member in ["war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"] {
        if let Some(bytes) = source_document.members.get(member) {
            let extended = ["war3map.w3a", "war3map.w3d", "war3map.w3q"].contains(&member);
            let merged = super::object_data::merge(bytes, document.members.get(member), extended).unwrap();
            document.members.insert(member.into(), merged);
        }
    }
    assert_ne!(target_terrain_before_entities, super::w3e::clear(&source_terrain).unwrap());
    let before_resources = document.members.clone();
    let (copied_resources, imported_resources, _) = super::resources::copy_all(&source_path, &target_path, &mut document.members).unwrap();
    let copied_bytes: u64 = document.members.iter().filter(|(path, bytes)| before_resources.get(*path) != Some(*bytes)).map(|(_, bytes)| bytes.len() as u64).sum();
    eprintln!("Resource copy: {copied_resources} entries, {copied_bytes} uncompressed bytes, {imported_resources} import paths");
    assert!(copied_resources > 0, "private source fixture should contain model/media resources");
    assert!(imported_resources > 0, "anonymous model assets recovered from references must be exposed in the import manager");
    let before_repeat = document.members.clone();
    let repeated = super::resources::copy_all(&source_path, &target_path, &mut document.members).unwrap();
    let changed_again: Vec<_> = document.members.iter().filter_map(|(path, bytes)| {
        let old = before_repeat.get(path);
        old.is_none_or(|old| old != bytes).then(|| (path.clone(), old.map(Vec::len), bytes.len(), old.map(|value| Sha256::digest(value)[..8].to_vec()), Sha256::digest(bytes)[..8].to_vec()))
    }).collect();
    assert_eq!(repeated.0, 0, "pending resources must not be added twice: {changed_again:?}");
    let mut terrain = super::w3e::parse(&document.w3e).unwrap();
    let height = u16::from_le_bytes([terrain.cells[0], terrain.cells[1]]).saturating_add(1);
    terrain.cells[..2].copy_from_slice(&height.to_le_bytes());
    document.w3e = terrain.to_bytes();
    drop(target);

    let output_path = std::env::temp_dir().join(format!("terrain-clone-{}.w3x", uuid::Uuid::new_v4()));
    super::save::write_map_copy(&document, &output_path).unwrap();
    let output = Archive::open(&output_path).unwrap();
    let saved_terrain = output.read("war3map.w3e").unwrap();
    assert_eq!(saved_terrain, document.w3e);
    super::w3e::parse(&saved_terrain).unwrap();
    for member in ["war3map.doo", "war3mapUnits.doo"] {
        if let Some(expected) = document.members.get(member) { assert_eq!(super::entities::round_trip(&output.read(member).unwrap(), member == "war3mapUnits.doo").unwrap(), *expected, "saved entity data differs: {member}"); }
    }
    for member in document.members.keys().filter(|member| super::mpq_identity::parse_key(member).is_some()) {
        let expected = super::mpq_identity::parse_key(member).unwrap();
        assert!(output.hashes().unwrap().iter().any(|entry| entry[..3] == expected && entry[3] < 0xfffffffe), "anonymous MPQ identity missing after save: {member}");
    }
    for (member, bytes) in &document.members {
        if super::mpq_identity::parse_key(member).is_some() { continue; }
        let actual = output.read(&member.replace('/', "\\")).unwrap_or_else(|error| panic!("{member}: {error}"));
        assert_eq!(
            sha2::Sha256::digest(&actual), sha2::Sha256::digest(bytes),
            "saved resource bytes differ: {member}; sizes {} vs {}",
            actual.len(), bytes.len()
        );
    }
    let saved_imports = if output.has("war3map.imp") { super::imports::parse(&output.read("war3map.imp").unwrap()).unwrap() } else { Vec::new() };
    assert!(!saved_imports.is_empty(), "saved clone must contain a usable import-manager manifest");
    for entry in &source_imports {
        assert!(saved_imports.iter().any(|saved| super::imports::member_path(saved.0, &saved.1).eq_ignore_ascii_case(&super::imports::member_path(entry.0, &entry.1))), "source import missing from saved manifest: {}", String::from_utf8_lossy(&entry.1));
        let path = super::imports::member_path(entry.0, &entry.1);
        assert!(output.has(&path.replace('/', "\\")), "source import missing from saved archive: {path}");
    }
    let mut prefixed_dependencies_verified = 0;
    for raw in model_texture_refs {
        let reference = String::from_utf8_lossy(&raw).replace('\\', "/");
        let already_at_reference = source.read_raw(&raw).is_ok();
        let reference_leaf = reference.rsplit('/').next().unwrap_or(&reference);
        let imported_match = imported_members.iter().find(|path| {
            let relative = path.strip_prefix("war3mapImported/").unwrap_or(path);
            relative.eq_ignore_ascii_case(&reference) || relative.rsplit('/').next().is_some_and(|leaf| leaf.eq_ignore_ascii_case(reference_leaf))
        }).cloned();
        let recovered_candidates = recovered_names.values().filter(|path| {
            let path = path.replace('\\', "/");
            let relative = path.strip_prefix("war3mapImported/").or_else(|| path.strip_prefix("war3mapimported/")).unwrap_or(&path);
            relative.eq_ignore_ascii_case(&reference) || relative.rsplit('/').next().is_some_and(|leaf| leaf.eq_ignore_ascii_case(reference_leaf))
        }).collect::<Vec<_>>();
        let exact_recovered_match = recovered_candidates.iter().find(|path| {
            let path = path.replace('\\', "/");
            let relative = path.strip_prefix("war3mapImported/").or_else(|| path.strip_prefix("war3mapimported/")).unwrap_or(&path);
            relative.eq_ignore_ascii_case(&reference)
        }).map(|path| (**path).clone());
        let recovered_match = exact_recovered_match.or_else(|| (recovered_candidates.len() == 1).then(|| recovered_candidates[0].clone()));
        if !already_at_reference && imported_match.is_none() && recovered_match.is_none() { continue; }
        assert!(output.read_raw(&raw).is_ok(), "model texture reference was not materialized at its expected path: {reference}");
        if !already_at_reference {
            prefixed_dependencies_verified += 1;
            assert!(saved_imports.iter().any(|entry| super::imports::member_path(entry.0, &entry.1).eq_ignore_ascii_case(&reference)), "model dependency must be registered at its unprefixed reference path: {reference}");
        }
    }
    assert!(prefixed_dependencies_verified > 0, "private source map must exercise a model texture resolved from a prefixed import path");
    for (member, _) in document.members.iter().filter(|(member, _)| member.to_ascii_lowercase().starts_with("war3mapimported/")) {
        assert!(saved_imports.iter().any(|entry| super::imports::member_path(entry.0, &entry.1).eq_ignore_ascii_case(member)), "recovered model/dependency missing from import manager: {member}");
        assert!(output.has(&member.replace('/', "\\")), "import-manager item missing from saved MPQ: {member}");
    }
    for (member, bytes) in &document.members {
        if super::mpq_identity::parse_key(member).is_some() || !bytes.starts_with(b"MDLX") { continue; }
        assert!(saved_imports.iter().any(|entry| super::imports::member_path(entry.0, &entry.1).eq_ignore_ascii_case(member)), "model must be imported at its logical path: {member}");
    }
    drop(output);
    drop(source);
    assert_eq!(source_hash(), before_source_hash, "source map changed during copy/save");
    assert_eq!(target_hash(), before_target_hash, "target map changed before save-as");
    fs::remove_file(output_path).unwrap();
}

#[test]
#[ignore = "requires TERRAIN_CLONE_PRIVATE_MAP to point at the original map; writes only a private output copy"]
fn private_map_clone_preserves_cliff_slots_models_and_gate_overrides() {
    use sha2::{Digest, Sha256};
    use std::path::PathBuf;
    use super::session::MapDocument;
    use crate::model_viewer::storm::Archive;

    let source = PathBuf::from(std::env::var_os("TERRAIN_CLONE_PRIVATE_MAP").expect("set TERRAIN_CLONE_PRIVATE_MAP"));
    assert!(source.canonicalize().unwrap().starts_with(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-results").canonicalize().unwrap()), "test must use a private map copy");
    let output = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("../test-results/terrain-cliff-native-{}.w3x", uuid::Uuid::new_v4()));
    let before = Sha256::digest(std::fs::read(&source).unwrap()).to_vec();
    let archive = Archive::open(&source).unwrap();
    let mut doc = MapDocument::new(source.clone(), archive.read("war3map.w3e").unwrap());
    for name in ["war3map.imp", "war3map.w3b", "war3map.wts"] {
        if archive.has(name) { doc.members.insert(name.into(), archive.read(name).unwrap()); }
    }
    super::resources::copy_all(&source, &source, &mut doc.members).unwrap();
    for name in ["ReplaceableTextures/Cliff/Cliff0.blp", "ReplaceableTextures/Cliff/Cliff1.blp"] {
        let original = archive.read(&name.replace('/', "\\")).unwrap();
        let block = archive.block(&name).unwrap();
        let identity = archive.hashes().unwrap().into_iter().find(|entry| entry[3] == block).unwrap();
        doc.members.insert(name.into(), original.clone());
        doc.members.insert(super::mpq_identity::key(identity), original);
    }
    assert!(doc.members["ReplaceableTextures/Cliff/Cliff1.blp"] != super::NATIVE_CLIFF_TEXTURES[1].1);
    assert_eq!(super::replace_native_cliff_overrides(&mut doc), 2);
    assert_eq!(doc.members.keys().filter(|path| super::mpq_identity::matches_name(path, "ReplaceableTextures/Cliff/Cliff1.blp")).count(), 1);
    let objects = super::object_data::resolve_strings(&doc.members["war3map.w3b"], &doc.members["war3map.wts"], false).unwrap();
    doc.members.insert("war3map.w3b".into(), objects.clone());
    let mut copied_terrain = doc.w3e.clone();
    super::copy::copy_region(&doc.w3e, &mut copied_terrain, &super::SelectionRect { x0:0,y0:0,x1:128,y1:128,mask:None }, [0,0], true, false).unwrap();
    assert_eq!(super::w3e::palette(&copied_terrain, 1).unwrap(), [*b"CLdi", *b"CLgr"]);
    doc.w3e = copied_terrain;
    doc.saved_members = doc.members.clone();
    assert!(doc.members.contains_key("ReplaceableTextures/Cliff/Cliff0.blp"));
    assert!(doc.members.contains_key("ReplaceableTextures/Cliff/Cliff1.blp"));
    super::save::write_map_copy(&doc, &output).unwrap();
    let saved = Archive::open(&output).unwrap();
    for (name, expected) in [
        ("ReplaceableTextures\\Cliff\\Cliff0.blp", super::NATIVE_CLIFF_TEXTURES[0].1),
        ("ReplaceableTextures\\Cliff\\Cliff1.blp", super::NATIVE_CLIFF_TEXTURES[1].1),
    ] { assert_eq!(saved.read(name).unwrap(), expected); }
    assert_eq!(super::w3e::palette(&saved.read("war3map.w3e").unwrap(), 1).unwrap(), [*b"CLdi", *b"CLgr"]);
    let fields=super::object_data::resolve_strings(&saved.read("war3map.w3b").unwrap(), &saved.read("war3map.wts").unwrap(), false).unwrap();
    assert_eq!(fields, objects, "gate models must retain the source overrides");
    drop(saved);
    assert!(doc.removed_members.is_empty());
    assert_eq!(Sha256::digest(std::fs::read(&source).unwrap()).to_vec(), before);
}

#[test]
#[ignore = "requires TERRAIN_CLONE_VERIFY_MAP to point at a private saved map copy"]
fn private_saved_map_uses_embedded_native_cliff_textures() {
    use crate::model_viewer::storm::Archive;
    use sha2::Digest;
    use std::path::PathBuf;
    let path = PathBuf::from(std::env::var_os("TERRAIN_CLONE_VERIFY_MAP").expect("set TERRAIN_CLONE_VERIFY_MAP"));
    assert!(path.canonicalize().unwrap().starts_with(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-results").canonicalize().unwrap()), "test must use a private map copy");
    let archive = Archive::open(&path).unwrap();
    for (name, expected) in [
        ("ReplaceableTextures\\Cliff\\Cliff0.blp", super::NATIVE_CLIFF_TEXTURES[0].1),
        ("ReplaceableTextures\\Cliff\\Cliff1.blp", super::NATIVE_CLIFF_TEXTURES[1].1),
    ] {
        let actual = archive.read(name).unwrap();
        assert_eq!(sha2::Sha256::digest(&actual), sha2::Sha256::digest(expected), "saved map override must use the bundled game texture: {name}");
    }
}

fn doodad(x: f32, y: f32, z: f32) -> Vec<u8> {
    let mut bytes = b"W3do".to_vec(); bytes.extend_from_slice(&8i32.to_le_bytes()); bytes.extend_from_slice(&11i32.to_le_bytes()); bytes.extend_from_slice(&1i32.to_le_bytes());
    let mut entry = vec![0; 42]; entry[8..12].copy_from_slice(&x.to_le_bytes()); entry[12..16].copy_from_slice(&y.to_le_bytes()); entry[16..20].copy_from_slice(&z.to_le_bytes());
    bytes.extend_from_slice(&entry); bytes.extend_from_slice(&0i32.to_le_bytes()); bytes.extend_from_slice(&1i32.to_le_bytes()); bytes.extend_from_slice(&[0; 8]); bytes
}

fn regions(items: &[(&str, (f32, f32, f32, f32))]) -> Vec<u8> {
    let mut bytes = 5i32.to_le_bytes().to_vec(); bytes.extend_from_slice(&(items.len() as i32).to_le_bytes());
    for (index, (name, (left, bottom, right, top))) in items.iter().enumerate() {
        for value in [*left, *bottom, *right, *top] { bytes.extend_from_slice(&value.to_le_bytes()); }
        bytes.extend_from_slice(name.as_bytes()); bytes.push(0); bytes.extend_from_slice(&(index as i32).to_le_bytes());
        bytes.extend_from_slice(&[0; 4]); bytes.push(0); bytes.extend_from_slice(&[255; 4]);
    }
    bytes
}
