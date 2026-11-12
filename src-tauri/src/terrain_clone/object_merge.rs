use super::{entities, object_data, session::MapDocument, CopyOptions, SelectionRect};
use std::collections::{HashMap, HashSet};

const OBJECT_FILES: [(&str, &str, bool, bool); 7] = [
    ("war3map.w3u", "单位", false, true),
    ("war3map.w3t", "物品", false, true),
    ("war3map.w3a", "技能", true, true),
    ("war3map.w3b", "可破坏物", false, false),
    ("war3map.w3d", "装饰物", true, false),
    ("war3map.w3h", "魔法效果", false, true),
    ("war3map.w3q", "升级", true, true),
];

pub(super) fn apply(source: &MapDocument, target: &mut MapDocument, options: &CopyOptions, selection: &SelectionRect, log: &mut Vec<String>) -> Result<HashMap<[u8; 4], [u8; 4]>, String> {
    let mut remap = HashMap::new();
    if !options.object_data { return Ok(remap); }
    let mut unit_ids = HashSet::new();
    let mut doodad_ids = HashSet::new();
    for (name, enabled, units) in [("war3mapUnits.doo", options.units, true), ("war3map.doo", options.doodads, false)] {
        if !enabled { continue; }
        if let Some(bytes) = source.members.get(name) {
            let ids = entities::selected_ids(bytes, &source.w3e, selection, units)?;
            if units { unit_ids = ids; } else { doodad_ids = ids; }
        }
    }
    if unit_ids.is_empty() && doodad_ids.is_empty() {
        log.push("物编合并：本次选区没有复制单位/物品或装饰物，已跳过".into());
        return Ok(remap);
    }
    let mut existing = HashSet::new();
    let mut reserved = HashSet::new();
    for (name, _, extended, _) in OBJECT_FILES {
        if let Some(bytes) = target.members.get(name) { existing.extend(object_data::ids(bytes, extended)?); }
        if let Some(bytes) = source.members.get(name) { reserved.extend(object_data::ids(bytes, extended)?); }
    }
    reserved.extend(&existing);
    let mut merged = Vec::new();
    for (name, label, extended, unit_data) in OBJECT_FILES {
        let needed = if unit_data { &unit_ids } else { &doodad_ids };
        if needed.is_empty() { continue; }
        if let Some(src) = source.members.get(name) {
            if let Some(bytes) = object_data::merge_selected(src, target.members.get(name), extended, needed, &mut existing, &mut reserved, &mut remap).map_err(|error| format!("{name}：{error}"))? {
                target.members.insert(name.into(), bytes);
                merged.push(label);
            }
        }
    }
    if merged.is_empty() {
        log.push("物编合并：本次复制对象无需新增定义，保留目标物编".into());
    } else {
        if source.normalized_tables > 0 { log.push(format!("优化物编表：已将 {} 个 SLK/TXT 文件还原为编辑器物编数据，仅合并勾选类别", source.normalized_tables)); }
        log.push(format!("物编合并：仅本次复制对象的{}；同编号同父对象保留目标定义，不同父对象分配新编号", merged.join("、")));
    }
    Ok(remap)
}

#[cfg(test)]
#[path = "object_merge_tests.rs"]
mod tests;
