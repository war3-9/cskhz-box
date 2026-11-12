use super::{export::{run, texture_paths, Item}, index, storm::Archive};
use std::{fs, path::PathBuf, sync::atomic::AtomicBool};

#[test]
#[ignore = "requires the actual right-click export from check-model-context-export.cjs --native"]
fn custom_context_exports_reimport_with_exact_model_and_texture_paths() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-results/model-context-export").canonicalize().unwrap();
    let output = PathBuf::from(std::env::var("BOX_CONTEXT_EXPORT_DIRECTORY").unwrap()).canonicalize().unwrap();
    assert!(output.starts_with(&root));
    fn collect(root: &std::path::Path, folder: &std::path::Path, files: &mut Vec<(String, Vec<u8>)>) {
        for entry in fs::read_dir(folder).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() { collect(root, &path, files); }
            else { files.push((path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/"), fs::read(&path).unwrap())); }
        }
    }
    let mut files = vec![]; collect(&output, &output, &mut files);
    let map = root.join(format!("context-roundtrip-{}.w3x", uuid::Uuid::new_v4()));
    let archive = Archive::create_fixture(&map, true);
    for (path, bytes) in &files { archive.write(path, bytes, false).unwrap(); }
    archive.flush().unwrap(); drop(archive);
    let archive = Archive::open(&map).unwrap();
    let mut models = 0; let mut textures = 0;
    for (path, bytes) in &files {
        assert_eq!(archive.read(&path.replace('/', "\\")).unwrap(), *bytes);
        if !path.ends_with(".mdx") && !path.ends_with(".mdl") { continue; }
        models += 1;
        for texture in super::export_rename::texture_paths(bytes, path).unwrap() {
            assert!(texture.starts_with("Models\\Units\\Custom"));
            let expected = files.iter().find(|(name, _)| name.replace('/', "\\") == texture).unwrap();
            assert_eq!(archive.read(&texture).unwrap(), expected.1); textures += 1;
        }
    }
    assert_eq!((models, textures), (2, 4));
    println!("Actual right-click MDX/MDL: {models} models, {textures} exact texture references survive MPQ save/reopen");
}

#[test]
#[ignore = "requires the local Warcraft game archives; creates private round-trip fixtures"]
fn renamed_game_models_export_from_map_and_reimport_with_numbered_texture_paths() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../test-results/viewer-batch-rename");
    let fixture = root.join("fixture"); fs::create_dir_all(&fixture).unwrap();
    let game = PathBuf::from(std::env::var_os("BOX_VIEWER_TEST_GAME_DIR").expect("set BOX_VIEWER_TEST_GAME_DIR"));
    let archives: Vec<_> = ["War3Patch.mpq", "War3xLocal.mpq", "War3x.mpq", "war3.mpq"].iter().map(|name| Archive::open(&game.join(name)).unwrap()).collect();
    let read = |path: &str| archives.iter().find_map(|archive| archive.read(path).ok()).unwrap_or_else(|| panic!("missing game resource: {path}"));
    let model = read("units\\human\\Footman\\Footman.mdx"); assert!(model.starts_with(b"MDLX"));
    let mut files = vec![("war3mapImported/a.mdx".to_string(), model.clone()), ("nested/b.mdx".to_string(), model.clone())];
    for path in texture_paths(&model, "a.mdx") { files.push((path.replace('\\', "/"), read(&path))); }
    let map = root.join("source.w3x");
    assert!(!map.exists(), "Use a fresh fixture run");
    let archive = Archive::create_fixture(&map, true);
    for (name, bytes) in &files {
        let path = fixture.join(name); fs::create_dir_all(path.parent().unwrap()).unwrap(); fs::write(path, bytes).unwrap();
        archive.write(name, bytes, false).unwrap();
    }
    archive.flush().unwrap(); drop(archive);
    let before = fs::read(&map).unwrap(); let cancel = AtomicBool::new(false);
    let source = index::scan(map.to_string_lossy().into(), "main".into(), &cancel).unwrap();
    assert_eq!(source.entries.iter().filter(|entry| entry.model).count(), 2);
    let items: Vec<_> = ["war3mapImported/a.mdx", "nested/b.mdx"].iter().enumerate().map(|(i, path)| Item {
        source_id: "main".into(), path: path.to_string(), output: format!("wuqi({}).mdx", i + 36), dependency: false, rename_textures: true,
    }).collect();
    let out = root.join("rust-export");
    let result = run(vec![source], items, out.to_string_lossy().into(), true, &cancel, |_| {}).unwrap();
    assert_eq!(result.models, 2); assert!(result.failed.is_empty()); assert!(result.missing.is_empty()); assert!(result.textures >= 2);
    let reimport = Archive::create_fixture(&root.join("roundtrip.w3x"), true);
    for entry in fs::read_dir(&out).unwrap() { let entry = entry.unwrap(); reimport.write(&entry.file_name().to_string_lossy(), &fs::read(entry.path()).unwrap(), false).unwrap(); }
    reimport.flush().unwrap();
    for i in 36..=37 {
        let name = format!("wuqi({i}).mdx"); let bytes = reimport.read(&name).unwrap();
        let original = super::export_rename::texture_paths(&model, "a.mdx").unwrap();
        let renamed = super::export_rename::names(original, &name);
        assert_eq!(bytes, super::export_rename::rewrite(&model, "a.mdx", &renamed).unwrap());
        for (old, new) in renamed { assert_eq!(reimport.read(&new).unwrap(), read(&old)); }
    }
    assert_eq!(fs::read(map).unwrap(), before);
    println!("Real MDX: 2 models / {} textures exported, references resolve after MPQ reimport; source map unchanged", result.textures);
}
