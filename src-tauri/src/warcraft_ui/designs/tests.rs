use super::{migration, settings::{Context, Preferences}, storage};
use std::{fs, path::PathBuf};
use serde_json::json;

struct Fixture { root: PathBuf, context: Context, id: String }
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("box-design-tests-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("old")).unwrap();
        let context = Context { preferences: root.join("data/preferences.json"), default_directory: root.join("old") };
        Self { root, context, id: uuid::Uuid::new_v4().to_string() }
    }
    fn text(&self, title: &str) -> String { json!({ "format":"war3-ui-lab", "version":2, "arrayName":"ui", "nodes":[],
        "design": {"id":self.id, "name":title, "updatedAt":123}, "referenceBackground":"data:image/png;base64,YQ==" }).to_string() }
    fn old(&self) -> PathBuf { storage::path(&self.root.join("old"), &self.id).unwrap() }
    fn save(&self) { storage::atomic(&self.old(), &self.text("中文设计")).unwrap(); }
}
impl Drop for Fixture { fn drop(&mut self) { fs::remove_dir_all(&self.root).unwrap(); } }

#[test]
fn executable_location_controls_default_not_working_directory() {
    let executable = PathBuf::from(r"F:\超时空盒子\box.exe");
    assert_eq!(super::settings::default_directory(&executable).unwrap(), PathBuf::from(r"F:\超时空盒子\UI设计保存稿-开源版"));
}
#[test]
fn atomic_updates_keep_utf8_identity_and_embedded_bytes() {
    let fixture = Fixture::new(); fixture.save();
    storage::atomic(&fixture.old(), &fixture.text("修改版")).unwrap();
    let text = storage::read(&fixture.old()).unwrap(); let (value, meta) = storage::parse(&text).unwrap();
    assert_eq!(meta.name, "修改版"); assert_eq!(meta.id, fixture.id);
    assert_eq!(value["referenceBackground"], "data:image/png;base64,YQ==");
    assert_eq!(storage::files(&fixture.root.join("old")).unwrap().len(), 1);
}
#[test]
fn successful_migration_verifies_copy_then_removes_only_owned_files() {
    let fixture = Fixture::new(); fixture.save();
    fs::write(fixture.root.join("old/用户文件.txt"), b"untouched").unwrap();
    let result = migration::migrate(&fixture.context, Some(fixture.root.join("new").display().to_string())).unwrap();
    assert!(result.warning.is_none()); assert!(!fixture.old().exists());
    assert_eq!(storage::read(&storage::path(&PathBuf::from(result.directory), &fixture.id).unwrap()).unwrap(), fixture.text("中文设计"));
    assert_eq!(fs::read(fixture.root.join("old/用户文件.txt")).unwrap(), b"untouched");
}
#[test]
fn conflict_keeps_both_versions_and_records_alias_across_restart() {
    let fixture = Fixture::new(); fixture.save();
    let target = fixture.root.join("new"); fs::create_dir(&target).unwrap();
    let existing = storage::path(&target, &fixture.id).unwrap();
    storage::atomic(&existing, &fixture.text("目标已有版本")).unwrap();
    let result = migration::migrate(&fixture.context, Some(target.display().to_string())).unwrap();
    assert_eq!(storage::read(&existing).unwrap(), fixture.text("目标已有版本"));
    let remapped = result.remapped.get(&fixture.id).unwrap(); assert_ne!(remapped, &fixture.id);
    assert!(storage::path(&target, remapped).unwrap().exists());
    assert_eq!(fixture.context.load().unwrap().migrations[0].ids[&fixture.id], *remapped);
    assert!(fixture.context.info(&fixture.context.load().unwrap()).unwrap().remapped.is_empty());
    let next = migration::migrate(&fixture.context, Some(fixture.root.join("third").display().to_string())).unwrap();
    assert!(next.remapped.is_empty()); assert_eq!(next.revision, 2);
    assert_eq!(next.migrations.len(), 2); assert!(next.migrations[1].ids.is_empty());
}
#[test]
fn identical_conflict_does_not_duplicate_and_default_restore_moves_back() {
    let fixture = Fixture::new(); fixture.save();
    let target = fixture.root.join("new"); fs::create_dir(&target).unwrap();
    storage::atomic(&storage::path(&target, &fixture.id).unwrap(), &fixture.text("中文设计")).unwrap();
    migration::migrate(&fixture.context, Some(target.display().to_string())).unwrap();
    assert_eq!(storage::files(&target).unwrap().len(), 1);
    migration::migrate(&fixture.context, None).unwrap();
    assert!(fixture.old().exists()); assert_eq!(storage::files(&target).unwrap().len(), 0);
    assert!(fixture.context.load().unwrap().directory.is_none());
}
#[test]
fn failed_settings_commit_removes_copies_and_preserves_source() {
    let mut fixture = Fixture::new(); fixture.save();
    fs::write(fixture.root.join("blocked"), b"file").unwrap();
    fixture.context.preferences = fixture.root.join("blocked/preferences.json");
    let target = fixture.root.join("new");
    assert!(migration::migrate(&fixture.context, Some(target.display().to_string())).is_err());
    assert_eq!(storage::read(&fixture.old()).unwrap(), fixture.text("中文设计"));
    assert_eq!(storage::files(&target).unwrap().len(), 0);
}
#[test]
fn corrupt_source_aborts_without_switching_directory() {
    let fixture = Fixture::new(); fixture.save();
    fs::write(fixture.root.join("old/bad.war3ui"), b"invalid").unwrap();
    assert!(migration::migrate(&fixture.context, Some(fixture.root.join("new").display().to_string())).is_err());
    assert!(fixture.old().exists()); assert!(fixture.context.load().unwrap().directory.is_none());
}
#[test]
fn cleanup_retains_changed_source_and_retries_after_restoration() {
    let fixture = Fixture::new(); fixture.save();
    let mut preferences = Preferences { cleanup: vec![super::settings::Cleanup {
        path: fixture.old().display().to_string(), sha256: storage::fingerprint(fixture.text("中文设计").as_bytes()),
    }], ..Preferences::default() };
    storage::atomic(&fixture.old(), &fixture.text("被外部改动")).unwrap();
    migration::cleanup(&fixture.context, &mut preferences).unwrap();
    assert_eq!(preferences.cleanup.len(), 1); assert!(fixture.old().exists());
    storage::atomic(&fixture.old(), &fixture.text("中文设计")).unwrap();
    migration::cleanup(&fixture.context, &mut preferences).unwrap();
    assert!(preferences.cleanup.is_empty()); assert!(!fixture.old().exists());
}
#[test]
fn invalid_ids_and_malformed_or_oversize_files_are_rejected() {
    let fixture = Fixture::new();
    for id in ["../outside", "test", r"..\outside"] { assert!(storage::path(&fixture.root, id).is_err()); }
    assert!(storage::parse("{}").is_err());
    assert!(storage::parse(&"x".repeat(storage::MAX_FILE + 1)).is_err());
}
#[cfg(windows)]
#[test]
fn locked_source_cleanup_is_retryable_after_directory_commit() {
    use std::os::windows::fs::OpenOptionsExt;
    let fixture = Fixture::new(); fixture.save();
    let held = fs::OpenOptions::new().read(true).share_mode(1).open(fixture.old()).unwrap();
    let result = migration::migrate(&fixture.context, Some(fixture.root.join("new").display().to_string())).unwrap();
    assert!(result.warning.is_some()); assert!(fixture.old().exists());
    drop(held);
    let mut preferences = fixture.context.load().unwrap();
    migration::cleanup(&fixture.context, &mut preferences).unwrap();
    assert!(preferences.cleanup.is_empty()); assert!(!fixture.old().exists());
}
