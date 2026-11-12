use super::*;
fn texture() -> Vec<u8> {
    let mut bytes = vec![0; 1184]; bytes[..4].copy_from_slice(b"BLP1"); bytes[4..8].copy_from_slice(&1u32.to_le_bytes());
    bytes[12..16].copy_from_slice(&2u32.to_le_bytes()); bytes[16..20].copy_from_slice(&2u32.to_le_bytes());
    bytes[28..32].copy_from_slice(&1180u32.to_le_bytes()); bytes[92..96].copy_from_slice(&4u32.to_le_bytes()); bytes
}
fn fixture() -> (std::path::PathBuf, std::path::PathBuf) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/ui-save-native").join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&root).unwrap(); let map = root.join("地图.w3x");
    let archive = Archive::create_fixture(&map, false);
    archive.write("war3map.j", b"preserve script", false).unwrap(); archive.write("unknown/private.bin", b"unknown bytes", false).unwrap(); drop(archive);
    (root, map)
}
#[test]
fn saves_in_place_backs_up_exact_original_keeps_unknown_and_restores_default() {
    let (root, map) = fixture(); let original = fs::read(&map).unwrap();
    let result = save(&map, &fingerprint(&map).unwrap(), &[Change { path: EXTRA[0].into(), bytes: Some(texture()) }]).unwrap();
    assert_eq!(fs::read(&result.backup).unwrap(), original); assert_eq!(fingerprint(&map).unwrap(), result.fingerprint);
    let archive = Archive::open(&map).unwrap();
    assert_eq!(archive.read(EXTRA[0]).unwrap(), texture()); assert_eq!(archive.read(r"unknown\private.bin").unwrap(), b"unknown bytes");
    assert_eq!(archive.read("war3map.j").unwrap(), b"preserve script");
    assert!(map_ops::import_list(&archive.read("war3map.imp").unwrap()).unwrap().iter().any(|(_, name)| name == EXTRA[0].as_bytes())); drop(archive);
    let first_save = fs::read(&map).unwrap();
    let reset = save(&map, &result.fingerprint, &[Change { path: EXTRA[0].into(), bytes: None }]).unwrap();
    assert_eq!(fs::read(reset.backup).unwrap(), first_save); let archive = Archive::open(&map).unwrap(); assert!(!archive.has(EXTRA[0])); drop(archive);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn stale_unknown_duplicate_invalid_and_locked_maps_are_unchanged() {
    let (root, map) = fixture(); let original = fs::read(&map).unwrap(); let current = fingerprint(&map).unwrap();
    assert!(save(&map, "stale", &[Change { path: EXTRA[0].into(), bytes: Some(texture()) }]).is_err());
    for changes in [vec![Change { path: "war3map.j".into(), bytes: Some(texture()) }],
        vec![Change { path: EXTRA[0].into(), bytes: Some(vec![1, 2]) }],
        vec![Change { path: EXTRA[0].into(), bytes: None }, Change { path: EXTRA[0].into(), bytes: None }]] {
        assert!(save(&map, &current, &changes).is_err());
    }
    let lock = OpenOptions::new().read(true).share_mode(1).open(&map).unwrap();
    assert!(save(&map, &current, &[Change { path: EXTRA[0].into(), bytes: Some(texture()) }]).is_err()); drop(lock);
    assert_eq!(fs::read(&map).unwrap(), original); assert_eq!(fs::read_dir(&root).unwrap().count(), 1); fs::remove_dir_all(root).unwrap();
}
