use super::{index, storm::Archive};
use std::{fs, path::Path, sync::atomic::AtomicBool, time::Instant};

#[test]
fn picker_scan_preserves_paths_and_bytes_without_full_model_analysis() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/picker-native");
    fs::create_dir_all(&root).unwrap();
    let path = root.join(format!("{}.w3x", uuid::Uuid::new_v4()));
    let archive = Archive::create_classic(&path, 160).unwrap();
    let mut model = b"MDLXTEXS".to_vec(); model.extend(268u32.to_le_bytes());
    let mut skin = vec![0;268]; skin[4..21].copy_from_slice(b"Textures\\skin.blp"); model.extend(skin);
    model.extend(b"UNKN"); model.extend((256 * 1024u32).to_le_bytes()); model.resize(model.len()+256*1024, 0);
    for n in 0..128 { archive.write(&format!("Models/模型{n}.mdx"), &model, false).unwrap(); }
    archive.write("Textures/skin.blp", b"BLP1test", false).unwrap();
    archive.write("war3map.j", b"function main takes nothing returns nothing\nendfunction", false).unwrap();
    archive.flush().unwrap(); drop(archive);
    let original = fs::read(&path).unwrap(); let cancel = AtomicBool::new(false);
    let start = Instant::now(); let full = index::scan(path.to_string_lossy().into(), "full".into(), &cancel).unwrap(); let full_ms = start.elapsed().as_secs_f64()*1000.0;
    let start = Instant::now(); let quick = index::scan_mode(path.to_string_lossy().into(), "quick".into(), &cancel, true).unwrap(); let quick_ms = start.elapsed().as_secs_f64()*1000.0;
    assert!(quick.complete); assert!(quick.analysis.is_none()); assert!(full.analysis.is_some());
    assert_eq!(quick.entries.iter().map(|e| (&e.path,e.model,e.anonymous)).collect::<Vec<_>>(), full.entries.iter().map(|e| (&e.path,e.model,e.anonymous)).collect::<Vec<_>>());
    assert_eq!(index::read(&quick,"Models/模型42.mdx").unwrap(), model);
    assert_eq!(fs::read(&path).unwrap(), original);
    assert!(index::scan_mode(path.to_string_lossy().into(), "cancel".into(), &AtomicBool::new(true), true).is_err());
    eprintln!("PICKER_BENCH {}", serde_json::json!({"fullMs":full_ms,"quickMs":quick_ms,"models":128,"modelBytes":model.len()*128}));
    fs::remove_file(path).unwrap();
}

#[test]
fn picker_scan_keeps_unknown_paths_disabled_and_allows_full_recovery() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/picker-native"); fs::create_dir_all(&root).unwrap();
    let path = root.join(format!("{}.w3x", uuid::Uuid::new_v4())); let archive = Archive::create_fixture(&path,false);
    archive.write("Models/Visible.mdx", b"MDLX", false).unwrap(); archive.write("Models/Hidden.mdx", b"MDLX", false).unwrap();
    archive.write("war3map.j", b"call Model(\"Models\\Visible.mdx\")", false).unwrap();
    archive.write("Units/UnitUI.slk", b"C;X1;Y1;K\"Models\\Hidden.mdx\"", false).unwrap();
    archive.flush().unwrap(); drop(archive);
    let cancel = AtomicBool::new(false);
    let quick = index::scan_mode(path.to_string_lossy().into(), "quick".into(), &cancel,true).unwrap();
    assert!(!quick.complete); assert!(quick.warning.unwrap().contains("补全"));
    assert_eq!(quick.entries.iter().filter(|entry| entry.model).count(), 2);
    assert!(quick.entries.iter().any(|entry| entry.model && entry.anonymous));
    let full = index::scan(path.to_string_lossy().into(), "full".into(), &cancel).unwrap();
    assert!(full.entries.iter().any(|entry| entry.path.eq_ignore_ascii_case("Models\\Hidden.mdx") && !entry.anonymous));
    fs::remove_file(path).unwrap();
}
