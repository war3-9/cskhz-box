pub fn group(bytes: &[u8], path: &str) -> u8 {
    let path = path.to_ascii_lowercase().replace('\\', "/");
    if path.starts_with("units/") { return 0; }
    if path.starts_with("buildings/") { return 1; }
    if path.starts_with("doodads/") { return 2; }
    let mut names = vec![];
    if bytes.starts_with(b"MDLX") {
        let mut offset = 4usize;
        while offset + 8 <= bytes.len() {
            let length = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
            let Some(end) = offset.checked_add(8).and_then(|v| v.checked_add(length)).filter(|&v| v <= bytes.len()) else { break; };
            if &bytes[offset..offset + 4] == b"SEQS" {
                for sequence in bytes[offset + 8..end].chunks_exact(132) { names.push(String::from_utf8_lossy(&sequence[..80]).trim_end_matches('\0').to_ascii_lowercase()); }
                break;
            }
            offset = end;
        }
    } else {
        let text = String::from_utf8_lossy(bytes);
        for chunk in text.split("Anim \"").skip(1) { if let Some(name) = chunk.split('"').next() { names.push(name.to_ascii_lowercase()); } }
    }
    if names.iter().any(|name| name.starts_with("walk")) { 0 }
    else if names.iter().any(|name| name.starts_with("stand work") || name.starts_with("upgrade")) { 1 }
    else if names.iter().any(|name| name.starts_with("attack")) { 0 }
    else { 2 }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn units_buildings_and_decorations() {
        assert_eq!(group(b"Version {} Anim \"Walk Fast\" {}", "anonymous.mdl"), 0);
        assert_eq!(group(b"Version {} Anim \"Stand Work\" {}", "anonymous.mdl"), 1);
        assert_eq!(group(b"Version {} Anim \"Stand\" {}", "anonymous.mdl"), 2);
        assert_eq!(group(b"MDLX\0\0\0\0\xff\xff\xff\xff", "broken.mdx"), 2);
    }
}
