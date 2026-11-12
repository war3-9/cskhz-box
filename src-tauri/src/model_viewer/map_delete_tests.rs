use std::{collections::BTreeMap, fs, path::PathBuf, sync::atomic::AtomicBool};
use super::{index, map_ops, storm::Archive};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-results/resource-actions-rust").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap(); Self(root)
    }
    fn map(&self, listed: bool) -> PathBuf {
        let path = self.0.join("source.w3x");
        let archive = Archive::create_fixture(&path, listed);
        for (name, bytes) in [("Models/delete.mdx", b"MDLX-delete".as_slice()), ("Models/keep.mdx", b"MDLX-keep"), ("Textures/shared.blp", b"BLP1-shared"), ("war3map.j", b"function main takes nothing returns nothing\nendfunction"), ("unknown.bin", b"unknown-user-data")] {
            archive.write(name, bytes, false).unwrap();
        }
        archive.flush().unwrap(); drop(archive); path
    }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

#[test]
fn map_resource_deletion_preserves_other_bytes_with_and_without_listfile() {
    for listed in [true, false] {
        let fixture = Fixture::new(); let path = fixture.map(listed);
        let original = fs::read(&path).unwrap();
        let source = index::scan(path.to_string_lossy().into(), "source".into(), &AtomicBool::new(false)).unwrap();
        assert_eq!(source.complete, listed);
        if let Some(directory) = std::env::var_os("BOX_RESOURCE_ACTION_FIXTURES") {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().canonicalize().unwrap();
            let directory = PathBuf::from(directory).canonicalize().unwrap();
            assert!(directory.starts_with(root.join("test-results")));
            fs::copy(&path, directory.join(if listed { "listed.w3x" } else { "anonymous.w3x" })).unwrap();
        }
        let target = source.entries.iter().find(|e| e.model && index::read(&source, &e.path).unwrap() == b"MDLX-delete").unwrap();
        let mut retained: Vec<_> = source.entries.iter().filter(|e| e.path != target.path && !e.path.starts_with('(')).map(|e| index::read(&source, &e.path).unwrap()).collect();
        retained.sort();
        let output = fixture.0.join("deleted.w3x");
        assert_eq!(map_ops::mutate(&source, output.to_str().unwrap(), &[target.path.clone()], &BTreeMap::new(), true).unwrap(), 1);
        let archive = Archive::open(&output).unwrap();
        assert!(archive.read("Models\\delete.mdx").is_err(), "deleted named hash remains, listed={listed}");
        assert_ne!(archive.read_raw(target.raw_name.as_ref().unwrap()).ok().as_deref(), Some(b"MDLX-delete".as_slice()), "deleted content remains, listed={listed}");
        assert_eq!(archive.read("Textures\\shared.blp").unwrap(), b"BLP1-shared");
        drop(archive);
        assert_eq!(fs::read(&path).unwrap(), original);
        let result = index::scan(output.to_string_lossy().into(), "result".into(), &AtomicBool::new(false)).unwrap();
        assert_eq!(result.complete, listed);
        let mut actual: Vec<_> = result.entries.iter().filter(|e| !e.path.starts_with('(')).map(|e| index::read(&result, &e.path).unwrap()).collect();
        actual.sort(); assert_eq!(actual, retained);
        assert_eq!(result.entries.iter().filter(|e| e.model).count(), 1);
        let texture = result.entries.iter().find(|e| e.path.ends_with(".blp")).unwrap();
        let output2 = fixture.0.join("texture-deleted.w3x");
        assert_eq!(map_ops::mutate(&result, output2.to_str().unwrap(), &[texture.path.clone()], &BTreeMap::new(), true).unwrap(), 1);
        let archive = Archive::open(&output2).unwrap();
        assert!(archive.read("Textures\\shared.blp").is_err());
        assert_eq!(archive.read("Models\\keep.mdx").unwrap(), b"MDLX-keep");
        assert_eq!(archive.read("unknown.bin").unwrap(), b"unknown-user-data");
    }
}

#[test]
fn map_resource_deletion_rejects_overwrite_non_resources_and_unknown_entries() {
    let fixture = Fixture::new(); let path = fixture.map(false);
    let original = fs::read(&path).unwrap();
    let source = index::scan(path.to_string_lossy().into(), "source".into(), &AtomicBool::new(false)).unwrap();
    let target = source.entries.iter().find(|e| e.model).unwrap().path.clone();
    let output = fixture.0.join("blocked.w3x");
    for paths in [vec!["war3map.j".into()], vec!["missing.mdx".into()], vec!["../escape.mdx".into()]] {
        assert!(map_ops::mutate(&source, output.to_str().unwrap(), &paths, &BTreeMap::new(), true).is_err());
        assert!(!output.exists());
    }
    assert!(map_ops::mutate(&source, path.to_str().unwrap(), &[target], &BTreeMap::new(), true).is_err());
    assert!(map_ops::mutate(&source, output.to_str().unwrap(), &[], &BTreeMap::new(), false).is_err());
    assert!(!output.exists()); assert_eq!(fs::read(&path).unwrap(), original);
}

#[test]
fn whole_model_deletion_removes_model_and_texture_from_a_copy() {
    let model = br#"Version { FormatVersion 800, }
Model "fixture" { BlendTime 150, MinimumExtent { 0,0,0 }, MaximumExtent { 1,1,1 }, BoundsRadius 1, }
Textures 1 { Bitmap { Image "Textures\skin.blp", } }"#;
    for listed in [true, false] {
        let fixture = Fixture::new(); let path = fixture.0.join("source.w3x");
        let archive = Archive::create_fixture(&path, listed);
        for (name, bytes) in [("Models/delete.mdl", model.as_slice()), ("Models/keep.mdl", b"Version { FormatVersion 800, } Model \"keep\" { BlendTime 150, }".as_slice()), ("Textures/skin.blp", b"BLP1-skin"), ("Textures/unrelated.blp", b"BLP1-keep"), ("war3map.j", b"function main takes nothing returns nothing\nendfunction"), ("unknown.bin", b"user-data")] {
            archive.write(name, bytes, false).unwrap();
        }
        archive.flush().unwrap(); drop(archive);
        if let Some(directory) = std::env::var_os("BOX_RESOURCE_ACTION_FIXTURES") {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().canonicalize().unwrap();
            let directory = PathBuf::from(directory).canonicalize().unwrap();
            assert!(directory.starts_with(root.join("test-results")));
            fs::copy(&path, directory.join(if listed { "whole-listed.w3x" } else { "whole-anonymous.w3x" })).unwrap();
        }
        let original = fs::read(&path).unwrap();
        let source = index::scan(path.to_string_lossy().into(), "source".into(), &AtomicBool::new(false)).unwrap();
        let paths: Vec<_> = source.entries.iter().filter(|entry| {
            let Ok(bytes) = index::read(&source, &entry.path) else { return false; };
            bytes == model || bytes == b"BLP1-skin"
        }).map(|entry| entry.path.clone()).collect();
        assert_eq!(paths.len(), 2);
        let output = fixture.0.join("whole-deleted.w3x");
        assert_eq!(map_ops::mutate(&source, output.to_str().unwrap(), &paths, &BTreeMap::new(), true).unwrap(), 2);
        let archive = Archive::open(&output).unwrap();
        assert!(archive.read("Models\\delete.mdl").is_err());
        assert!(archive.read("Textures\\skin.blp").is_err());
        assert_eq!(archive.read("Textures\\unrelated.blp").unwrap(), b"BLP1-keep");
        assert_eq!(archive.read("unknown.bin").unwrap(), b"user-data");
        assert!(archive.read("Models\\keep.mdl").is_ok());
        assert!(archive.read("war3map.j").is_ok());
        assert_eq!(fs::read(path).unwrap(), original);
    }
}
