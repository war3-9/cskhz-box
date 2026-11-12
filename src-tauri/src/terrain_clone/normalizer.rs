use super::{object_data, optimized_objects, session::MapDocument};
use crate::model_viewer::storm::Archive;
use flate2::read::GzDecoder;
use std::{fs, os::windows::process::CommandExt, path::Path, process::Command};

const PACKAGE: &[u8] = include_bytes!("../../../.private/terrain-object-normalizer.tar.gz");
const VERSION: &str = include_str!("../../../.private/terrain-object-normalizer.sha256");
const OBJECTS: [&str; 7] = ["war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"];

pub(super) fn normalize(doc: &mut MapDocument, base: &Path) -> Result<(), String> {
    let paths = optimized_objects::paths();
    let count = paths.iter().filter(|name| doc.members.contains_key(*name)).count();
    if count == 0 { return Ok(()); }
    let runtime = base.join("object-normalizer");
    fs::create_dir_all(&runtime).map_err(|e| e.to_string())?;
    let stamp = runtime.join("package.sha256");
    if fs::read_to_string(&stamp).ok().as_deref() != Some(VERSION) {
        tar::Archive::new(GzDecoder::new(PACKAGE)).unpack(&runtime).map_err(|e| format!("部署物编转换器失败：{e}"))?;
        fs::write(&stamp, VERSION).map_err(|e| e.to_string())?;
    }
    let job = base.join("object-jobs").join(uuid::Uuid::new_v4().to_string());
    let input = job.join("input");
    fs::create_dir_all(&input).map_err(|e| e.to_string())?;
    for (name, bytes) in &doc.members {
        // Some protected maps expose a one-byte NUL placeholder for war3map.wts.
        // Passing that marker to w3x2lni makes its WTS parser fail even though the
        // map has no trigger-string table. Treat it as an absent table.
        if name.eq_ignore_ascii_case("war3map.wts") && (bytes.is_empty() || bytes.iter().all(|byte| *byte == 0)) { continue; }
        if paths.contains(name) || OBJECTS.contains(&name.as_str()) || ["war3map.w3i", "war3map.wts"].contains(&name.as_str()) {
            let path = input.join(name.replace('\\', "/"));
            fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
            fs::write(path, bytes).map_err(|e| e.to_string())?;
        }
    }
    let output = job.join("normalized.w3x");
    let result = Command::new(runtime.join("bin/w3x2lni-lua.exe"))
        .current_dir(runtime.join("script"))
        .arg("box-objects.lua").arg(&input).arg(&output)
        .creation_flags(0x08000000).output().map_err(|e| format!("启动内置物编转换器失败：{e}"))?;
    fs::write(job.join("conversion.log"), &result.stdout).map_err(|e| e.to_string())?;
    if !result.status.success() || !output.is_file() {
        return Err(format!("优化物编还原失败：{}", String::from_utf8_lossy(&result.stderr)));
    }
    let archive = Archive::open(&output)?;
    let wts = if archive.has("war3map.wts") { archive.read("war3map.wts")? } else { vec![] };
    for name in OBJECTS {
        if archive.has(name) {
            let bytes = archive.read(name)?;
            let extended = ["war3map.w3a", "war3map.w3d", "war3map.w3q"].contains(&name);
            doc.members.insert(name.into(), object_data::resolve_strings(&bytes, &wts, extended)?);
        }
    }
    for name in paths { doc.members.remove(&name); }
    doc.normalized_tables = count;
    Ok(())
}
