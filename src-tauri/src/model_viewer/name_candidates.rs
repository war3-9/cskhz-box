use std::{collections::BTreeSet, fs, path::Path};
pub fn beside_archive(path: &Path) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    if let Some(parent) = path.parent() {
        for list in [parent.join("listfile.txt"), path.with_extension("listfile.txt")] {
            if let Ok(metadata) = fs::metadata(&list) { if metadata.len() <= 16 * 1024 * 1024 { if let Ok(text) = fs::read_to_string(list) { names.extend(text.lines().map(str::trim).filter(|name| !name.is_empty()).map(String::from)); } } }
        }
        if let Ok(items) = fs::read_dir(parent) {
            for item in items.flatten() {
                let name = item.file_name().to_string_lossy().into_owned();
                if [".mdx", ".mdl", ".blp", ".tga", ".dds"].iter().any(|ext| name.to_ascii_lowercase().ends_with(ext)) {
                    names.insert(name.clone()); names.insert(format!("war3mapImported\\{name}"));
                }
            }
        }
    }
    names
}
pub fn related_models(name: &str) -> Vec<String> {
    let mut candidates = vec![name.to_owned(), name.rsplit(['/', '\\']).next().unwrap_or(name).to_owned()];
    for path in candidates.clone() { if let Some((stem, _)) = path.rsplit_once('.') {
        candidates.extend([format!("{stem}.mdx"), format!("{stem}.mdl")]);
    } }
    candidates.extend(candidates.clone().into_iter().filter(|name| !name.contains(['/', '\\'])).map(|name| format!("war3mapImported\\{name}")));
    candidates.sort(); candidates.dedup();
    candidates
}
pub fn internal_name(bytes: &[u8]) -> Option<String> {
    if !bytes.starts_with(b"MDLX") { return None; }
    let mut offset = 4;
    while offset + 8 <= bytes.len() {
        let length = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().ok()?) as usize;
        let end = (offset + 8).checked_add(length).filter(|end| *end <= bytes.len())?;
        if &bytes[offset..offset + 4] == b"MODL" && length >= 80 {
            let name = &bytes[offset + 8..offset + 88]; let end = name.iter().position(|byte| *byte == 0).unwrap_or(80);
            let name = std::str::from_utf8(&name[..end]).ok()?.trim();
            return (!name.is_empty() && !name.contains([':', '\\', '/', '\0']) && !name.chars().any(char::is_control)).then(|| format!("{name}.mdx"));
        }
        offset = end;
    }
    None
}
pub fn remember(names: &mut std::collections::HashMap<u32, String>, block: u32, name: String) {
    names.entry(block).and_modify(|old| {
        let rank = |value: &str| (!value.to_ascii_lowercase().ends_with(".mdx"), value.replace('\\', "/").to_ascii_lowercase(), value.to_owned());
        if rank(&name) < rank(old) { *old = name.clone(); }
    }).or_insert(name);
}
pub fn anonymous_model(name: &str) -> String {
    let Some((stem, extension)) = name.rsplit_once('.') else { return name.into(); };
    if !["mdx", "mdl"].contains(&extension.to_ascii_lowercase().as_str()) { return name.into(); }
    stem.strip_prefix("File").and_then(|digits| digits.parse::<u32>().ok()).map_or_else(|| name.into(), |index| format!("file_{index:06}.{extension}"))
}
