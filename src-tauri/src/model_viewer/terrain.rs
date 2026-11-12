use super::{index::Source, storm::Archive, ViewerState};
use serde::{Deserialize, Serialize};
use std::{collections::{BTreeMap, HashMap, HashSet}, path::Path};

#[derive(Deserialize)]
struct Catalog { ground: HashMap<String, String>, cliff: HashMap<String, String>, paths: Vec<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainTexture { pub path: String, pub name: String, pub terrain_type: String, pub used: bool, pub source_id: Option<String>, pub size: usize }
fn names(bytes: &[u8]) -> Result<(Vec<String>, Vec<String>), String> {
    if !bytes.starts_with(b"W3E!") { return Err("地图地形数据无效".into()); }
    fn group(bytes: &[u8], at: &mut usize) -> Result<Vec<String>, String> {
        let count = u32::from_le_bytes(bytes.get(*at..*at + 4).ok_or("地形纹理表截断")?.try_into().unwrap()) as usize; *at += 4;
        if count > 256 { return Err("地形纹理数量异常".into()); }
        let data = bytes.get(*at..*at + count * 4).ok_or("地形纹理表截断")?; *at += count * 4;
        Ok(data.chunks_exact(4).map(|id| String::from_utf8_lossy(id).into_owned()).collect())
    }
    let mut at = 13; Ok((group(bytes, &mut at)?, group(bytes, &mut at)?))
}
fn slk(bytes: &[u8], cliff: bool) -> Vec<(String, String)> {
    let mut rows: BTreeMap<usize, HashMap<usize, String>> = BTreeMap::new(); let (mut x, mut y) = (0, 0);
    for line in String::from_utf8_lossy(bytes).lines().filter(|line| line.starts_with("C;")) {
        let mut quoted = false; let mut fields = Vec::new(); let mut start = 0;
        for (i, c) in line.char_indices() { if c == '"' { quoted = !quoted; } if c == ';' && !quoted { fields.push(&line[start..i]); start = i + 1; } } fields.push(&line[start..]);
        for field in fields {
            if let Some(v) = field.strip_prefix('X') { x = v.parse().unwrap_or(0); }
            else if let Some(v) = field.strip_prefix('Y') { y = v.parse().unwrap_or(0); }
            else if let Some(v) = field.strip_prefix('K') { rows.entry(y).or_default().insert(x, v.trim_matches('"').replace("\"\"", "\"")); }
        }
    }
    let Some(header) = rows.remove(&1) else { return vec![]; };
    let col = |name: &str| header.iter().find(|(_, value)| value.eq_ignore_ascii_case(name)).map(|(key, _)| *key);
    let (Some(id), Some(dir), Some(file)) = (col(if cliff { "cliffID" } else { "tileID" }), col(if cliff { "texDir" } else { "dir" }), col(if cliff { "texFile" } else { "file" })) else { return vec![]; };
    rows.values().filter_map(|row| { let (id, dir, file) = (row.get(&id)?, row.get(&dir)?, row.get(&file)?); if dir == "_" || file == "_" { return None; } Some((id.clone(), format!("{}/{}{}", dir.replace('\\', "/"), file, if file.to_lowercase().ends_with(".blp") { "" } else { ".blp" }))) }).collect()
}
fn list(source: Source, games: Vec<Source>) -> Result<Vec<TerrainTexture>, String> {
    if !["w3x", "w3m"].iter().any(|ext| source.path.to_lowercase().ends_with(ext)) { return Ok(vec![]); }
    let map = Archive::open(Path::new(&source.path))?;
    let game_archives: Vec<_> = games.iter().filter_map(|s| Archive::open(Path::new(&s.path)).ok().map(|a| (s.id.clone(), a))).collect();
    let data = map.read("war3map.w3e")?; let (ground_ids, cliff_ids) = names(&data)?;
    let mut catalog: Catalog = serde_json::from_str(include_str!("../terrain_clone/terrain_paths.json")).map_err(|e| e.to_string())?;
    for (table, cliff) in [("TerrainArt/Terrain.slk", false), ("TerrainArt/CliffTypes.slk", true)] {
        let bytes = map.read(&table.replace('/', "\\")).ok().or_else(|| game_archives.iter().find_map(|(_, archive)| archive.read(&table.replace('/', "\\")).ok()));
        if let Some(bytes) = bytes { for (id, path) in slk(&bytes, cliff) { if cliff { catalog.cliff.insert(id, path); } else { catalog.ground.insert(id, path); } } }
    }
    let mut candidates: BTreeMap<String, (String, String, bool)> = BTreeMap::new();
    let mut used = HashSet::new();
    for (ids, table, kind) in [(&ground_ids, &catalog.ground, "地面"), (&cliff_ids, &catalog.cliff, "悬崖")] {
        for id in ids {
            if let Some(path) = table.get(id) { used.insert(path.to_lowercase()); candidates.insert(path.to_lowercase(), (path.clone(), format!("{id} · {kind}"), true)); }
        }
    }
    for path in catalog.paths.iter().chain(catalog.ground.values()).chain(catalog.cliff.values()) {
        if map.has(&path.replace('/', "\\")) { candidates.entry(path.to_lowercase()).or_insert_with(|| (path.clone(), path.rsplit('/').next().unwrap_or(path).to_string(), used.contains(&path.to_lowercase()))); }
    }
    let mut result = Vec::new();
    for (_, (path, name, used)) in candidates {
        let resolved = if map.has(&path.replace('/', "\\")) { map.read(&path.replace('/', "\\")).ok().map(|b| (source.id.clone(), b.len())) } else { game_archives.iter().find_map(|(id, archive)| archive.read(&path.replace('/', "\\")).ok().map(|b| (id.clone(), b.len()))) };
        let terrain_type = if catalog.cliff.values().any(|value| value.eq_ignore_ascii_case(&path)) || path.to_lowercase().contains("cliff") { "悬崖" } else { "地面" };
        let (source_id, size) = resolved.map(|(id, size)| (Some(id), size)).unwrap_or((None, 0));
        result.push(TerrainTexture { path, name, terrain_type: terrain_type.into(), used, source_id, size });
    }
    Ok(result)
}
#[tauri::command]
pub async fn viewer_terrain_resources(id: String, game_ids: Vec<String>, state: tauri::State<'_, ViewerState>) -> Result<Vec<TerrainTexture>, String> {
    let (source, games) = { let sources = state.sources.lock().map_err(|e| e.to_string())?; (sources.get(&id).cloned().ok_or("地图已关闭")?, game_ids.iter().filter_map(|id| sources.get(id).cloned()).collect()) };
    tauri::async_runtime::spawn_blocking(move || list(source, games)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_tables_and_slk() {
        assert!(names(b"bad").is_err());
        let mut bytes = b"W3E!".to_vec(); bytes.resize(13,0); bytes.extend(1u32.to_le_bytes()); bytes.extend(b"Zsan"); bytes.extend(0u32.to_le_bytes());
        assert_eq!(names(&bytes).unwrap(), (vec!["Zsan".to_string()], vec![]));
        bytes.pop(); assert!(names(&bytes).is_err());
        let rows = slk(b"ID;PWXL\nC;X1;Y1;K\"tileID\"\nC;X2;K\"dir\"\nC;X3;K\"file\"\nC;X1;Y2;K\"Zsan\"\nC;X2;K\"TerrainArt\\Test\"\nC;X3;K\"Sand\"", false);
        assert_eq!(rows,vec![("Zsan".into(),"TerrainArt/Test/Sand.blp".into())]);
    }
    #[test]
    fn four_ground_textures_prioritize_map_bytes() {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/ui-model-fixtures").join(uuid::Uuid::new_v4().to_string()); std::fs::create_dir_all(&directory).unwrap(); let path = directory.join("terrain.w3x");
        let map = Archive::create_fixture(&path,true);
        let mut bytes=b"W3E!".to_vec();bytes.resize(13,0);bytes.extend(4u32.to_le_bytes());bytes.extend(b"ZsanCvinZbksVcrp");bytes.extend(0u32.to_le_bytes());
        map.write("war3map.w3e",&bytes,false).unwrap();
        let catalog:Catalog=serde_json::from_str(include_str!("../terrain_clone/terrain_paths.json")).unwrap();
        for id in ["Zsan","Cvin","Zbks","Vcrp"] { map.write(&catalog.ground[id],b"map-override",false).unwrap(); }
        drop(map);
        let source=Source { id:"test".into(), name:"terrain".into(), path:path.to_string_lossy().into(), kind:"archive".into(), entries:vec![], complete:true, warning:None, analysis:None };
        let entries=list(source,vec![]).unwrap();assert_eq!(entries.len(),4);
        assert!(entries.iter().all(|e| e.used && e.source_id.as_deref()==Some("test") && e.size==12));
    }
}
