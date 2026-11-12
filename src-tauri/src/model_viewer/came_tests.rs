use super::{came, export, index, storm::Archive};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}, sync::atomic::AtomicBool};

fn hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn validate_mdx(bytes: &[u8]) {
    assert!(bytes.starts_with(b"MDLX"));
    let (mut position, mut version, mut model) = (4, false, false);
    while position < bytes.len() {
        assert!(position + 8 <= bytes.len());
        let tag = &bytes[position..position + 4];
        let size = u32::from_le_bytes(bytes[position + 4..position + 8].try_into().unwrap()) as usize;
        let end = (position + 8).checked_add(size).unwrap(); assert!(end <= bytes.len());
        if tag == b"VERS" { assert_eq!(&bytes[position + 8..end], 800u32.to_le_bytes()); version = true; }
        if tag == b"MODL" { model = true; }
        position = end;
    }
    assert!(version && model);
}

#[test]
#[ignore = "requires explicit real map and retained independent runtime evidence"]
fn real_came_map_scan_read_export() {
    let path = PathBuf::from(std::env::var_os("BOX_HM3W_TEST_MAP").expect("real map required"));
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let evidence = root.join(".private/hm3w-came-viewer-20261023");
    let expected: serde_json::Value = serde_json::from_slice(&fs::read(evidence.join("codec-verification.json")).unwrap()).unwrap();
    let original = hash(&fs::read(&path).unwrap()); assert_eq!(original, expected["sourceSha256"]);
    let cancel = AtomicBool::new(false);
    let started = std::time::Instant::now();
    let source = index::scan(path.to_string_lossy().into(), "came".into(), &cancel).unwrap();
    let scan_ms = started.elapsed().as_millis();
    let archive = Archive::open(&path).unwrap();
    assert_eq!(archive.external_count(), Some(14571));
    assert_eq!(source.entries.len(), 14579);
    assert!(!source.complete);
    assert!(source.warning.as_ref().unwrap().contains("全部 14571"));
    assert_eq!(source.entries.iter().filter(|entry| entry.model).count(), 1580);
    let mut total = 0u64; let mut external = 0; let mut types = std::collections::BTreeMap::new();
    let mut samples = Vec::new();
    for entry in &source.entries {
        let raw = entry.raw_name.as_ref().unwrap();
        if archive.block_raw(raw).unwrap() < came::BLOCK_BASE { continue; }
        external += 1;
        let bytes = archive.read_raw(raw).unwrap();
        assert_eq!(bytes.len() as u64, entry.size); total += bytes.len() as u64;
        let kind = super::content::extension(&bytes).unwrap_or("other");
        *types.entry(kind).or_insert(0) += 1;
        if entry.model {
            validate_mdx(&bytes);
            // Preview useful meshes as well as small effects from the game capture.
            if (200_000..2_000_000).contains(&bytes.len()) && samples.len() < 12 { samples.push(entry.path.clone()); }
        }
    }
    assert_eq!(external, 14571); assert_eq!(total, 895345811);
    assert_eq!(types["mdx"], 1580); assert_eq!(types["blp"], 12785);
    let matches = expected["gameByteMatches"].as_array().unwrap();
    for item in matches {
        let name = item["path"].as_str().unwrap();
        let bytes = index::read(&source, name).unwrap();
        assert_eq!(hash(&bytes), item["sha256"], "runtime byte comparison {name}");
        assert_eq!(bytes.len() as u64, item["bytes"].as_u64().unwrap());
        if name.ends_with(".mdx") && !samples.iter().any(|s| s.eq_ignore_ascii_case(name)) { samples.push(name.into()); }
    }
    assert_eq!(matches.len(), 74);
    // Named access and internal raw tokens must lead to the same records.
    for entry in source.entries.iter().filter(|entry| !entry.anonymous && entry.model).take(25) {
        assert_eq!(archive.read(&entry.path).unwrap(), archive.read_raw(entry.raw_name.as_ref().unwrap()).unwrap());
    }
    assert!(Archive::writable_copy(&path).err().unwrap().contains("只读"));
    assert!(archive.write("x", b"x", true).is_err());
    assert!(archive.remove(b"x").is_err());
    let run = root.join("test-results/came-viewer-20261023"); fs::create_dir_all(&run).unwrap();
    let items = samples.iter().map(|name| export::Item { source_id: "came".into(), path: name.clone(), output: name.clone(), dependency: false, rename_textures: false }).collect();
    let output = run.join("assets");
    let result = export::run(vec![source.clone()], items, output.to_string_lossy().into(), true, &cancel, |_| {}).unwrap();
    assert!(result.failed.is_empty(), "{}", serde_json::to_string(&result).unwrap());
    assert_eq!(result.models, samples.len()); assert!(result.textures > 0);
    for name in &samples { assert_eq!(fs::read(output.join(index::safe_relative(name).unwrap())).unwrap(), index::read(&source, name).unwrap()); }
    let mut dependencies = Vec::new();
    for name in &samples { for texture in export::texture_paths(&index::read(&source, name).unwrap(), name) {
        if archive.has(&texture) {
            let exported = output.join(index::safe_relative(&texture).unwrap());
            assert!(exported.exists(), "missing exported dependency {texture}");
            let bytes = fs::read(exported).unwrap(); assert_eq!(bytes, archive.read(&texture).unwrap());
            dependencies.push(serde_json::json!({"path":texture,"sha256":hash(&bytes)}));
        }
    } }
    assert_eq!(hash(&fs::read(&path).unwrap()), original);
    let proof = serde_json::json!({"completed":true,"sourceSha256":original,"entries":source.entries.len(),"externalRecords":external,"decodedBytes":total,"types":types,"models":1580,"runtimeByteMatches":74,"scanMs":scan_ms,"namedModels":source.entries.iter().filter(|entry| entry.model && !entry.anonymous).count(),"export":result,"sampleModels":samples,"dependencies":dependencies,"readOnlyGuards":true});
    fs::write(evidence.join("native-integration.json"), serde_json::to_vec_pretty(&proof).unwrap()).unwrap();
    fs::write(run.join("source.json"), serde_json::to_vec(&source).unwrap()).unwrap();
    eprintln!("CAME verification: {proof}");
}

#[test]
#[ignore = "requires explicit C0 JRP1 map and independent Python decoder hashes"]
fn real_jrp_came_scan_read_and_export() {
    let path = PathBuf::from(std::env::var_os("BOX_JRP_TEST_MAP").expect("real map required"));
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let evidence = root.join(".private/c0-came-viewer-20261023");
    let expected: serde_json::Value = serde_json::from_slice(&fs::read(evidence.join("independent-resource-hashes.json")).unwrap()).unwrap();
    let original = hash(&fs::read(&path).unwrap()); assert_eq!(original, expected["sourceSha256"]);
    let cancel = AtomicBool::new(false);
    let source = index::scan(path.to_string_lossy().into(), "jrp".into(), &cancel).unwrap();
    let archive = Archive::open(&path).unwrap();
    assert_eq!(archive.external_count(), Some(5424));
    assert_eq!(source.entries.iter().filter(|entry| entry.model).count(), 250);
    let mut external = 0; let mut types = std::collections::BTreeMap::new(); let mut samples = Vec::new();
    for entry in &source.entries {
        let raw = entry.raw_name.as_ref().unwrap(); let block = archive.block_raw(raw).unwrap();
        if block < came::BLOCK_BASE { continue; }
        let bytes = archive.read_raw(raw).unwrap();
        let record = (block - came::BLOCK_BASE) as usize;
        assert_eq!(hash(&bytes), expected["resources"][record]["sha256"], "record {record}");
        assert_eq!(bytes.len() as u64, entry.size); external += 1;
        let kind = super::content::extension(&bytes).unwrap_or("other"); *types.entry(kind).or_insert(0) += 1;
        if entry.model { validate_mdx(&bytes); if samples.len() < 10 { samples.push(entry.path.clone()); } }
    }
    assert_eq!(external, 5424); assert_eq!(types["mdx"], 250); assert_eq!(types["blp"], 3250); assert_eq!(types["tga"], 1816);
    assert!(Archive::writable_copy(&path).is_err()); assert!(archive.write("x", b"x", true).is_err()); assert!(archive.remove(b"x").is_err());
    let output = root.join("test-results/c0-came/native-export");
    let items = samples.iter().map(|name| export::Item { source_id: "jrp".into(), path: name.clone(), output: name.clone(), dependency: false, rename_textures: false }).collect();
    let exported = export::run(vec![source.clone()], items, output.to_string_lossy().into(), true, &cancel, |_| {}).unwrap();
    assert!(exported.failed.is_empty()); assert_eq!(exported.models, samples.len());
    for name in &samples { assert_eq!(fs::read(output.join(index::safe_relative(name).unwrap())).unwrap(), index::read(&source, name).unwrap()); }
    assert_eq!(hash(&fs::read(&path).unwrap()), original);
    let proof = serde_json::json!({"completed":true,"sourceSha256":original,"sourceUnchanged":true,"models":250,"externalRecords":external,"types":types,"independentHashMatches":external,"export":exported,"readOnlyGuards":true});
    fs::write(evidence.join("native-integration.json"), serde_json::to_vec_pretty(&proof).unwrap()).unwrap();
}

