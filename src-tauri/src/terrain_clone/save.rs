use super::session::MapDocument;
use crate::model_viewer::storm::Archive;
use std::{fs::{self, OpenOptions}, io::{self, Write}, path::Path};

pub(super) fn write_map_copy(doc: &MapDocument, output: &Path) -> Result<(), String> {
    if doc.disk_hash.as_ref() != Some(&MapDocument::file_hash(&doc.path)?) { return Err("地图在打开后被其他程序修改，请重新打开后再保存".into()); }
    let original = Archive::open(&doc.path)?;
    let mut members = doc.members.clone();
    if !doc.blank {
        super::skin_resources::preserve(&original, &mut members)?;
        super::terrain_resources::preserve(&original, &mut members, &doc.removed_members)?;
    }
    members.retain(|name, _| !doc.removed_members.iter().any(|removed| super::mpq_identity::matches_name(name, removed)));
    drop(original);
    let mut input = fs::File::open(&doc.path).map_err(|e| format!("无法读取目标地图：{e}"))?;
    let mut output_file = OpenOptions::new().write(true).create_new(true).open(output).map_err(|e| format!("无法创建输出地图：{e}"))?;
    let mut cleanup = OutputCleanup { path: output, committed: false };
    if doc.blank {
        // Create a fresh archive: source code and unknown source members never
        // enter a blank target, even when resource copying is disabled.
        let mut header = b"HM3W\0\0\0\0Terrain clone\0".to_vec();
        header.extend_from_slice(&0u32.to_le_bytes());
        header.extend_from_slice(&1u32.to_le_bytes());
        header.resize(512, 0);
        output_file.write_all(&header).map_err(|e| e.to_string())?;
    } else { io::copy(&mut input, &mut output_file).map_err(|e| e.to_string())?; }
    drop(output_file);
    let archive = if doc.blank { Archive::create_classic(output, members.len() + 1)? } else {
        super::mpq_identity::reserve(output, members.len() + 1)?;
        Archive::writable_copy(output)?
    };
    if doc.normalized_tables > 0 { for name in super::optimized_objects::paths() { let name = name.replace('/', "\\"); if archive.has(&name) { archive.remove(name.as_bytes())?; } } }
    archive.write("war3map.w3e", &doc.w3e, true)?;
    for name in &doc.removed_members {
        let name = name.replace('/', "\\");
        if archive.has(&name) { archive.remove(name.as_bytes())?; }
    }
    for (member, bytes) in &members { archive.write(member, bytes, true)?; }
    if doc.blank { clear_blank_members(&archive, doc)?; }
    archive.flush()?;
    drop(archive);
    super::mpq_identity::restore_filtered(output, &members, &doc.removed_members)?;
    if doc.disk_hash.as_ref() != Some(&MapDocument::file_hash(&doc.path)?) { return Err("保存期间原地图被其他程序修改，未交付不一致的输出".into()); }
    cleanup.committed = true;
    Ok(())
}

struct OutputCleanup<'a> { path: &'a Path, committed: bool }
impl Drop for OutputCleanup<'_> {
    fn drop(&mut self) { if !self.committed { let _ = fs::remove_file(self.path); } }
}

pub(super) fn write_map_in_place(doc: &MapDocument) -> Result<(), String> {
    if doc.disk_hash.as_ref() != Some(&MapDocument::file_hash(&doc.path)?) { return Err("目标地图在打开后被其他程序修改，请重新打开目标地图再复制".into()); }
    let parent = doc.path.parent().ok_or("目标地图目录无效")?;
    let stem = doc.path.file_name().ok_or("目标地图名称无效")?.to_string_lossy();
    let temp = parent.join(format!(".{stem}.box-saving-{}", uuid::Uuid::new_v4()));
    write_map_copy(doc, &temp)?;
    let _cleanup = OutputCleanup { path: &temp, committed: false };
    let backup_dir = parent.join(".box-terrain-backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let backup = backup_dir.join(format!("{stem}.{stamp}"));
    fs::copy(&doc.path, &backup).map_err(|e| e.to_string())?;
    if doc.disk_hash.as_ref() != Some(&MapDocument::file_hash(&doc.path)?) { let _ = fs::remove_file(&temp); return Err("保存期间目标地图被其他程序修改，未覆盖目标地图".into()); }
    if let Err(error) = fs::rename(&temp, &doc.path) { let _ = fs::remove_file(&temp); return Err(format!("替换目标地图失败：{error}")); }
    Ok(())
}

fn clear_blank_members(archive: &Archive, doc: &MapDocument) -> Result<(), String> {
    for name in ["war3map.doo", "war3mapUnits.doo"] {
        if archive.has(name) && !doc.members.contains_key(name) {
            let mut empty = b"W3do\x08\x00\x00\x00\x0b\x00\x00\x00\x00\x00\x00\x00".to_vec();
            if name == "war3map.doo" { empty.extend_from_slice(&[0; 8]); }
            archive.write(name, &empty, true)?;
        }
    }
    if archive.has("war3map.w3r") && !doc.members.contains_key("war3map.w3r") { archive.write("war3map.w3r", &5i32.to_le_bytes().into_iter().chain(0i32.to_le_bytes()).collect::<Vec<_>>(), true)?; }
    if archive.has("war3map.shd") && !doc.members.contains_key("war3map.shd") { let bytes = archive.read("war3map.shd")?; archive.write("war3map.shd", &vec![0; bytes.len()], true)?; }
    if archive.has("war3map.wpm") && !doc.members.contains_key("war3map.wpm") {
        let bytes = archive.read("war3map.wpm")?;
        if bytes.len() >= 16 {
            let mut blank = bytes[..16].to_vec();
            blank.resize(bytes.len(), 0);
            archive.write("war3map.wpm", &blank, true)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_modified_backing_file_and_preserves_existing_output() {
        let source = super::super::tests::archive_fixture();
        let archive = Archive::open(&source).unwrap();
        let doc = MapDocument::new(source.clone(), archive.read("war3map.w3e").unwrap());
        drop(archive);
        let output = source.with_extension("existing.w3x");
        fs::write(&output, b"unrelated existing output").unwrap();
        assert!(write_map_copy(&doc, &output).is_err());
        assert_eq!(fs::read(&output).unwrap(), b"unrelated existing output");
        let archive = Archive::writable_copy(&source).unwrap();
        archive.write("new.txt", b"external edit", false).unwrap();
        archive.flush().unwrap(); drop(archive);
        let fresh = source.with_extension("new.w3x");
        assert!(write_map_copy(&doc, &fresh).unwrap_err().contains("修改"));
        assert!(!fresh.exists());
        fs::remove_file(output).unwrap(); fs::remove_file(source).unwrap();
    }
}
