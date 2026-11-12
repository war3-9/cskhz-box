//! Lossless four-byte IDs. Printable ASCII stays unchanged; other IDs use byte-order hex.
pub fn from_bytes(bytes: [u8; 4]) -> String {
    if bytes.iter().all(|b| (0x21..=0x7e).contains(b)) {
        String::from_utf8(bytes.to_vec()).unwrap()
    } else {
        format!("0x{:02X}{:02X}{:02X}{:02X}", bytes[0], bytes[1], bytes[2], bytes[3])
    }
}
pub fn to_bytes(id: &str) -> Option<[u8; 4]> {
    if id.len() == 4 && id.bytes().all(|b| (0x21..=0x7e).contains(&b)) {
        return id.as_bytes().try_into().ok();
    }
    let hex = id.strip_prefix("0x")?;
    if hex.len() != 8 || !hex.bytes().all(|b| b.is_ascii_digit() || (b'A'..=b'F').contains(&b)) { return None; }
    let mut bytes = [0; 4];
    for (index, byte) in bytes.iter_mut().enumerate() { *byte = u8::from_str_radix(&hex[index*2..index*2+2], 16).ok()?; }
    // One spelling per ID keeps dictionary keys, conflict detection and undo consistent.
    (from_bytes(bytes) == id).then_some(bytes)
}
pub fn valid(id: &str) -> bool { to_bytes(id).is_some_and(|bytes| bytes != [0; 4]) }

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn every_byte_roundtrips_without_utf8_or_codepage_conversion() {
        for byte in 0..=255 {
            for index in 0..4 {
                let mut bytes = *b"A001"; bytes[index] = byte;
                assert_eq!(to_bytes(&from_bytes(bytes)), Some(bytes));
            }
        }
        assert_eq!(from_bytes([0xc4,0xe3,0xba,0xc3]), "0xC4E3BAC3");
        assert_eq!(to_bytes("0x41483031"), None); // ASCII AH01 has its original spelling.
        for invalid in ["0xc4E3BAC3", "0xC4E3BAC", "中文", "A00", "A0001"] { assert_eq!(to_bytes(invalid), None); }
        assert!(!valid("0x00000000"));
    }
}
