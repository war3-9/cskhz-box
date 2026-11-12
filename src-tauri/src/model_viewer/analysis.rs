use super::{index::{Entry, Source}, references::references, storm::Archive};
use serde::Serialize;
use std::{collections::{HashMap, HashSet}, path::Path};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub model_textures: Vec<String>,
    pub unused_models: Vec<String>,
    pub usage_supported: bool,
    pub usage_note: String,
}

fn normal(path: &str) -> String { path.replace("\\\\", "/").replace('\\', "/").trim_start_matches("./").to_lowercase() }
fn model_key(path: &str) -> String {
    let path = normal(path);
    path.strip_suffix(".mdx").or_else(|| path.strip_suffix(".mdl")).unwrap_or(&path).to_string()
}
fn texture(path: &str) -> bool { [".blp", ".tga", ".dds", ".png", ".jpg", ".jpeg"].iter().any(|ext| path.to_ascii_lowercase().ends_with(ext)) }

// Read only the MDX texture table, never guess a skin from its directory/name.
pub fn model_references(bytes: &[u8]) -> Vec<String> {
    if !bytes.starts_with(b"MDLX") {
        let Ok(text) = std::str::from_utf8(bytes) else { return Vec::new(); };
        let mut names = Vec::new(); let parts: Vec<_> = text.split('"').collect();
        for i in (1..parts.len()).step_by(2) { if parts[i - 1].split_whitespace().last() == Some("Image") { names.push(parts[i].replace("\\\\", "\\")); } }
        return names;
    }
    let mut names = Vec::new(); let mut pos = 4;
    while pos + 8 <= bytes.len() {
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let Some(end) = pos.checked_add(8).and_then(|n| n.checked_add(size)).filter(|n| *n <= bytes.len()) else { break; };
        if &bytes[pos..pos + 4] == b"TEXS" {
            for record in bytes[pos + 8..end].chunks_exact(268) {
                let field = &record[4..264]; let len = field.iter().position(|b| *b == 0).unwrap_or(field.len());
                if let Ok(name) = std::str::from_utf8(&field[..len]) { if !name.is_empty() { names.push(name.to_string()); } }
            }
        }
        pos = end;
    }
    names
}

pub fn classify(entries: &[Entry], dependencies: &HashMap<String, Vec<String>>) -> Analysis {
    let textures: HashSet<_> = entries.iter().filter(|e| !e.model && texture(&e.path)).map(|e| normal(&e.path)).collect();
    let mut used = HashSet::new();
    for (model, names) in dependencies {
        let dir = normal(model).rsplit_once('/').map(|(dir, _)| dir.to_string()).unwrap_or_default();
        for name in names.iter().filter(|name| texture(name)) {
            let name = normal(name);
            let mut candidates = vec![name.clone()];
            let mut parts: Vec<_> = dir.split('/').filter(|p| !p.is_empty()).collect();
            let mut safe = true;
            for part in name.split('/') { match part { ".." => { if parts.pop().is_none() { safe = false; break; } }, "." | "" => {}, _ => parts.push(part) } }
            if safe {
                candidates.push(parts.join("/"));
                candidates.push(if dir.is_empty() { name.rsplit('/').next().unwrap().to_string() } else { format!("{dir}/{}", name.rsplit('/').next().unwrap()) });
            }
            // Same precedence as resource lookup: root, relative, model-local flattened file.
            if let Some(path) = candidates.into_iter().find(|path| textures.contains(path)) { used.insert(path); }
        }
    }
    let mut model_textures: Vec<_> = used.into_iter().collect(); model_textures.sort();
    Analysis { model_textures, usage_note: "仅地图支持未使用模型识别".into(), ..Default::default() }
}

const MAP_FILES: &[&str] = &[
    "war3map.j", "scripts\\war3map.j", "war3map.lua", "scripts\\war3map.lua",
    "war3map.w3u", "war3map.w3t", "war3map.w3b", "war3map.w3d", "war3map.w3a", "war3map.w3h", "war3map.w3q",
    "war3map.w3c", "war3map.w3i", "war3map.wts", "war3map.wtg", "war3map.wct", "war3mapSkin.txt", "war3mapMisc.txt",
    "war3map.doo", "war3mapUnits.doo",
];

pub fn map_usage(source: &Source, archive: &Archive, recovered_references: &[String], analysis: &mut Analysis) {
    if !matches!(Path::new(&source.path).extension().and_then(|e| e.to_str()).map(str::to_lowercase).as_deref(), Some("w3x" | "w3m")) { return; }
    let mut names = recovered_references.to_vec(); let mut script = false;
    for file in MAP_FILES.iter().filter(|file| archive.has(file)) {
        let Ok(bytes) = archive.read(file) else { analysis.usage_note = format!("无法读取 {file}，未使用模型识别不可用"); return; };
        if file.ends_with(".j") || file.ends_with(".lua") {
            script |= !bytes.is_empty() && !bytes.contains(&0);
        }
        names.extend(references(&bytes));
    }
    if !script { analysis.usage_note = "地图脚本不可读，未使用模型识别不可用".into(); return; }
    // An MPQ can resolve an original referenced path to a file block without a
    // listfile. Match blocks as well as names, including anonymous model entries.
    let mut used_blocks = HashSet::new();
    let stems: HashSet<_> = names.iter().filter(|name| { let path = name.to_ascii_lowercase(); path.ends_with(".mdx") || path.ends_with(".mdl") }).map(|name| model_key(name)).collect();
    for stem in stems {
        for path in [format!("{stem}.mdx"), format!("{stem}.mdl"), format!("{stem}_portrait.mdx"), format!("{stem}_portrait.mdl")] {
            if let Some(block) = archive.block(&path) { used_blocks.insert(block); }
        }
    }
    let candidates: HashSet<_> = unused(&source.entries, &names).into_iter().collect();
    analysis.unused_models = source.entries.iter().filter(|entry| candidates.contains(&entry.path)
        && !entry.raw_name.as_ref().and_then(|raw| archive.block_raw(raw)).is_some_and(|block| used_blocks.contains(&block)))
        .map(|entry| entry.path.clone()).collect();
    analysis.usage_supported = true;
    analysis.usage_note = "按地图脚本、物编、SLK/TXT 和触发器的静态引用及归档文件编号识别；未发现引用的模型显示标签，动态拼接路径仍可能漏判，请核对后再处理。".into();
}

fn unused(entries: &[Entry], references: &[String]) -> Vec<String> {
    let models: Vec<_> = entries.iter().filter(|e| e.model).collect();
    let mut counts = HashMap::new();
    for entry in &models { *counts.entry(model_key(&entry.path).rsplit('/').next().unwrap().to_string()).or_insert(0) += 1; }
    let used: HashSet<_> = references.iter().map(|name| model_key(name)).collect();
    let basenames: HashSet<_> = used.iter().map(|name| name.rsplit('/').next().unwrap()).collect();
    models.into_iter().filter(|entry| {
        let path = model_key(&entry.path); let base = path.rsplit('/').next().unwrap();
        !base.ends_with("_portrait") && !used.contains(&path) && !(counts[base] == 1 && basenames.contains(base))
    }).map(|e| e.path.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry(path: &str) -> Entry { Entry { path: path.into(), size: 0, model: path.ends_with("mdx"), anonymous: false, model_group: 2, legacy_path: None, raw_name: None } }
    #[test] fn usage_handles_unicode_aliases_ambiguous_names_and_portraits() {
        let entries = ["模型/中文.mdx", "A/unit.mdx", "B/unit.mdx", "free.mdx", "free_portrait.mdx"].map(entry);
        assert_eq!(unused(&entries, &["模型\\中文.mdl".into(), "unit.mdx".into(), "A/unit.mdl".into()]), ["B/unit.mdx", "free.mdx"]);
    }
    #[test] fn textures_follow_resolution_precedence_without_hiding_unrelated_icons() {
        let entries = ["A/unit.mdx", "A/skin.blp", "B/skin.blp", "icons/item.blp", "effect.dds"].map(entry);
        let deps = HashMap::from([("A/unit.mdx".into(), vec!["Textures\\skin.blp".into()])]);
        assert_eq!(classify(&entries, &deps).model_textures, ["a/skin.blp"]);
    }
    #[test] fn texture_table_does_not_treat_arbitrary_model_strings_as_skins() {
        let mut bytes = b"MDLXTEXS".to_vec(); bytes.extend(268u32.to_le_bytes()); let mut record = vec![0; 268];
        record[4..12].copy_from_slice(b"skin.blp"); bytes.extend(record); bytes.extend(b"MODL\x08\0\0\0icon.blp");
        assert_eq!(model_references(&bytes), ["skin.blp"]);
        assert_eq!(model_references(br#"Model "icon.blp" {} Textures 1 { Bitmap { Image "Textures\\skin.blp", } }"#), ["Textures\\skin.blp"]);
    }
    #[test] fn archive_scan_reports_unused_models_and_separates_model_skins() {
        use std::{fs, sync::atomic::AtomicBool};
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/viewer-analysis-native"); fs::create_dir_all(&dir).unwrap();
        for listed in [true, false] {
            let path = dir.join(format!("{}.w3x", uuid::Uuid::new_v4())); let archive = Archive::create_fixture(&path, listed);
            let mut model = b"MDLXTEXS".to_vec(); model.extend(268u32.to_le_bytes()); let mut record = vec![0; 268]; record[4..21].copy_from_slice(b"Textures\\skin.blp"); model.extend(record);
            for name in ["Models/Used.mdx", "Models/Used_portrait.mdx", "Models/Unused.mdx", "Models/中文.mdx", "Models/SlkOnly.mdx"] { archive.write(name, &model, false).unwrap(); }
            archive.write("Textures/skin.blp", b"BLP1", false).unwrap(); archive.write("Icons/item.blp", b"BLP1", false).unwrap();
            archive.write("war3map.j", br#"function main takes nothing returns nothing
call Model("Models\\Used.mdl")
endfunction"#, false).unwrap(); archive.write("war3map.w3u", "\0Models\\中文.mdx\0".as_bytes(), false).unwrap();
            archive.write("Units/UnitUI.slk", b"ID;PWXL;N;E\nC;X1;Y1;K\"Models\\SlkOnly.mdl\"\nE", false).unwrap();
            archive.write("war3map.w3i", &[0; 16], false).unwrap(); archive.flush().unwrap(); drop(archive);
            let source = super::super::index::scan(path.to_string_lossy().into(), "test".into(), &AtomicBool::new(false)).unwrap();
            let mut anonymous_source = source.clone();
            let archive = Archive::open(&path).unwrap();
            let used_block = archive.block("Models/Used.mdx").unwrap();
            let used_entry = anonymous_source.entries.iter_mut().find(|entry| archive.block_raw(entry.raw_name.as_ref().unwrap()) == Some(used_block)).unwrap();
            used_entry.path = "file_900001.mdx".into(); used_entry.anonymous = true;
            let mut block_analysis = Analysis::default(); map_usage(&anonymous_source, &archive, &[], &mut block_analysis);
            assert!(block_analysis.usage_supported);
            assert!(!block_analysis.unused_models.contains(&"file_900001.mdx".into()), "resolve used anonymous models by archive block, not display name");
            let analysis = source.analysis.unwrap();
            assert!(analysis.usage_supported, "{}", analysis.usage_note);
            let unused_blocks: HashSet<_> = source.entries.iter().filter(|entry| analysis.unused_models.contains(&entry.path)).filter_map(|entry| archive.block_raw(entry.raw_name.as_ref().unwrap())).collect();
            assert_eq!(unused_blocks, HashSet::from([archive.block("Models/Unused.mdx").unwrap()]));
            if listed { assert_eq!(analysis.model_textures, ["textures/skin.blp"]); }
            drop(archive);
            fs::remove_file(path).unwrap();
        }
    }
    #[test]
    fn unreadable_usage_is_not_misreported_as_every_model_unused() {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/viewer-analysis-native"); std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join(format!("{}.w3x", uuid::Uuid::new_v4())); let archive = Archive::create_fixture(&path, false);
        archive.write("model.mdx", b"MDLX", false).unwrap(); archive.flush().unwrap(); drop(archive);
        let source = super::super::index::scan(path.to_string_lossy().into(), "unsupported".into(), &std::sync::atomic::AtomicBool::new(false)).unwrap();
        let analysis = source.analysis.unwrap(); assert!(!analysis.usage_supported); assert!(analysis.unused_models.is_empty());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    #[ignore = "read-only local map check; set BOX_VIEWER_TEST_MAP"]
    fn inspect_local_map_usage() {
        let path = std::env::var("BOX_VIEWER_TEST_MAP").unwrap();
        let source = super::super::index::scan(path, "usage-check".into(), &std::sync::atomic::AtomicBool::new(false)).unwrap();
        let analysis = source.analysis.as_ref().unwrap();
        eprintln!("{}", serde_json::json!({"entries":source.entries.len(),"models":source.entries.iter().filter(|e| e.model).count(),"complete":source.complete,"anonymousModels":source.entries.iter().filter(|e| e.model && e.anonymous).count(),"supported":analysis.usage_supported,"unused":analysis.unused_models.len(),"sample":analysis.unused_models.iter().take(10).collect::<Vec<_>>(),"note":analysis.usage_note}));
        assert!(analysis.usage_supported, "{}", analysis.usage_note);
        if let Some(directory) = std::env::var_os("BOX_VIEWER_USAGE_FIXTURE") {
            let directory = std::path::PathBuf::from(directory); std::fs::create_dir_all(&directory).unwrap();
            let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().canonicalize().unwrap();
            assert!(directory.canonicalize().unwrap().starts_with(project.join("test-results")));
            std::fs::write(directory.join("source.json"), serde_json::to_vec(&source).unwrap()).unwrap();
        }
    }
    #[test]
    #[ignore = "requires local classic Warcraft archives and BOX_VIEWER_ASSET_DIR inside project test-results"]
    fn prepare_local_viewer_assets() {
        use std::{fs, path::PathBuf};
        let root = PathBuf::from(std::env::var_os("BOX_VIEWER_ASSET_DIR").unwrap());
        let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().canonicalize().unwrap();
        fs::create_dir_all(&root).unwrap(); let root = root.canonicalize().unwrap(); assert!(root.starts_with(project.join("test-results")));
        let game = PathBuf::from(std::env::var_os("BOX_VIEWER_TEST_GAME_DIR").expect("set BOX_VIEWER_TEST_GAME_DIR"));
        let archives: Vec<_> = ["War3Patch.mpq", "War3xLocal.mpq", "War3x.mpq", "war3.mpq"].map(|name| Archive::open(&game.join(name)).unwrap()).into_iter().collect();
        let read = |path: &str| archives.iter().find_map(|archive| archive.read(path).ok()).unwrap();
        let mut models = Vec::new();
        archives.last().unwrap().enumerate(|name, _, _, _| { if normal(&name).starts_with("units/") && name.to_ascii_lowercase().ends_with(".mdx") { models.push(name); } true });
        models.sort(); models.truncate(110); models.push("units\\human\\Footman\\Footman.mdx".into());
        let mut files = HashSet::new();
        for name in models {
            let bytes = read(&name); let names = model_references(&bytes);
            for (name, bytes) in std::iter::once((name, bytes)).chain(names.into_iter().map(|name| { let bytes = read(&name); (name, bytes) })) {
                if !files.insert(normal(&name)) { continue; }
                let path = root.join(name.replace('\\', "/")); fs::create_dir_all(path.parent().unwrap()).unwrap(); fs::write(path, bytes).unwrap();
            }
        }
        // This icon has no model reference and must remain in the texture browser.
        fs::create_dir_all(root.join("Icons")).unwrap(); fs::write(root.join("Icons/standalone.blp"), read("ReplaceableTextures\\CommandButtons\\BTNFootman.blp")).unwrap();
        eprintln!("prepared {} model/texture files at {}", files.len(), root.display());
    }
}
