//! Disk map text only. Native object memory and all new writes remain UTF-8.
pub fn decode(bytes: &[u8]) -> Result<String, String> {
    if let Ok(text) = std::str::from_utf8(bytes) { return Ok(text.to_owned()); }
    if bytes.starts_with(b"\xef\xbb\xbf") { return Err("带 UTF-8 标记的地图文本编码无效".into()); }
    #[cfg(windows)] {
        // Legacy Chinese WE writes CP936. Never use the machine's current ACP,
        // replacement characters or best-fit mappings to guess damaged bytes.
        use windows_sys::Win32::Globalization::*;
        let length = i32::try_from(bytes.len()).map_err(|_| "地图文本过长")?;
        let mut wide = vec![0u16; bytes.len()];
        let n = unsafe { MultiByteToWideChar(936, MB_ERR_INVALID_CHARS, bytes.as_ptr(), length,
            wide.as_mut_ptr(), length) };
        if n > 0 {
            wide.truncate(n as usize);
            let mut restored = vec![0u8; bytes.len()]; let mut substituted = 0;
            let count = unsafe { WideCharToMultiByte(936, WC_NO_BEST_FIT_CHARS, wide.as_ptr(), n,
                restored.as_mut_ptr(), length, std::ptr::null(), &mut substituted) };
            if count == length && substituted == 0 && restored == bytes {
                return String::from_utf16(&wide).map_err(|_| "旧地图文本包含无效字符".into());
            }
        }
    }
    Err("地图文本不是有效 UTF-8 或可无损读取的旧版 GBK 编码".into())
}

#[cfg(all(test,windows))] mod tests {
    use super::*;
    #[test] fn legacy_text_is_strict_and_new_utf8_stays_unchanged() {
        for text in ["", "ASCII", "中文繁體髙😀", "\u{feff}STRING 0\n{\n中文\n}\n"] {
            assert_eq!(decode(text.as_bytes()).unwrap(),text);
        }
        assert_eq!(decode(&[0xd6,0xd0,0xce,0xc4]).unwrap(),"中文");
        for bytes in [vec![0x81], vec![0xff], vec![0xef,0xbb,0xbf,0x81]] { assert!(decode(&bytes).is_err()); }
    }
}
