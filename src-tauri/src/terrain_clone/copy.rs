use super::{w3e::{self, W3e}, SelectionRect};

const SLOT_LIMIT: usize = 16;
const LAYER_HEIGHT: i32 = 512;

#[cfg(test)]
pub(super) fn copy_region(source_bytes: &[u8], target_bytes: &mut Vec<u8>, rect: &SelectionRect, destination: [u32; 2], ground_art: bool, cliff_art: bool) -> Result<(u32, Vec<String>), String> {
    copy_region_rotated(source_bytes, target_bytes, rect, destination, ground_art, cliff_art, 0)
}

pub(super) fn copy_region_rotated(source_bytes: &[u8], target_bytes: &mut Vec<u8>, rect: &SelectionRect, destination: [u32; 2], ground_art: bool, cliff_art: bool, rotation: u16) -> Result<(u32, Vec<String>), String> {
    let rotation = rotation % 360;
    if !matches!(rotation, 0 | 90 | 180 | 270) { return Err("地形旋转角度必须是 0、90、180 或 270 度".into()); }
    let source = w3e::parse(source_bytes)?;
    let mut target = w3e::parse(target_bytes)?;
    let (width, height) = rotated_dimensions(rect, rotation);
    validate(&source, &target, rect, destination, width, height)?;
    let selected = |x: u32, y: u32| is_selected(rect, &source, x, y);
    let (source_ground, target_ground) = (w3e::palette(source_bytes, 0)?, w3e::palette(target_bytes, 0)?);
    let (source_cliff, target_cliff) = (w3e::palette(source_bytes, 1)?, w3e::palette(target_bytes, 1)?);
    let (used_sg, used_tg) = palette_usage(&source, &target, rect, destination, &source_ground, &target_ground, 0, rotation);
    let (used_sc, used_tc) = palette_usage(&source, &target, rect, destination, &source_cliff, &target_cliff, 4, rotation);
    let (new_ground, source_ground_map, target_ground_map) = merge_palette(&source_ground, &target_ground, &used_sg, &used_tg, ground_art)?;
    let (new_cliff, target_cliff_map, source_cliff_map) = merge_palette(&target_cliff, &source_cliff, &used_tc, &used_sc, cliff_art)?;
    let (header, changed_palette) = w3e::rebuild_header(&target.header, &new_ground, &new_cliff)?;
    target.header = header;

    let layer_shift = border_layer(&target, destination[0], destination[1], width, height) - border_layer(&source, rect.x0, rect.y0, rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
    let height_shift = border_visual(&target, destination[0], destination[1], width, height) - border_visual(&source, rect.x0, rect.y0, rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
    let mut changed = 0;
    let mut copied_water = 0;
    let source_width = rect.x1 - rect.x0 + 1;
    let source_height = rect.y1 - rect.y0 + 1;
    for sy_local in 0..source_height { for sx_local in 0..source_width {
        let sx = rect.x0 + sx_local; let sy = rect.y0 + sy_local;
        if !selected(sx, sy) { continue; }
        let (tx_local, ty_local) = source_to_target(sx_local, sy_local, source_width, source_height, rotation);
        let mut cell = source.cell(sx, sy).to_vec();
        let old_texture = cell[4];
        cell[4] = (old_texture & 0xf0) | (source_ground_map.get((old_texture & 15) as usize).copied().unwrap_or(0) & 15);
        let old_cliff = cell[6] >> 4;
        let cliff = if old_cliff == 15 { 15 } else { source_cliff_map.get(old_cliff as usize).copied().unwrap_or(0) & 15 };
        cell[6] = (cell[6] & 15) | (cliff << 4);
        cell[6] = (cell[6] & 0xf0) | ((i32::from(cell[6] & 15) + layer_shift).clamp(0, 15) as u8);
        adjust_water_level(&mut cell, height_shift);
        copied_water += u32::from(cell[4] & 0x40 != 0);
        target.cell_mut(destination[0] + tx_local, destination[1] + ty_local).copy_from_slice(&cell);
        changed += 1;
    } }
    remap_target_outside(&mut target, rect, destination, width, height, &selected, &target_ground_map, &target_cliff_map, rotation);
    let trimmed_water = trim_overhanging_water(&mut target, rect, destination, width, height, &selected, rotation);
    *target_bytes = target.to_bytes();
    Ok((changed, vec![
        format!("复制了 {changed} 个地形 tilepoint"),
        format!("调色板：地面 {} 项，悬崖 {} 项{}", new_ground.len(), new_cliff.len(), if changed_palette { "（已更新）" } else { "" }),
        format!("高度对齐 {height_shift}，悬崖层偏移 {layer_shift}，水面 {copied_water} 格{}", if rotation == 0 { String::new() } else { format!("，旋转 {rotation}°") }),
        format!("水面边缘修剪 {trimmed_water} 格"),
    ]))
}

pub(super) fn aligned_height_rotated(source_bytes: &[u8], target_bytes: &[u8], rect: &SelectionRect, destination: [u32; 2], rotation: u16) -> Result<i32, String> {
    let source = w3e::parse(source_bytes)?;
    let target = w3e::parse(target_bytes)?;
    let (width, height) = rotated_dimensions(rect, rotation % 360);
    validate(&source, &target, rect, destination, width, height)?;
    Ok(border_visual(&target, destination[0], destination[1], width, height) - border_visual(&source, rect.x0, rect.y0, width, height))
}

fn validate(source: &W3e, target: &W3e, rect: &SelectionRect, destination: [u32; 2], width: u32, height: u32) -> Result<(), String> {
    if rect.x0 > rect.x1 || rect.y0 > rect.y1 || rect.x1 >= source.width || rect.y1 >= source.height { return Err("源选区超出地图范围".into()); }
    if destination[0].checked_add(width).is_none_or(|edge| edge > target.width) || destination[1].checked_add(height).is_none_or(|edge| edge > target.height) { return Err("目标粘贴位置超出地图范围".into()); }
    if rect.mask.as_ref().is_some_and(|mask| mask.len() != source.width as usize * source.height as usize) { return Err("涂抹选区数据与源地图尺寸不一致".into()); }
    Ok(())
}

fn is_selected(rect: &SelectionRect, source: &W3e, x: u32, y: u32) -> bool {
    if x < rect.x0 || y < rect.y0 || x > rect.x1 || y > rect.y1 { return false; }
    rect.mask.as_ref().is_none_or(|mask| mask[y as usize * source.width as usize + x as usize])
}

fn palette_usage(source: &W3e, target: &W3e, rect: &SelectionRect, destination: [u32; 2], source_palette: &[[u8; 4]], target_palette: &[[u8; 4]], byte: usize, rotation: u16) -> (Vec<bool>, Vec<bool>) {
    let mut source_used = vec![false; source_palette.len()]; let mut target_used = vec![false; target_palette.len()];
    for y in rect.y0..=rect.y1 { for x in rect.x0..=rect.x1 { if is_selected(rect, source, x, y) {
        mark_used(&mut source_used, source.cell(x, y)[if byte == 0 { 4 } else { 6 }], byte);
    } } }
    let (width, height) = rotated_dimensions(rect, rotation);
    for y in 0..target.height { for x in 0..target.width {
        let inside = x >= destination[0] && y >= destination[1] && x < destination[0] + width && y < destination[1] + height;
        let selected = inside && { let (sx, sy) = target_to_source(x - destination[0], y - destination[1], rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1, rotation); is_selected(rect, source, rect.x0 + sx, rect.y0 + sy) };
        if !selected { mark_used(&mut target_used, target.cell(x, y)[if byte == 0 { 4 } else { 6 }], byte); }
    } }
    (source_used, target_used)
}

fn mark_used(used: &mut [bool], texture: u8, byte: usize) {
    if used.is_empty() { return; }
    let index = if byte == 0 { usize::from(texture & 15) } else { usize::from((texture >> 4) & 15) };
    if let Some(slot) = used.get_mut(index) { *slot = true; }
}

fn merge_palette(source: &[[u8; 4]], target: &[[u8; 4]], source_used: &[bool], target_used: &[bool], enabled: bool) -> Result<(Vec<[u8; 4]>, Vec<u8>, Vec<u8>), String> {
    if !enabled {
        let source_map = source.iter().map(|id| target.iter().position(|candidate| candidate == id).unwrap_or(0) as u8).collect();
        let target_map = (0..target.len()).map(|index| index as u8).collect();
        return Ok((target.to_vec(), source_map, target_map));
    }
    let mut merged = Vec::new();
    for (index, id) in source.iter().enumerate() { if source_used.get(index).copied().unwrap_or(false) && !merged.contains(id) { merged.push(*id); } }
    let target_prefix = target_used.iter().rposition(|used| *used).map_or(0, |last| last + 1);
    for id in target.iter().take(target_prefix) { if !merged.contains(id) { merged.push(*id); } }
    if merged.is_empty() { merged.extend(target.iter().take(SLOT_LIMIT).copied()); }
    if merged.len() > SLOT_LIMIT { return Err("源选区与目标地图正在使用的纹理超过 16 种，无法无损合并调色板".into()); }
    let source_map = source.iter().map(|id| merged.iter().position(|candidate| candidate == id).unwrap_or(0) as u8).collect();
    let target_map = target.iter().map(|id| merged.iter().position(|candidate| candidate == id).unwrap_or(0) as u8).collect();
    Ok((merged, source_map, target_map))
}

fn border_cells(map: &W3e, x: u32, y: u32, width: u32, height: u32) -> Vec<Vec<u8>> {
    let mut cells = Vec::new();
    for xx in x..x + width { for yy in [y.saturating_sub(1), y + height] { if xx < map.width && yy < map.height { cells.push(map.cell(xx, yy).to_vec()); } } }
    for yy in y..y + height { for xx in [x.saturating_sub(1), x + width] { if xx < map.width && yy < map.height { cells.push(map.cell(xx, yy).to_vec()); } } }
    cells
}

fn border_layer(map: &W3e, x: u32, y: u32, width: u32, height: u32) -> i32 {
    let mut counts = [0u8; 16];
    for cell in border_cells(map, x, y, width, height) { counts[(cell[6] & 15) as usize] = counts[(cell[6] & 15) as usize].saturating_add(1); }
    counts.iter().enumerate().max_by_key(|(_, count)| **count).map(|(layer, _)| layer as i32).unwrap_or(0)
}

fn border_visual(map: &W3e, x: u32, y: u32, width: u32, height: u32) -> i32 {
    let cells = border_cells(map, x, y, width, height);
    if cells.is_empty() { return 0; }
    let sum: i64 = cells.iter().map(|cell| i32::from(u16::from_le_bytes([cell[0], cell[1]])) - 8192 + (i32::from(cell[6] & 15) - 2) * LAYER_HEIGHT).map(i64::from).sum();
    (sum as f64 / cells.len() as f64).round() as i32
}

fn adjust_water_level(cell: &mut [u8], delta: i32) {
    let word = u16::from_le_bytes([cell[2], cell[3]]);
    let flags = word & 0xc000;
    let level = (i32::from(word & 0x3fff) + delta).clamp(0, 0x3fff) as u16;
    cell[2..4].copy_from_slice(&(flags | level).to_le_bytes());
}

fn remap_target_outside(target: &mut W3e, rect: &SelectionRect, dest: [u32; 2], width: u32, height: u32, selected: &impl Fn(u32, u32) -> bool, ground_map: &[u8], cliff_map: &[u8], rotation: u16) {
    for y in 0..target.height { for x in 0..target.width {
        let inside = x >= dest[0] && y >= dest[1] && x < dest[0] + width && y < dest[1] + height;
        if inside { let (sx, sy) = target_to_source(x - dest[0], y - dest[1], rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1, rotation); if selected(rect.x0 + sx, rect.y0 + sy) { continue; } }
        let cell = target.cell_mut(x, y); let ground = (cell[4] & 15) as usize; let cliff = (cell[6] >> 4) as usize;
        if let Some(index) = ground_map.get(ground) { cell[4] = (cell[4] & 0xf0) | (*index & 15); }
        if cliff != 15 { if let Some(index) = cliff_map.get(cliff) { cell[6] = (cell[6] & 15) | ((*index & 15) << 4); } }
    } }
}

fn trim_overhanging_water(target: &mut W3e, rect: &SelectionRect, dest: [u32; 2], width: u32, height: u32, selected: &impl Fn(u32, u32) -> bool, rotation: u16) -> u32 {
    let mut removed = 0;
    for y in 0..height { for x in 0..width {
        let (sx_local, sy_local) = target_to_source(x, y, rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1, rotation);
        let sx = rect.x0 + sx_local; let sy = rect.y0 + sy_local;
        if !selected(sx, sy) { continue; }
        let tx = dest[0] + x; let ty = dest[1] + y;
        if target.cell(tx, ty)[4] & 0x40 == 0 { continue; }
        let word = u16::from_le_bytes([target.cell(tx, ty)[2], target.cell(tx, ty)[3]]) & 0x3fff;
        let water = i32::from(word) - 8192;
        let mut overhang = 0;
        for (dx, dy) in [(-1i32,0i32),(1,0),(0,-1),(0,1)] {
            let nx = tx as i32 + dx; let ny = ty as i32 + dy;
            if nx < 0 || ny < 0 || nx >= target.width as i32 || ny >= target.height as i32 { continue; }
            let inside = nx >= dest[0] as i32 && ny >= dest[1] as i32 && nx < (dest[0] + width) as i32 && ny < (dest[1] + height) as i32;
            if inside { let (local_x, local_y) = target_to_source(nx as u32 - dest[0], ny as u32 - dest[1], rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1, rotation); if selected(rect.x0 + local_x, rect.y0 + local_y) { continue; } }
            let neighbor = target.cell(nx as u32, ny as u32);
            if neighbor[4] & 0x40 != 0 { continue; }
            let height = i32::from(u16::from_le_bytes([neighbor[0], neighbor[1]])) - 8192 + (i32::from(neighbor[6] & 15) - 2) * LAYER_HEIGHT;
            overhang = overhang.max(water - height);
        }
        if overhang > LAYER_HEIGHT / 4 { target.cell_mut(tx, ty)[4] &= !0x40; removed += 1; }
    } }
    removed
}

fn rotated_dimensions(rect: &SelectionRect, rotation: u16) -> (u32, u32) {
    let width = rect.x1 - rect.x0 + 1; let height = rect.y1 - rect.y0 + 1;
    if rotation == 90 || rotation == 270 { (height, width) } else { (width, height) }
}

fn source_to_target(x: u32, y: u32, width: u32, height: u32, rotation: u16) -> (u32, u32) {
    match rotation { 90 => (height - 1 - y, x), 180 => (width - 1 - x, height - 1 - y), 270 => (y, width - 1 - x), _ => (x, y) }
}

fn target_to_source(x: u32, y: u32, width: u32, height: u32, rotation: u16) -> (u32, u32) {
    match rotation { 90 => (y, height - 1 - x), 180 => (width - 1 - x, height - 1 - y), 270 => (width - 1 - y, x), _ => (x, y) }
}
