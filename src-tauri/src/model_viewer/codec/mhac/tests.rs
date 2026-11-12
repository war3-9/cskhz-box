use super::*;
use rsa::{pkcs8::DecodePrivateKey, rand_core::OsRng, RsaPublicKey};

fn variant_envelope(key: &[u8; 48], mhec: bool) -> Vec<u8> {
    let der = if mhec { include_bytes!("../mhec-v1.der").as_slice() } else { include_bytes!("../mhac-v1.der").as_slice() };
    let private = RsaPrivateKey::from_pkcs8_der(der).unwrap();
    RsaPublicKey::from(&private).encrypt(&mut OsRng, Pkcs1v15Encrypt, base64::engine::general_purpose::STANDARD.encode(key).as_bytes()).unwrap()
}
fn envelope(key: &[u8; 48]) -> Vec<u8> { variant_envelope(key, false) }
fn fixture(sections: &[(usize, &[u8])], key: &[u8; 48]) -> Vec<u8> {
    let mut bits = sections.len() as u128; let mut flags = 0u32;
    for (i, (id, _)) in sections.iter().enumerate() { bits |= (*id as u128) << (5 + 5 * i); if *id != 0 { flags |= 1 << id; } }
    let mut output = b"MHAC\x01\0\0\0".to_vec(); output.extend(bits.to_le_bytes()); output.extend(flags.to_le_bytes()); output.extend(envelope(key));
    for (id, bytes) in sections {
        let data = if *id == 0 { bytes.to_vec() } else { zstd::stream::encode_all(*bytes, 1).unwrap() };
        let encrypted = decrypt(&data, key); output.extend((encrypted.len() as u32).to_le_bytes()); output.extend(encrypted);
    }
    output
}
#[test]
fn model_preserves_standard_sections_and_removes_only_runtime_version_metadata() {
    let key = [47; 48]; let version = [800u32.to_le_bytes().as_slice(), b"{\"target_map\":\"fixture\"}\0"].concat();
    let input = fixture(&[(0, &version), (1, &[0; 372]), (4, &[0; 268])], &key); let before = input.clone();
    let output = decode(&input).unwrap(); assert_eq!(input, before);
    let mut expected = b"MDLXVERS\x04\0\0\0".to_vec(); expected.extend(800u32.to_le_bytes());
    for (tag, data) in [(b"MODL", vec![0; 372]), (b"TEXS", vec![0; 268])] { expected.extend(tag); expected.extend((data.len() as u32).to_le_bytes()); expected.extend(data); }
    assert_eq!(output, expected);
}
#[test]
fn texture_restores_blp_header_and_checks_mip_bounds() {
    let key = [23; 48]; let mut blp = vec![0; 1182]; blp[..4].copy_from_slice(b"BLP1");
    for (offset, value) in [(4, 1u32), (8, 8), (12, 1), (16, 1), (20, 4), (24, 1), (28, 1180), (92, 2)] { blp[offset..offset + 4].copy_from_slice(&value.to_le_bytes()); }
    let wrap = |data: &[u8]| { let mut input = b"MHEB\x01\0\0\0".to_vec(); input.extend(envelope(&key)); input.extend(decrypt(&data[4..], &key)); input };
    assert_eq!(decode(&wrap(&blp)).unwrap(), blp);
    blp[28..32].copy_from_slice(&5000u32.to_le_bytes()); assert!(decode(&wrap(&blp)).unwrap_err().contains("mipmap"));
}
#[test]
fn rejects_wrong_versions_keys_invalid_sections_truncation_and_bombs() {
    for magic in [b"MHAC", b"MHEB", b"MHEC"] {
        for size in [4, 7, 8, 23, 24, 27, 28, 100, 263] { let mut bytes = magic.to_vec(); bytes.resize(size, 0); if size >= 8 { bytes[4] = 1; } assert!(decode(&bytes).is_err()); }
        let mut future = magic.to_vec(); future.extend(2u32.to_le_bytes()); assert!(decode(&future).unwrap_err().contains("版本"));
    }
    assert!(material(&[0; 256]).unwrap_err().contains("密钥"));
    let mut invalid = b"MHAC\x01\0\0\0".to_vec(); invalid.extend(0u128.to_le_bytes()); assert!(decode(&invalid).unwrap_err().contains("数量"));
    invalid[8..24].copy_from_slice(&(2u128 | 31 << 5).to_le_bytes()); assert!(decode(&invalid).unwrap_err().contains("标记"));
    let compressed = zstd::stream::encode_all(vec![0; 4096].as_slice(), 1).unwrap(); assert!(inflate(&compressed, 1024).unwrap_err().contains("上限"));
    let mut input = fixture(&[(0, &800u32.to_le_bytes()), (1, &[0; 372])], &[55; 48]);
    input.push(0); assert!(decode(&input).unwrap_err().contains("尾部"));
}

#[test]
fn mhec_uses_its_own_key_and_plain_version_section() {
    let key = [19; 48];
    let mut input = fixture(&[(0, &800u32.to_le_bytes()), (1, &[0; 372])], &key);
    input[..4].copy_from_slice(b"MHEC"); input[28..284].copy_from_slice(&variant_envelope(&key, true));
    input[288..292].copy_from_slice(&800u32.to_le_bytes());
    let output = decode(&input).unwrap();
    assert_eq!(&output[..16], b"MDLXVERS\x04\0\0\0\x20\x03\0\0");
    assert_eq!(&output[16..24], b"MODLt\x01\0\0"); assert_eq!(output.len(), 396);
    input[..4].copy_from_slice(b"MHAC"); assert!(decode(&input).is_err(), "keys must not silently cross formats");
}

#[test]
#[ignore = "requires the explicitly configured MHEC map; reads it without changing it"]
fn actual_mhec_map_all_models_and_textures() {
    use crate::model_viewer::{index, export, storm::Archive};
    use sha2::{Digest, Sha256};
    use std::{path::PathBuf, fs, sync::atomic::AtomicBool};
    let path = PathBuf::from(std::env::var_os("BOX_MHEC_TEST_MAP").expect("BOX_MHEC_TEST_MAP"));
    let directory = PathBuf::from(std::env::var_os("BOX_MHEC_TEST_OUTPUT").expect("BOX_MHEC_TEST_OUTPUT"));
    fs::create_dir_all(&directory).unwrap();
    let before = Sha256::digest(fs::read(&path).unwrap());
    let source = index::scan(path.to_string_lossy().into(), "mhec-native".into(), &AtomicBool::new(false)).unwrap();
    assert!(source.warning.as_ref().unwrap().contains("171 个 MHEC"));
    let archive = Archive::open(&path).unwrap();
    let mut models = 0; let mut ordinary = 0; let mut textures = std::collections::BTreeSet::new(); let mut missing = std::collections::BTreeSet::new();
    for entry in source.entries.iter().filter(|entry| entry.model) {
        let input = index::read(&source, &entry.path).unwrap();
        if input.starts_with(b"MHEC") { models += 1; } else { ordinary += 1; }
        let output = crate::model_viewer::codec::convert(&input).unwrap(); assert!(output.starts_with(b"MDLX"));
        let target = directory.join(entry.path.replace('\\', "/")); fs::create_dir_all(target.parent().unwrap()).unwrap(); fs::write(target, output.as_ref()).unwrap();
        for name in export::texture_paths(&output, &entry.path) {
            match archive.read(&name) {
                Ok(bytes) => { let bytes = crate::model_viewer::codec::convert(&bytes).unwrap(); let target = directory.join(name.replace('\\', "/")); assert!(!name.contains("..") && !name.contains(':')); fs::create_dir_all(target.parent().unwrap()).unwrap(); fs::write(target, bytes.as_ref()).unwrap(); textures.insert(name); }
                Err(_) => { missing.insert(name); }
            }
        }
    }
    assert_eq!(models, 171); assert_eq!(ordinary, 1);
    assert_eq!(before, Sha256::digest(fs::read(&path).unwrap()));
    if let Some(path) = std::env::var_os("BOX_MHEC_TEST_EVIDENCE") { fs::write(path, serde_json::to_vec_pretty(&serde_json::json!({ "source": source, "mhecModels": models, "ordinaryModels": ordinary, "textures": textures, "missingGameTextures": missing, "mapSha256": format!("{before:x}"), "mapUnchanged": true })).unwrap()).unwrap(); }
}

#[test]
#[ignore = "requires an explicitly configured real map; reads it without changing it"]
fn actual_map_native_scan_read_and_export() {
    use crate::model_viewer::{index, export, storm::Archive};
    use sha2::{Digest, Sha256};
    use std::{path::PathBuf, fs, sync::atomic::AtomicBool};
    let path = PathBuf::from(std::env::var_os("BOX_MHAC_TEST_MAP").expect("BOX_MHAC_TEST_MAP"));
    let directory = PathBuf::from(std::env::var_os("BOX_MHAC_TEST_OUTPUT").expect("BOX_MHAC_TEST_OUTPUT"));
    let before = Sha256::digest(fs::read(&path).unwrap());
    let source = index::scan(path.to_string_lossy().into(), "mhac-native".into(), &AtomicBool::new(false)).unwrap();
    let models: Vec<_> = source.entries.iter().filter(|entry| entry.model).collect();
    assert_eq!(models.len(), 1, "the embedded DLL must not be offered as a model");
    assert!(source.warning.as_ref().unwrap().contains("MHAC"));
    let model_path = models[0].path.clone();
    let original = index::read(&source, &model_path).unwrap(); assert!(original.starts_with(b"MHAC"));
    let decoded = crate::model_viewer::codec::convert(&original).unwrap();
    let references = export::texture_paths(&decoded, &model_path); assert_eq!(references.len(), 8);
    let progress = export::run(vec![source.clone()], vec![export::Item { source_id: source.id.clone(), path: model_path.clone(), output: "feiyin.mdx".into(), dependency: false, rename_textures: false }], directory.to_string_lossy().into(), true, &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(progress.models, 1); assert_eq!(progress.textures, 8); assert!(progress.failed.is_empty(), "{}", serde_json::to_string(&progress).unwrap()); assert!(progress.missing.is_empty());
    let archive = Archive::open(&path).unwrap();
    for name in references { let bytes = archive.read(&name).unwrap(); assert!(bytes.starts_with(b"MHEB")); let converted = crate::model_viewer::codec::convert(&bytes).unwrap(); assert!(converted.starts_with(b"BLP1")); assert_eq!(fs::read(directory.join(name.replace('\\', "/"))).unwrap(), converted.as_ref()); }
    assert_eq!(before, Sha256::digest(fs::read(&path).unwrap()));
    if let Some(path) = std::env::var_os("BOX_MHAC_TEST_EVIDENCE") { fs::write(path, serde_json::to_vec_pretty(&serde_json::json!({ "source": source, "export": progress, "mapUnchanged": true })).unwrap()).unwrap(); }
}
