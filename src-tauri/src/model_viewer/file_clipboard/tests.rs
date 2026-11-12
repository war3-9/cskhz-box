use super::*;
use std::sync::atomic::AtomicBool;
#[cfg(windows)]
mod packet_shell;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results/file-clipboard-tests").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap(); Self(root)
    }
    fn source(&self, id: &str, texture: Option<&[u8]>) -> Source {
        let root = self.0.join(id); fs::create_dir_all(&root).unwrap();
        fs::write(root.join("a.mdl"), b"Textures 1 { Bitmap { Image \"skin.blp\", } }").unwrap();
        if let Some(texture) = texture { fs::write(root.join("skin.blp"), texture).unwrap(); }
        index::scan(root.to_string_lossy().into(), id.into(), &AtomicBool::new(false)).unwrap()
    }
}
impl Drop for Fixture { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
fn item(id: &str, output: &str) -> Item { Item { source_id: id.into(), path: "a.mdl".into(), output: output.into(), dependency: false, rename_textures: false } }

#[test]
fn prepares_nested_models_with_rewritten_textures_and_retains_originals() {
    let fixture = Fixture::new(); let first = fixture.source("first", Some(b"red")); let second = fixture.source("second", Some(b"blue"));
    let originals = fs::read(fixture.0.join("first/a.mdl")).unwrap();
    let (copied, paths) = prepare(vec![first, second], vec![item("first", "Models/中文.mdl"), item("second", "Models/other.mdl")], &fixture.0.join("clipboard")).unwrap();
    assert_eq!((copied.models, copied.textures, copied.files), (2, 2, 4));
    assert_eq!(paths.len(), 1); assert!(paths[0].is_dir());
    let stage = PathBuf::from(copied.directory);
    assert_eq!(fs::read(stage.join("Models/中文1.blp")).unwrap(), b"red");
    assert_eq!(fs::read(stage.join("Models/other1.blp")).unwrap(), b"blue");
    assert!(fs::read_to_string(stage.join("Models/中文.mdl")).unwrap().contains("Image \"Models\\中文1.blp\""));
    assert_eq!(fs::read(fixture.0.join("first/a.mdl")).unwrap(), originals);
}

#[test]
fn missing_textures_rejects_the_package_and_removes_only_the_failed_stage() {
    let fixture = Fixture::new(); let source = fixture.source("first", None); let root = fixture.0.join("clipboard");
    let error = prepare(vec![source], vec![item("first", "a.mdl")], &root).err().unwrap();
    assert!(error.contains("skin.blp")); assert_eq!(fs::read_dir(root).unwrap().count(), 0);
    assert!(fixture.0.join("first/a.mdl").is_file());
}

#[test]
fn rejects_unmounted_paths_traversal_and_case_insensitive_output_collisions() {
    let fixture = Fixture::new(); let source = fixture.source("first", Some(b"skin"));
    let mut unknown = item("first", "a.mdl"); unknown.path = "unknown.mdl".into();
    assert!(validate(&[source.clone()], &[unknown]).is_err());
    assert!(validate(&[source.clone()], &[item("first", "../a.mdl")]).is_err());
    assert!(validate(&[source], &[item("first", "Models/A.mdl"), item("first", "models/a.MDL")]).is_err());
}

#[cfg(windows)]
#[test]
fn hdrop_uses_utf16_absolute_top_level_paths_and_double_null_termination() {
    let paths = [PathBuf::from("F:/模型/中文.mdl"), PathBuf::from("F:/模型/Textures")];
    let payload = windows::drop_payload(&paths).unwrap();
    assert_eq!(&payload[..20], &[20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
    let wide = payload[20..].chunks_exact(2).map(|bytes| u16::from_le_bytes([bytes[0], bytes[1]])).collect::<Vec<_>>();
    assert_eq!(String::from_utf16_lossy(&wide), "F:\\模型\\中文.mdl\0F:\\模型\\Textures\0\0");
    assert!(windows::drop_payload(&[PathBuf::from("relative.mdl")]).is_err());
    assert_eq!(windows::shell_path(&PathBuf::from("\\\\?\\F:\\模型\\中文.mdl")).unwrap(), "F:\\模型\\中文.mdl");
    assert_eq!(windows::shell_path(&PathBuf::from("\\\\?\\UNC\\server\\share\\中文.mdl")).unwrap(), "\\\\server\\share\\中文.mdl");
}
