mod session;
mod blank;
mod trigger_safety;
mod w3e;
mod export_table;
mod copy;
mod entities;
mod special_doodads;
mod grids;
mod regions;
mod resources;
mod dependencies;
mod imports;
mod object_data;
mod object_merge;
mod optimized_objects;
mod normalizer;
mod trigger_strings;
mod mpq_identity;
pub(crate) fn reserve_import_capacity(path: &std::path::Path, count: usize) -> Result<(), String> { mpq_identity::reserve(path, count) }
mod save;
mod skin_resources;
mod terrain_resources;
mod terrain_slk;
#[cfg(test)]
mod came_tests;

use serde::{Deserialize, Serialize};
use session::MapDocument;
use std::{collections::HashMap, path::{Path, PathBuf}, sync::Mutex};
#[cfg(test)]
use std::fs;
use tauri::State;

#[derive(Default)]
pub struct TerrainCloneState { maps: Mutex<HashMap<String, MapDocument>> }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainMapInfo {
    pub id: String,
    pub path: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
    pub doodad_points: Vec<[f32; 2]>,
    pub preview_warnings: Vec<String>,
    pub dirty: bool,
    pub can_undo: bool,
    pub undo_steps: usize,
    pub blank: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionRect { pub x0: u32, pub y0: u32, pub x1: u32, pub y1: u32, pub mask: Option<Vec<bool>> }

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyOptions {
    pub terrain: bool, pub ground_art: bool, pub cliff_art: bool,
    #[serde(default = "default_native_cliffs")]
    pub native_cliffs: bool,
    pub doodads: bool, pub units: bool, pub paths: bool, pub shadows: bool,
    pub regions: bool, pub object_data: bool, pub all_resources: bool,
}

fn default_native_cliffs() -> bool { false }

const NATIVE_CLIFF_TEXTURES: [(&str, &[u8]); 2] = [
    ("ReplaceableTextures/Cliff/Cliff0.blp", include_bytes!("../../resources/terrain/Cliff0.blp")),
    ("ReplaceableTextures/Cliff/Cliff1.blp", include_bytes!("../../resources/terrain/Cliff1.blp")),
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyResult { pub changed_tilepoints: u32, pub log: Vec<String>, pub target: TerrainMapInfo }

fn map_path(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    if !p.is_absolute() || !["w3x", "w3m"].contains(&ext.as_str()) { return Err("请选择普通 .w3x 或 .w3m 地图".into()); }
    Ok(p.to_path_buf())
}

fn info(id: &str, doc: &MapDocument) -> Result<TerrainMapInfo, String> {
    let preview = w3e::parse(&doc.w3e)?;
    let (doodad_points, preview_warnings) = match doc.members.get("war3map.doo") {
        Some(bytes) => match entities::markers(bytes, &preview) {
            Ok(points) => (points, vec![]),
            Err(error) => (vec![], vec![format!("装饰物位置未显示：{error}")]),
        },
        None => (vec![], vec![]),
    };
    Ok(TerrainMapInfo { id: id.into(), path: doc.path.to_string_lossy().into(), name: if doc.blank { "新建空白地图".into() } else { doc.path.file_name().unwrap_or_default().to_string_lossy().into() }, width: preview.width, height: preview.height, pixels: preview.rgb(), doodad_points, preview_warnings, dirty: doc.w3e != doc.saved_w3e || doc.members != doc.saved_members || doc.removed_members != doc.saved_removed_members || doc.blank, can_undo: doc.history_cursor > 0, undo_steps: doc.history_cursor, blank: doc.blank })
}

fn read_document(path: PathBuf, normalizer_base: &Path) -> Result<MapDocument, String> {
    let archive = super::model_viewer::storm::Archive::open(&path)?;
    let bytes = archive.read("war3map.w3e").map_err(|_| "地图缺少可读取的 war3map.w3e 地形数据".to_string())?;
    w3e::parse(&bytes)?;
    let mut doc = MapDocument::new(path, bytes);
    for member in ["war3map.doo", "war3mapUnits.doo", "war3map.wpm", "war3map.shd", "war3map.w3r", "war3map.imp", "war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q", "war3map.w3i", "war3map.wts"] {
        if archive.has(member) {
            let bytes = archive.read(member)?;
            // Authenticated CAME maps use a single NUL for absent optional tables.
            if archive.external_count().is_some() && ["war3map.w3r", "war3map.wts"].contains(&member) && bytes == [0] { continue; }
            doc.members.insert(member.into(), bytes);
        }
    }
    optimized_objects::load(&archive, &mut doc.members)?;
    if let Some(bytes) = doc.members.get("war3map.imp") { doc.members.insert("war3map.imp".into(), imports::normalize(&archive, bytes)?); }
    normalizer::normalize(&mut doc, normalizer_base)?;
    let wts = doc.members.get("war3map.wts").cloned().unwrap_or_default();
    for name in ["war3map.w3u", "war3map.w3t", "war3map.w3a", "war3map.w3b", "war3map.w3d", "war3map.w3h", "war3map.w3q"] {
        if let Some(bytes) = doc.members.get(name) { let extended = ["war3map.w3a", "war3map.w3d", "war3map.w3q"].contains(&name); doc.members.insert(name.into(), object_data::resolve_strings(bytes, &wts, extended)?); }
    }
    doc.saved_members = doc.members.clone();
    Ok(doc)
}

#[tauri::command]
pub fn terrain_clone_open_map(path: String, app: tauri::AppHandle, state: State<'_, TerrainCloneState>) -> Result<TerrainMapInfo, String> {
    let doc = read_document(map_path(&path)?, &crate::app_data::directory(&app)?.join("terrain-clone"))?;
    let id = uuid::Uuid::new_v4().to_string();
    let result = info(&id, &doc)?;
    state.maps.lock().map_err(|_| "地图状态锁定失败".to_string())?.insert(id, doc);
    Ok(result)
}

#[tauri::command]
pub fn terrain_clone_copy_region(source_id: String, target_id: String, selection: SelectionRect, destination: [u32; 2], rotation: Option<u16>, options: CopyOptions, state: State<'_, TerrainCloneState>) -> Result<CopyResult, String> {
    if ![options.terrain, options.doodads, options.units, options.paths, options.shadows, options.regions, options.all_resources, options.object_data, options.native_cliffs].into_iter().any(|enabled| enabled) {
        return Err("请至少选择地形、装饰物、单位/物品、寻路、阴影或区域中的一项".into());
    }
    if source_id == target_id { return Err("源地图和目标地图不能相同".into()); }
    let mut maps = state.maps.lock().map_err(|_| "地图状态锁定失败".to_string())?;
    let source_doc = maps.get(&source_id).ok_or("源地图会话已关闭")?.clone();
    let target = maps.get(&target_id).ok_or("目标地图会话已关闭")?;
    if !target.blank && source_doc.path == target.path { return Err("源地图和目标地图不能使用同一个文件".into()); }
    let before = target.clone();
    let mut updated = before.clone();
    let rotation = rotation.unwrap_or(0);
    if rotation != 0 { return Err("地形旋转功能已移除，请重新放置选区后复制".into()); }
    let height_shift = if options.terrain || options.doodads || options.units { copy::aligned_height_rotated(&source_doc.w3e, &before.w3e, &selection, destination, rotation)? } else { 0 };
    let (changed, mut log) = if options.terrain {
        copy::copy_region_rotated(&source_doc.w3e, &mut updated.w3e, &selection, destination, options.ground_art, options.cliff_art, rotation)?
    } else { (0, vec!["地形：已跳过".into()]) };
    if rotation != 0 { log.push(format!("目标地形选区已旋转 {rotation}°；旋转操作仅作用于地形，装饰物、单位、寻路、阴影和区域已跳过")); }
    let remap = object_merge::apply(&source_doc, &mut updated, &options, &selection, &mut log)?;
    if options.doodads && rotation == 0 { copy_entity_member_remapped("war3map.doo", &source_doc, &mut updated, &selection, destination, false, &remap, &mut log)?; }
    if options.units && rotation == 0 { copy_entity_member_remapped("war3mapUnits.doo", &source_doc, &mut updated, &selection, destination, true, &remap, &mut log)?; }
    if options.paths && rotation == 0 { copy_grid_member("war3map.wpm", &source_doc, &mut updated, &selection, destination, true, &mut log)?; }
    if options.shadows && rotation == 0 { copy_grid_member("war3map.shd", &source_doc, &mut updated, &selection, destination, false, &mut log)?; }
    if options.regions && rotation == 0 { copy_region_member(&source_doc, &mut updated, &selection, destination, &mut log)?; }
    trigger_safety::validate(&before, &updated)?;
    if options.all_resources {
        let (copied, imported, unresolved) = resources::copy_assets(&source_doc.path, &before.path, &mut updated.members, before.blank)?;
        log.push(format!("模型/贴图/音频资源：新增 {copied} 个，其中导入路径 {imported} 个已加入 war3map.imp"));
        if !unresolved.is_empty() {
            let examples = unresolved.iter().take(8).cloned().collect::<Vec<_>>().join("、");
            log.push(format!("有 {} 项模型依赖存在同名不同内容，未猜测覆盖：{}{}", unresolved.len(), examples, if unresolved.len() > 8 { "……" } else { "" }));
        }
    }
    if options.native_cliffs {
        let replaced = replace_native_cliff_overrides(&mut updated);
        if replaced > 0 { log.push(format!("悬崖贴图：已替换 {replaced} 个原版贴图覆盖文件，悬崖类型与模型保持不变")); }
        else { log.push("悬崖贴图：检测到自定义悬崖模型时保留配套贴图，避免原版 UV 与自定义贴图错配".into()); }
    } else {
        let archive = super::model_viewer::storm::Archive::open(&source_doc.path)?;
        for name in ["ReplaceableTextures/Cliff/Cliff0.blp", "ReplaceableTextures/Cliff/Cliff1.blp"] {
            if updated.removed_members.remove(&name.to_ascii_lowercase()) && options.all_resources && archive.has(&name.replace('/', "\\")) {
                updated.members.insert(name.into(), archive.read(&name.replace('/', "\\"))?);
            }
        }
    }
    if changed > 0 || updated.members != before.members || updated.removed_members != before.removed_members || updated.w3e != before.w3e { updated.push_history(); }
    if options.doodads || options.units { log.push(format!("实体高度对齐：{:.2} 世界单位", height_shift as f32 * 0.25)); }
    let target = maps.get_mut(&target_id).ok_or("目标地图会话已关闭")?;
    *target = updated;
    let target_info = info(&target_id, target)?;
    Ok(CopyResult { changed_tilepoints: changed, log, target: target_info })
}

fn replace_native_cliff_overrides(doc: &mut MapDocument) -> usize {
    let paths: Vec<String> = serde_json::from_str(include_str!("cliff_model_paths.json")).expect("embedded cliff paths");
    if paths.iter().any(|name| doc.members.keys().any(|key| mpq_identity::matches_name(key, name))) { return 0; }
    if let Ok(archive) = crate::model_viewer::storm::Archive::open(&doc.path) {
        if paths.iter().any(|name| archive.has(&name.replace('/', "\\"))) { return 0; }
    }
    let mut replaced = 0;
    for (name, bytes) in NATIVE_CLIFF_TEXTURES {
        doc.removed_members.remove(&name.to_ascii_lowercase());
        if doc.members.get(name).is_none_or(|current| current != bytes)
            || doc.members.keys().any(|path| path.eq_ignore_ascii_case(name) && path != name)
        {
            doc.members.retain(|path, _| !mpq_identity::matches_name(path, name));
            doc.members.insert(name.into(), bytes.to_vec());
            replaced += 1;
        }
    }
    replaced
}

#[tauri::command]
pub fn terrain_clone_adjust_height(map_id: String, rect: SelectionRect, destination: [u32; 2], delta_world: f32, state: State<'_, TerrainCloneState>) -> Result<TerrainMapInfo, String> {
    if !delta_world.is_finite() || delta_world.abs() > 8192.0 { return Err("高度调整必须在 -8192 到 8192 世界单位之间".into()); }
    let mut maps = state.maps.lock().map_err(|_| "地图状态锁定失败".to_string())?;
    let doc = maps.get_mut(&map_id).ok_or("目标地图会话已关闭")?;
    let mut terrain = w3e::parse(&doc.w3e)?;
    validate_selection(&terrain, &rect, destination)?;
    let raw_delta = (delta_world * 4.0).round() as i32;
    if raw_delta == 0 { return info(&map_id, doc); }
    let width = rect.x1 - rect.x0 + 1;
    let height = rect.y1 - rect.y0 + 1;
    for y in 0..height { for x in 0..width {
        let sx = rect.x0 + x; let sy = rect.y0 + y;
        if rect.mask.as_ref().is_some_and(|mask| !mask[sy as usize * terrain.width as usize + sx as usize]) { continue; }
        let cell = terrain.cell_mut(destination[0] + x, destination[1] + y);
        let ground = (i32::from(u16::from_le_bytes([cell[0], cell[1]])) + raw_delta).clamp(0, u16::MAX as i32) as u16;
        cell[0..2].copy_from_slice(&ground.to_le_bytes());
        let level = u16::from_le_bytes([cell[2], cell[3]]);
        let flags = level & 0xc000;
        let adjusted = (i32::from(level & 0x3fff) + raw_delta).clamp(0, 0x3fff) as u16;
        cell[2..4].copy_from_slice(&(flags | adjusted).to_le_bytes());
    } }
    doc.w3e = terrain.to_bytes();
    doc.push_history();
    info(&map_id, doc)
}

fn validate_selection(map: &w3e::W3e, rect: &SelectionRect, destination: [u32; 2]) -> Result<(), String> {
    if rect.x0 > rect.x1 || rect.y0 > rect.y1 || rect.x1 >= map.width || rect.y1 >= map.height { return Err("高度调整选区超出地图范围".into()); }
    let width = rect.x1 - rect.x0 + 1; let height = rect.y1 - rect.y0 + 1;
    if destination[0].checked_add(width).is_none_or(|edge| edge > map.width) || destination[1].checked_add(height).is_none_or(|edge| edge > map.height) { return Err("高度调整区域超出地图范围".into()); }
    if rect.mask.as_ref().is_some_and(|mask| mask.len() != map.width as usize * map.height as usize) { return Err("涂抹选区数据与地图尺寸不一致".into()); }
    Ok(())
}

#[cfg(test)]
fn copy_entity_member(name: &str, source: &MapDocument, target: &mut MapDocument, selection: &SelectionRect, destination: [u32; 2], units: bool, log: &mut Vec<String>) -> Result<(), String> {
    copy_entity_member_remapped(name, source, target, selection, destination, units, &Default::default(), log)
}

fn copy_entity_member_remapped(name: &str, source: &MapDocument, target: &mut MapDocument, selection: &SelectionRect, destination: [u32; 2], units: bool, remap: &HashMap<[u8; 4], [u8; 4]>, log: &mut Vec<String>) -> Result<(), String> {
    let empty = empty_entities(source.members.get(name).or_else(|| target.members.get(name)), units);
    let src = source.members.get(name).unwrap_or(&empty);
    let dst = target.members.get(name).unwrap_or(&empty);
    let (bytes, count) = entities::copy_remapped(src, dst, &source.w3e, &target.w3e, selection, destination, units, remap)?;
    target.members.insert(name.into(), bytes);
    log.push(format!("{}：复制 {count} 个", if units { "单位/物品" } else { "装饰物" }));
    Ok(())
}

fn empty_entities(template: Option<&Vec<u8>>, units: bool) -> Vec<u8> {
    let mut bytes = template.map(|bytes| bytes[..bytes.len().min(12)].to_vec()).unwrap_or_else(|| b"W3do\x08\x00\x00\x00\x0b\x00\x00\x00".to_vec());
    bytes.truncate(12);
    bytes.extend_from_slice(&0i32.to_le_bytes());
    if !units { bytes.extend_from_slice(&[0; 8]); }
    bytes
}

fn copy_grid_member(name: &str, source: &MapDocument, target: &mut MapDocument, selection: &SelectionRect, destination: [u32; 2], has_header: bool, log: &mut Vec<String>) -> Result<(), String> {
    let (Some(src), Some(dst)) = (source.members.get(name), target.members.get(name)) else { return Ok(()); };
    let (bytes, count) = grids::copy(src, dst, &source.w3e, &target.w3e, selection, destination, has_header)?;
    target.members.insert(name.into(), bytes);
    log.push(format!("{}：复制 {count} 个单元格", if has_header { "寻路" } else { "阴影" }));
    Ok(())
}

fn copy_region_member(source: &MapDocument, target: &mut MapDocument, selection: &SelectionRect, destination: [u32; 2], log: &mut Vec<String>) -> Result<(), String> {
    let empty = 5i32.to_le_bytes().into_iter().chain(0i32.to_le_bytes()).collect::<Vec<_>>();
    let src = source.members.get("war3map.w3r").unwrap_or(&empty);
    let dst = target.members.get("war3map.w3r").unwrap_or(&empty);
    let (bytes, copied, skipped) = regions::copy(src, dst, &source.w3e, &target.w3e, selection, destination)?;
    target.members.insert("war3map.w3r".into(), bytes);
    log.push(format!("区域：复制 {copied} 个，未复制 {skipped} 个未完全包含的区域"));
    Ok(())
}

#[tauri::command]
pub fn terrain_clone_new_blank(template_id: String, state: State<'_, TerrainCloneState>) -> Result<TerrainMapInfo, String> {
    let mut maps = state.maps.lock().map_err(|_| "地图状态锁定失败".to_string())?;
    let template = maps.get(&template_id).ok_or("请先打开一张源地图作为空白地图模板")?;
    let mut doc = MapDocument::new(template.path.clone(), w3e::clear(&template.saved_w3e)?);
    doc.blank = true;
    blank::initialize(&mut doc, template);
    doc.saved_members = doc.members.clone();
    doc.saved_removed_members = doc.removed_members.clone();
    let id = uuid::Uuid::new_v4().to_string();
    let result = info(&id, &doc)?;
    maps.insert(id, doc);
    Ok(result)
}

#[tauri::command]
pub fn terrain_clone_undo(map_id: String, state: State<'_, TerrainCloneState>) -> Result<TerrainMapInfo, String> {
    let mut maps = state.maps.lock().map_err(|_| "地图状态锁定失败".to_string())?;
    let doc = maps.get_mut(&map_id).ok_or("地图会话已关闭")?;
    doc.undo();
    info(&map_id, doc)
}

#[tauri::command]
pub fn terrain_clone_save_map(map_id: String, destination: String, state: State<'_, TerrainCloneState>) -> Result<String, String> {
    let mut maps = state.maps.lock().map_err(|_| "地图状态锁定失败".to_string())?;
    let doc = maps.get_mut(&map_id).ok_or("地图会话已关闭")?;
    let output = map_path(&destination)?;
    if doc.blank && output == doc.path { return Err("新建空白地图必须另存，不能覆盖源地图".into()); }
    if output == doc.path {
        save::write_map_in_place(doc)?;
        let result = output.to_string_lossy().into_owned();
        doc.mark_saved(output);
        return Ok(result);
    }
    if output.exists() { return Err("请选择新的输出路径，不能覆盖已有文件".into()); }
    save::write_map_copy(doc, &output)?;
    doc.mark_saved(output.clone());
    Ok(output.to_string_lossy().into())
}

#[tauri::command]
pub fn terrain_clone_close_map(map_id: String, state: State<'_, TerrainCloneState>) {
    if let Ok(mut maps) = state.maps.lock() { maps.remove(&map_id); }
}

#[tauri::command]
pub fn terrain_clone_export_table(map_id: String, selection: Option<SelectionRect>, state: State<'_, TerrainCloneState>) -> Result<String, String> {
    let maps = state.maps.lock().map_err(|_| "地图状态锁定失败".to_string())?;
    let doc = maps.get(&map_id).ok_or("地图会话已关闭")?;
    export_table::export(doc, selection.as_ref())
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod palette_tests;
#[cfg(test)]
mod entity_tests;
#[cfg(test)]
mod grid_tests;
#[cfg(test)]
mod complete_tests;
