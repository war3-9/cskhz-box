use super::*;
use super::super::console_save;

fn font() -> Vec<u8> { fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../素材/字体/山茶雅楷.ttf")).unwrap() }
#[test]
fn validates_real_truetype_and_rejects_renamed_or_truncated_files() {
    let bytes = font(); assert!(validate(&bytes).is_ok());
    for bad in [b"not a font".to_vec(), bytes[..256].to_vec(), b"OTTOabcdef".to_vec(), b"ttcfabcdef".to_vec()] {
        assert!(validate(&bad).is_err());
    }
}
#[test]
fn patches_only_custom_font_fields_preserving_legacy_bytes_and_other_sections() {
    let skin = b"\xef\xbb\xbf// keep \xd6\xd0\xce\xc4\r\n[CustomSkin]\r\nMasterFont=old.ttf\r\nmasterfont=duplicate.ttf\r\nGoldIcon=my.blp\r\n[Other]\r\nMasterFont=leave.ttf\r\n";
    let next = patch(skin).unwrap();
    assert!(next.starts_with(b"\xef\xbb\xbf// keep \xd6\xd0\xce\xc4\r\n"));
    assert!(next.windows(b"GoldIcon=my.blp\r\n[Other]\r\nMasterFont=leave.ttf\r\n".len()).any(|w| w == b"GoldIcon=my.blp\r\n[Other]\r\nMasterFont=leave.ttf\r\n"));
    for key in KEYS { assert_eq!(font_path(&next, key).unwrap(), FILE.as_bytes()); }
    assert_eq!(patch(&next).unwrap(), next);
    assert!(patch(&[0xff, 0xfe, 0, 1]).is_err());
}
#[test]
fn appends_missing_section_and_handles_last_line_without_newline() {
    for skin in [b"".as_slice(), b"[Other]\nKeep=1", b"[CustomSkin]", b"[CustomSkin]\nMasterFont=old.ttf"] {
        let next = patch(skin).unwrap();
        for key in KEYS { assert_eq!(font_path(&next, key).unwrap(), FILE.as_bytes()); }
    }
}
#[test]
fn saves_font_and_skin_together_then_restores_exact_original_resources() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/ui-font-native").join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&root).unwrap(); let map = root.join("自带字体.w3x");
    let archive = Archive::create_fixture(&map, false);
    let skin = b"[CustomSkin]\r\nMasterFont=Fonts\\legacy.ttf\r\nGoldIcon=keep.blp\r\n";
    let bytes = font();
    archive.write(SKIN, skin, false).unwrap(); archive.write(r"Fonts\legacy.ttf", &bytes, false).unwrap();
    archive.write(FILE, &bytes, false).unwrap(); archive.write("war3map.j", b"preserve script", false).unwrap(); drop(archive);
    let original = fs::read(&map).unwrap(); let baseline = snapshot(&map).unwrap();
    assert_eq!(baseline.preview, Some(bytes.clone()));
    let plan = changes(&map, Edit { reset: false, bytes: Some(bytes.clone()), skin: None, stored: None }).unwrap();
    let saved = console_save::save(&map, &console_save::fingerprint(&map).unwrap(), &plan).unwrap();
    assert_eq!(fs::read(saved.backup).unwrap(), original);
    let after = snapshot(&map).unwrap(); assert_eq!(after.preview, Some(bytes));
    for key in KEYS { assert_eq!(font_path(after.skin.as_deref().unwrap(), key).unwrap(), FILE.as_bytes()); }
    let plan = changes(&map, Edit { reset: true, bytes: None, skin: baseline.skin.clone(), stored: baseline.stored.clone() }).unwrap();
    console_save::save(&map, &saved.fingerprint, &plan).unwrap();
    let restored = snapshot(&map).unwrap(); assert_eq!(restored.skin, baseline.skin); assert_eq!(restored.stored, baseline.stored);
    let archive = Archive::open(&map).unwrap(); assert_eq!(archive.read("war3map.j").unwrap(), b"preserve script"); drop(archive);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn restoring_an_unmodified_map_removes_added_font_and_skin() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/ui-font-native").join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&root).unwrap(); let map = root.join("原生.w3m"); drop(Archive::create_fixture(&map, true));
    let plan = changes(&map, Edit { reset: false, bytes: Some(font()), skin: None, stored: None }).unwrap();
    let saved = console_save::save(&map, &console_save::fingerprint(&map).unwrap(), &plan).unwrap();
    let plan = changes(&map, Edit { reset: true, bytes: None, skin: None, stored: None }).unwrap();
    console_save::save(&map, &saved.fingerprint, &plan).unwrap(); let restored = snapshot(&map).unwrap();
    assert!(restored.skin.is_none() && restored.stored.is_none() && restored.preview.is_none());
    fs::remove_dir_all(root).unwrap();
}
