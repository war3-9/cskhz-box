use super::{w3e, SelectionRect};

pub(super) fn copy(source: &[u8], target: &[u8], source_w3e: &[u8], target_w3e: &[u8], selection: &SelectionRect, destination: [u32; 2]) -> Result<(Vec<u8>, usize, usize), String> {
    let source_map = w3e::parse(source_w3e)?;
    let target_map = w3e::parse(target_w3e)?;
    validate(&source_map, selection)?;
    let mut src = Regions::parse(source)?;
    let mut dst = Regions::parse(target)?;
    let width = selection.x1 - selection.x0 + 1;
    let height = selection.y1 - selection.y0 + 1;
    let dx = target_map.origin_x + destination[0] as f32 * 128.0 - (source_map.origin_x + selection.x0 as f32 * 128.0);
    let dy = target_map.origin_y + destination[1] as f32 * 128.0 - (source_map.origin_y + selection.y0 as f32 * 128.0);
    let min_x = source_map.origin_x + selection.x0 as f32 * 128.0;
    let min_y = source_map.origin_y + selection.y0 as f32 * 128.0;
    let max_x = source_map.origin_x + (selection.x1 + 1) as f32 * 128.0;
    let max_y = source_map.origin_y + (selection.y1 + 1) as f32 * 128.0;
    let paste = (target_map.origin_x + destination[0] as f32 * 128.0, target_map.origin_y + destination[1] as f32 * 128.0,
        target_map.origin_x + (destination[0] + width) as f32 * 128.0, target_map.origin_y + (destination[1] + height) as f32 * 128.0);
    // Names in the replaced area are available for reuse. Renaming them first
    // would leave the retained target triggers referring to deleted regions.
    dst.records.retain(|entry| {
        let b = bounds(entry);
        let overlap = b.0 < paste.2 && b.2 > paste.0 && b.1 < paste.3 && b.3 > paste.1;
        let selected = selection.mask.is_none() || fully_masked(selection, &source_map, (b.0 - dx, b.1 - dy, b.2 - dx, b.3 - dy));
        !(overlap && selected)
    });
    let mut copied = Vec::new();
    let mut skipped = 0;
    for record in src.records.drain(..) {
        let bounds = bounds(&record);
        if bounds.0 < min_x || bounds.1 < min_y || bounds.2 > max_x || bounds.3 > max_y { skipped += 1; continue; }
        if !fully_masked(selection, &source_map, bounds) { skipped += 1; continue; }
        let mut moved = record;
        set_f32(&mut moved, 0, bounds.0 + dx);
        set_f32(&mut moved, 4, bounds.1 + dy);
        set_f32(&mut moved, 8, bounds.2 + dx);
        set_f32(&mut moved, 12, bounds.3 + dy);
        let name = read_cstring(&moved, 16)?;
        let name = script_safe_name(&name);
        let mut unique_name = name.clone();
        let mut suffix = 2;
        while dst.records.iter().chain(copied.iter()).any(|entry| read_cstring(entry, 16).is_ok_and(|existing| identifier_name(&existing) == identifier_name(&unique_name))) {
            unique_name = format!("{name}_{suffix}"); suffix += 1;
        }
        replace_cstring(&mut moved, 16, &unique_name)?;
        let id_offset = moved[16..].iter().position(|byte| *byte == 0).ok_or("区域名称未终止")? + 17;
        moved[id_offset..id_offset + 4].copy_from_slice(&dst.next_id.to_le_bytes());
        dst.next_id = dst.next_id.wrapping_add(1);
        copied.push(moved);
    }
    let count = copied.len();
    dst.records.extend(copied);
    Ok((dst.to_bytes(), count, skipped))
}

pub(super) fn trigger_names(bytes: &[u8]) -> Result<Vec<String>, String> {
    Regions::parse(bytes)?.records.iter().map(|record| read_cstring(record, 16).map(|name| format!("gg_rct_{}", identifier_name(&name)))).collect()
}

fn identifier_name(name: &str) -> String {
    name.chars().map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' }).collect()
}

fn script_safe_name(name: &str) -> String {
    // WE converts punctuation to underscores. JassHelper rejects identifiers
    // ending in an underscore (e.g. a source region named "0-0-00#").
    let normalized = identifier_name(name);
    let normalized = normalized.trim_end_matches('_');
    if normalized.is_empty() { "Region".into() } else { normalized.into() }
}

#[cfg(test)]
mod naming_tests {
    fn regions(name: &str) -> Vec<u8> {
        let mut b = [5u32.to_le_bytes(), 1u32.to_le_bytes()].concat();
        for n in [-4032f32, -4032f32, -3968f32, -3968f32] { b.extend_from_slice(&n.to_le_bytes()); }
        b.extend_from_slice(name.as_bytes()); b.push(0);
        b.extend_from_slice(&[0; 13]);
        b
    }
    #[test]
    fn copied_region_names_compile_without_trailing_punctuation() {
        assert_eq!(super::script_safe_name("0-0-00-00-00#"), "0_0_00_00_00");
        assert_eq!(super::script_safe_name("地区#"), "地区");
        assert_eq!(super::script_safe_name("##"), "Region");
        assert_eq!(super::script_safe_name("Existing_Region"), "Existing_Region");
    }
    #[test]
    fn repeat_copy_reuses_region_name_and_keeps_paint_holes() {
        let terrain = super::super::tests::fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
        let rect = super::SelectionRect { x0: 0, y0: 0, x1: 2, y1: 2, mask: None };
        let src = regions("Area#");
        let (once, count, _) = super::copy(&src, &regions("Old"), &terrain, &terrain, &rect, [0, 0]).unwrap();
        assert_eq!(count, 1);
        let (twice, _, _) = super::copy(&src, &once, &terrain, &terrain, &rect, [0, 0]).unwrap();
        assert_eq!(super::trigger_names(&once).unwrap(), vec!["gg_rct_Area"]);
        assert_eq!(super::trigger_names(&twice).unwrap(), vec!["gg_rct_Area"]);
        let masked = super::SelectionRect { mask: Some(vec![false; 25]), ..rect };
        let (kept, count, _) = super::copy(&src, &once, &terrain, &terrain, &masked, [0, 0]).unwrap();
        assert_eq!(count, 0);
        assert_eq!(kept, once);
    }
}

fn validate(map: &w3e::W3e, selection: &SelectionRect) -> Result<(), String> {
    if selection.x0 > selection.x1 || selection.y0 > selection.y1 || selection.x1 >= map.width || selection.y1 >= map.height { return Err("区域复制选区超出地图范围".into()); }
    if selection.mask.as_ref().is_some_and(|mask| mask.len() != map.width as usize * map.height as usize) { return Err("涂抹选区数据与地图尺寸不一致".into()); }
    Ok(())
}

fn fully_masked(selection: &SelectionRect, map: &w3e::W3e, bounds: (f32, f32, f32, f32)) -> bool {
    let x0 = ((bounds.0 - map.origin_x) / 128.0).floor().max(0.0) as u32;
    let y0 = ((bounds.1 - map.origin_y) / 128.0).floor().max(0.0) as u32;
    let x1 = ((bounds.2 - map.origin_x) / 128.0).ceil().max(0.0) as u32;
    let y1 = ((bounds.3 - map.origin_y) / 128.0).ceil().max(0.0) as u32;
    if x0 < selection.x0 || y0 < selection.y0 || x1 > selection.x1 + 1 || y1 > selection.y1 + 1 { return false; }
    selection.mask.as_ref().is_none_or(|mask| (y0..y1).all(|y| (x0..x1).all(|x| mask[y as usize * map.width as usize + x as usize])))
}

fn bounds(record: &[u8]) -> (f32, f32, f32, f32) { (get_f32(record, 0), get_f32(record, 4), get_f32(record, 8), get_f32(record, 12)) }
fn get_f32(bytes: &[u8], offset: usize) -> f32 { f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap_or_default()) }
fn set_f32(bytes: &mut [u8], offset: usize, value: f32) { bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes()); }

fn read_cstring(bytes: &[u8], offset: usize) -> Result<String, String> {
    let end = bytes.get(offset..).ok_or("区域记录被截断")?.iter().position(|byte| *byte == 0).map(|n| n + offset).ok_or("区域名称未终止")?;
    String::from_utf8(bytes[offset..end].to_vec()).map_err(|_| "区域名称编码无效".into())
}

fn replace_cstring(record: &mut Vec<u8>, offset: usize, value: &str) -> Result<(), String> {
    let end = record.get(offset..).ok_or("区域记录被截断")?.iter().position(|byte| *byte == 0).map(|n| n + offset).ok_or("区域名称未终止")?;
    let mut rebuilt = record[..offset].to_vec(); rebuilt.extend_from_slice(value.as_bytes()); rebuilt.push(0); rebuilt.extend_from_slice(&record[end + 1..]); *record = rebuilt;
    Ok(())
}

struct Regions { header: Vec<u8>, next_id: i32, records: Vec<Vec<u8>> }

impl Regions {
    fn parse(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < 8 { return Err("区域文件头被截断".into()); }
        let count = read_i32(bytes, 4)?;
        if !(0..=100_000).contains(&count) { return Err("区域数量越界".into()); }
        let mut offset = 8usize;
        let mut records = Vec::with_capacity(count as usize);
        let mut next_id = 0;
        for _ in 0..count {
            let start = offset;
            if offset.checked_add(16).is_none_or(|end| end > bytes.len()) { return Err("区域边界数据被截断".into()); }
            for index in 0..4 { if !get_f32(bytes, offset + index * 4).is_finite() { return Err("区域坐标无效".into()); } }
            offset += 16;
            let _ = read_cstring(bytes, offset)?;
            offset += bytes[offset..].iter().position(|byte| *byte == 0).ok_or("区域名称未终止")? + 1;
            let id = read_i32(bytes, offset)?; offset += 4; next_id = next_id.max(id.saturating_add(1));
            if offset + 4 > bytes.len() { return Err("区域天气数据被截断".into()); } offset += 4;
            let _ = read_cstring(bytes, offset)?;
            offset += bytes[offset..].iter().position(|byte| *byte == 0).ok_or("区域环境音未终止")? + 1;
            offset = offset.checked_add(4).filter(|end| *end <= bytes.len()).ok_or("区域颜色数据被截断")?;
            records.push(bytes[start..offset].to_vec());
        }
        if offset != bytes.len() { return Err("区域文件存在无法识别的尾随数据".into()); }
        Ok(Self { header: bytes[..4].to_vec(), next_id, records })
    }

    fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = self.header.clone(); bytes.extend_from_slice(&(self.records.len() as i32).to_le_bytes());
        for record in &self.records { bytes.extend_from_slice(record); }
        bytes
    }
}

fn read_i32(bytes: &[u8], offset: usize) -> Result<i32, String> { Ok(i32::from_le_bytes(bytes.get(offset..offset + 4).ok_or("区域记录被截断")?.try_into().map_err(|_| "区域记录被截断")?)) }
