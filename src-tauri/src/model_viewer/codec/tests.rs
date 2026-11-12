use super::{convert, reader::{chunk, number}};
use std::{borrow::Cow, fs, path::PathBuf};

fn protected_model() -> Vec<u8> {
    let mut bytes = b"MDB3".to_vec(); bytes.push(22); bytes.extend_from_slice(&(800u32 ^ 0x34968729).to_le_bytes());
    bytes.push(11); bytes.extend_from_slice(&4u32.to_le_bytes()); bytes.extend_from_slice(b"test"); bytes.extend_from_slice(&[0; 32]);
    bytes
}

#[test]
fn converts_model_header_and_keeps_ordinary_resources_borrowed() {
    let bytes = protected_model(); let original = bytes.clone();
    let converted = convert(&bytes).unwrap();
    assert!(converted.starts_with(b"MDLX")); assert_eq!(bytes, original);
    let mut expected = b"MDLX".to_vec(); chunk(&mut expected, b"VERS", &800u32.to_le_bytes()).unwrap();
    let mut model = b"test".to_vec(); model.resize(372, 0); chunk(&mut expected, b"MODL", &model).unwrap();
    assert_eq!(converted.as_ref(), expected);
    assert!(matches!(convert(&expected).unwrap(), Cow::Borrowed(_)));
}

#[test]
fn rejects_every_truncated_header_and_unsupported_version_without_panicking() {
    let bytes = protected_model();
    for end in 4..bytes.len() { assert!(convert(&bytes[..end]).is_err(), "accepted {end}"); }
    let mut invalid = bytes.clone(); invalid[5..9].copy_from_slice(&(900u32 ^ 0x34968729).to_le_bytes()); assert!(convert(&invalid).is_err());
    invalid = bytes.clone(); invalid.extend_from_slice(&[7, 255, 255, 255, 255]); assert!(convert(&invalid).is_err());
    invalid = bytes; invalid.extend_from_slice(&[2, 4, 0, 0, 0, 0, 0, 0, 0]); assert!(convert(&invalid).is_err());
}

fn encode_texture(bytes: &[u8]) -> Vec<u8> {
    let mut output = b"BLX1".to_vec(); let mut key = bytes.len() as u32 ^ 0x24125689; let mut previous = 0;
    for word in bytes[4..].chunks(4) {
        let mut padded = [0; 4]; padded[..word.len()].copy_from_slice(word); let plain = u32::from_le_bytes(padded);
        output.extend_from_slice(&(plain ^ previous ^ key).to_le_bytes()[..word.len()]); previous = plain; key = key.rotate_left(2);
    }
    output
}

#[test]
fn decodes_texture_feedback_and_partial_final_word_with_bounded_mipmaps() {
    let mut blp = vec![0u8; 1181]; blp[..4].copy_from_slice(b"BLP1");
    for (offset, value) in [(4,1u32),(12,1),(16,1),(28,1180),(92,1)] { blp[offset..offset+4].copy_from_slice(&value.to_le_bytes()); }
    blp[1180] = 19;
    assert_eq!(convert(&encode_texture(&blp)).unwrap().as_ref(), blp);
    blp[28..32].copy_from_slice(&u32::MAX.to_le_bytes()); assert!(convert(&encode_texture(&blp)).is_err());
    for size in [4,6,155] { let mut bytes = b"BLX1".to_vec(); bytes.resize(size,0); assert!(convert(&bytes).is_err()); }
}

#[test]
#[ignore = "requires the original codec reference fixture in BOX_CODEC_FIXTURE_DIR"]
fn converts_all_actual_map_models_and_textures() {
    let root = PathBuf::from(std::env::var_os("BOX_CODEC_FIXTURE_DIR").expect("set BOX_CODEC_FIXTURE_DIR"));
    let inventory: serde_json::Value = serde_json::from_slice(&fs::read(root.join("source-inventory/inventory.json")).expect("实际特殊地图样本必须在场")).unwrap();
    let archive = crate::model_viewer::storm::Archive::open(&root.join("final-native/maps/source.w3x")).unwrap();
    let output = root.join("converted-native"); fs::create_dir_all(&output).unwrap();
    let mut models = 0; let mut textures = 0;
    for entry in inventory["entries"].as_array().unwrap() {
        let kind = entry["kind"].as_str().unwrap_or("");
        if !matches!(kind, "mdb3" | "blx1") { continue; }
        let block = entry["block"].as_u64().unwrap(); let raw = format!("File{block:08}.xxx");
        let bytes = archive.read(&raw).unwrap(); let original = bytes.clone();
        let converted = convert(&bytes).unwrap_or_else(|error| panic!("{block}: {error}"));
        assert_eq!(bytes, original);
        let extension = if kind == "mdb3" { models += 1; assert!(converted.starts_with(b"MDLX")); "mdx" } else { textures += 1; assert!(converted.starts_with(b"BLP1")); "blp" };
        fs::write(output.join(format!("{block}.{extension}")), converted).unwrap();
    }
    assert_eq!((models,textures), (155,1485));
}

#[test]
fn malformed_nested_record_and_expansion_are_bounded() {
    let mut bytes = protected_model(); bytes.push(7); number(&mut bytes, 4).unwrap(); number(&mut bytes, u32::MAX).unwrap(); assert!(convert(&bytes).is_err());
    let mut reader = super::reader::Reader::new(&[]);
    assert!(reader.take(usize::MAX).is_err());
    let mut output = Vec::new(); assert!(reader.string(256,256).is_err());
    assert!(super::reader::append(&mut output, b"ok").is_ok());
}

#[test]
#[ignore = "requires the original codec reference fixture in BOX_CODEC_FIXTURE_DIR"]
fn actual_map_export_converts_models_and_discovered_texture_dependencies() {
    use std::sync::atomic::AtomicBool;
    let root = PathBuf::from(std::env::var_os("BOX_CODEC_FIXTURE_DIR").expect("set BOX_CODEC_FIXTURE_DIR"));
    let map = root.join("final-native/maps/source.w3x"); let original = fs::read(&map).unwrap();
    let source = crate::model_viewer::index::scan(map.to_string_lossy().into(), "codec-export".into(), &AtomicBool::new(false)).unwrap();
    let items = source.entries.iter().filter(|entry| entry.model).map(|entry| crate::model_viewer::export::Item {
        source_id: source.id.clone(), path: entry.path.clone(), output: entry.path.clone(), dependency: false, rename_textures: false,
    }).collect();
    let directory = root.join(format!("codec-export-{}", uuid::Uuid::new_v4()));
    let result = crate::model_viewer::export::run(vec![source], items, directory.to_string_lossy().into(), true, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(result.models, 173); assert!(result.failed.is_empty(), "{}", serde_json::to_string(&result).unwrap());
    assert!(result.textures > 100); assert_eq!(fs::read(map).unwrap(), original);
    fs::write(root.join("codec-export-result.json"), serde_json::to_vec_pretty(&serde_json::json!({"directory":directory,"result":result})).unwrap()).unwrap();
}
