use std::{collections::BTreeMap, fs, path::PathBuf, sync::atomic::AtomicBool};
use super::{folder_ops, import_files::{self, ImportInput}, index, map_ops};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self { let path = std::env::temp_dir().join(format!("box-viewer-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&path).unwrap(); Self(path) }
    fn source(&self) -> index::Source { index::scan(self.0.to_string_lossy().into(), "test".into(), &AtomicBool::new(false)).unwrap() }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
#[test]
fn folder_operations_preserve_bytes_backups_and_reject_conflicts() {
    let fixture = Fixture::new(); fs::create_dir_all(fixture.0.join("sub")).unwrap();
    fs::write(fixture.0.join("sub/a.mdx"), b"MDLX-original").unwrap(); fs::write(fixture.0.join("sub/b.mdx"), b"MDLX-second").unwrap(); fs::write(fixture.0.join("sub/new1.mdx"), b"occupied").unwrap();
    let source = fixture.source(); let paths = vec!["sub/a.mdx".into(), "sub/b.mdx".into()];
    assert!(folder_ops::rename(&source, &paths, "new", 1).is_err()); assert_eq!(fs::read(fixture.0.join("sub/a.mdx")).unwrap(), b"MDLX-original");
    let (mapping, backup) = folder_ops::rename(&source, &paths, "hero", 3).unwrap();
    assert_eq!(mapping["sub/a.mdx"], "sub/hero3.mdx"); assert_eq!(fs::read(fixture.0.join("sub/hero3.mdx")).unwrap(), b"MDLX-original"); assert_eq!(fs::read(PathBuf::from(backup).join("sub/a.mdx")).unwrap(), b"MDLX-original");
    assert_eq!(fixture.source().entries.iter().filter(|e| e.model).count(), 3);
    let backup = folder_ops::delete(&fixture.source(), &["sub/hero3.mdx".into()], Some(&fixture.0.join("downloads"))).unwrap(); assert!(!fixture.0.join("sub/hero3.mdx").exists()); assert_eq!(fs::read(PathBuf::from(backup).join("sub/hero3.mdx")).unwrap(), b"MDLX-original");
    let files = BTreeMap::from([("sub/new1.mdx".into(), b"other".to_vec()), ("added.mdx".into(), b"MDLX".to_vec())]);
    assert!(folder_ops::import(&fixture.0.canonicalize().unwrap(), &files).is_err()); assert!(!fixture.0.join("added.mdx").exists()); assert!(folder_ops::delete(&fixture.source(), &["../escape.mdx".into()], Some(&fixture.0.join("downloads"))).is_err());
}
#[test]
fn imports_copy_texture_paths_and_fail_before_mutation_when_missing() {
    let fixture = Fixture::new(); fs::create_dir(fixture.0.join("Textures")).unwrap(); fs::write(fixture.0.join("model.mdx"), b"MDLX").unwrap(); fs::write(fixture.0.join("Textures/a.blp"), b"BLP1").unwrap();
    let inputs = [ImportInput { path: fixture.0.join("model.mdx").to_string_lossy().into(), textures: vec!["Textures\\a.blp".into()] }];
    let files = import_files::prepare(&inputs, false).unwrap(); assert_eq!(files["Textures/a.blp"], b"BLP1"); assert_eq!(files["model.mdx"], b"MDLX");
    fs::remove_file(fixture.0.join("Textures/a.blp")).unwrap(); assert!(import_files::prepare(&inputs, false).is_err());
}
#[test]
#[ignore = "requires a complete ordinary map in BOX_VIEWER_MUTATION_MAP"]
fn normal_map_import_delete_save_as_and_preserve_original() {
    let fixture = Fixture::new();
    let path = PathBuf::from(std::env::var_os("BOX_VIEWER_MUTATION_MAP").expect("set BOX_VIEWER_MUTATION_MAP"));
    let original = fs::read(&path).unwrap(); let source = index::scan(path.to_string_lossy().into(), "map".into(), &AtomicBool::new(false)).unwrap(); assert!(source.complete);
    let output = fixture.0.join("导入.w3m"); let files = BTreeMap::from([("war3mapImported/added.mdx".into(), b"MDLX-added".to_vec()), ("Textures/added.blp".into(), b"BLP1-added".to_vec())]);
    assert_eq!(map_ops::mutate(&source, output.to_str().unwrap(), &[], &files, false).unwrap(), 2);
    let added = index::scan(output.to_string_lossy().into(), "added".into(), &AtomicBool::new(false)).unwrap();
    assert_eq!(index::read(&added, "Textures/added.blp").unwrap(), b"BLP1-added"); assert_eq!(index::read(&added, "war3mapImported/added.mdx").unwrap(), b"MDLX-added");
    let deleted = fixture.0.join("删除.w3m"); map_ops::mutate(&added, deleted.to_str().unwrap(), &["war3mapImported/added.mdx".into()], &BTreeMap::new(), true).unwrap();
    let removed = index::scan(deleted.to_string_lossy().into(), "removed".into(), &AtomicBool::new(false)).unwrap(); assert!(index::read(&removed, "war3mapImported/added.mdx").is_err()); assert_eq!(fs::read(&path).unwrap(), original);
    assert!(map_ops::mutate(&source, output.to_str().unwrap(), &[], &files, false).is_err());
    let mut read_only = source.clone(); read_only.complete = false; assert!(map_ops::mutate(&read_only, fixture.0.join("blocked.w3m").to_str().unwrap(), &[], &files, false).is_err()); assert!(!fixture.0.join("blocked.w3m").exists());
}
