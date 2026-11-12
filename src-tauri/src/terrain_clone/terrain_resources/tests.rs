use super::*;
use super::super::{imports, resources, save, session::MapDocument, terrain_slk};

#[test]
fn native_ids_use_their_own_tileset_paths_including_mixed_palettes() {
    let data = catalog();
    assert_eq!(data.ground.len(), 177);
    assert_eq!(data.cliff.len(), 36);
    for (id, path) in [
        ("Lgrs", "TerrainArt/LordaeronSummer/Lords_Grass.blp"),
        ("Ygsb", "TerrainArt/Cityscape/City_Grass.blp"),
        ("Fgrs", "TerrainArt/LordaeronFall/Lordf_Grass.blp"),
        ("Dbrk", "TerrainArt/Dungeon/Cave_Brick.blp"),
        ("Arck", "TerrainArt/Ashenvale/Ashen_Rock.blp"),
    ] { assert_eq!(data.ground[id], path); }
    assert_eq!(data.cliff["CLgr"], "ReplaceableTextures/Cliff/Cliff1.blp");
}

#[test]
fn custom_slk_paths_respect_sticky_coordinates_and_quoted_separators() {
    let bytes = b"ID;PWXL;N;E\nC;X1;Y1;K\"tileID\"\nC;X2;K\"dir\"\nC;X3;K\"file\"\nC;X1;Y2;K\"Lgrs\"\nC;X2;K\"custom\\ground\"\nC;X3;K\"summer;grass\"\nC;X1;Y3;K\"Ygsb\"\nC;X2;K\"custom\\ground\"\nC;X3;K\"town.blp\"\n";
    assert_eq!(terrain_slk::texture_paths(bytes, "dir", "file").unwrap(), ["custom/ground/summer;grass.blp", "custom/ground/town.blp"]);
    assert!(terrain_slk::texture_paths(b"ID;PWXL\n", "dir", "file").is_err());
}

#[test]
#[ignore = "requires the supplied real clone in BOX_TERRAIN_TGA_INPUT"]
fn real_tga_terrain_clone_save_and_readback() {
    let source = std::path::PathBuf::from(std::env::var("BOX_TERRAIN_TGA_INPUT").unwrap());
    let output = std::path::PathBuf::from(std::env::var("BOX_TERRAIN_TGA_OUTPUT").unwrap());
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").canonicalize().unwrap();
    assert!(output.parent().unwrap().canonicalize().unwrap().starts_with(root.join("test-results")));
    let source_hash = MapDocument::file_hash(&source).unwrap();
    let original = Archive::open(&source).unwrap();
    let doc = MapDocument::new(source.clone(), original.read("war3map.w3e").unwrap());
    save::write_map_copy(&doc, &output).unwrap();
    let saved = Archive::open(&output).unwrap();
    let rows = imports::parse(&saved.read("war3map.imp").unwrap()).unwrap();
    let mut count = 0;
    for path in references(&original, &HashMap::new()).unwrap() {
        let archive_path = path.replace('/', "\\");
        if !path.ends_with(".tga") || !original.has(&archive_path) { continue; }
        let source_bytes = crate::model_viewer::codec::convert(&original.read(&archive_path).unwrap()).unwrap().into_owned();
        assert_eq!(saved.read(&archive_path).unwrap(), source_bytes, "lost original {path}");
        assert!(rows.iter().any(|(flag, name)| *flag == 13 && imports::member_path(*flag, name).eq_ignore_ascii_case(&path)), "lost import {path}");
        let blp = format!("{}.blp", &path[..path.len()-4]);
        let blp_archive = blp.replace('/', "\\");
        if !original.has(&blp_archive) {
            assert!(!saved.has(&blp_archive), "do not replace the original TGA with a conversion {blp}");
            count += 1;
        }
    }
    assert!(count >= 8, "expected the supplied native terrain TGA overrides, found {count}");
    assert_eq!(MapDocument::file_hash(&source).unwrap(), source_hash);
    println!("native terrain TGA overrides preserved and registered: {count}; output {}", output.display());
}

#[test]
fn unlisted_native_overrides_remain_at_exact_paths_in_imports_after_repeated_save() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let fixture = super::super::tests::archive_fixture();
    let job = root.join("test-results/terrain-runtime-crash-20261012").join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&job).unwrap();
    let source = job.join("source.w3m");
    std::fs::copy(&fixture, &source).unwrap();
    super::super::mpq_identity::reserve(&source, 32).unwrap();
    let archive = Archive::writable_copy(&source).unwrap();
    let mut overrides = Vec::new();
    for (index, path) in [
        "TerrainArt/LordaeronSummer/Lords_Grass.blp",
        "TerrainArt/Cityscape/City_Grass.blp",
        "TerrainArt/LordaeronFall/Lordf_Grass.blp",
        "TerrainArt/Dungeon/Cave_Brick.blp",
        "ReplaceableTextures/Cliff/Cliff1.blp",
        "custom/ground/summer.blp",
        "Doodads/Terrain/Cliffs/CliffsAAAB0.mdx",
        "Doodads/Terrain/CliffTrans/CliffTransAAHL0.mdx",
    ].iter().enumerate() {
        let bytes = format!("private terrain texture {index}").into_bytes();
        archive.write(path, &bytes, false).unwrap();
        overrides.push((path.to_string(), bytes));
    }
    let tga_path = "TerrainArt/LordaeronSummer/Lords_Dirt.tga";
    let game_path = "TerrainArt/LordaeronSummer/Lords_Dirt.blp";
    let mut tga = vec![0; 18];
    tga[2] = 2;
    tga[12..16].copy_from_slice(&[2, 0, 2, 0]);
    tga[16..18].copy_from_slice(&[32, 0x28]);
    tga.extend_from_slice(&[20, 50, 200, 255].repeat(4));
    archive.write(tga_path, &tga, false).unwrap();
    overrides.push((tga_path.to_string(), tga));
    let table = b"ID;PWXL;N;E\nC;X1;Y1;K\"tileID\"\nC;X2;K\"dir\"\nC;X3;K\"file\"\nC;X1;Y2;K\"Lgrs\"\nC;X2;K\"custom\\ground\"\nC;X3;K\"summer\"\n";
    archive.write(TABLES[0], table, false).unwrap();
    if archive.has("war3map.imp") { archive.remove(b"war3map.imp").unwrap(); }
    if archive.has("(listfile)") { archive.remove(b"(listfile)").unwrap(); }
    archive.flush().unwrap();
    drop(archive);
    let original = std::fs::read(&source).unwrap();
    let mut copied = HashMap::new();
    resources::copy_all(&source, &fixture, &mut copied).unwrap();
    for (path, bytes) in &overrides { assert_eq!(&copied[path], bytes, "missing copy {path}"); }
    assert!(!copied.contains_key(game_path));
    assert_eq!(copied[TABLES[0]], table);
    let archive = Archive::open(&source).unwrap();
    let mut doc = MapDocument::new(source.clone(), archive.read("war3map.w3e").unwrap());
    drop(archive);
    // Pending source texture must win over inherited target container bytes.
    doc.members.insert(overrides[0].0.clone(), b"pending source texture".to_vec());
    overrides[0].1 = b"pending source texture".to_vec();
    for name in ["first.w3m", "second.w3m"] {
        let output = job.join(name);
        save::write_map_copy(&doc, &output).unwrap();
        let saved = Archive::open(&output).unwrap();
        let entries = imports::parse(&saved.read("war3map.imp").unwrap()).unwrap();
        assert!(!saved.has(&game_path.replace('/', "\\")));
        for (path, bytes) in &overrides {
            assert_eq!(&saved.read(&path.replace('/', "\\")).unwrap(), bytes, "wrong saved texture {path}");
            assert_eq!(entries.iter().filter(|(flag, raw)| imports::member_path(*flag, raw).eq_ignore_ascii_case(path)).count(), 1, "wrong import {path}");
        }
        assert!(entries.iter().any(|(flag, raw)| imports::member_path(*flag, raw).eq_ignore_ascii_case(TABLES[0])));
        assert!(!entries.iter().any(|(flag, raw)| imports::member_path(*flag, raw).eq_ignore_ascii_case("TerrainArt/LordaeronSummer/Lords_DirtRough.blp")), "do not import missing built-in textures");
        drop(saved);
        doc.mark_saved(output);
    }
    assert_eq!(std::fs::read(&source).unwrap(), original);
}
