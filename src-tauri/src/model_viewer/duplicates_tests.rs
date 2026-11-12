use std::{collections::BTreeMap, fs, path::{Path, PathBuf}, sync::atomic::AtomicBool};
use super::{duplicates::{self, MergeGroup}, duplicates_merge, export_rename, index, map_ops, storm::Archive};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/model-duplicates-native").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&path).unwrap(); Self(path)
    }
    fn files(&self) -> BTreeMap<String, Vec<u8>> {
        BTreeMap::from([
            ("Models/a.mdx".into(), mdx("Textures/skin_a.blp", b"same-unknown-data")),
            ("Models/b.mdx".into(), mdx("Textures/skin_b.blp", b"same-unknown-data")),
            ("Models/c.mdl".into(), br#"Model "c" {} Textures 1 { Bitmap { Image "Textures\\skin_b.blp", } }"#.to_vec()),
            ("Textures/skin_a.blp".into(), b"BLP1-same-content".to_vec()),
            ("Textures/skin_b.blp".into(), b"BLP1-same-content".to_vec()),
            ("war3map.j".into(), b"function main takes nothing returns nothing\nendfunction".to_vec()),
            ("unknown.bin".into(), b"unrelated-user-content".to_vec()),
        ])
    }
    fn folder(&self) -> PathBuf {
        let root = self.0.join("source");
        for (name, bytes) in self.files() { let path = root.join(name); fs::create_dir_all(path.parent().unwrap()).unwrap(); fs::write(path, bytes).unwrap(); }
        root
    }
    fn map(&self) -> PathBuf {
        let path = self.0.join("source.w3x"); let archive = Archive::create_fixture(&path, true);
        for (name, bytes) in self.files() { archive.write(&name, &bytes, false).unwrap(); }
        archive.write("war3map.imp", &map_ops::encode_list(&[(13, b"Models\\a.mdx".to_vec()), (13, b"Models\\b.mdx".to_vec()), (13, b"Textures\\skin_a.blp".to_vec()), (13, b"Textures\\skin_b.blp".to_vec())]), false).unwrap();
        archive.flush().unwrap(); drop(archive); path
    }
    fn source(&self, path: &Path) -> index::Source { index::scan(path.to_string_lossy().into_owned(), "duplicates".into(), &AtomicBool::new(false)).unwrap() }
    fn base(&self) -> PathBuf { self.0.join("downloads") }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
fn mdx(texture: &str, other: &[u8]) -> Vec<u8> {
    let mut bytes = b"MDLXTEXS".to_vec(); bytes.extend(268u32.to_le_bytes()); let mut record = vec![0; 268];
    record[4..4 + texture.len()].copy_from_slice(texture.as_bytes()); bytes.extend(record);
    bytes.extend(b"UNKN"); bytes.extend((other.len() as u32).to_le_bytes()); bytes.extend(other); bytes
}
fn group() -> Vec<MergeGroup> { vec![MergeGroup { keep: "Textures/skin_a.blp".into(), remove: vec!["Textures/skin_b.blp".into()] }] }

#[test]
fn duplicate_scan_normalizes_only_matching_texture_content_and_preserves_unknown_model_blocks() {
    let fixture = Fixture::new(); let path = fixture.folder(); let source = fixture.source(&path);
    let scan = duplicates::scan(&duplicates::snapshot(&source).unwrap());
    assert_eq!(scan.models.len(), 1); assert_eq!(scan.models[0].paths, ["Models/a.mdx", "Models/b.mdx"]);
    assert_eq!(scan.textures.len(), 1); assert_eq!(scan.textures[0].references.iter().find(|item| item.texture.ends_with("skin_b.blp")).unwrap().models.len(), 2);
    assert!(scan.can_merge); assert_eq!(scan.textures[0].reclaim_bytes, b"BLP1-same-content".len() as u64);
    fs::write(path.join("Models/b.mdx"), mdx("Textures/skin_b.blp", b"different-unknown-data")).unwrap();
    assert!(duplicates::scan(&duplicates::snapshot(&source).unwrap()).models.is_empty());
    fs::write(path.join("Models/b.mdx"), mdx("Textures/skin_b.blp", b"same-unknown-data")).unwrap();
    fs::write(path.join("Textures/skin_b.blp"), b"BLP1-different-content").unwrap();
    let scan = duplicates::scan(&duplicates::snapshot(&source).unwrap()); assert!(scan.models.is_empty()); assert!(scan.textures.is_empty());
}

#[test]
fn texture_merge_rewrites_all_models_and_backs_up_originals_in_folder_and_map() {
    for archive in [false, true] {
        let fixture = Fixture::new(); let path = if archive { fixture.map() } else { fixture.folder() }; let source = fixture.source(&path);
        let original = archive.then(|| fs::read(&path).unwrap()); let snapshot = duplicates::snapshot(&source).unwrap();
        let result = duplicates_merge::execute(&source, &snapshot.fingerprint, &group(), Some(&fixture.base())).unwrap();
        assert_eq!(result.changed, 1); assert_eq!(result.source.path, source.path); assert_eq!(result.source.id, source.id);
        assert!(result.source.entries.iter().all(|entry| !entry.path.eq_ignore_ascii_case("Textures/skin_b.blp")));
        for model in ["Models/a.mdx", "Models/b.mdx", "Models/c.mdl"] {
            let bytes = index::read(&result.source, model).unwrap();
            assert_eq!(export_rename::texture_paths(&bytes, model).unwrap().iter().map(|path| duplicates::key(path)).collect::<Vec<_>>(), ["textures/skin_a.blp"]);
            if model.ends_with(".mdx") { assert!(bytes.ends_with(b"same-unknown-data")); }
        }
        assert_eq!(index::read(&result.source, "unknown.bin").unwrap(), b"unrelated-user-content");
        assert_eq!(index::read(&result.source, "Textures/skin_a.blp").unwrap(), b"BLP1-same-content");
        let backup = PathBuf::from(result.backup.unwrap());
        assert_eq!(fs::read(backup.join("Textures/skin_b.blp")).unwrap(), b"BLP1-same-content");
        assert_eq!(fs::read(backup.join("Models/b.mdx")).unwrap(), fixture.files()["Models/b.mdx"]);
        if let Some(original) = original { assert_eq!(fs::read(backup.join("原地图恢复.boxbackup")).unwrap(), original); let archive = Archive::open(&path).unwrap(); let imp = map_ops::import_list(&archive.read("war3map.imp").unwrap()).unwrap(); assert!(imp.iter().all(|(_, path)| !path.eq_ignore_ascii_case(b"Textures\\skin_b.blp"))); }
        let reopened = fixture.source(&path); assert!(reopened.entries.iter().all(|entry| !entry.path.ends_with("skin_b.blp")));
    }
}

#[test]
fn stale_scan_invalid_group_or_non_model_reference_never_changes_files() {
    let fixture = Fixture::new(); let path = fixture.folder(); let source = fixture.source(&path);
    let scan = duplicates::scan(&duplicates::snapshot(&source).unwrap());
    fs::write(path.join("added.mdl"), b"Model \"new\" {}").unwrap();
    assert!(duplicates_merge::execute(&source, &scan.fingerprint, &group(), Some(&fixture.base())).err().unwrap().contains("已变化"));
    let snapshot = duplicates::snapshot(&source).unwrap();
    let invalid = [MergeGroup { keep: "Models/a.mdx".into(), remove: vec!["Textures/skin_b.blp".into()] }];
    assert!(duplicates_merge::execute(&source, &snapshot.fingerprint, &invalid, Some(&fixture.base())).is_err());
    fs::write(path.join("war3map.j"), br#"call Image("Textures\\skin_b.blp")"#).unwrap();
    let snapshot = duplicates::snapshot(&source).unwrap();
    assert!(duplicates::scan(&snapshot).textures[0].blocked_reason.is_some());
    assert!(duplicates_merge::execute(&source, &snapshot.fingerprint, &group(), Some(&fixture.base())).is_err());
    assert_eq!(fs::read(path.join("Models/b.mdx")).unwrap(), fixture.files()["Models/b.mdx"]);
    assert!(path.join("Textures/skin_b.blp").exists());
}

#[test]
fn failed_texture_removal_rolls_back_previously_rewritten_folder_models() {
    use std::os::windows::fs::OpenOptionsExt;
    let fixture = Fixture::new(); let path = fixture.folder(); let source = fixture.source(&path);
    let hold = fs::OpenOptions::new().read(true).share_mode(1).open(path.join("Textures/skin_b.blp")).unwrap();
    let snapshot = duplicates::snapshot(&source).unwrap();
    let error = duplicates_merge::execute(&source, &snapshot.fingerprint, &group(), Some(&fixture.base())).err().expect("locked duplicate texture must reject removal");
    assert!(error.contains("已恢复原文件"), "rollback did not finish: {error}");
    assert!(!error.contains("回滚失败"), "unexpected rollback failure: {error}");
    for (name, original) in fixture.files() { assert_eq!(fs::read(path.join(name)).unwrap(), original); }
    drop(hold);
}

#[test]
fn backup_failure_and_map_replace_failure_leave_original_map_exact() {
    use std::os::windows::fs::OpenOptionsExt;
    let fixture = Fixture::new(); let path = fixture.map(); let original = fs::read(&path).unwrap(); let source = fixture.source(&path);
    let snapshot = duplicates::snapshot(&source).unwrap(); let bad = fixture.0.join("bad-downloads"); fs::write(&bad, b"file").unwrap();
    assert!(duplicates_merge::execute(&source, &snapshot.fingerprint, &group(), Some(&bad)).is_err()); assert_eq!(fs::read(&path).unwrap(), original);
    let hold = fs::OpenOptions::new().read(true).share_mode(1 | 2).open(&path).unwrap();
    assert!(duplicates_merge::execute(&source, &snapshot.fingerprint, &group(), Some(&fixture.base())).is_err());
    assert_eq!(fs::read(&path).unwrap(), original); drop(hold);
}

#[test]
fn duplicate_model_delete_retains_chosen_model_and_all_companion_textures() {
    for archive in [false, true] {
        let fixture = Fixture::new(); let path = if archive { fixture.map() } else { fixture.folder() }; let source = fixture.source(&path);
        let snapshot = duplicates::snapshot(&source).unwrap();
        let groups = [MergeGroup { keep: "Models/a.mdx".into(), remove: vec!["Models/b.mdx".into()] }];
        let result = duplicates_merge::delete_models(&source, &snapshot.fingerprint, &groups, Some(&fixture.base())).unwrap();
        assert!(index::read(&result.source, "Models/b.mdx").is_err());
        assert_eq!(index::read(&result.source, "Models/a.mdx").unwrap(), fixture.files()["Models/a.mdx"]);
        for texture in ["Textures/skin_a.blp", "Textures/skin_b.blp"] { assert_eq!(index::read(&result.source, texture).unwrap(), b"BLP1-same-content"); }
        assert_eq!(fs::read(PathBuf::from(result.backup.unwrap()).join("Textures/skin_b.blp")).unwrap(), b"BLP1-same-content");
    }
}

#[test]
fn unsafe_model_texture_tables_disable_merging_without_hiding_exact_duplicates() {
    let fixture = Fixture::new(); let path = fixture.folder(); let source = fixture.source(&path);
    fs::write(path.join("broken.mdx"), b"MDLXTEXS\xff\xff\xff\xff").unwrap();
    let snapshot = duplicates::snapshot(&source).unwrap(); let scan = duplicates::scan(&snapshot);
    assert!(!scan.can_merge); assert!(!scan.warnings.is_empty()); assert_eq!(scan.models.len(), 1);
    assert!(duplicates_merge::execute(&source, &snapshot.fingerprint, &group(), Some(&fixture.base())).is_err());
}

#[test]
fn external_texture_references_include_jpeg_and_utf16_metadata() {
    let fixture = Fixture::new(); let path = fixture.folder();
    fs::write(path.join("Textures/extra_a.jpg"), b"jpeg-identical").unwrap();
    fs::write(path.join("Textures/extra_b.jpg"), b"jpeg-identical").unwrap();
    let unicode: Vec<u8> = "Textures\\extra_b.jpg".encode_utf16().flat_map(u16::to_le_bytes).collect();
    fs::write(path.join("metadata.bin"), unicode).unwrap();
    let source = fixture.source(&path); let snapshot = duplicates::snapshot(&source).unwrap();
    assert_eq!(duplicates::external_references(&snapshot, "Textures/extra_b.jpg"), ["metadata.bin"]);
    let scan = duplicates::scan(&snapshot);
    assert!(scan.textures.iter().find(|group| group.paths.iter().any(|path| path.ends_with("extra_b.jpg"))).unwrap().blocked_reason.is_some());
}
