use std::{collections::BTreeMap, fs::{self, OpenOptions}, io, path::Path};
use super::{index::{safe_relative, Source}, storm::Archive};

pub(super) fn import_list(bytes: &[u8]) -> Result<Vec<(u8, Vec<u8>)>, String> {
    if bytes.len() < 8 { return Err("地图导入清单已损坏".into()); }
    let count = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
    if count > 100000 { return Err("地图导入清单过大".into()); }
    let mut offset = 8; let mut items = vec![];
    for _ in 0..count {
        let flag = *bytes.get(offset).ok_or("地图导入清单截断")?; offset += 1;
        let length = bytes[offset..].iter().position(|b| *b == 0).ok_or("地图导入路径截断")?;
        items.push((flag, bytes[offset..offset + length].to_vec())); offset += length + 1;
    }
    Ok(items)
}
pub(super) fn encode_list(items: &[(u8, Vec<u8>)]) -> Vec<u8> {
    let mut bytes = 1u32.to_le_bytes().to_vec(); bytes.extend((items.len() as u32).to_le_bytes());
    for (flag, name) in items { bytes.push(*flag); bytes.extend(name); bytes.push(0); } bytes
}
pub fn mutate(source: &Source, destination: &str, paths: &[String], files: &BTreeMap<String, Vec<u8>>, deleting: bool) -> Result<usize, String> {
    let ext = Path::new(&source.path).extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    if source.kind != "archive" || (!source.complete && !deleting) || !["w3x", "w3m"].contains(&ext.as_str()) { return Err("只支持魔兽地图资源删除；导入需要完整文件清单".into()); }
    let output = Path::new(destination);
    if !output.is_absolute() || !["w3x", "w3m"].contains(&output.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase().as_str()) { return Err("请选择新地图的绝对保存路径".into()); }
    let original = Path::new(&source.path);
    if destination.eq_ignore_ascii_case(&source.path) || output.exists() { return Err("请另存为新地图，不能覆盖原地图或已有文件".into()); }
    let archive = Archive::open(original)?;
    let has_imports = archive.has("war3map.imp");
    let mut imported = if has_imports { import_list(&archive.read("war3map.imp")?)? } else { vec![] };
    let mut changed = vec![];
    for name in paths {
        safe_relative(name)?;
        if deleting && !super::import_files::resource_path(name) { return Err("只能删除模型和贴图资源".into()); }
        if deleting && !source.entries.iter().any(|e| e.path.replace('\\', "/").eq_ignore_ascii_case(&name.replace('\\', "/"))) { return Err(format!("资源不在此地图：{name}")); }
        if deleting {
            let entry = source.entries.iter().find(|e| e.path.replace('\\', "/").eq_ignore_ascii_case(&name.replace('\\', "/"))).unwrap();
            let raw = entry.raw_name.as_deref().ok_or("缺少资源归档标识，请重新打开地图")?;
            if archive.read_raw(raw)?.len() as u64 != entry.size { return Err("地图资源已变化，请重新打开地图".into()); }
        }
    }
    if !deleting { for (name, bytes) in files {
        safe_relative(name)?;
        if archive.has(&name.replace('/', "\\")) { if archive.read(&name.replace('/', "\\"))? != *bytes { return Err(format!("地图资源同名且内容不同：{name}")); } }
        else { changed.push(name.clone()); }
    } }
    if deleting {
        let removed_blocks: std::collections::HashSet<_> = paths.iter().filter_map(|name| source.entries.iter().find(|entry| entry.path.replace('\\', "/").eq_ignore_ascii_case(&name.replace('\\', "/"))).and_then(|entry| entry.raw_name.as_deref()).and_then(|raw| archive.block_raw(raw))).collect();
        imported.retain(|(flag, raw)| {
            let mut full = if *flag == 5 || *flag == 8 { [b"war3mapImported\\".as_slice(), raw.as_slice()].concat() } else { raw.clone() };
            for byte in &mut full { if *byte == b'/' { *byte = b'\\'; } }
            !archive.block_raw(&full).is_some_and(|block| removed_blocks.contains(&block))
        });
    }
    drop(archive);
    let mut input = fs::File::open(original).map_err(|e| e.to_string())?;
    let mut copy = OpenOptions::new().create_new(true).write(true).open(output).map_err(|e| e.to_string())?;
    let result = (|| {
        io::copy(&mut input, &mut copy).map_err(|e| e.to_string())?; drop(copy);
        let archive = Archive::writable_copy(output)?;
        if deleting {
            for name in paths {
                let entry = source.entries.iter().find(|e| e.path.replace('\\', "/").eq_ignore_ascii_case(&name.replace('\\', "/"))).unwrap();
                archive.remove(entry.raw_name.as_deref().unwrap_or(name.as_bytes()))?;
            }
        } else {
            for name in &changed { archive.write(name, &files[name], false)?; }
            for name in files.keys() {
                if !imported.iter().any(|(flag, raw)| { let old = String::from_utf8_lossy(raw).replace('\\', "/"); let old = if *flag == 5 || *flag == 8 { format!("war3mapImported/{old}") } else { old }; old.eq_ignore_ascii_case(name) }) { imported.push((13, name.replace('/', "\\").into_bytes())); }
            }
        }
        if has_imports || !deleting { archive.write("war3map.imp", &encode_list(&imported), true)?; }
        archive.flush()?;
        Ok(if deleting { paths.len() } else { changed.len() })
    })();
    if result.is_err() { fs::remove_file(output).map_err(|e| format!("失败的地图副本未能清理：{e}；{}", output.display()))?; }
    result
}
