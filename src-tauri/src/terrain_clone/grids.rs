use super::{w3e, SelectionRect};

pub(super) fn copy(source: &[u8], target: &[u8], source_w3e: &[u8], target_w3e: &[u8], selection: &SelectionRect, destination: [u32; 2], has_header: bool) -> Result<(Vec<u8>, u32), String> {
    let source_map = w3e::parse(source_w3e)?;
    let target_map = w3e::parse(target_w3e)?;
    let source_grid = Grid::parse(source, &source_map, has_header)?;
    let mut target_grid = Grid::parse(target, &target_map, has_header)?;
    validate(&source_map, &target_map, selection, destination)?;
    let width = selection.x1 - selection.x0 + 1;
    let height = selection.y1 - selection.y0 + 1;
    let mut changed = 0;
    for y in 0..height * 4 { for x in 0..width * 4 {
        let tile_x = selection.x0 + x / 4;
        let tile_y = selection.y0 + y / 4;
        if selection.mask.as_ref().is_some_and(|mask| !mask[tile_y as usize * source_map.width as usize + tile_x as usize]) { continue; }
        let source_x = selection.x0 * 4 + x;
        let source_y = selection.y0 * 4 + y;
        let target_x = destination[0] * 4 + x;
        let target_y = destination[1] * 4 + y;
        // Terrain has one more tilepoint than the pathing/shadow grid. The
        // outermost row/column therefore has no corresponding grid cells.
        if source_x >= source_grid.width || source_y >= source_grid.height || target_x >= target_grid.width || target_y >= target_grid.height { continue; }
        let source_index = source_y as usize * source_grid.width as usize + source_x as usize;
        let target_index = target_y as usize * target_grid.width as usize + target_x as usize;
        target_grid.data[target_index] = source_grid.data[source_index];
        changed += 1;
    } }
    Ok((target_grid.to_bytes(), changed))
}

fn validate(source: &w3e::W3e, target: &w3e::W3e, rect: &SelectionRect, destination: [u32; 2]) -> Result<(), String> {
    if rect.x0 > rect.x1 || rect.y0 > rect.y1 || rect.x1 >= source.width || rect.y1 >= source.height { return Err("寻路/阴影选区超出地图范围".into()); }
    let width = rect.x1 - rect.x0 + 1;
    let height = rect.y1 - rect.y0 + 1;
    if destination[0].checked_add(width).is_none_or(|edge| edge > target.width) || destination[1].checked_add(height).is_none_or(|edge| edge > target.height) { return Err("寻路/阴影粘贴位置超出地图范围".into()); }
    if rect.mask.as_ref().is_some_and(|mask| mask.len() != source.width as usize * source.height as usize) { return Err("涂抹选区数据与源地图尺寸不一致".into()); }
    Ok(())
}

struct Grid { width: u32, height: u32, header: Vec<u8>, data: Vec<u8> }

impl Grid {
    fn parse(bytes: &[u8], terrain: &w3e::W3e, has_header: bool) -> Result<Self, String> {
        let expected_width = (terrain.width - 1) * 4;
        let expected_height = (terrain.height - 1) * 4;
        let (header, width, height, data) = if has_header {
            if bytes.len() < 16 || &bytes[..4] != b"MP3W" { return Err("寻路文件头无效".into()); }
            let width = read_u32(bytes, 8)?;
            let height = read_u32(bytes, 12)?;
            (bytes[..16].to_vec(), width, height, bytes[16..].to_vec())
        } else {
            let width = expected_width;
            let height = expected_height;
            (Vec::new(), width, height, bytes.to_vec())
        };
        let cells = (width as usize).checked_mul(height as usize).ok_or("网格尺寸溢出")?;
        if width != expected_width || height != expected_height || data.len() != cells { return Err("寻路/阴影网格尺寸与地形不匹配".into()); }
        Ok(Self { width, height, header, data })
    }

    fn to_bytes(&self) -> Vec<u8> { let mut bytes = self.header.clone(); bytes.extend_from_slice(&self.data); bytes }
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let raw: [u8; 4] = bytes.get(offset..offset + 4).ok_or("寻路文件头被截断")?.try_into().map_err(|_| "寻路文件头被截断")?;
    Ok(u32::from_le_bytes(raw))
}
