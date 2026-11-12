use super::{session::MapDocument, w3e, SelectionRect};
use std::fmt::Write;

pub(super) fn export(doc: &MapDocument, selection: Option<&SelectionRect>) -> Result<String, String> {
    let map = w3e::parse(&doc.w3e)?;
    let ground = w3e::palette(&doc.w3e, 0)?;
    let cliff = w3e::palette(&doc.w3e, 1)?;
    let full = SelectionRect { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1, mask: None };
    let rect = selection.unwrap_or(&full);
    if rect.x0 > rect.x1 || rect.y0 > rect.y1 || rect.x1 >= map.width || rect.y1 >= map.height {
        return Err("导出选区超出地图范围".into());
    }
    if rect.mask.as_ref().is_some_and(|mask| mask.len() != map.width as usize * map.height as usize) {
        return Err("导出涂抹选区尺寸与源地图不一致".into());
    }
    let pathing = doc.members.get("war3map.wpm").map(|bytes| Pathing::parse(bytes, &map)).transpose()?;
    let mut out = String::new();
    let scope = if selection.is_some() { "选区" } else { "全图" };
    let _ = writeln!(out, "WC3 地形参数表\r\n源地图\t{}\r\n地图尺寸\t{} × {} tilepoint\r\n导出范围\t{scope} 列 {}–{} 行 {}–{}\r", doc.path.display(), map.width, map.height, rect.x0, rect.x1, rect.y0, rect.y1);
    out.push_str("坐标说明\t行从0开始，左下为原点；世界坐标间隔128；世界高度=(原始高度-8192+(悬崖层级-2)*512)/4\r\n");
    out.push_str("不可建造说明\t取每个地形格中心的寻路标记；外沿tilepoint或缺失寻路文件记为未知\r\n");
    for (kind, ids) in [("地形", &ground), ("悬崖", &cliff)] {
        for (index, id) in ids.iter().enumerate() { let _ = writeln!(out, "{kind}调色板\t{index}\t{}\r", String::from_utf8_lossy(id)); }
    }
    out.push_str("列\t行\t世界X\t世界Y\t地形槽位\t地形ID\t悬崖ID\t高度原始值\t世界高度\t水位原始值\t地面样式\t悬崖样式\t悬崖层级\t边界\t悬崖覆盖\t不可建造\r\n");
    let mut count = 0;
    for y in rect.y0..=rect.y1 { for x in rect.x0..=rect.x1 {
        if rect.mask.as_ref().is_some_and(|mask| !mask[y as usize * map.width as usize + x as usize]) { continue; }
        let cell = map.cell(x, y);
        let index = (cell[4] & 15) as usize;
        let terrain_id = ground.get(index).map(|id| String::from_utf8_lossy(id).into_owned()).unwrap_or_else(|| "????".into());
        let cliff_id = cliff.get((cell[6] >> 4) as usize).map(|id| String::from_utf8_lossy(id).into_owned()).unwrap_or_else(|| "----".into());
        let raw = u16::from_le_bytes([cell[0], cell[1]]);
        let water = u16::from_le_bytes([cell[2], cell[3]]);
        let layer = cell[6] & 15;
        let world_z = (i32::from(raw) - 8192 + (i32::from(layer) - 2) * 512) as f32 / 4.0;
        let unbuildable = pathing.as_ref().and_then(|grid| grid.unbuildable(x, y)).map(|value| if value { "1" } else { "0" }).unwrap_or("未知");
        let _ = writeln!(out, "{x}\t{y}\t{:.2}\t{:.2}\t{index}\t{terrain_id}\t{cliff_id}\t{raw}\t{world_z:.2}\t{}\t{}\t{}\t{layer}\t{}\t{}\t{unbuildable}\r", map.origin_x + x as f32 * 128.0, map.origin_y + y as f32 * 128.0, water & 0x3fff, cell[5] & 31, cell[5] >> 5, u8::from(water & 0x4000 != 0), u8::from(cell[4] & 0x80 != 0));
        count += 1;
    } }
    let _ = writeln!(out, "# 共导出 {count} 条 tilepoint 记录\r");
    Ok(out)
}

struct Pathing<'a> { width: u32, height: u32, data: &'a [u8] }
impl<'a> Pathing<'a> {
    fn parse(bytes: &'a [u8], map: &w3e::W3e) -> Result<Self, String> {
        if bytes.len() < 16 || &bytes[..4] != b"MP3W" { return Err("寻路文件头无效，无法导出不可建造标记".into()); }
        let width = u32::from_le_bytes(bytes[8..12].try_into().map_err(|_| "寻路文件头被截断")?);
        let height = u32::from_le_bytes(bytes[12..16].try_into().map_err(|_| "寻路文件头被截断")?);
        if width != (map.width - 1) * 4 || height != (map.height - 1) * 4 || bytes.len() != 16 + width as usize * height as usize {
            return Err("寻路网格尺寸与地形不匹配，无法导出不可建造标记".into());
        }
        Ok(Self { width, height, data: &bytes[16..] })
    }
    fn unbuildable(&self, x: u32, y: u32) -> Option<bool> {
        let x = x * 4 + 2; let y = y * 4 + 2;
        if x >= self.width || y >= self.height { return None; }
        Some(self.data[y as usize * self.width as usize + x as usize] & 8 != 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn exports_native_coordinates_heights_flags_and_only_the_selected_mask() {
        let mut terrain = w3e::parse(&super::super::tests::fixture(3, 3, &[*b"Ldrt"], &[*b"CLdi"], 2)).unwrap();
        let cell = terrain.cell_mut(1, 1);
        cell[0..2].copy_from_slice(&8320u16.to_le_bytes());
        cell[2..4].copy_from_slice(&(0x4000u16 | 8192).to_le_bytes());
        cell[4] |= 0x80; cell[5] = 5 | (3 << 5); cell[6] = 4;
        let mut doc = MapDocument::new(PathBuf::from("source.w3x"), terrain.to_bytes());
        let mut pathing = b"MP3W\0\0\0\0".to_vec();
        pathing.extend_from_slice(&8u32.to_le_bytes()); pathing.extend_from_slice(&8u32.to_le_bytes());
        pathing.extend_from_slice(&[0u8; 64]); pathing[16 + 6 * 8 + 6] = 8;
        doc.members.insert("war3map.wpm".into(), pathing);
        let mut mask = vec![false; 9]; mask[4] = true;
        let rect = SelectionRect { x0: 0, y0: 0, x1: 2, y1: 2, mask: Some(mask) };
        let text = export(&doc, Some(&rect)).unwrap();
        assert!(text.contains("1\t1\t-3968.00\t-3968.00\t0\tLdrt\tCLdi\t8320\t288.00\t8192\t5\t3\t4\t1\t1\t1\r\n"));
        assert!(text.contains("共导出 1 条"));
        let full = export(&doc, None).unwrap();
        assert!(full.contains("共导出 9 条"));
        assert!(full.contains("\t未知\r\n"));
    }

    #[test]
    fn rejects_invalid_rectangles_masks_and_corrupt_pathing_without_a_partial_table() {
        let mut doc = MapDocument::new(PathBuf::from("source.w3x"), super::super::tests::fixture(3, 3, &[*b"Ldrt"], &[*b"CLdi"], 2));
        let rect = SelectionRect { x0: 2, y0: 0, x1: 3, y1: 2, mask: None };
        assert!(export(&doc, Some(&rect)).is_err());
        let rect = SelectionRect { x0: 0, y0: 0, x1: 2, y1: 2, mask: Some(vec![true; 4]) };
        assert!(export(&doc, Some(&rect)).is_err());
        doc.members.insert("war3map.wpm".into(), vec![0; 16]);
        assert!(export(&doc, None).is_err());
    }
}
