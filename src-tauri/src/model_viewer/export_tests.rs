use super::{export::{run, texture_paths, Item}, index};
use std::{fs, path::PathBuf, sync::atomic::{AtomicBool, Ordering}};
fn root() -> PathBuf { let path = std::env::temp_dir().join(format!("box-raw-export-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&path).unwrap(); path }
fn model(paths: &[&str]) -> Vec<u8> {
    let mut bytes = b"MDLXTEXS".to_vec(); bytes.extend(((paths.len() * 268) as u32).to_le_bytes());
    for path in paths { let mut texture = [0u8; 268]; texture[4..4 + path.len()].copy_from_slice(path.as_bytes()); bytes.extend(texture); }
    bytes.extend(b"BROK\xff\xff\xff\xff"); bytes
}
fn item(path: &str) -> Item { Item { source_id: "main".into(), path: path.into(), output: path.into(), dependency: false, rename_textures: false } }
#[test]
fn raw_export_copies_malformed_animation_and_resolves_dependencies_once() {
    let root = root(); let main = root.join("main"); let supplement = root.join("supplement"); fs::create_dir_all(&main).unwrap(); fs::create_dir_all(&supplement).unwrap();
    let bytes = model(&["custom.blp", "extra.blp", "missing.blp", "custom.blp"]);
    fs::write(main.join("model.mdx"), &bytes).unwrap(); fs::write(main.join("custom.blp"), b"map bytes").unwrap(); fs::write(supplement.join("custom.blp"), b"override").unwrap(); fs::write(supplement.join("extra.blp"), b"extra").unwrap();
    let cancel = AtomicBool::new(false);
    let sources = vec![index::scan(main.to_string_lossy().into(), "main".into(), &cancel).unwrap(), index::scan(supplement.to_string_lossy().into(), "supplement".into(), &cancel).unwrap()];
    let output = root.join("out").to_string_lossy().into_owned();
    let result = run(sources.clone(), vec![item("model.mdx")], output.clone(), true, &cancel, |_| {}).unwrap();
    assert_eq!((result.models, result.textures), (1, 2)); assert!(result.failed.is_empty()); assert_eq!(result.missing, vec!["missing.blp"]);
    assert_eq!(fs::read(root.join("out/model.mdx")).unwrap(), bytes); assert_eq!(fs::read(root.join("out/custom.blp")).unwrap(), b"map bytes");
    let repeat = run(sources.clone(), vec![item("model.mdx")], output.clone(), true, &cancel, |_| {}).unwrap(); assert!(repeat.failed.is_empty());
    fs::write(root.join("out/model.mdx"), b"keep existing").unwrap();
    let conflict = run(sources.clone(), vec![item("model.mdx")], output.clone(), false, &cancel, |_| {}).unwrap(); assert_eq!(conflict.failed.len(), 1); assert_eq!(fs::read(root.join("out/model.mdx")).unwrap(), b"keep existing");
    let mut escape = item("model.mdx"); escape.output = "../escape.mdx".into(); assert_eq!(run(sources.clone(), vec![escape], output.clone(), false, &cancel, |_| {}).unwrap().failed.len(), 1); assert!(!root.join("escape.mdx").exists());
    let stopped = run(sources, vec![item("model.mdx")], output, false, &cancel, |_| cancel.store(true, Ordering::Relaxed)).unwrap(); assert!(stopped.stopped); assert_eq!(stopped.done, 0);
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn bounded_texture_chunk_handles_wrong_extension_and_truncation() {
    let bytes = model(&["textures\\中文.blp"]); assert_eq!(texture_paths(&bytes, "wrong.mdl"), vec!["textures\\中文.blp"]);
    assert!(texture_paths(&bytes[..13], "model.mdx").is_empty());
}

#[test]
fn renamed_models_export_independent_numbered_textures_and_preserve_source_bytes() {
    let root = root(); let main = root.join("main"); fs::create_dir_all(main.join("nested")).unwrap();
    let bytes = model(&["shared.blp", "second.tga", "", "SHARED.BLP"]);
    fs::write(main.join("nested/a.mdx"), &bytes).unwrap(); fs::write(main.join("nested/b.mdx"), &bytes).unwrap();
    fs::write(main.join("nested/shared.blp"), b"skin").unwrap(); fs::write(main.join("nested/second.tga"), b"effect").unwrap();
    let cancel = AtomicBool::new(false); let source = index::scan(main.to_string_lossy().into(), "main".into(), &cancel).unwrap();
    let items: Vec<_> = ["nested/a.mdx", "nested/b.mdx"].iter().enumerate().map(|(i, path)| {
        let mut item = item(path); item.output = format!("tx({}).mdx", i + 1); item.rename_textures = true; item
    }).collect();
    let output = root.join("out").to_string_lossy().into_owned();
    let result = run(vec![source.clone()], items.clone(), output.clone(), true, &cancel, |_| {}).unwrap();
    assert_eq!((result.models, result.textures, result.failed.len(), result.missing.len()), (2, 4, 0, 0));
    for i in 1..=2 {
        let exported = fs::read(root.join(format!("out/tx({i}).mdx"))).unwrap();
        assert_eq!(texture_paths(&exported, "a.mdx"), vec![format!("tx({i})1.blp"), format!("tx({i})2.tga"), format!("tx({i})1.blp")]);
        assert_eq!(exported.len(), bytes.len()); assert_eq!(&exported[exported.len() - 8..], &bytes[bytes.len() - 8..]);
        assert_eq!(fs::read(root.join(format!("out/tx({i})1.blp"))).unwrap(), b"skin");
        assert_eq!(fs::read(root.join(format!("out/tx({i})2.tga"))).unwrap(), b"effect");
    }
    assert_eq!(fs::read(main.join("nested/a.mdx")).unwrap(), bytes);
    let repeat = run(vec![source], items, output, true, &cancel, |_| {}).unwrap(); assert!(repeat.failed.is_empty());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn mdl_rename_only_changes_image_fields_and_reports_missing_without_fabricated_names() {
    let root = root(); let main = root.join("main"); fs::create_dir_all(&main).unwrap();
    let bytes = b"// Image \"comment.blp\"\nModel \"Untouched\" {} Textures 3 { Bitmap { Image \"skin.blp\", } Bitmap { Image \"missing.blp\", } Bitmap { Image \"\", ReplaceableId 1, } }";
    fs::write(main.join("a.mdl"), bytes).unwrap(); fs::write(main.join("skin.blp"), b"skin").unwrap();
    let cancel = AtomicBool::new(false); let source = index::scan(main.to_string_lossy().into(), "main".into(), &cancel).unwrap();
    let mut work = item("a.mdl"); work.output = "Models/Units/CustomText.mdl".into(); work.rename_textures = true;
    let result = run(vec![source], vec![work], root.join("out").to_string_lossy().into(), true, &cancel, |_| {}).unwrap();
    assert!(result.failed.is_empty()); assert_eq!(result.missing, vec!["missing.blp"]);
    let exported = fs::read_to_string(root.join("out/Models/Units/CustomText.mdl")).unwrap();
    assert_eq!(exported, String::from_utf8_lossy(bytes).replacen("Image \"skin.blp\"", "Image \"Models\\Units\\CustomText1.blp\"", 1));
    assert_eq!(fs::read(root.join("out/Models/Units/CustomText1.blp")).unwrap(), b"skin");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rename_rejects_texture_collisions_and_keeps_existing_different_files() {
    let root = root(); let main = root.join("main"); fs::create_dir_all(&main).unwrap();
    fs::write(main.join("a.mdx"), model(&["skin.blp"])).unwrap(); fs::write(main.join("skin.blp"), b"skin").unwrap(); fs::write(main.join("other.blp"), b"other").unwrap();
    let cancel = AtomicBool::new(false); let source = index::scan(main.to_string_lossy().into(), "main".into(), &cancel).unwrap();
    let mut renamed = item("a.mdx"); renamed.output = "tx(1).mdx".into(); renamed.rename_textures = true;
    let mut texture = item("other.blp"); texture.output = "tx(1)1.blp".into();
    let result = run(vec![source.clone()], vec![renamed.clone(), texture], root.join("out").to_string_lossy().into(), true, &cancel, |_| {}).unwrap();
    assert_eq!(result.models, 0); assert_eq!(result.failed.len(), 1); assert!(!root.join("out/tx(1).mdx").exists());
    assert_eq!(fs::read(root.join("out/tx(1)1.blp")).unwrap(), b"other");
    fs::write(root.join("out/tx(1).mdx"), b"existing").unwrap();
    let conflict = run(vec![source], vec![renamed], root.join("out").to_string_lossy().into(), true, &cancel, |_| {}).unwrap();
    assert_eq!(conflict.failed.len(), 1); assert_eq!(fs::read(root.join("out/tx(1).mdx")).unwrap(), b"existing");
    fs::remove_dir_all(root).unwrap();
}
