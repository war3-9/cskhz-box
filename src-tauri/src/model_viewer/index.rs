use super::storm::Archive;
use super::references::references;
use serde::Serialize;
use std::{collections::HashMap, fs, path::{Path, PathBuf}, sync::atomic::{AtomicBool, Ordering}};
use std::io::Read;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry { pub path: String, pub size: u64, pub model: bool, pub anonymous: bool, pub model_group: u8, #[serde(skip_serializing_if = "Option::is_none")] pub legacy_path: Option<String>, #[serde(skip_serializing)] pub raw_name: Option<Vec<u8>> }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source { pub id: String, pub path: String, pub name: String, pub kind: String, pub entries: Vec<Entry>, pub complete: bool, pub warning: Option<String>, pub analysis: Option<super::analysis::Analysis> }
pub fn safe_relative(name: &str) -> Result<PathBuf, String> {
    let name = name.replace('\\', "/");
    if name.starts_with('/') || name.contains(':') || name.split('/').any(|p| p == "..") || name.contains('\0') { return Err("资源路径必须位于来源目录内".into()); }
    Ok(PathBuf::from(name))
}
pub fn model_path(name: &str) -> bool { let n = name.to_ascii_lowercase(); n.ends_with(".mdx") || n.ends_with(".mdl") }
fn folder(root: &Path, current: &Path, entries: &mut Vec<Entry>, dependencies: &mut HashMap<String, Vec<String>>, cancel: &AtomicBool, quick: bool) -> Result<(), String> {
    for item in fs::read_dir(current).map_err(|e| e.to_string())? {
        if cancel.load(Ordering::Relaxed) { return Err("扫描已取消".into()); }
        let item = item.map_err(|e| e.to_string())?;
        if item.file_name() == ".box-model-backups" { continue; }
        let kind = item.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() { continue; }
        if kind.is_dir() { if !item.path().join(super::delete_backup::MARKER).is_file() { folder(root, &item.path(), entries, dependencies, cancel, quick)?; } }
        else if kind.is_file() {
            let name = item.path().strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
            let model = model_path(&name) && !fs::File::open(item.path()).and_then(|mut file| { let mut prefix = [0; 2]; file.read_exact(&mut prefix).map(|_| prefix == *b"MZ") }).unwrap_or(false);
            let model_group = if model && !quick { fs::read(item.path()).map(|bytes| { let converted = super::codec::convert(&bytes).ok(); let data = converted.as_deref().unwrap_or(&bytes); dependencies.insert(name.clone(), super::analysis::model_references(data)); super::model_group::group(data, &name) }).unwrap_or(2) } else { 2 };
            entries.push(Entry { model, path: name, size: item.metadata().map_err(|e| e.to_string())?.len(), anonymous: false, model_group, legacy_path: None, raw_name: None });
        }
    }
    Ok(())
}
pub fn scan(path: String, id: String, cancel: &AtomicBool) -> Result<Source, String> {
    scan_mode(path, id, cancel, false)
}
// Path pickers only need the directory. Keep full viewer analysis opt-in for this caller.
pub fn scan_mode(path: String, id: String, cancel: &AtomicBool, quick: bool) -> Result<Source, String> {
    let mut profile = super::scan_profile::ScanProfile::new();
    let root = PathBuf::from(&path);
    if !root.is_absolute() { return Err("请选择绝对路径".into()); }
    let mut entries = vec![];
    let mut complete = true;
    let kind;
    let mut display_name = None;
    let mut hm3w_external_payload = false;
    let mut came_records = None;
    let mut protected = HashMap::new();
    let mut native_modules = std::collections::HashSet::new();
    let mut dependencies = HashMap::new();
    let mut usage_references = Vec::new();
    if root.is_dir() { kind = "folder"; folder(&root, &root, &mut entries, &mut dependencies, cancel, quick)?; }
    else if model_path(&path) {
        kind = "file";
        let parent = root.parent().ok_or("模型缺少资源根目录")?;
        folder(parent, parent, &mut entries, &mut dependencies, cancel, quick)?;
        let name = root.file_name().unwrap().to_string_lossy();
        for e in &mut entries { e.model = e.model && e.path == name; }
    } else {
        kind = "archive";
        let mut prefix = [0; 0x820];
        hm3w_external_payload = fs::File::open(&root).and_then(|mut file| file.read_exact(&mut prefix)).is_ok()
            && super::content::has_hm3w_external_payload(&prefix, fs::metadata(&root).map_err(|e| e.to_string())?.len());
        let archive = Archive::open(&root)?;
        came_records = archive.external_count();
        profile.stage("open");
        complete = archive.has("(listfile)") && !hm3w_external_payload;
        let mut named = HashMap::new();
        if !quick || !complete { for name in super::name_candidates::beside_archive(&root) { if let Some(block) = archive.block(&name) { super::name_candidates::remember(&mut named, block, name); } } }
        for known in ["war3map.imp", "war3map.j", "scripts\\war3map.j", "war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3d", "war3map.w3b", "war3map.w3h", "war3map.w3q"] {
            if quick && complete { break; }
            if cancel.load(Ordering::Relaxed) { return Err("扫描已取消".into()); }
            if let Ok(bytes) = archive.read(known) { for name in references(&bytes) { for candidate in super::name_candidates::related_models(&name) { if let Some(block) = archive.block(&candidate) { super::name_candidates::remember(&mut named, block, candidate); } } } }
        }
        let mut blocks = HashMap::new();
        profile.stage("known-names");
        archive.enumerate(|mut name, raw, size, block| {
            if cancel.load(Ordering::Relaxed) { return false; }
            let anonymous = name.starts_with("File") && name.as_bytes().get(4).is_some_and(u8::is_ascii_digit);
            if anonymous || model_path(&name) || (!quick && name.to_ascii_lowercase().ends_with(".blp")) {
                if let Ok(prefix) = archive.prefix(&raw) {
                    if model_path(&name) && prefix.starts_with(b"MZ") { native_modules.insert(block); }
                    if let Some(format) = super::content::protected_format(&prefix) { protected.insert(block, format); }
                    if anonymous { if let Some(extension) = super::content::extension(&prefix) { name = format!("{}.{}", name.rsplit_once('.').map_or(name.as_str(), |(stem, _)| stem), extension); } }
                }
            }
            let legacy_path = (anonymous && model_path(&name)).then(|| name.clone());
            let entry = Entry { model: model_path(&name) && !native_modules.contains(&block), path: name, size: size as u64, anonymous, model_group: 2, legacy_path, raw_name: Some(raw) };
            if !blocks.contains_key(&block) || !anonymous { blocks.insert(block, entry); }
            true
        });
        if cancel.load(Ordering::Relaxed) { return Err("扫描已取消".into()); }
        profile.stage("enumerate-and-identify");
        let mut reads = 0; let mut read_bytes = 0usize; let mut refs = 0; let mut probes = 0;
        #[cfg(test)]
        let dump = std::env::var("BOX_VIEWER_DUMP_DIR").ok().map(PathBuf::from);
        let mut read_us = 0u128; let mut parse_us = 0u128; let mut probe_us = 0u128;
        for entry in blocks.values_mut() {
            if quick { break; }
            if cancel.load(Ordering::Relaxed) { return Err("扫描已取消".into()); }
            if !entry.model && ![".xxx", ".slk", ".lua", ".txt", ".j", ".ini"].iter().any(|extension| entry.path.to_ascii_lowercase().ends_with(extension)) { continue; }
            if entry.size > 16 * 1024 * 1024 { continue; }
            if let Some(raw) = &entry.raw_name {
                let time = std::time::Instant::now(); let result = archive.read_raw(raw); read_us += time.elapsed().as_micros();
                if let Ok(bytes) = result {
                    #[cfg(test)]
                    if let Some(root) = &dump { if !entry.model { fs::create_dir_all(root).unwrap(); fs::write(root.join(&entry.path), &bytes).unwrap(); } }
                    if entry.model { let converted = super::codec::convert(&bytes).ok(); let data = converted.as_deref().unwrap_or(&bytes); dependencies.insert(entry.path.clone(), super::analysis::model_references(data)); entry.model_group = super::model_group::group(data, &entry.path); }
                    reads += 1; read_bytes += bytes.len(); let time = std::time::Instant::now(); let mut names = references(&bytes);
                    // Include SLK/TXT tables and anonymous metadata already read for name recovery.
                    if !entry.model { usage_references.extend(names.iter().cloned()); }
                    if entry.model { names.extend(super::name_candidates::internal_name(&bytes)); } parse_us += time.elapsed().as_micros(); refs += names.len();
                    let time = std::time::Instant::now();
                    for name in names { for candidate in super::name_candidates::related_models(&name) { probes += 1; if let Some(block) = archive.block(&candidate) { super::name_candidates::remember(&mut named, block, candidate); } } }
                    probe_us += time.elapsed().as_micros();
                }
            }
        }
        if std::env::var_os("BOX_VIEWER_PROFILE").is_some() { eprintln!("VIEWER_REFERENCES {}", serde_json::json!({ "reads": reads, "bytes": read_bytes, "references": refs, "probes": probes, "readUs": read_us, "parseUs": parse_us, "probeUs": probe_us })); }
        for (block, mut name) in named { if let Some(entry) = blocks.get_mut(&block) { if entry.model != model_path(&name) { continue; } if entry.model && entry.path.to_ascii_lowercase().ends_with(".mdx") && name.to_ascii_lowercase().ends_with(".mdl") { name.truncate(name.len() - 4); name.push_str(".mdx"); } if let Some(refs) = dependencies.remove(&entry.path) { dependencies.insert(name.clone(), refs); } entry.path = name; entry.anonymous = false; let path = entry.path.to_ascii_lowercase().replace('\\', "/"); if path.starts_with("units/") || path.starts_with("buildings/") || path.starts_with("doodads/") { entry.model_group = super::model_group::group(&[], &entry.path); } } }
        profile.stage("recover-references");
        entries = blocks.into_values().collect();
        for entry in entries.iter_mut().filter(|entry| entry.model && entry.size > 16 * 1024 * 1024) {
            if quick { break; }
            if cancel.load(Ordering::Relaxed) { return Err("扫描已取消".into()); }
            if let Some(raw) = &entry.raw_name { if let Ok(bytes) = archive.read_raw(raw) { let converted = super::codec::convert(&bytes).ok(); let data = converted.as_deref().unwrap_or(&bytes); dependencies.insert(entry.path.clone(), super::analysis::model_references(data)); entry.model_group = super::model_group::group(data, &entry.path); } }
        }
        profile.stage("model-groups");
        for entry in entries.iter_mut().filter(|entry| entry.model && entry.anonymous) { entry.path = super::name_candidates::anonymous_model(&entry.path); }
        // StormLib remembers names opened by metadata reads. Read after enumeration so
        // anonymous W3I/WTS resources still participate in reference name recovery.
        if !quick && matches!(root.extension().and_then(|extension| extension.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("w3x" | "w3m")) { display_name = super::map_metadata::name(&root, &archive); }
    }
    entries.sort_by_key(|e| e.path.to_ascii_lowercase());
    profile.stage("sort");
    profile.finish(entries.len(), entries.iter().filter(|e| e.model).count());
    let mut warnings = vec![];
    if quick && entries.iter().any(|entry| entry.anonymous) { complete = false; }
    if let Some(count) = came_records { warnings.push(format!("已读取全部 {count} 个 CAME 外置资源，支持模型预览、贴图依赖读取和导出；部分原始路径尚未恢复，保护地图仅支持只读访问")); }
    else if hm3w_external_payload { warnings.push("检测到 HM3W 外置保护资源：标准 MPQ 文件表不包含地图尾部数据，当前只能列出 MPQ 内可直接读取的项目。请使用地图作者提供的授权资源导出或未保护资源包。".to_string()); }
    if !complete { warnings.push(if quick { "快速读取的部分资源尚未核实原路径，可点击补全路径继续扫描".to_string() } else { "归档没有文件清单：已按内容识别匿名资源，原始名称枚举不完整".to_string() }); }
    let protected_models = protected.values().filter(|format| **format == "MDB3").count();
    let protected_textures = protected.values().filter(|format| **format == "BLX1").count();
    if protected_models + protected_textures > 0 { warnings.push(format!("特殊格式：{protected_models} 个 MDB3 模型、{protected_textures} 个 BLX1 贴图；预览、导出和地形克隆时自动转换为标准 MDX / BLP")); }
    let mhac_models = protected.values().filter(|format| **format == "MHAC").count();
    let mheb_textures = protected.values().filter(|format| **format == "MHEB").count();
    let mhec_models = protected.values().filter(|format| **format == "MHEC").count();
    if mhac_models + mheb_textures + mhec_models > 0 { warnings.push(format!("特殊格式：{mhac_models} 个 MHAC 模型、{mhec_models} 个 MHEC 模型、{mheb_textures} 个 MHEB 贴图；兼容的 v1 资源会自动转换，其他密钥或版本会提示不兼容")); }
    if !native_modules.is_empty() { warnings.push(format!("{} 个使用模型扩展名的程序模块已从模型列表排除", native_modules.len())); }
    let warning = (!warnings.is_empty()).then(|| warnings.join("；"));
    let mut analysis = super::analysis::classify(&entries, &dependencies);
    let mut source = Source { id, name: display_name.unwrap_or_else(|| root.file_name().unwrap_or_default().to_string_lossy().into()), path, kind: kind.into(), entries, complete, warning, analysis: None };
    if !quick {
        if kind == "archive" { super::analysis::map_usage(&source, &Archive::open(&root)?, &usage_references, &mut analysis); }
        source.analysis = Some(analysis);
    }
    Ok(source)
}
pub fn read(source: &Source, name: &str) -> Result<Vec<u8>, String> {
    let relative = safe_relative(name)?;
    let root = PathBuf::from(&source.path);
    if source.kind == "archive" {
        let archive = Archive::open(&root)?;
        if let Some(raw) = source.entries.iter().find(|e| e.path.replace('\\', "/").eq_ignore_ascii_case(&name.replace('\\', "/"))).and_then(|e| e.raw_name.as_ref()) { return archive.read_raw(raw); }
        return archive.read(&name.replace('/', "\\"));
    }
    let root = if source.kind == "file" { root.parent().unwrap().to_path_buf() } else { root };
    let full = root.join(relative).canonicalize().map_err(|e| e.to_string())?;
    if !full.starts_with(root.canonicalize().map_err(|e| e.to_string())?) { return Err("资源路径越过来源目录".into()); }
    fs::read(full).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn paths_reject_escape() { for n in ["../foo", "C:/foo", "a/../../foo", "/root"] { assert!(safe_relative(n).is_err()); } assert!(safe_relative("中文\\单位.mdx").is_ok()); }
    #[test]
    #[ignore = "requires the reference map in BOX_VIEWER_TEST_MAP (7411 entries / 748 models)"]
    fn user_map_reads_all_identified_models() {
        let path = PathBuf::from(std::env::var_os("BOX_VIEWER_TEST_MAP").expect("set BOX_VIEWER_TEST_MAP to the reference map")).canonicalize().expect("reference map must exist");
        let source = scan(path.to_string_lossy().into(), "test".into(), &AtomicBool::new(false)).unwrap();
        let models: Vec<_> = source.entries.iter().filter(|e| e.model).collect();
        assert_eq!(source.entries.len(), 7411, "扫描优化不能遗漏归档条目");
        assert_eq!(models.len(), 748, "扫描优化不能遗漏真实模型");
        assert_eq!(models.iter().filter(|e| !e.anonymous).count(), 289, "SLK 与模型引用恢复名称必须稳定");
        for name in ["war3mapImported\\0233f337a4b11ad4.mdx", "war3mapImported\\1bb0b666dec2506c.mdx"] { assert!(models.iter().any(|entry| entry.path.eq_ignore_ascii_case(name)), "遗漏已知 SLK 名称 {name}"); }
        assert!(models.iter().any(|entry| entry.path == "file_000002.mdx" && entry.anonymous));
        assert_eq!(models.iter().filter(|e| e.model_group == 0).count(), 185, "单位分组必须保留");
        eprintln!("真实地图：{} 个条目 / {} 个模型 / 完整清单 {} / 恢复名称 {}", source.entries.len(), models.len(), source.complete, models.iter().filter(|entry| !entry.anonymous).count());
        eprintln!("恢复名称样例：{:?}", models.iter().filter(|entry| !entry.anonymous).take(10).map(|entry| &entry.path).collect::<Vec<_>>());
        let texture = read(&source, "war3mapImported/quilboar_warrior_01_02_unlit.blp").expect("用户模型贴图必须可读");
        assert!(texture.starts_with(b"BLP"));
        if let Ok(directory) = std::env::var("BOX_VIEWER_FIXTURE_DIR") {
            let directory = PathBuf::from(directory); assert!(directory.is_absolute());
            fs::create_dir_all(directory.join("war3mapImported")).unwrap();
            fs::write(directory.join("war3mapImported/quilboar_warrior_01_02_unlit.blp"), &texture).unwrap();
            fs::write(directory.join("1bb0b666dec2506c.mdx"), read(&source, "war3mapImported/1bb0b666dec2506c.mdx").unwrap()).unwrap();
        }
        for item in models { let bytes = read(&source, &item.path).unwrap(); assert_eq!(bytes.len() as u64, item.size); assert!(bytes.starts_with(b"MDLX") || item.path.to_lowercase().ends_with(".mdl"), "{} {:?}", item.path, &bytes[..bytes.len().min(20)]); }
        if let Ok(report_path) = std::env::var("BOX_VIEWER_NAME_COMPARE") {
            let report = PathBuf::from(report_path); let archive = Archive::open(&path).unwrap();
            let reference: serde_json::Value = serde_json::from_slice(&fs::read(report.join("reference/memory-map-names.json")).unwrap()).unwrap();
            let mut names: HashMap<u32, Vec<String>> = HashMap::new();
            for name in reference["names"].as_array().unwrap().iter().filter_map(|name| name.as_str()).filter(|name| model_path(name) && !name.starts_with("file_")) {
                if let Some(block) = archive.block(name) { names.entry(block).or_default().push(name.into()); }
            }
            let mut differences = vec![];
            for entry in source.entries.iter().filter(|entry| entry.model) {
                let raw = entry.raw_name.as_ref().unwrap(); let raw_name = String::from_utf8_lossy(raw);
                if let Some(block) = archive.block(&raw_name) { if let Some(candidates) = names.get(&block) {
                    if entry.anonymous || !candidates.iter().any(|name| name.eq_ignore_ascii_case(&entry.path)) { differences.push(serde_json::json!({"ours":entry.path,"anonymous":entry.anonymous,"block":block,"candidates":candidates})); }
                } }
            }
            fs::write(report.join("name-block-crosscheck.json"), serde_json::to_vec_pretty(&serde_json::json!({"foundBlocks":names.len(),"differences":differences})).unwrap()).unwrap();
        }
    }
}
