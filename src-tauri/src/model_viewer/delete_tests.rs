use std::{fs, path::PathBuf, sync::atomic::AtomicBool};
use super::{delete_map, folder_ops, index, map_ops, mutations::{self, Mutation}, storm::Archive};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-results/model-delete-rust").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap(); Self(root)
    }
    fn source(&self, path: &std::path::Path) -> index::Source { index::scan(path.to_string_lossy().into_owned(), "source".into(), &AtomicBool::new(false)).unwrap() }
    fn map(&self, listed: bool) -> PathBuf {
        let path = self.0.join("当前地图.w3x");
        let archive = Archive::create_fixture(&path, listed);
        for (name, bytes) in [("Models/删除.mdx", b"MDLX-delete".as_slice()), ("Models/keep.mdx", b"MDLX-keep"), ("Textures/skin.blp", b"BLP1-skin"), ("war3map.j", b"function main takes nothing returns nothing\nendfunction"), ("unknown.bin", b"unchanged-user-data")] { archive.write(name, bytes, false).unwrap(); }
        archive.write("war3map.imp", &map_ops::encode_list(&[(13, "Models\\删除.mdx".as_bytes().to_vec()), (13, b"Textures\\skin.blp".to_vec())]), false).unwrap();
        archive.flush().unwrap(); drop(archive); path
    }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

#[test]
fn deletion_changes_current_map_exports_download_folder_and_reopens_without_deleted_resources() {
    for listed in [true, false] {
        let fixture = Fixture::new(); let path = fixture.map(listed); let original = fs::read(&path).unwrap();
        let source = fixture.source(&path);
        let target = source.entries.iter().find(|entry| entry.model && index::read(&source, &entry.path).unwrap() == b"MDLX-delete").unwrap().path.clone();
        let texture = source.entries.iter().find(|entry| index::read(&source, &entry.path).unwrap() == b"BLP1-skin").unwrap().path.clone();
        let result = mutations::execute_with_backups(&source, Mutation { operation: "delete".into(), paths: vec![target.clone(), texture.clone()], prefix: String::new(), start: 0, inputs: vec![], destination: Some(fixture.0.join("must-not-create.w3x").to_string_lossy().into()), new_id: "must-not-use".into() }, Some(&fixture.0.join("downloads"))).unwrap();
        assert_eq!(result.source.path, source.path); assert_eq!(result.source.id, source.id); assert_eq!(result.changed, 2);
        assert!(!fixture.0.join("must-not-create.w3x").exists());
        let backup = PathBuf::from(result.backup.unwrap());
        assert!(backup.starts_with(fixture.0.join("downloads/已删除模型")));
        assert_eq!(fs::read(backup.join(index::safe_relative(&target).unwrap())).unwrap(), b"MDLX-delete");
        assert_eq!(fs::read(backup.join(index::safe_relative(&texture).unwrap())).unwrap(), b"BLP1-skin");
        assert_eq!(fs::read(backup.join("原地图恢复.boxbackup")).unwrap(), original);
        let archive = Archive::open(&path).unwrap();
        assert!(archive.read("Models\\删除.mdx").is_err()); assert!(archive.read("Textures\\skin.blp").is_err());
        assert_eq!(archive.read("Models\\keep.mdx").unwrap(), b"MDLX-keep");
        assert_eq!(archive.read("unknown.bin").unwrap(), b"unchanged-user-data");
        assert!(map_ops::import_list(&archive.read("war3map.imp").unwrap()).unwrap().is_empty()); drop(archive);
        let refreshed = fixture.source(&path); assert_eq!(refreshed.entries.iter().filter(|entry| entry.model).count(), 1);
        assert!(refreshed.entries.iter().all(|entry| index::read(&refreshed, &entry.path).unwrap() != b"MDLX-delete"));
        assert_eq!(fs::read_dir(&fixture.0).unwrap().filter_map(Result::ok).filter(|entry| entry.path().extension().is_some_and(|ext| ext == "w3x")).count(), 1);
    }
}

#[test]
fn deletion_backup_failure_or_atomic_replace_failure_preserves_original_map() {
    let fixture = Fixture::new(); let path = fixture.map(true); let original = fs::read(&path).unwrap(); let source = fixture.source(&path);
    let target = source.entries.iter().find(|entry| entry.model).unwrap().path.clone();
    let blocked = fixture.0.join("blocked-downloads"); fs::write(&blocked, b"occupied").unwrap();
    assert!(delete_map::execute(&source, &[target.clone()], Some(&blocked)).is_err()); assert_eq!(fs::read(&path).unwrap(), original);
    use std::os::windows::fs::OpenOptionsExt;
    let hold = fs::OpenOptions::new().read(true).share_mode(1 | 2).open(&path).unwrap();
    assert!(delete_map::execute(&source, &[target], Some(&fixture.0.join("downloads"))).is_err());
    assert_eq!(fs::read(&path).unwrap(), original); drop(hold);
    assert!(fs::read_dir(&fixture.0).unwrap().filter_map(Result::ok).all(|entry| !entry.file_name().to_string_lossy().starts_with(".box-delete-")));
}

#[test]
fn folder_deletion_rolls_back_on_locked_file_and_does_not_rescan_download_backups() {
    let fixture = Fixture::new(); fs::write(fixture.0.join("a.mdx"), b"MDLX-a").unwrap(); fs::write(fixture.0.join("b.mdx"), b"MDLX-b").unwrap();
    let source = fixture.source(&fixture.0);
    use std::os::windows::fs::OpenOptionsExt;
    let hold = fs::OpenOptions::new().read(true).share_mode(1).open(fixture.0.join("b.mdx")).unwrap();
    assert!(folder_ops::delete(&source, &["a.mdx".into(), "b.mdx".into()], Some(&fixture.0.join("downloads"))).is_err());
    assert_eq!(fs::read(fixture.0.join("a.mdx")).unwrap(), b"MDLX-a"); assert_eq!(fs::read(fixture.0.join("b.mdx")).unwrap(), b"MDLX-b"); drop(hold);
    folder_ops::delete(&source, &["a.mdx".into()], Some(&fixture.0.join("downloads"))).unwrap();
    let reopened = fixture.source(&fixture.0);
    assert_eq!(reopened.entries.iter().filter(|entry| entry.model).count(), 1);
    assert!(reopened.entries.iter().all(|entry| !entry.path.contains("已删除模型")));
}

#[test]
fn batch_delete_backs_up_companion_textures_without_removing_shared_originals() {
    let fixture = Fixture::new(); let model = br#"Version { FormatVersion 800, } Textures 1 { Bitmap { Image "Textures\skin.blp", } }"#;
    let path = fixture.0.join("batch.w3x"); let archive = Archive::create_fixture(&path, false);
    archive.write("Models/hero.mdl", model, false).unwrap(); archive.write("Textures/skin.blp", b"BLP1-shared", false).unwrap(); archive.flush().unwrap(); drop(archive);
    let source = fixture.source(&path); let name = source.entries.iter().find(|entry| entry.model).unwrap().path.clone();
    let (_, backup) = delete_map::execute(&source, &[name], Some(&fixture.0.join("downloads"))).unwrap();
    assert_eq!(fs::read(PathBuf::from(backup).join("Textures/skin.blp")).unwrap(), b"BLP1-shared");
    assert_eq!(Archive::open(&path).unwrap().read("Textures\\skin.blp").unwrap(), b"BLP1-shared");
    let folder = fixture.0.join("folder"); fs::create_dir_all(folder.join("Textures")).unwrap(); fs::write(folder.join("hero.mdl"), model).unwrap(); fs::write(folder.join("Textures/skin.blp"), b"BLP1-shared").unwrap();
    let source = fixture.source(&folder);
    let backup = folder_ops::delete(&source, &["hero.mdl".into()], Some(&fixture.0.join("downloads"))).unwrap();
    assert_eq!(fs::read(PathBuf::from(backup).join("Textures/skin.blp")).unwrap(), b"BLP1-shared");
    assert_eq!(fs::read(folder.join("Textures/skin.blp")).unwrap(), b"BLP1-shared");
}
