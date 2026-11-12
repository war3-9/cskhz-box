use super::*;
use sha2::Digest;

const MODEL: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/jrp1/model.jrp"));
const TEXTURE: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/jrp1/texture.jrp"));
const IMAGE: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/jrp1/image.jrp"));
const PALETTE: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/jrp1/palette.jrp"));
const PADDING: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/jrp1/padding.jrp"));

#[test]
fn authenticated_real_resources_match_independent_decoder() {
    for (bytes, magic, expected) in [
        (MODEL, b"MDLX".as_slice(), "8da476af179690779a64f15e98cbd67561478f7a13ab51239a45e8415b1baf16"),
        (TEXTURE, b"BLP1", "6feb95803227fcfc33258aac9973d75bd52bf580683859cc818fc45489418a88"),
        (IMAGE, &[0, 0, 2, 0], "9db031a01964b5e45c87b420032e096baee862882aa9ef69d4274fc23fdbfe35"),
        // Independently executed x86 decoder confirms overlapping mip writes.
        (PALETTE, b"BLP1", "c4ce421078419293f1b8d9673ace55ffb431a5e08ecc93bdf4f4064dba08631b"),
        (PADDING, b"BLP1", "df5b97781421c3c45f5081768fb3b86aefca52ecd4efc010e77e0be41bb02c3f"),
    ] {
        let original = bytes.to_vec();
        let decoded = decode(bytes).unwrap();
        assert!(decoded.starts_with(magic));
        assert_eq!(format!("{:x}", Sha256::digest(&decoded)), expected);
        assert_eq!(bytes, original);
        assert_eq!(crate::model_viewer::codec::convert(bytes).unwrap().as_ref(), decoded);
    }
}

#[test]
fn header_index_and_each_segment_require_authentication() {
    for at in [8, 16, 32, 48, 60, 92, 108, 124, 160, MODEL.len() - 1] {
        let mut damaged = MODEL.to_vec(); damaged[at] ^= 1;
        assert!(decode(&damaged).is_err(), "tampering at {at} was accepted");
    }
    for n in [0, 4, 48, 159, 160, MODEL.len() - 1] { assert!(decode(&MODEL[..n]).is_err()); }
    let mut trailing = MODEL.to_vec(); trailing.push(0); assert!(decode(&trailing).is_err());
}

fn change_index(bytes: &[u8], modify: impl FnOnce(&mut [u8])) -> Vec<u8> {
    let mut out = bytes.to_vec();
    let wrapping = derive(&ROOT, bytes, b"JRP1/key-envelope/v1", &[]).unwrap();
    let content = decrypt(&wrapping, &bytes[48..60], &bytes[60..92], &bytes[92..108], &bytes[..48]).unwrap();
    let key = derive(&content, bytes, b"JRP1/index/v1", &[]).unwrap();
    let n = u32_at(bytes, 120).unwrap() as usize;
    let aad = [&bytes[..124], &bytes[140..160]].concat();
    let mut index = decrypt(&key, &bytes[108..120], &bytes[160..160+n], &bytes[124..140], &aad).unwrap();
    modify(&mut index);
    let cipher = Aes256Gcm::new_from_slice(&key).unwrap().encrypt(Nonce::from_slice(&bytes[108..120]), Payload { msg: &index, aad: &aad }).unwrap();
    out[160..160+n].copy_from_slice(&cipher[..n]); out[124..140].copy_from_slice(&cipher[n..]); out
}

#[test]
fn authenticated_malformed_indexes_are_bounded_and_rejected() {
    assert!(decode(&change_index(MODEL, |index| index[10..18].copy_from_slice(&u64::MAX.to_le_bytes()))).is_err());
    assert!(decode(&change_index(MODEL, |index| index[22..26].copy_from_slice(&u32::MAX.to_le_bytes()))).is_err());
    assert!(decode(&change_index(MODEL, |index| index[26] = 71)).is_err());
    assert!(decode(&change_index(MODEL, |index| index[30+28..30+36].copy_from_slice(&u64::MAX.to_le_bytes()))).is_err());
    assert!(decode(&change_index(MODEL, |index| index[30+12] = 2)).is_err());
}

#[test]
fn bounded_zstd_rejects_trailing_frames_and_wrong_sizes() {
    let packed = zstd::encode_all(b"example".as_slice(), 1).unwrap();
    assert_eq!(decompress(&packed, 7).unwrap(), b"example");
    assert!(decompress(&packed, 6).is_err());
    assert!(decompress(&[packed, vec![0]].concat(), 7).is_err());
}
