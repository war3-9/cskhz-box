use super::{w3e, SelectionRect};
use super::special_doodads::SpecialDoodads;

const DOODAD_HEAD: usize = 42;
const UNIT_HEAD: usize = 55;

pub(super) fn variations(bytes: &[u8]) -> Result<std::collections::HashMap<[u8; 4], u32>, String> {
    let mut result = std::collections::HashMap::new();
    for record in Entries::parse(bytes, false)?.records {
        let id = record[..4].try_into().unwrap();
        let variation = u32::from_le_bytes(record[4..8].try_into().unwrap());
        result.entry(id).and_modify(|old: &mut u32| *old = (*old).max(variation)).or_insert(variation);
    }
    Ok(result)
}

#[cfg(test)]
pub(super) fn copy(source: &[u8], target: &[u8], source_w3e: &[u8], target_w3e: &[u8], selection: &SelectionRect, destination: [u32; 2], units: bool) -> Result<(Vec<u8>, usize), String> {
    copy_remapped(source, target, source_w3e, target_w3e, selection, destination, units, &Default::default())
}

pub(super) fn copy_remapped(source: &[u8], target: &[u8], source_w3e: &[u8], target_w3e: &[u8], selection: &SelectionRect, destination: [u32; 2], units: bool, remap: &std::collections::HashMap<[u8; 4], [u8; 4]>) -> Result<(Vec<u8>, usize), String> {
    let source_terrain = w3e::parse(source_w3e)?;
    let target_terrain = w3e::parse(target_w3e)?;
    validate_mask(&source_terrain, selection)?;
    let mut source_entities = Entries::parse(source, units)?;
    for record in &mut source_entities.records {
        if let Some(id) = remap.get(&<[u8; 4]>::try_from(&record[..4]).unwrap()) { record[..4].copy_from_slice(id); }
    }
    if let Some(special) = &mut source_entities.special { special.remap(remap); }
    let mut target_entities = Entries::parse(target, units)?;
    if source_entities.header[4..12] != target_entities.header[4..12] { return Err("源和目标的单位/装饰物格式版本不一致".into()); }
    let special_count = match (&source_entities.special, &mut target_entities.special) {
        (Some(source), Some(target)) => target.copy_from(source, &source_terrain, selection, destination),
        _ => 0,
    };
    let width = selection.x1 - selection.x0 + 1;
    let height = selection.y1 - selection.y0 + 1;
    let dx = target_terrain.origin_x + destination[0] as f32 * 128.0 - (source_terrain.origin_x + selection.x0 as f32 * 128.0);
    let dy = target_terrain.origin_y + destination[1] as f32 * 128.0 - (source_terrain.origin_y + selection.y0 as f32 * 128.0);
    let min_x = target_terrain.origin_x + destination[0] as f32 * 128.0;
    let min_y = target_terrain.origin_y + destination[1] as f32 * 128.0;
    let max_x = target_terrain.origin_x + (destination[0] + width) as f32 * 128.0;
    let max_y = target_terrain.origin_y + (destination[1] + height) as f32 * 128.0;
    target_entities.records.retain(|record| {
        let (x, y, _) = position(record);
        if !(x >= min_x && x < max_x && y >= min_y && y < max_y) { return true; }
        let Some(mask) = selection.mask.as_ref() else { return false; };
        let local_x = ((x - min_x) / 128.0).floor() as u32;
        let local_y = ((y - min_y) / 128.0).floor() as u32;
        let source_x = selection.x0 + local_x;
        let source_y = selection.y0 + local_y;
        !mask.get(source_y as usize * source_terrain.width as usize + source_x as usize).copied().unwrap_or(false)
    });
    source_entities.records.retain_mut(|record| {
        let (x, y, z) = position(record);
        let tile_x = ((x - source_terrain.origin_x) / 128.0).floor() as i32;
        let tile_y = ((y - source_terrain.origin_y) / 128.0).floor() as i32;
        let local_x = tile_x - selection.x0 as i32;
        let local_y = tile_y - selection.y0 as i32;
        if local_x < 0 || local_y < 0 || local_x >= width as i32 || local_y >= height as i32 { return false; }
        if selection.mask.as_ref().is_some_and(|mask| !mask[tile_y as usize * source_terrain.width as usize + tile_x as usize]) { return false; }
        let source_height = visual_height(&source_terrain, tile_x as u32, tile_y as u32);
        let target_x = destination[0] + local_x as u32;
        let target_y = destination[1] + local_y as u32;
        let target_height = visual_height(&target_terrain, target_x, target_y);
        set_position(record, x + dx, y + dy, z + (target_height - source_height) * 0.25);
        true
    });
    let count = source_entities.records.len() + special_count;
    let mut used_ids: std::collections::HashSet<_> = target_entities.records.iter().map(|record| read_i32(record, record.len() - 4).unwrap_or(0)).collect();
    let mut next_id = used_ids.iter().copied().chain(source_entities.records.iter().map(|record| read_i32(record, record.len() - 4).unwrap_or(0))).max().unwrap_or(-1).saturating_add(1);
    for record in &mut source_entities.records {
        let end = record.len();
        let id = read_i32(record, end - 4)?;
        if !used_ids.insert(id) {
            while used_ids.contains(&next_id) { next_id = next_id.checked_add(1).ok_or("单位/装饰物创建编号溢出")?; }
            record[end - 4..].copy_from_slice(&next_id.to_le_bytes());
            used_ids.insert(next_id);
        }
    }
    target_entities.records.extend(source_entities.records);
    Ok((target_entities.to_bytes(), count))
}

pub(super) fn selected_ids(bytes: &[u8], source_w3e: &[u8], selection: &SelectionRect, units: bool) -> Result<std::collections::HashSet<[u8; 4]>, String> {
    let terrain = w3e::parse(source_w3e)?;
    validate_mask(&terrain, selection)?;
    let entries = Entries::parse(bytes, units)?;
    let mut ids = std::collections::HashSet::new();
    for record in entries.records {
        let (x, y, _) = position(&record);
        let x = ((x - terrain.origin_x) / 128.0).floor() as i64;
        let y = ((y - terrain.origin_y) / 128.0).floor() as i64;
        if x < selection.x0 as i64 || x > selection.x1 as i64 || y < selection.y0 as i64 || y > selection.y1 as i64 { continue; }
        if selection.mask.as_ref().is_some_and(|mask| !mask[y as usize * terrain.width as usize + x as usize]) { continue; }
        ids.insert(record[..4].try_into().unwrap());
    }
    if let Some(special) = entries.special { ids.extend(special.selected_ids(&terrain, selection)); }
    Ok(ids)
}

fn visual_height(map: &w3e::W3e, x: u32, y: u32) -> f32 {
    let cell = map.cell(x.min(map.width - 1), y.min(map.height - 1));
    f32::from(u16::from_le_bytes([cell[0], cell[1]])) - 8192.0 + (f32::from(cell[6] & 15) - 2.0) * 512.0
}

fn validate_mask(terrain: &w3e::W3e, selection: &SelectionRect) -> Result<(), String> {
    if selection.x0 > selection.x1 || selection.y0 > selection.y1 || selection.x1 >= terrain.width || selection.y1 >= terrain.height { return Err("实体复制选区超出地图范围".into()); }
    if selection.mask.as_ref().is_some_and(|mask| mask.len() != terrain.width as usize * terrain.height as usize) { return Err("涂抹选区数据与源地图尺寸不一致".into()); }
    Ok(())
}

fn position(record: &[u8]) -> (f32, f32, f32) {
    (read_f32(record, 8), read_f32(record, 12), read_f32(record, 16))
}

fn set_position(record: &mut [u8], x: f32, y: f32, z: f32) {
    record[8..12].copy_from_slice(&x.to_le_bytes());
    record[12..16].copy_from_slice(&y.to_le_bytes());
    record[16..20].copy_from_slice(&z.to_le_bytes());
}

fn read_f32(bytes: &[u8], offset: usize) -> f32 {
    f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap_or_default())
}

struct Entries { header: Vec<u8>, records: Vec<Vec<u8>>, special: Option<SpecialDoodads> }

impl Entries {
    fn parse(bytes: &[u8], units: bool) -> Result<Self, String> {
        if bytes.len() < 16 || &bytes[..4] != b"W3do" { return Err("单位/装饰物文件头无效".into()); }
        if read_i32(bytes, 4)? != 8 || read_i32(bytes, 8)? != 11 { return Err("当前仅支持经典版 8/11 单位/装饰物格式".into()); }
        let count = read_i32(bytes, 12)?;
        if !(0..=1_000_000).contains(&count) { return Err("单位/装饰物数量越界".into()); }
        let mut offset = 16usize;
        let mut records = Vec::with_capacity(count as usize);
        for _ in 0..count {
            let start = offset;
            offset = offset.checked_add(if units { UNIT_HEAD } else { DOODAD_HEAD }).ok_or("单位/装饰物偏移溢出")?;
            if offset > bytes.len() { return Err("单位/装饰物记录被截断".into()); }
            if units { offset = parse_unit_tail(bytes, offset)?; }
            else { offset = parse_doodad_tail(bytes, offset)?; }
            let record = bytes.get(start..offset).ok_or("单位/装饰物记录被截断")?.to_vec();
            let (x, y, z) = position(&record);
            if !x.is_finite() || !y.is_finite() || !z.is_finite() { return Err("单位/装饰物坐标无效".into()); }
            records.push(record);
        }
        let special = if units {
            if offset != bytes.len() { return Err("单位文件包含无法识别的尾随数据".into()); }
            None
        } else { Some(SpecialDoodads::parse(&bytes[offset..])?) };
        Ok(Self { header: bytes[..16].to_vec(), records, special })
    }

    fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = self.header.clone();
        bytes[12..16].copy_from_slice(&(self.records.len() as i32).to_le_bytes());
        for record in &self.records { bytes.extend_from_slice(record); }
        if let Some(special) = &self.special { bytes.extend_from_slice(&special.to_bytes()); }
        bytes
    }
}

pub(super) fn markers(bytes: &[u8], terrain: &w3e::W3e) -> Result<Vec<[f32; 2]>, String> {
    let entries = Entries::parse(bytes, false)?;
    let mut points: Vec<_> = entries.records.iter().map(|record| {
        let (x, y, _) = position(record);
        [(x - terrain.origin_x) / 128.0, (y - terrain.origin_y) / 128.0]
    }).collect();
    if let Some(special) = entries.special { points.extend(special.markers()); }
    Ok(points)
}

pub(super) fn trigger_names(bytes: &[u8], units: bool) -> Result<Vec<String>, String> {
    let entries = Entries::parse(bytes, units)?;
    let mut names = vec![];
    for record in entries.records {
        let id = read_i32(&record, record.len() - 4)?;
        let rawcode = String::from_utf8_lossy(&record[..4]);
        for kind in if units { &["unit", "item"][..] } else { &["dest"][..] } {
            names.push(format!("gg_{kind}_{rawcode}_{id:04}"));
        }
    }
    Ok(names)
}

#[cfg(test)]
pub(super) fn round_trip(bytes: &[u8], units: bool) -> Result<Vec<u8>, String> { Ok(Entries::parse(bytes, units)?.to_bytes()) }

fn parse_doodad_tail(bytes: &[u8], mut offset: usize) -> Result<usize, String> {
    let sets = read_count(bytes, &mut offset, "物品组数量")?;
    for _ in 0..sets {
        let items = read_count(bytes, &mut offset, "物品数量")?;
        skip_items(bytes, &mut offset, items, 8)?;
    }
    skip(bytes, &mut offset, 4)?;
    Ok(offset)
}

fn parse_unit_tail(bytes: &[u8], mut offset: usize) -> Result<usize, String> {
    let drops = read_count(bytes, &mut offset, "掉落表数量")?;
    for _ in 0..drops {
        let items = read_count(bytes, &mut offset, "掉落物数量")?;
        skip_items(bytes, &mut offset, items, 8)?;
    }
    skip(bytes, &mut offset, 24)?;
    let inventory = read_count(bytes, &mut offset, "物品栏数量")?;
    skip_items(bytes, &mut offset, inventory, 8)?;
    let abilities = read_count(bytes, &mut offset, "技能数量")?;
    skip_items(bytes, &mut offset, abilities, 12)?;
    match read_i32(bytes, offset)? {
        0 => skip(bytes, &mut offset, 8)?,
        1 => skip(bytes, &mut offset, 12)?,
        2 => { offset += 4; let random = read_count(bytes, &mut offset, "随机单位数量")?; skip_items(bytes, &mut offset, random, 8)?; }
        _ => return Err("单位随机数据标志无效".into()),
    }
    skip(bytes, &mut offset, 12)?;
    Ok(offset)
}

fn read_count(bytes: &[u8], offset: &mut usize, label: &str) -> Result<usize, String> {
    let count = read_i32(bytes, *offset)?;
    *offset += 4;
    if !(0..=1_000_000).contains(&count) { return Err(format!("{label}越界")); }
    Ok(count as usize)
}

fn read_i32(bytes: &[u8], offset: usize) -> Result<i32, String> {
    let raw: [u8; 4] = bytes.get(offset..offset.checked_add(4).ok_or("单位/装饰物偏移溢出")?).ok_or("单位/装饰物记录被截断")?.try_into().map_err(|_| "单位/装饰物记录被截断")?;
    Ok(i32::from_le_bytes(raw))
}

fn skip_items(bytes: &[u8], offset: &mut usize, count: usize, item_size: usize) -> Result<(), String> {
    let size = count.checked_mul(item_size).ok_or("单位/装饰物记录长度溢出")?;
    skip(bytes, offset, size)
}

fn skip(bytes: &[u8], offset: &mut usize, count: usize) -> Result<(), String> {
    *offset = offset.checked_add(count).ok_or("单位/装饰物偏移溢出")?;
    if *offset > bytes.len() { return Err("单位/装饰物记录被截断".into()); }
    Ok(())
}
