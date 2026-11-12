const EXTENSIONS: [&[u8]; 6] = [b".mdx", b".mdl", b".blp", b".tga", b".dds", b".png"];
fn delimiter(byte: u8) -> bool { byte.is_ascii_control() || b"\"'<>=,;()".contains(&byte) }

// Most binary fields cannot contain a resource path. Decode only tokens with a path suffix.
pub fn references(bytes: &[u8]) -> Vec<String> {
    references_with_cancel(bytes, &std::sync::atomic::AtomicBool::new(false)).unwrap_or_default()
}
pub fn references_with_cancel(bytes: &[u8], cancel: &std::sync::atomic::AtomicBool) -> Result<Vec<String>, String> {
    let mut names = vec![]; let mut start = 0; let mut offset = 0;
    while offset <= bytes.len() {
        if offset % (1024 * 1024) == 0 && cancel.load(std::sync::atomic::Ordering::Relaxed) { return Err("扫描已取消".into()); }
        let unicode_control = bytes.get(offset) == Some(&0xc2) && bytes.get(offset + 1).is_some_and(|b| (0x80..=0x9f).contains(b));
        if offset == bytes.len() || delimiter(bytes[offset]) || unicode_control {
            let token = &bytes[start..offset];
            let mut end = token.len();
            while end > 0 && token[end - 1].is_ascii_whitespace() { end -= 1; }
            let suffix = &token[..end];
            // Unicode whitespace is uncommon in binary files; retain the text path behavior.
            let unicode_tail = suffix.last().is_some_and(|b| *b >= 0x80) && suffix.contains(&b'.');
            if EXTENSIONS.iter().any(|ext| suffix.len() >= ext.len() && suffix[suffix.len() - ext.len()..].eq_ignore_ascii_case(ext)) || unicode_tail {
                let name = String::from_utf8_lossy(token).trim().replace("\\\\", "\\");
                if name.len() < 1024 && EXTENSIONS.iter().any(|ext| name.as_bytes().len() >= ext.len() && name.as_bytes()[name.len() - ext.len()..].eq_ignore_ascii_case(ext)) { names.push(name); }
            }
            offset += if unicode_control { 2 } else { 1 }; start = offset;
        } else { offset += 1; }
    }
    // Quoted object-table paths can contain parentheses; retain their complete filename.
    if cancel.load(std::sync::atomic::Ordering::Relaxed) { return Err("扫描已取消".into()); }
    for (index, token) in bytes.split(|byte| *byte == b'"').skip(1).step_by(2).enumerate() {
        if index % 1024 == 0 && cancel.load(std::sync::atomic::Ordering::Relaxed) { return Err("扫描已取消".into()); }
        if token.len() < 1024 && EXTENSIONS.iter().any(|ext| token.len() >= ext.len() && token[token.len() - ext.len()..].eq_ignore_ascii_case(ext)) {
            names.push(String::from_utf8_lossy(token).trim().replace("\\\\", "\\"));
        }
    }
    let mut seen = std::collections::HashSet::new(); names.retain(|name| seen.insert(name.to_ascii_lowercase()));
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn paths_survive_binary_and_unicode_boundaries() {
        let bytes = b"\xff\x00 war3mapImported\\\\Unit.MDX \x00\xff\x01Textures\\skin.BLP\"bad.exe\x00";
        assert_eq!(references(bytes), ["war3mapImported\\Unit.MDX", "Textures\\skin.BLP"]);
        assert_eq!(references("noise\u{85}模型\\单位.mdl\u{3000}\0".as_bytes()), ["模型\\单位.mdl"]);
        assert!(references(&vec![255; 1024 * 1024]).is_empty());
        assert!(references(b"C;X5;K\"war3mapImported\\huasaoshumu (1).mdl\"").contains(&"war3mapImported\\huasaoshumu (1).mdl".into()));
    }
    #[test] fn resource_tokens_match_the_previous_parser() {
        fn previous(bytes: &[u8]) -> Vec<String> {
            String::from_utf8_lossy(bytes).split(|c: char| c.is_control() || matches!(c, '"' | '\'' | '<' | '>' | '=' | ',' | ';' | '(' | ')'))
                .map(|s| s.trim().replace("\\\\", "\\"))
                .filter(|s| s.len() < 1024 && EXTENSIONS.iter().any(|e| s.as_bytes().len() >= e.len() && s.as_bytes()[s.len() - e.len()..].eq_ignore_ascii_case(e))).collect()
        }
        for separator in ["\0", "\u{85}", ";", "=", "\"", "\n"] {
            for name in ["Textures\\skin.BLP", "模型\\单位.mdl\u{3000}", " prefix.mdx.extra", " x.dds", "Models\\\\a.mdx", "noise.mdx noise.blp"] {
                let bytes = format!("\u{fffd}{separator}{name}{separator}bad.exe");
                let mut expected = previous(bytes.as_bytes()); expected.dedup(); assert_eq!(references(bytes.as_bytes()), expected);
            }
        }
    }
    #[test] fn cancellable_reference_scan_stops_before_parsing() {
        let cancel = std::sync::atomic::AtomicBool::new(true);
        assert_eq!(references_with_cancel(b"Textures\\skin.blp", &cancel).unwrap_err(), "扫描已取消");
    }
}
