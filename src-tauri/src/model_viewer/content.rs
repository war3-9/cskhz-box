pub(crate) fn has_hm3w_external_payload(prefix: &[u8], total_len: u64) -> bool {
    const MPQ_OFFSET: usize = 0x800;
    const HEADER_END: usize = MPQ_OFFSET + 32;
    if prefix.len() < HEADER_END || &prefix[..4] != b"HM3W" || &prefix[MPQ_OFFSET..MPQ_OFFSET + 4] != b"MPQ\x1a" {
        return false;
    }
    let archive_size = u32::from_le_bytes(prefix[MPQ_OFFSET + 8..MPQ_OFFSET + 12].try_into().unwrap()) as u64;
    let archive_end = MPQ_OFFSET as u64 + archive_size;
    archive_size >= 32 && archive_end <= total_len && total_len - archive_end > 1024 * 1024
}

// Identify resources by content even when protected maps omit their filenames.
pub(crate) fn extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"JRP1") {
        return match bytes.get(8..12) {
            Some([1, 0, 0, 0]) => Some("mdx"),
            Some([2, 0, 0, 0]) => Some("blp"),
            Some([3, 0, 0, 0]) => Some("tga"),
            _ => None,
        };
    }
    if [b"MDLX".as_slice(), b"MDB3", b"MHAC", b"MHEC"].iter().any(|magic| bytes.starts_with(magic)) { return Some("mdx"); }
    if [b"BLP1".as_slice(), b"BLP2", b"BLX1", b"MHEB"].iter().any(|magic| bytes.starts_with(magic)) { return Some("blp"); }
    for (magic, extension) in [(b"DDS ".as_slice(), "dds"), (b"\x89PNG\r\n\x1a\n", "png"), (b"\xff\xd8\xff", "jpg"), (b"OggS", "ogg"), (b"fLaC", "flac"), (b"ID3", "mp3")] {
        if bytes.starts_with(magic) { return Some(extension); }
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") { return Some("wav"); }
    let text = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    if String::from_utf8_lossy(text).trim_start().starts_with("Version") { return Some("mdl"); }
    if bytes.len() >= 18 && matches!(bytes[1], 0 | 1) && matches!(bytes[2], 1 | 2 | 3 | 9 | 10 | 11)
        && u16::from_le_bytes([bytes[12], bytes[13]]) > 0 && u16::from_le_bytes([bytes[14], bytes[15]]) > 0
        && matches!(bytes[16], 8 | 16 | 24 | 32) && bytes[17] & 0xc0 == 0 { return Some("tga"); }
    None
}

pub(crate) fn protected_format(bytes: &[u8]) -> Option<&'static str> {
    for (magic, name) in [(b"MDB3", "MDB3"), (b"BLX1", "BLX1"), (b"MHAC", "MHAC"), (b"MHEB", "MHEB"), (b"MHEC", "MHEC"), (b"JRP1", "JRP1")] {
        if bytes.starts_with(magic) { return Some(name); }
    }
    None
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn detects_hm3w_only_when_mpq_has_a_large_external_tail() {
        let mut prefix = vec![0; 0x820];
        prefix[..4].copy_from_slice(b"HM3W");
        prefix[0x800..0x804].copy_from_slice(b"MPQ\x1a");
        prefix[0x808..0x80c].copy_from_slice(&4096u32.to_le_bytes());
        assert!(has_hm3w_external_payload(&prefix, 0x820 + 2 * 1024 * 1024));
        assert!(!has_hm3w_external_payload(&prefix, 0x820 + 4096));
        prefix[..4].copy_from_slice(b"W3X!");
        assert!(!has_hm3w_external_payload(&prefix, 0x820 + 2 * 1024 * 1024));
    }
    #[test] fn recognizes_protected_resources_and_text_models() {
        assert_eq!(extension(b"MDB3\x16\x09\x84\x96"), Some("mdx"));
        assert_eq!(extension(b"BLX1\xcd\x44"), Some("blp"));
        assert_eq!(extension(b"MHAC\x01\0\0\0"), Some("mdx"));
        assert_eq!(extension(b"MHEB\x01\0\0\0"), Some("blp"));
        assert_eq!(protected_format(b"MHAC"), Some("MHAC"));
        assert_eq!(protected_format(b"MHEB"), Some("MHEB"));
        assert_eq!(extension(b"MHEC\x01\0\0\0"), Some("mdx"));
        assert_eq!(protected_format(b"MHEC"), Some("MHEC"));
        assert_eq!(extension(b"JRP1\x01\0\xa0\0\x01\0\0\0"), Some("mdx"));
        assert_eq!(extension(b"JRP1\x01\0\xa0\0\x02\0\0\0"), Some("blp"));
        assert_eq!(extension(b"JRP1\x01\0\xa0\0\x03\0\0\0"), Some("tga"));
        assert_eq!(extension(b"JRP1\x01\0\xa0\0\xff\0\0\0"), None);
        assert_eq!(protected_format(b"JRP1"), Some("JRP1"));
        assert_eq!(extension(b"\xef\xbb\xbf\r\n Version {"), Some("mdl"));
        assert_eq!(extension(b"RIFFxxxxWAVE"), Some("wav"));
        // MP3W is Warcraft pathing data, not an MPEG audio header.
        assert_eq!(extension(b"MP3W\0\0\0\0\x10\0\0\0\x10\0\0\0"), None);
        assert_eq!(extension(b"RIFFxxxxAVI "), None);
        assert_eq!(extension(b"BLX"), None);
    }
    #[test] fn anonymous_tga_requires_a_valid_header() {
        let mut header = [0; 18]; header[2] = 2; header[12] = 64; header[14] = 64; header[16] = 32;
        assert_eq!(extension(&header), Some("tga"));
        header[14] = 0; assert_eq!(extension(&header), None);
    }
}
