use std::collections::{HashMap, HashSet};

pub fn key(path: &str) -> String { path.replace('\\', "/").to_ascii_lowercase() }
struct Field { start: usize, end: usize, path: String, fixed: bool }
fn fields(bytes: &[u8], path: &str) -> Result<Vec<Field>, String> {
    if bytes.starts_with(b"MDLX") {
        let mut offset = 4;
        while offset + 8 <= bytes.len() {
            let length = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
            let end = (offset + 8).checked_add(length).filter(|end| *end <= bytes.len()).ok_or("模型数据块不完整，无法安全重命名贴图")?;
            if &bytes[offset..offset + 4] == b"TEXS" {
                if length % 268 != 0 { return Err("模型贴图列表损坏".into()); }
                return Ok((offset + 12..end).step_by(268).filter_map(|start| {
                    let name = &bytes[start..start + 260]; let size = name.iter().position(|b| *b == 0).unwrap_or(260);
                    (size > 0).then(|| Field { start, end: start + 260, path: String::from_utf8_lossy(&name[..size]).into_owned(), fixed: true })
                }).collect());
            }
            offset = end;
        }
        return Ok(vec![]);
    }
    if !path.to_ascii_lowercase().ends_with(".mdl") { return Err("无法识别模型格式".into()); }
    let mut result = vec![]; let mut i = 0;
    while i < bytes.len() {
        if bytes[i..].starts_with(b"//") { while i < bytes.len() && bytes[i] != b'\n' { i += 1; } }
        else if bytes[i..].starts_with(b"/*") {
            i += 2; while i + 1 < bytes.len() && &bytes[i..i + 2] != b"*/" { i += 1; } i = (i + 2).min(bytes.len());
        } else if bytes[i] == b'"' {
            i += 1; while i < bytes.len() && bytes[i] != b'"' { i += 1; } i = (i + 1).min(bytes.len());
        } else if bytes[i].is_ascii_alphabetic() || bytes[i] == b'_' {
            let start = i; while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') { i += 1; }
            if &bytes[start..i] == b"Image" {
                while i < bytes.len() && bytes[i].is_ascii_whitespace() { i += 1; }
                if bytes.get(i) == Some(&b'"') {
                    i += 1; let start = i; while i < bytes.len() && bytes[i] != b'"' { i += 1; }
                    if i == bytes.len() { return Err("MDL 贴图引用不完整".into()); }
                    let name = String::from_utf8_lossy(&bytes[start..i]).replace("\\\\", "\\");
                    if !name.is_empty() { result.push(Field { start, end: i, path: name, fixed: false }); } i += 1;
                }
            }
        } else { i += 1; }
    }
    Ok(result)
}

pub fn texture_paths(bytes: &[u8], path: &str) -> Result<Vec<String>, String> { Ok(fields(bytes, path)?.into_iter().map(|field| field.path).collect()) }
pub fn names(paths: Vec<String>, output: &str) -> Vec<(String, String)> {
    let stem = output.rsplit_once('.').map_or(output, |(stem, _)| stem);
    let mut seen = HashSet::new(); let mut result = vec![];
    for path in paths {
        if !seen.insert(key(&path)) { continue; }
        let extension = path.rsplit(['/', '\\']).next().unwrap_or(&path).rsplit_once('.').map_or("blp", |(_, extension)| extension);
        let output = format!("{}{}.{}", stem, result.len() + 1, extension.to_ascii_lowercase());
        result.push((path, output));
    }
    result
}
pub fn rewrite(bytes: &[u8], path: &str, names: &[(String, String)]) -> Result<Vec<u8>, String> {
    let mapping: HashMap<_, _> = names.iter().map(|(path, output)| (key(path), output.replace('/', "\\"))).collect();
    let mut result = bytes.to_vec();
    for field in fields(bytes, path)?.into_iter().rev() {
        let Some(name) = mapping.get(&key(&field.path)) else { continue; };
        if name.len() >= 260 { return Err("贴图新名称过长，请缩短前缀".into()); }
        if field.fixed { result[field.start..field.end].fill(0); result[field.start..field.start + name.len()].copy_from_slice(name.as_bytes()); }
        else { result.splice(field.start..field.end, name.bytes()); }
    }
    Ok(result)
}
