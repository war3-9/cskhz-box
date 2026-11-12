use crate::model_viewer::storm::Archive;
use std::{collections::{HashMap, HashSet}, sync::OnceLock};

const TABLES: [&str; 2] = ["TerrainArt/Terrain.slk", "TerrainArt/CliffTypes.slk"];

#[derive(serde::Deserialize)]
struct Catalog {
    ground: HashMap<String, String>,
    cliff: HashMap<String, String>,
    paths: Vec<String>,
}

fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| serde_json::from_str(include_str!("terrain_paths.json")).expect("embedded terrain catalog"))
}

// Native IDs identify logical texture paths independently of the map's base
// tileset. Scan unused native overrides too, so changing tiles in KK stays valid.
pub(super) fn references(archive: &Archive, members: &HashMap<String, Vec<u8>>) -> Result<HashSet<String>, String> {
    let data = catalog();
    let mut paths: HashSet<_> = data.paths.iter().chain(data.ground.values()).chain(data.cliff.values()).cloned().collect();
    // Cliff meshes are generated from corner heights at runtime, so no W3E or
    // doodad record contains their filenames. Recover them explicitly instead
    // of carrying only anonymous MPQ identities without editor import paths.
    paths.extend(serde_json::from_str::<Vec<String>>(include_str!("cliff_model_paths.json")).expect("embedded cliff model paths"));
    for (index, table) in TABLES.iter().enumerate() {
        let archive_path = table.replace('/', "\\");
        let pending = members.iter().find(|(path, _)| path.eq_ignore_ascii_case(table)).map(|(_, bytes)| bytes.clone());
        let bytes = match pending {
            Some(bytes) => bytes,
            None if archive.has(&archive_path) => archive.read(&archive_path)?,
            _ => continue,
        };
        paths.insert(table.to_string());
        let (dir, file) = if index == 0 { ("dir", "file") } else { ("texDir", "texFile") };
        paths.extend(super::terrain_slk::texture_paths(&bytes, dir, file)?);
    }
    // Native terrain names may resolve to TGA instead of BLP. Anonymous TGA
    // identities must also become exact imports or KK drops them while saving.
    let tga_paths: Vec<_> = paths.iter().filter_map(|path| path.strip_suffix(".blp").map(|base| format!("{base}.tga"))).collect();
    paths.extend(tga_paths);
    Ok(paths)
}

pub(super) fn preserve(archive: &Archive, members: &mut HashMap<String, Vec<u8>>, removed_members: &HashSet<String>) -> Result<(), String> {
    let mut imports = Vec::new();
    for name in references(archive, members)? {
        let safe = super::resources::safe_archive_path(&name).ok_or_else(|| format!("地形贴图路径不安全：{name}"))?;
        if removed_members.contains(&safe.to_ascii_lowercase()) { continue; }
        let archive_path = safe.replace('/', "\\");
        if !members.keys().any(|key| key.eq_ignore_ascii_case(&safe)) {
            if !archive.has(&archive_path) { continue; } // Built-in textures are supplied by Warcraft.
            members.insert(safe.clone(), crate::model_viewer::codec::convert(&archive.read(&archive_path)?)?.into_owned());
        }
        imports.push((13, safe.replace('/', "\\").into_bytes()));
    }
    if imports.is_empty() { return Ok(()); }
    let existing = match members.get("war3map.imp") {
        Some(bytes) => Some(bytes.clone()),
        None if archive.has("war3map.imp") => Some(archive.read("war3map.imp")?),
        _ => None,
    };
    members.insert("war3map.imp".into(), super::imports::merge(existing.as_deref(), &[], &imports)?);
    Ok(())
}

#[cfg(test)]
mod tests;
