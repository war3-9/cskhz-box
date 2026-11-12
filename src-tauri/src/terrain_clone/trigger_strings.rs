use std::collections::BTreeMap;

pub(super) fn parse(bytes: &[u8]) -> Result<BTreeMap<u32, Vec<u8>>, String> {
    let mut strings = BTreeMap::new();
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    let mut lines = bytes.split(|byte| *byte == b'\n');
    while let Some(line) = lines.next() {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let Some(id) = line.strip_prefix(b"STRING ") else { continue; };
        let id: u32 = std::str::from_utf8(id).ok().and_then(|s| s.trim().parse().ok()).ok_or("WTS 字符串编号无效")?;
        while let Some(line) = lines.next() { if line.strip_suffix(b"\r").unwrap_or(line) == b"{" { break; } }
        let mut value = vec![]; let mut ended = false; let mut first = true;
        for line in lines.by_ref() {
            let line = line.strip_suffix(b"\r").unwrap_or(line);
            if line == b"}" { ended = true; break; }
            if !first { value.extend_from_slice(b"\r\n"); }
            first = false;
            value.extend_from_slice(line);
        }
        if !ended { return Err("WTS 字符串内容未闭合".into()); }
        strings.insert(id, value);
    }
    Ok(strings)
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn preserves_multiline_bytes() { assert_eq!(parse(b"STRING 12\r\n{\r\nhello\r\nworld\r\n}\r\n").unwrap()[&12], b"hello\r\nworld"); assert!(parse(b"STRING 3\n{\nbad").is_err()); }
    #[test] fn reads_zero_after_utf8_bom_and_preserves_leading_empty_lines() {
        let strings = parse(b"\xef\xbb\xbfSTRING 0\r\n// object field\r\n{\r\n\r\nhello\r\n\r\n}\r\nSTRING 1\n{\n}\n").unwrap();
        assert_eq!(strings[&0], b"\r\nhello\r\n");
        assert!(strings[&1].is_empty());
    }
}
