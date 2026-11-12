use super::{session::MapDocument, SelectionRect};
use crate::model_viewer::{content, storm::Archive};
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, HashMap, HashSet}, fs, path::{Path, PathBuf}};

fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }

#[test]
fn ordinary_truncated_regions_are_not_treated_as_came_placeholders() {
    let source_path = super::tests::archive_fixture();
    let archive = Archive::writable_copy(&source_path).unwrap();
    archive.write("war3map.w3r", &[0], true).unwrap();
    archive.flush().unwrap();
    drop(archive);
    let run = source_path.with_extension("normalizer");
    let source = super::read_document(source_path.clone(), &run).unwrap();
    assert_eq!(source.members["war3map.w3r"], [0]);
    let mut target = source.clone();
    target.blank = true;
    super::blank::initialize(&mut target, &source);
    let selection = SelectionRect { x0: 0, y0: 0, x1: 4, y1: 4, mask: None };
    assert!(super::copy_region_member(&source, &mut target, &selection, [0, 0], &mut vec![]).unwrap_err().contains("区域文件头被截断"));
    fs::remove_file(source_path).unwrap();
}

#[test]
#[ignore = "requires explicit BOX_CAME_REGION_MAP private copy"]
fn real_came_placeholder_region_clone_roundtrip() {
    let path = PathBuf::from(std::env::var_os("BOX_CAME_REGION_MAP").expect("explicit private map required"));
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    assert!(path.canonicalize().unwrap().starts_with(root.join("test-results").canonicalize().unwrap()));
    let run = path.parent().unwrap();
    let before = digest(&fs::read(&path).unwrap());
    assert_eq!(before, "580a4484fca11310689aea72406959b297297dc392a38a088ae151a52c11338e");
    let archive = Archive::open(&path).unwrap();
    assert_eq!(archive.external_count(), Some(5582));
    assert_eq!(archive.read("war3map.w3r").unwrap(), [0]);
    assert_eq!(archive.read("war3map.wts").unwrap(), [0]);
    let source = super::read_document(path.clone(), &run.join("normalizer")).unwrap();
    assert!(!source.members.contains_key("war3map.w3r"));
    assert!(!source.members.contains_key("war3map.wts"));
    assert!(source.normalized_tables > 0);
    let objects_output = run.join("recovered-objects");
    fs::create_dir_all(&objects_output).unwrap();
    for name in ["war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"] {
        if let Some(bytes) = source.members.get(name) { fs::write(objects_output.join(name), bytes).unwrap(); }
    }
    let terrain = super::w3e::parse(&source.w3e).unwrap();
    assert_eq!((terrain.width, terrain.height), (129, 193));
    let selection = SelectionRect { x0: 0, y0: 0, x1: terrain.width - 1, y1: terrain.height - 1, mask: None };
    let mut target = MapDocument::new(path.clone(), super::w3e::clear(&source.w3e).unwrap());
    target.blank = true;
    super::blank::initialize(&mut target, &source);
    let options = super::CopyOptions { terrain: true, ground_art: true, cliff_art: true, native_cliffs: false, doodads: true, units: true, paths: true, shadows: true, regions: true, object_data: true, all_resources: true };
    let height_shift = super::copy::aligned_height_rotated(&source.w3e, &target.w3e, &selection, [0, 0], 0).unwrap();
    let (changed, mut log) = super::copy::copy_region(&source.w3e, &mut target.w3e, &selection, [0, 0], true, true).unwrap();
    let remap = super::object_merge::apply(&source, &mut target, &options, &selection, &mut log).unwrap();
    for (name, units) in [("war3map.doo", false), ("war3mapUnits.doo", true)] {
        super::copy_entity_member_remapped(name, &source, &mut target, &selection, [0, 0], units, &remap, &mut log).unwrap();
    }
    for (name, header) in [("war3map.wpm", true), ("war3map.shd", false)] {
        super::copy_grid_member(name, &source, &mut target, &selection, [0, 0], header, &mut log).unwrap();
    }
    super::copy_region_member(&source, &mut target, &selection, [0, 0], &mut log).unwrap();
    assert!(super::regions::trigger_names(&target.members["war3map.w3r"]).unwrap().is_empty());
    let (copied, imported, unresolved) = super::resources::copy_assets(&path, &path, &mut target.members, true).unwrap();
    let output = run.join(format!("verified-clone-{}.w3x", uuid::Uuid::new_v4()));
    super::save::write_map_copy(&target, &output).unwrap();
    let saved = Archive::open(&output).unwrap();
    assert_eq!(saved.external_count(), None);
    let manifest = super::imports::parse(&saved.read("war3map.imp").unwrap()).unwrap();
    let manifest: HashSet<_> = manifest.iter().map(|(flag, raw)| super::imports::member_path(*flag, raw).to_ascii_lowercase()).collect();
    let listfile = String::from_utf8(saved.read("(listfile)").unwrap()).unwrap().replace('\\', "/").to_ascii_lowercase();
    let mut object_models = 0;
    for reference in super::object_data::model_paths(&target.members).unwrap() {
        if !archive.has(&reference) { continue; }
        let normalized = reference.replace('\\', "/").to_ascii_lowercase();
        assert!(manifest.contains(&normalized), "unregistered object model: {reference}");
        assert!(listfile.lines().any(|line| line == normalized), "unlisted object model: {reference}");
        assert_eq!(saved.read(&reference).unwrap(), crate::model_viewer::codec::convert(&archive.read(&reference).unwrap()).unwrap().as_ref());
        object_models += 1;
    }
    assert!(object_models >= 60, "expected the numbered scenery model variants");
    let saved_terrain = saved.read("war3map.w3e").unwrap();
    assert_eq!(digest(&saved_terrain), digest(&target.w3e));
    let saved_grid = super::w3e::parse(&saved_terrain).unwrap();
    let source_ground = super::w3e::palette(&source.w3e, 0).unwrap();
    let saved_ground = super::w3e::palette(&saved_terrain, 0).unwrap();
    let source_cliff = super::w3e::palette(&source.w3e, 1).unwrap();
    let saved_cliff = super::w3e::palette(&saved_terrain, 1).unwrap();
    for (from, to) in terrain.cells.chunks_exact(7).zip(saved_grid.cells.chunks_exact(7)) {
        assert_eq!(&from[..2], &to[..2]);
        let water = u16::from_le_bytes([from[2], from[3]]);
        let shifted = ((i32::from(water & 0x3fff) + height_shift).clamp(0, 0x3fff) as u16) | (water & 0xc000);
        assert_eq!(u16::from_le_bytes([to[2], to[3]]), shifted);
        assert_eq!(source_ground[(from[4] & 15) as usize], saved_ground[(to[4] & 15) as usize]);
        assert_eq!(from[4] & 0xf0, to[4] & 0xf0);
        assert_eq!(from[5], to[5]);
        assert_eq!(from[6] & 15, to[6] & 15);
        if from[6] >> 4 == 15 { assert_eq!(to[6] >> 4, 15); }
        else { assert_eq!(source_cliff[(from[6] >> 4) as usize], saved_cliff[(to[6] >> 4) as usize]); }
    }
    let hashes = saved.hashes().unwrap();
    let mut raw_names = HashMap::new();
    saved.enumerate(|_, raw, _, block| { raw_names.insert(block, raw); true });
    for (name, bytes) in &target.members {
        let actual = if let Some(identity) = super::mpq_identity::parse_key(name) {
            let block = hashes.iter().find(|entry| entry[..3] == identity && entry[3] < 0xfffffffe).expect("saved anonymous identity")[3];
            saved.read_raw(&raw_names[&block]).unwrap()
        } else { saved.read(&name.replace('/', "\\")).unwrap() };
        assert_eq!(actual, *bytes, "{name}");
    }
    assert!(!saved.has("war3map.wts"));
    let reopened = super::read_document(output.clone(), &run.join("normalizer")).unwrap();
    assert_eq!(reopened.w3e, target.w3e);
    assert_eq!(digest(&fs::read(&path).unwrap()), before);
    if let Some(repair_path) = std::env::var_os("BOX_CAME_REPAIR_MAP").map(PathBuf::from) {
        assert!(repair_path.canonicalize().unwrap().starts_with(root.join("test-results").canonicalize().unwrap()));
        let repair_before = digest(&fs::read(&repair_path).unwrap());
        let mut repair = super::read_document(repair_path.clone(), &run.join("repair-normalizer")).unwrap();
        super::resources::copy_assets(&path, &repair_path, &mut repair.members, false).unwrap();
        super::save::write_map_copy(&repair, &run.join("repaired-user.w3x")).unwrap();
        assert_eq!(digest(&fs::read(&repair_path).unwrap()), repair_before);
    }
    let counts = |doc: &MapDocument| -> HashMap<String, usize> {
        ["war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"].into_iter().filter_map(|name| {
            doc.members.get(name).map(|bytes| (name.into(), super::object_data::ids(bytes, ["war3map.w3a", "war3map.w3d", "war3map.w3q"].contains(&name)).unwrap().len()))
        }).collect()
    };
    fs::write(run.join("native-roundtrip.json"), serde_json::to_vec_pretty(&serde_json::json!({
        "passed": true, "sourceSha256": before, "dimensions": [terrain.width, terrain.height], "normalizedTables": source.normalized_tables,
        "sourceObjects": counts(&source), "savedObjects": counts(&reopened), "changedTilepoints": changed,
        "copiedResources": copied, "importedPaths": imported, "objectModelPaths": object_models, "unresolved": unresolved, "log": log,
        "output": output, "outputSha256": digest(&fs::read(&output).unwrap())
    })).unwrap()).unwrap();
}

#[test]
#[ignore = "requires explicit BOX_HM3W_TEST_MAP; reads original, writes only project test output"]
fn real_came_terrain_assets_save_and_readback() {
    let path = PathBuf::from(std::env::var_os("BOX_HM3W_TEST_MAP").expect("explicit real map required"));
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let run = root.join("test-results/came-terrain-20261023");
    fs::create_dir_all(&run).unwrap();
    let original = digest(&fs::read(&path).unwrap());
    assert_eq!(original, "4e15c188d796c0db43f8256b8f247dab355a72c8763083b11e386bcbeed3e84f");
    let source = Archive::open(&path).unwrap();
    let identities = source.resource_hashes().unwrap();
    assert_eq!(identities.iter().filter(|entry| entry[3] >= 0x80000000 && entry[3] < 0xfffffffe).count(), 14571);
    let terrain = source.read("war3map.w3e");
    eprintln!("CAME terrain readable: {}", terrain.is_ok());
    // Resource copying must work independently of whether protected terrain
    // metadata is available. Record that boundary without inventing geometry.
    let backing = super::tests::archive_fixture();
    let target = Archive::open(&backing).unwrap();
    let mut doc = MapDocument::new(backing.clone(), target.read("war3map.w3e").unwrap());
    drop(target);
    doc.blank = true;
    let template = doc.clone();
    super::blank::initialize(&mut doc, &template);
    let mut changed = None;
    let mut dimensions = None;
    if let Ok(bytes) = &terrain {
        let parsed = super::w3e::parse(bytes).unwrap();
        let mut empty = super::w3e::clear(bytes).unwrap();
        let selection = SelectionRect { x0: 0, y0: 0, x1: parsed.width - 1, y1: parsed.height - 1, mask: None };
        changed = Some(super::copy::copy_region(bytes, &mut empty, &selection, [0, 0], true, true).unwrap().0);
        dimensions = Some([parsed.width, parsed.height]);
        let copied_terrain = super::w3e::parse(&empty).unwrap();
        assert_eq!([copied_terrain.width, copied_terrain.height], [parsed.width, parsed.height]);
        assert_eq!(changed, Some(parsed.width * parsed.height));
        doc.w3e = empty;
    }
    let (copied, imported, unresolved) = super::resources::copy_assets(&path, &backing, &mut doc.members, true).unwrap();
    eprintln!("CAME assets copied: {copied}, known import paths: {imported}");
    let raw_members: HashMap<_, _> = doc.members.iter().filter_map(|(name, bytes)| super::mpq_identity::parse_key(name).map(|id| (id, digest(bytes)))).collect();
    let mut types = BTreeMap::new();
    for (name, bytes) in &doc.members {
        if super::mpq_identity::parse_key(name).is_some() { *types.entry(content::extension(bytes).unwrap_or("other")).or_insert(0usize) += 1; }
    }
    assert_eq!(types["mdx"], 1580);
    assert_eq!(types["blp"], 12785);
    assert_eq!(types["mp3"], 81);
    assert!(!doc.members.keys().any(|name| super::mpq_identity::matches_name(name, "war3map.wpm")), "unchecked pathing must not enter through anonymous asset copying");
    assert!(types["tga"] >= 45); // Outer MPQ can also contain the map preview TGA.
    let output = run.join(format!("cloned-{}.w3x", uuid::Uuid::new_v4()));
    super::save::write_map_copy(&doc, &output).unwrap();
    // Release the ~1GB pending resource state before validating every record.
    let logical: Vec<_> = doc.members.iter().filter(|(name, _)| super::mpq_identity::parse_key(name).is_none()).map(|(name, bytes)| (name.clone(), digest(bytes))).collect();
    drop(doc);
    let saved = Archive::open(&output).unwrap();
    let saved_entries = saved.hashes().unwrap();
    let saved_hashes: HashSet<_> = saved_entries.iter().filter(|entry| entry[3] < 0xfffffffe).map(|entry| [entry[0], entry[1], entry[2]]).collect();
    for identity in raw_members.keys() { assert!(saved_hashes.contains(identity), "lost original resource identity {identity:x?}"); }
    let by_block: HashMap<_, _> = saved_entries.into_iter().filter_map(|entry| {
        let id = [entry[0], entry[1], entry[2]];
        raw_members.get(&id).map(|hash| (entry[3], (id, hash)))
    }).collect();
    let mut seen = HashSet::new();
    let mut failure = None;
    saved.enumerate(|_, raw, _, block| {
        if let Some((id, hash)) = by_block.get(&block) {
            match saved.read_raw(&raw) {
                Ok(bytes) if digest(&bytes) == **hash => { seen.insert(*id); }
                other => { failure = Some(format!("resource readback mismatch {id:x?}: {:?}", other.err())); return false; }
            }
        }
        true
    });
    assert!(failure.is_none(), "{failure:?}");
    assert_eq!(seen.len(), raw_members.len());
    for (name, hash) in &logical {
        let bytes = saved.read(&name.replace('/', "\\")).unwrap_or_else(|error| panic!("logical path {name}: {error}"));
        assert_eq!(digest(&bytes), *hash, "logical path {name}");
    }
    let expected: serde_json::Value = serde_json::from_slice(&fs::read(root.join(".private/hm3w-came-viewer-20261023/codec-verification.json")).unwrap()).unwrap();
    for item in expected["gameByteMatches"].as_array().unwrap() {
        let name = item["path"].as_str().unwrap();
        assert_eq!(digest(&saved.read(name).unwrap()), item["sha256"].as_str().unwrap(), "game reference {name}");
    }
    assert_eq!(digest(&fs::read(&path).unwrap()), original);
    let proof = serde_json::json!({"completed":true,"sourceUnchanged":true,"sourceSha256":original,"terrainReadable":terrain.is_ok(),"terrainError":terrain.err(),"dimensions":dimensions,"changedTilepoints":changed,"copied":copied,"imported":imported,"unresolved":unresolved,"types":types,"originalIdentitiesReadBack":seen.len(),"logicalPathsReadBack":logical.len(),"runtimeByteMatches":74,"output":output});
    fs::write(root.join(".private/hm3w-came-viewer-20261023/terrain-integration.json"), serde_json::to_vec_pretty(&proof).unwrap()).unwrap();
    eprintln!("CAME terrain verification: {proof}");
    drop(saved);
    fs::remove_file(backing).unwrap();
}
