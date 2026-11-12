use super::*;
use crate::model_viewer::storm::Archive;

fn options(units: bool, doodads: bool, object_data: bool) -> CopyOptions {
    serde_json::from_value(serde_json::json!({
        "terrain": false, "groundArt": false, "cliffArt": false,
        "doodads": doodads, "units": units, "paths": false, "shadows": false,
        "regions": false, "objectData": object_data, "allResources": true,
        "restoreEmptyGates": true
    })).unwrap()
}

fn rect() -> SelectionRect { SelectionRect { x0: 0, y0: 0, x1: 1, y1: 1, mask: None } }
fn doc() -> MapDocument { MapDocument::new("missing.w3x".into(), super::super::tests::fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2)) }

fn object(id: &[u8; 4], extended: bool) -> Vec<u8> {
    let mut bytes = [2u32.to_le_bytes(), 0u32.to_le_bytes(), 1u32.to_le_bytes()].concat();
    bytes.extend_from_slice(b"hfoo"); bytes.extend_from_slice(id);
    bytes.extend_from_slice(&1u32.to_le_bytes()); bytes.extend_from_slice(b"unam");
    bytes.extend_from_slice(&3u32.to_le_bytes());
    if extended { bytes.extend_from_slice(&[0; 8]); }
    bytes.extend_from_slice(b"test\0"); bytes.extend_from_slice(id); bytes
}

fn placements(ids: &[[u8; 4]], units: bool) -> Vec<u8> {
    let mut bytes = b"W3do".to_vec();
    for value in [8i32, 11, ids.len() as i32] { bytes.extend_from_slice(&value.to_le_bytes()); }
    for id in ids {
        let mut record = vec![0; if units { 111 } else { 50 }];
        record[..4].copy_from_slice(id);
        for at in [8, 12] { record[at..at + 4].copy_from_slice(&(-4032f32).to_le_bytes()); }
        bytes.extend_from_slice(&record);
    }
    if !units { bytes.extend_from_slice(&[0; 8]); }
    bytes
}

fn populated() -> (MapDocument, MapDocument) {
    let mut source = doc(); let mut target = doc();
    let mut unit_ids = vec![]; let mut doodad_ids = vec![];
    for (index, (name, _, extended, unit_data)) in OBJECT_FILES.iter().enumerate() {
        let id = [b'S', b'0', b'0', b'0' + index as u8];
        source.members.insert((*name).into(), object(&id, *extended));
        target.members.insert((*name).into(), object(&[b'T', b'0', b'0', b'0' + index as u8], *extended));
        if *unit_data { unit_ids.push(id); } else { doodad_ids.push(id); }
    }
    source.members.insert("war3mapUnits.doo".into(), placements(&unit_ids, true));
    source.members.insert("war3map.doo".into(), placements(&doodad_ids, false));
    (source, target)
}

#[test]
fn category_switches_apply_to_all_seven_object_files_and_keep_target_data() {
    for merge in [false, true] { for units in [false, true] { for doodads in [false, true] {
        let (source, mut target) = populated(); let before = target.members.clone();
        let mut log = Vec::new();
        apply(&source, &mut target, &options(units, doodads, merge), &rect(), &mut log).unwrap();
        for (name, label, _, unit_data) in OBJECT_FILES {
            let enabled = merge && if unit_data { units } else { doodads };
            if enabled {
                assert_eq!(u32::from_le_bytes(target.members[name][8..12].try_into().unwrap()), 2, "{name}");
                assert!(log.iter().any(|line| line.contains(label)));
            } else { assert_eq!(target.members[name], before[name], "disabled {name}"); }
        }
    } } }
}

#[test]
fn empty_selection_mask_and_unplaced_definitions_do_not_merge() {
    let (mut source, mut target) = populated();
    source.members.insert("war3map.w3u".into(), object(b"NONE", false));
    let before = target.members.clone(); let mut log = vec![];
    let mut mask = rect(); mask.mask = Some(vec![false; 25]);
    assert!(apply(&source, &mut target, &options(true, true, true), &mask, &mut log).unwrap().is_empty());
    assert_eq!(target.members, before);
    apply(&source, &mut target, &options(true, true, true), &rect(), &mut log).unwrap();
    assert_eq!(target.members["war3map.w3u"], before["war3map.w3u"]);
}

#[test]
fn same_parent_and_original_overrides_keep_target_while_parent_conflicts_remap_only_copied_entities() {
    let (mut source, mut target) = populated(); let mut log = vec![];
    let original = object(b"S000", false);
    target.members.insert("war3map.w3u".into(), original.clone());
    apply(&source, &mut target, &options(true, false, true), &rect(), &mut log).unwrap();
    assert_eq!(target.members["war3map.w3u"], original);
    let mut conflict = original.clone(); conflict[12..16].copy_from_slice(b"hkni");
    target.members.insert("war3map.w3u".into(), conflict.clone());
    target.members.insert("war3mapUnits.doo".into(), placements(&[*b"S000"], true));
    let remap = apply(&source, &mut target, &options(true, false, true), &rect(), &mut log).unwrap();
    let new_id = remap[b"S000"];
    assert_ne!(new_id, *b"S000");
    let changed = &target.members["war3map.w3u"];
    assert!(changed.windows(4).any(|part| part == new_id));
    super::super::copy_entity_member_remapped("war3mapUnits.doo", &source, &mut target, &rect(), [2, 2], true, &remap, &mut log).unwrap();
    let saved_ids = entities::selected_ids(&target.members["war3mapUnits.doo"], &target.w3e, &SelectionRect { x0: 0, y0: 0, x1: 4, y1: 4, mask: None }, true).unwrap();
    assert!(saved_ids.contains(b"S000") && saved_ids.contains(&new_id));
    let custom = object(b"hfoo", false);
    let mut stock = [2u32.to_le_bytes(), 1u32.to_le_bytes()].concat();
    stock.extend_from_slice(&custom[12..]); stock[12..16].fill(0);
    stock.extend_from_slice(&0u32.to_le_bytes());
    let mut source_stock = stock.clone(); source_stock[28..32].copy_from_slice(b"src!");
    source.members.insert("war3map.w3u".into(), source_stock.clone()); source.members.insert("war3mapUnits.doo".into(), placements(&[*b"hfoo"], true));
    target.members.insert("war3map.w3u".into(), stock.clone());
    apply(&source, &mut target, &options(true, false, true), &rect(), &mut log).unwrap();
    assert_eq!(target.members["war3map.w3u"], stock);
    target.members.remove("war3map.w3u");
    target.members.insert("war3mapUnits.doo".into(), placements(&[*b"hfoo"], true));
    apply(&source, &mut target, &options(true, false, true), &rect(), &mut log).unwrap();
    assert_eq!(target.members["war3map.w3u"], source_stock, "a placed base unit is not an existing override");
}

#[test]
fn special_doodad_ids_follow_selection_masks_and_conflict_remaps() {
    let terrain = doc().w3e;
    let mut special = placements(&[], false); special.truncate(20);
    special.extend_from_slice(&1u32.to_le_bytes()); special.extend_from_slice(b"D001");
    special.extend_from_slice(&[0; 4]); special.extend_from_slice(&1u32.to_le_bytes()); special.extend_from_slice(&1u32.to_le_bytes());
    assert!(entities::selected_ids(&special, &terrain, &rect(), false).unwrap().contains(b"D001"));
    let mut masked = rect(); masked.mask = Some(vec![false; 25]);
    assert!(entities::selected_ids(&special, &terrain, &masked, false).unwrap().is_empty());
    let remap = HashMap::from([(*b"D001", *b"z000")]);
    let (copy, count) = entities::copy_remapped(&special, &placements(&[], false), &terrain, &terrain, &rect(), [2, 2], false, &remap).unwrap();
    assert_eq!(count, 1);
    let ids = entities::selected_ids(&copy, &terrain, &SelectionRect { x0: 2, y0: 2, x1: 3, y1: 3, mask: None }, false).unwrap();
    assert_eq!(ids, HashSet::from([*b"z000"]));
}

#[test]
fn disabled_unit_objects_and_optimized_tables_do_not_leak_through_assets_or_save() {
    let path = super::super::tests::archive_fixture();
    let archive = Archive::writable_copy(&path).unwrap();
    let terrain = archive.read("war3map.w3e").unwrap();
    let (mut source, existing) = populated(); source.path = path.clone(); source.w3e = terrain.clone();
    for (name, _, _, _) in OBJECT_FILES { archive.write(name, &existing.members[name], false).unwrap(); }
    archive.write("Units/UnitData.slk", b"OPTIMIZED_UNIT_TABLE_MUST_NOT_TRANSFER", false).unwrap();
    archive.write("texture.blp", b"INDEPENDENT_ASSET_MUST_TRANSFER", false).unwrap();
    archive.write("war3map.imp", &super::super::imports::merge(None, &[], &[
        (13, b"Units\\UnitData.slk".to_vec()), (13, b"texture.blp".to_vec())
    ]).unwrap(), false).unwrap();
    archive.flush().unwrap(); drop(archive);
    for blank in [false, true] {
        let mut target = MapDocument::new(path.clone(), terrain.clone()); target.blank = blank;
        if blank { super::super::blank::initialize(&mut target, &source); }
        else { target.members = existing.members.clone(); }
        apply(&source, &mut target, &options(false, true, true), &rect(), &mut vec![]).unwrap();
        super::super::resources::copy_assets(&path, &path, &mut target.members, blank).unwrap();
        assert!(!target.members.keys().any(|name| name.eq_ignore_ascii_case("Units/UnitData.slk")));
        let output = path.with_extension(if blank { "blank.w3x" } else { "existing.w3x" });
        super::super::save::write_map_copy(&target, &output).unwrap();
        let saved = Archive::open(&output).unwrap();
        assert_eq!(saved.read("texture.blp").unwrap(), b"INDEPENDENT_ASSET_MUST_TRANSFER");
        if blank { assert!(!saved.has("Units/UnitData.slk")); }
        for (name, _, _, unit_data) in OBJECT_FILES {
            if unit_data {
                if blank { assert!(!saved.has(name), "excluded {name}"); }
                else { assert_eq!(saved.read(name).unwrap(), existing.members[name], "preserved {name}"); }
            } else { assert!(saved.read(name).unwrap().windows(1).any(|part| part == b"S"), "included {name}"); }
        }
        drop(saved); std::fs::remove_file(output).unwrap();
    }
    std::fs::remove_file(path).unwrap();
}
