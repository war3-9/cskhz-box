use super::storm::Archive;
use std::{fs::File, io::Read, path::Path};
#[link(name = "kernel32")]
extern "system" { fn MultiByteToWideChar(code_page: u32, flags: u32, bytes: *const u8, length: i32, wide: *mut u16, count: i32) -> i32; }
fn text(bytes: &[u8]) -> String {
    if let Ok(value) = std::str::from_utf8(bytes) { return value.trim_start_matches('\u{feff}').into(); }
    let mut wide = vec![0u16; bytes.len()];
    let count = unsafe { MultiByteToWideChar(936, 0, bytes.as_ptr(), bytes.len() as i32, wide.as_mut_ptr(), wide.len() as i32) };
    if count > 0 { String::from_utf16_lossy(&wide[..count as usize]) } else { String::from_utf8_lossy(bytes).into() }
}
fn string(bytes: &[u8], offset: usize) -> Option<String> {
    let value = bytes.get(offset..)?; let end = value.iter().position(|b| *b == 0)?;
    (end <= 8192).then(|| text(&value[..end]))
}
fn w3i_name(bytes: &[u8]) -> Option<String> {
    let version = u32::from_le_bytes(bytes.get(..4)?.try_into().ok()?);
    let offset = match version { 18 | 25 | 26 | 27 => 12, 28..=32 => 28, _ => return None };
    string(bytes, offset)
}
fn resolve(value: String, wts: &[u8]) -> Option<String> {
    let Some(id) = value.trim().strip_prefix("TRIGSTR_").and_then(|id| id.parse::<u32>().ok()) else { return Some(value); };
    let table = text(wts); let mut rest = table.as_str();
    while let Some(start) = rest.find("STRING") {
        rest = &rest[start + 6..]; let opening = rest.find('{')?; let key = rest[..opening].trim().parse::<u32>().ok();
        rest = &rest[opening + 1..]; let closing = rest.find('}')?;
        if key == Some(id) { return Some(rest[..closing].trim_matches(['\r', '\n']).trim().into()); }
        rest = &rest[closing + 1..];
    } None
}
fn clean(value: &str) -> Option<String> {
    let mut result = String::new(); let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '|' {
            if chars.peek() == Some(&'r') { chars.next(); continue; }
            if chars.peek() == Some(&'c') { let mut probe = chars.clone(); probe.next(); if (0..8).all(|_| probe.next().is_some_and(|c| c.is_ascii_hexdigit())) { chars = probe; continue; } }
        }
        if !c.is_control() { result.push(c); }
    }
    let result = result.trim(); (!result.is_empty() && !result.starts_with("TRIGSTR_")).then(|| result.chars().take(512).collect())
}
pub fn name(path: &Path, archive: &Archive) -> Option<String> {
    let wts = archive.prefix_limit(b"war3map.wts", 4 * 1024 * 1024).unwrap_or_default();
    let info = archive.prefix_limit(b"war3map.w3i", 8192).ok().and_then(|bytes| w3i_name(&bytes));
    if let Some(value) = info.and_then(|value| resolve(value, &wts)).and_then(|value| clean(&value)) { return Some(value); }
    let mut header = vec![]; File::open(path).ok()?.take(8192).read_to_end(&mut header).ok()?;
    if !header.starts_with(b"HM3W") { return None; }
    string(&header, 8).and_then(|value| resolve(value, &wts)).and_then(|value| clean(&value))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn classic_and_reforged_offsets() { for (version, offset) in [(18u32, 12), (25, 12), (28, 28), (31, 28)] { let mut bytes = vec![0; offset]; bytes[..4].copy_from_slice(&version.to_le_bytes()); bytes.extend_from_slice(b"TRIGSTR_001\0"); assert_eq!(w3i_name(&bytes).as_deref(), Some("TRIGSTR_001")); } assert!(w3i_name(&[25, 0]).is_none()); }
    #[test] fn localized_name_and_colors() { assert_eq!(clean(&resolve("TRIGSTR_007".into(), "STRING 7\n{\n|cffff0000天命西游|r\n}".as_bytes()).unwrap()).as_deref(), Some("天命西游")); assert!(resolve("TRIGSTR_42".into(), b"STRING 1\n{\nTest\n}").is_none()); assert_eq!(clean("|cffzzzzzzTest").as_deref(), Some("|cffzzzzzzTest")); assert_eq!(text(&[0xb5, 0xd8, 0xcd, 0xbc]), "地图"); }
}
