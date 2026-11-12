use std::{fs, path::Path};
use serde::{Deserialize, Serialize};
use super::{console_save::Change, storm::Archive};

pub const FILE: &str = r"Fonts\BoxConsoleUI.ttf";
pub const SKIN: &str = "war3mapSkin.txt";
pub const KEYS: &[&str] = &["MasterFont", "MessageFont", "ChatFont", "EscMenuTextFont", "InfoPanelTextFont", "TextTagFont"];
const LIMIT: usize = 20 * 1024 * 1024;

pub fn validate(bytes: &[u8]) -> Result<bool, String> {
    if bytes.len() > LIMIT || !bytes.starts_with(&[0, 1, 0, 0]) {
        return Err("请选择20MB以内的静态 TrueType 字体（.ttf），不支持字体集合、网页字体或CFF字体".into());
    }
    let font = ttf_parser::Face::parse(bytes, 0).map_err(|_| "字体文件损坏或格式不受支持")?;
    if font.is_variable() || font.tables().glyf.is_none() {
        return Err("请选择静态 TrueType 字体，旧版魔兽不保证支持可变字体".into());
    }
    if "0123456789/".chars().any(|ch| font.glyph_index(ch).is_none()) {
        return Err("该字体缺少数字或斜杠，无法显示资源和生命数值".into());
    }
    Ok("任务菜单盟友聊天生命法力金币木材".chars().all(|ch| font.glyph_index(ch).is_some()))
}

fn optional(archive: &Archive, name: &[u8], limit: usize) -> Result<Option<Vec<u8>>, String> {
    // Use raw MPQ paths so legacy GBK font references need no lossy conversion.
    match archive.prefix_limit(name, limit as u32 + 1) {
        Ok(bytes) if bytes.len() > limit => Err("地图字体或皮肤文件过大".into()),
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error == "资源不存在或已损坏" => Ok(None),
        Err(error) => Err(error),
    }
}
fn trim(bytes: &[u8]) -> &[u8] { bytes.trim_ascii() }
fn section(line: &[u8]) -> Option<&[u8]> {
    let line = trim(line.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(line));
    if line.starts_with(b"[") && line.ends_with(b"]") { Some(trim(&line[1..line.len()-1])) } else { None }
}
fn assignment(line: &[u8]) -> Option<(&[u8], &[u8])> {
    let index = line.iter().position(|ch| *ch == b'=')?;
    Some((trim(&line[..index]), trim(&line[index+1..])))
}
fn font_path(skin: &[u8], key: &str) -> Option<Vec<u8>> {
    let mut custom = false; let mut found = None;
    for line in skin.split(|ch| *ch == b'\n') {
        if let Some(name) = section(line) { custom = name.eq_ignore_ascii_case(b"CustomSkin"); }
        else if custom { if let Some((name, value)) = assignment(line) {
            if name.eq_ignore_ascii_case(key.as_bytes()) && !value.is_empty() {
                let value = value.strip_prefix(b"\"").and_then(|v| v.strip_suffix(b"\"")).unwrap_or(value);
                found = Some(value.to_vec());
            }
        } }
    }
    found
}
pub fn validate_skin(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > 2 * 1024 * 1024 || bytes.contains(&0) { return Err("地图皮肤文件过大或不是支持的ANSI/UTF-8文本".into()); }
    Ok(())
}
// Preserve unknown fields, comments, encoding and original line endings byte for byte.
pub fn patch(skin: &[u8]) -> Result<Vec<u8>, String> {
    validate_skin(skin)?;
    let newline: &[u8] = if skin.windows(2).any(|w| w == b"\r\n") { b"\r\n" } else { b"\n" };
    let mut output = Vec::new(); let mut custom = false; let mut seen = false;
    for line in skin.split_inclusive(|ch| *ch == b'\n') {
        if let Some(name) = section(line) {
            custom = name.eq_ignore_ascii_case(b"CustomSkin");
            if custom { seen = true; }
            output.extend(line);
            if custom {
                if !output.ends_with(b"\n") { output.extend(newline); }
                for key in KEYS { output.extend(format!("{key}={FILE}").as_bytes()); output.extend(newline); }
            }
        } else if !(custom && assignment(line).is_some_and(|(name, _)| KEYS.iter().any(|key| name.eq_ignore_ascii_case(key.as_bytes())))) {
            output.extend(line);
        }
    }
    if !seen {
        if !output.is_empty() && !output.ends_with(b"\n") { output.extend(newline); }
        output.extend(b"[CustomSkin]"); output.extend(newline);
        for key in KEYS { output.extend(format!("{key}={FILE}").as_bytes()); output.extend(newline); }
    }
    Ok(output)
}

#[derive(Serialize)]
pub struct Snapshot { pub skin: Option<Vec<u8>>, pub stored: Option<Vec<u8>>, pub preview: Option<Vec<u8>> }
pub fn snapshot(path: &Path) -> Result<Snapshot, String> {
    let archive = Archive::open(path)?;
    let skin = optional(&archive, SKIN.as_bytes(), 2 * 1024 * 1024)?;
    if let Some(bytes) = &skin { validate_skin(bytes)?; }
    let stored = optional(&archive, FILE.as_bytes(), LIMIT)?;
    let master = font_path(skin.as_deref().unwrap_or_default(), "MasterFont").unwrap_or_else(|| br"Fonts\dfst-m3u.ttf".to_vec());
    let preview = optional(&archive, &master, LIMIT)?;
    Ok(Snapshot { skin, stored, preview })
}
#[derive(Deserialize)]
pub struct Edit {
    pub reset: bool,
    pub bytes: Option<Vec<u8>>,
    pub skin: Option<Vec<u8>>,
    pub stored: Option<Vec<u8>>,
}
pub fn changes(path: &Path, edit: Edit) -> Result<Vec<Change>, String> {
    if edit.reset {
        if let Some(bytes) = &edit.skin { validate_skin(bytes)?; }
        if edit.stored.as_ref().is_some_and(|bytes| bytes.len() > LIMIT) { return Err("原有字体文件过大".into()); }
        return Ok(vec![Change { path: SKIN.into(), bytes: edit.skin }, Change { path: FILE.into(), bytes: edit.stored }]);
    }
    let bytes = edit.bytes.ok_or("缺少字体文件")?; validate(&bytes)?;
    let archive = Archive::open(path)?;
    let skin = optional(&archive, SKIN.as_bytes(), 2 * 1024 * 1024)?.unwrap_or_default();
    Ok(vec![Change { path: FILE.into(), bytes: Some(bytes) }, Change { path: SKIN.into(), bytes: Some(patch(&skin)?) }])
}
#[derive(Serialize)]
pub struct Input { pub bytes: Vec<u8>, pub chinese: bool }
#[tauri::command]
pub async fn console_font_input(path: String) -> Result<Input, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&path);
        if !path.is_absolute() || !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("ttf")) { return Err("请选择TTF字体文件".into()); }
        let file = fs::File::open(path).map_err(|e| e.to_string())?;
        use std::io::Read;
        let mut bytes = Vec::new(); file.take(LIMIT as u64 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        let chinese = validate(&bytes)?; Ok(Input { bytes, chinese })
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn console_font_snapshot(path: String) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&path); super::console_save::fingerprint(path)?; snapshot(path)
    }).await.map_err(|e| e.to_string())?
}
#[cfg(test)]
#[path = "console_font_tests.rs"]
mod tests;
