use crate::model_viewer::storm::Archive;
use std::{collections::HashSet, path::Path};

#[cfg(test)]
pub(super) fn copy_all(source_path: &Path, target_path: &Path, target_members: &mut std::collections::HashMap<String, Vec<u8>>) -> Result<(usize, usize, Vec<String>), String> {
    copy_assets(source_path, target_path, target_members, false)
}

pub(super) fn copy_assets(source_path: &Path, target_path: &Path, target_members: &mut std::collections::HashMap<String, Vec<u8>>, fresh_target: bool) -> Result<(usize, usize, Vec<String>), String> {
    let source = Archive::open(source_path)?;
    let target = Archive::open(target_path)?;
    let hashes = source.resource_hashes()?;
    let source_imports = if source.has("war3map.imp") { super::imports::resolve_paths(&source, super::imports::parse(&source.read("war3map.imp")?)?) } else { Vec::new() };
    let source_imports: Vec<_> = source_imports.into_iter().filter(|(flag, path)| asset_path(&super::imports::member_path(*flag, path))).collect();
    let recovered_names = crate::model_viewer::recovered_archive_names(source_path)?;
    let mut resources = Vec::new();
    let mut failure = None;
    source.enumerate(|name, raw, _size, block| {
        if !asset_path(&name) { return true; }
        if !is_model_texture_or_sound(&name) {
            if !super::mpq_identity::anonymous(&name) { return true; }
            let prefix = match source.prefix(&raw) { Ok(bytes) => bytes, Err(error) => { failure = Some(format!("无法识别匿名资源 {name}：{error}")); return false; } };
            if crate::model_viewer::content::extension(&prefix).is_none() { return true; }
        }
        let Some(path) = safe_archive_path(&name) else { failure = Some(format!("资源路径不安全，已停止复制：{name}")); return false; };
        match source.read_raw(&raw) {
            Ok(bytes) => {
                let bytes = match crate::model_viewer::codec::convert(&bytes) {
                    Ok(bytes) => bytes.into_owned(),
                    Err(error) => { failure = Some(format!("无法转换资源 {name}：{error}")); return false; }
                };
                if super::mpq_identity::anonymous(&path) {
                    let identities: Vec<_> = hashes.iter().filter(|hash| hash[3] == block).collect();
                    if identities.is_empty() { failure = Some(format!("无法确认匿名资源的归档身份：{name}")); return false; }
                    for hash in identities { resources.push((super::mpq_identity::key(*hash), bytes.clone())); }
                    if let Some(recovered) = recovered_names.get(&raw).filter(|recovered| !super::mpq_identity::anonymous(recovered)) {
                        if let Some(import_path) = recovered_import_path(recovered, block, &bytes, &source, &resources) {
                            resources.push((import_path, bytes));
                        }
                    }
                } else { resources.push((path, bytes)); }
                true
            }
            Err(error) => { failure = Some(format!("无法读取资源 {name}：{error}")); false }
        }
    });
    if let Some(error) = failure { return Err(error); }
    // Anonymous identities are readable until World Editor repacks the map.
    // Materialize exact object model/variation paths and register them below.
    for reference in super::object_data::model_paths(target_members)? {
        let path = safe_archive_path(&reference).ok_or_else(|| format!("物编模型路径不安全：{reference}"))?;
        let archive_path = path.replace('/', "\\");
        if !source.has(&archive_path) || resources.iter().any(|(existing, _)| existing.eq_ignore_ascii_case(&path)) { continue; }
        let bytes = crate::model_viewer::codec::convert(&source.read(&archive_path)?)?.into_owned();
        resources.push((path, bytes));
    }
    // Recover native terrain overrides by exact logical path. A basename
    // search could confuse Cityscape grass with Lordaeron grass.
    for path in super::terrain_resources::references(&source, &std::collections::HashMap::new())? {
        let archive_path = path.replace('/', "\\");
        if !source.has(&archive_path) || resources.iter().any(|(existing, _)| existing.eq_ignore_ascii_case(&path)) { continue; }
        let bytes = crate::model_viewer::codec::convert(&source.read(&archive_path)?)?.into_owned();
        resources.push((path, bytes));
    }
    for (flag, raw_path) in &source_imports {
        let member = super::imports::member_path(*flag, raw_path);
        let Some(path) = safe_archive_path(&member) else { return Err(format!("导入清单路径不安全：{}", String::from_utf8_lossy(raw_path))); };
        if resources.iter().any(|(existing, _)| existing.eq_ignore_ascii_case(&path)) { continue; }
        let bytes = source.read(&path.replace('/', "\\")).map_err(|error| format!("导入资源 {} 无法读取：{error}", String::from_utf8_lossy(raw_path)))?;
        resources.push((path, crate::model_viewer::codec::convert(&bytes)?.into_owned()));
    }
    // TGA has no fixed magic and anonymous files may be enumerated as .xxx.
    // Follow MDX texture paths so signature filtering cannot omit dependencies.
    let mut dependencies = HashSet::new();
    if !fresh_target {
        dependencies.extend(super::skin_resources::references(&source)?);
        dependencies.extend(super::skin_resources::references(&target)?);
    }
    for (_, bytes) in &resources {
        if bytes.starts_with(b"MDLX") {
            let mut offset = 4usize;
            while offset + 8 <= bytes.len() {
                let size = u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
                let Some(end) = offset.checked_add(8).and_then(|start| start.checked_add(size)).filter(|end| *end <= bytes.len()) else { break; };
                if &bytes[offset..offset + 4] == b"TEXS" {
                    for texture in bytes[offset + 8..end].chunks_exact(268) {
                        let name = texture[4..264].split(|byte| *byte == 0).next().unwrap();
                        if !name.is_empty() { dependencies.insert(name.to_vec()); }
                    }
                }
                offset = end;
            }
        } else if bytes.starts_with(b"Version") {
            dependencies.extend(crate::model_viewer::references::references(bytes).into_iter().map(String::into_bytes));
        }
    }
    let imported_members = source_imports.iter().map(|(flag, path)| super::imports::member_path(*flag, path)).collect::<Vec<_>>();
    let mut dependency_imports = Vec::new();
    let mut unresolved_dependencies = Vec::new();
    for raw in dependencies {
        if !asset_path(&String::from_utf8_lossy(&raw)) { continue; }
        let dependency = match super::dependencies::resolve(&source, &raw, &imported_members, &recovered_names) {
            Ok(dependency) => dependency,
            Err(error) if error.contains("无法安全选择") => {
                unresolved_dependencies.push(String::from_utf8_lossy(&raw).replace('\\', "/"));
                continue;
            }
            Err(error) => return Err(error),
        };
        let Some((reference, block, bytes)) = dependency else { continue; };
        let bytes = crate::model_viewer::codec::convert(&bytes)?.into_owned();
        for hash in hashes.iter().filter(|hash| hash[3] == block) { resources.push((super::mpq_identity::key(*hash), bytes.clone())); }
        let Some(path) = safe_archive_path(&reference) else { return Err(format!("模型依赖路径不安全：{reference}")); };
        if source.block(&path).is_some_and(|referenced_block| referenced_block != block) {
            return Err(format!("模型依赖路径与源地图资源冲突：{reference}"));
        }
        if let Some((_, existing)) = resources.iter().find(|(existing, _)| existing.eq_ignore_ascii_case(&path)) {
            if existing != &bytes { return Err(format!("模型依赖路径对应多份不同资源：{reference}")); }
        } else {
            resources.push((path, bytes));
        }
        dependency_imports.push((13, reference.replace('/', "\\").into_bytes()));
    }

    let resources: std::collections::HashMap<_, _> = resources.into_iter().collect();
    // Register every known logical member, including custom paths from listfiles.
    // An editor save must retain the same path that models and object data use.
    let imported = resources.keys().filter(|path| super::mpq_identity::parse_key(path).is_none()).map(|path| (13, path.replace('/', "\\").into_bytes())).chain(dependency_imports).collect::<Vec<_>>();
    let imported_count = source_imports.iter().chain(&imported).map(|(flag, path)| super::imports::member_path(*flag, path).to_ascii_lowercase()).collect::<HashSet<_>>().len();
    let mut added = Vec::new();
    for (path, bytes) in resources {
        if let Some((pending_path, pending)) = target_members.iter().find(|(existing, _)| existing.eq_ignore_ascii_case(&path)) {
            if pending != &bytes { added.push((pending_path.clone(), bytes)); }
            continue;
        }
        if fresh_target || super::mpq_identity::parse_key(&path).is_some() { added.push((path, bytes)); }
        else if target.has(&path.replace('/', "\\")) {
            if target.read(&path.replace('/', "\\"))? != bytes { added.push((path, bytes)); }
        } else {
            added.push((path, bytes));
        }
    }
    let existing_manifest = if source_imports.is_empty() && imported.is_empty() { None } else if let Some(bytes) = target_members.get("war3map.imp") {
        Some(bytes.clone())
    } else if !fresh_target && target.has("war3map.imp") {
        Some(super::imports::normalize(&target, &target.read("war3map.imp")?)?)
    } else { None };
    drop(target);
    let manifest = if source_imports.is_empty() && imported.is_empty() { None } else {
        Some(super::imports::merge(existing_manifest.as_deref(), &source_imports, &imported)?)
    };
    let copied = added.len();
    for (path, bytes) in added { target_members.insert(path, bytes); }
    if let Some(manifest) = manifest { target_members.insert("war3map.imp".into(), manifest); }
    unresolved_dependencies.sort_by_key(|path| path.to_ascii_lowercase());
    unresolved_dependencies.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    Ok((copied, imported_count, unresolved_dependencies))
}

// Import manifests can contain arbitrary members, including executable scripts
// and editor triggers. Those are never terrain assets, regardless of checkbox.
fn asset_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    let leaf = normalized.rsplit('/').next().unwrap_or(&normalized);
    if leaf.starts_with("war3map.") || leaf == "war3mapunits.doo" { return false; }
    // Optimized object tables belong to the category-filtered object merge,
    // even when an import manifest lists them as ordinary resources.
    if (normalized.starts_with("units/") || normalized.starts_with("doodads/"))
        && super::optimized_objects::paths().iter().any(|table| table == &normalized) { return false; }
    !matches!(leaf.rsplit('.').next().unwrap_or(""), "j" | "ai" | "lua" | "wtg" | "wct" | "exe" | "dll" | "asi")
}

fn is_model_texture_or_sound(path: &str) -> bool {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    if normalized.starts_with("war3map") && !normalized.starts_with("war3mapimported/") { return false; }
    matches!(Path::new(path).extension().and_then(|extension| extension.to_str()).unwrap_or("").to_ascii_lowercase().as_str(),
        "mdx" | "mdl" | "blp" | "tga" | "dds" | "png" | "jpg" | "jpeg" | "wav" | "mp3" | "ogg" | "flac" | "mid" | "mod" | "ttf" | "otf" | "ttc")
}

pub(super) fn safe_archive_path(path: &str) -> Option<String> {
    let path = path.replace('\\', "/");
    if path.is_empty() || path.starts_with('/') || path.contains(':') || path.contains('\0') || path.split('/').any(|part| part.is_empty() || part == "." || part == "..") { return None; }
    Some(path)
}

fn recovered_import_path(name: &str, block: u32, bytes: &[u8], source: &Archive, pending: &[(String, Vec<u8>)]) -> Option<String> {
    let normalized = name.replace('\\', "/");
    let mut candidate = normalized;
    let Some(mut safe) = safe_archive_path(&candidate) else { return None; };
    if pending.iter().any(|(path, existing)| path.eq_ignore_ascii_case(&safe) && existing == bytes) {
        return Some(safe);
    }
    if source.block(&safe).is_some_and(|existing| existing != block)
        || pending.iter().any(|(path, _)| path.eq_ignore_ascii_case(&safe)) {
        let leaf = safe.rsplit_once('/').map_or(safe.as_str(), |(_, leaf)| leaf).to_string();
        let (stem, extension) = leaf.rsplit_once('.').unwrap_or((&leaf, ""));
        let (stem, extension) = (stem.to_string(), extension.to_string());
        let mut suffix = 0u32;
        loop {
            let unique = if extension.is_empty() { format!("{stem}__box_{block}_{suffix}") } else { format!("{stem}__box_{block}_{suffix}.{extension}") };
            candidate = format!("war3mapImported/{unique}");
            safe = safe_archive_path(&candidate)?;
            let source_conflict = source.block(&safe).is_some_and(|existing| existing != block);
            let pending_conflict = pending.iter().any(|(path, _)| path.eq_ignore_ascii_case(&safe));
            if !source_conflict && !pending_conflict { break; }
            suffix = suffix.checked_add(1)?;
        }
    }
    Some(safe)
}

