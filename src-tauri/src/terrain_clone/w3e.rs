const CELL_BYTES: usize = 7;

pub struct W3e {
    pub width: u32,
    pub height: u32,
    pub origin_x: f32,
    pub origin_y: f32,
    pub header: Vec<u8>,
    pub cells: Vec<u8>,
}

pub fn parse(bytes: &[u8]) -> Result<W3e, String> {
    if bytes.len() < 33 || &bytes[..4] != b"W3E!" { return Err("war3map.w3e 头部无效".into()); }
    let mut offset = 9usize;
    let custom_tileset = read_i32(bytes, &mut offset)?;
    if !(0..=1).contains(&custom_tileset) { return Err("自定义地形标记无效".into()); }
    let ground = read_palette(bytes, &mut offset)?;
    let cliff = read_palette(bytes, &mut offset)?;
    let width = read_i32(bytes, &mut offset)?;
    let height = read_i32(bytes, &mut offset)?;
    if !(2..=1024).contains(&width) || !(2..=1024).contains(&height) { return Err("地图地形尺寸不受支持".into()); }
    let origin_x = read_f32(bytes, &mut offset)?;
    let origin_y = read_f32(bytes, &mut offset)?;
    let expected = width as usize * height as usize * CELL_BYTES;
    if offset.checked_add(expected) != Some(bytes.len()) { return Err("地形 tilepoint 数据长度与地图尺寸不匹配".into()); }
    let _ = (ground, cliff);
    Ok(W3e { width: width as u32, height: height as u32, origin_x, origin_y, header: bytes[..offset].to_vec(), cells: bytes[offset..].to_vec() })
}

fn read_i32(bytes: &[u8], offset: &mut usize) -> Result<i32, String> {
    let end = offset.checked_add(4).ok_or("地形头部偏移溢出")?;
    let raw: [u8; 4] = bytes.get(*offset..end).ok_or("地形头部被截断")?.try_into().map_err(|_| "地形头部被截断")?;
    *offset = end;
    Ok(i32::from_le_bytes(raw))
}

fn read_f32(bytes: &[u8], offset: &mut usize) -> Result<f32, String> {
    let end = offset.checked_add(4).ok_or("地形头部偏移溢出")?;
    let raw: [u8; 4] = bytes.get(*offset..end).ok_or("地形头部被截断")?.try_into().map_err(|_| "地形头部被截断")?;
    *offset = end;
    let value = f32::from_le_bytes(raw);
    if !value.is_finite() { return Err("地形世界坐标原点无效".into()); }
    Ok(value)
}

fn read_palette(bytes: &[u8], offset: &mut usize) -> Result<usize, String> {
    let count = read_i32(bytes, offset)?;
    if count < 0 { return Err("地形调色板数量越界".into()); }
    let count = count as usize;
    let bytes_to_skip = count.checked_mul(4).ok_or("地形调色板数量越界")?;
    let end = offset.checked_add(bytes_to_skip).ok_or("地形头部长度溢出")?;
    if end > bytes.len() { return Err("地形调色板被截断".into()); }
    *offset = end;
    Ok(count)
}

impl W3e {
    pub fn to_bytes(&self) -> Vec<u8> { let mut out = self.header.clone(); out.extend_from_slice(&self.cells); out }
    pub(super) fn cell(&self, x: u32, y: u32) -> &[u8] { let i = (y as usize * self.width as usize + x as usize) * CELL_BYTES; &self.cells[i..i + CELL_BYTES] }
    pub(super) fn cell_mut(&mut self, x: u32, y: u32) -> &mut [u8] { let i = (y as usize * self.width as usize + x as usize) * CELL_BYTES; &mut self.cells[i..i + CELL_BYTES] }

    pub fn rgb(&self) -> Vec<u8> {
        let mut pixels = Vec::with_capacity(self.width as usize * self.height as usize * 3);
        for y in 0..self.height { for x in 0..self.width {
            let cell = self.cell(x, y);
            let base = terrain_color(cell);
            let shade = (i16::from_le_bytes([cell[0], cell[1]]) - 8192).clamp(-1536, 1536) / 64;
            for channel in base { pixels.push((i16::from(channel) + shade).clamp(20, 230) as u8); }
        } }
        pixels
    }
}

fn terrain_color(cell: &[u8]) -> [u8; 3] {
    let texture = cell[4] & 15;
    match texture % 8 {
        0 => [75, 103, 57], 1 => [113, 91, 58], 2 => [80, 120, 62], 3 => [102, 105, 98],
        4 => [151, 131, 89], 5 => [125, 119, 108], 6 => [112, 147, 156], _ => [145, 151, 157],
    }
}

pub fn clear(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut map = parse(bytes)?;
    let template = map.cell(0, 0).to_vec();
    for y in 0..map.height { for x in 0..map.width {
        let cell = map.cell_mut(x, y);
        cell.copy_from_slice(&template);
        cell[4] &= !0x40;
        cell[6] &= 0xf0;
    } }
    Ok(map.to_bytes())
}

pub(super) fn palette(bytes: &[u8], kind: usize) -> Result<Vec<[u8; 4]>, String> {
    let mut offset = 13usize;
    let ground_count_offset = offset;
    let ground_count = read_palette(bytes, &mut offset)?;
    let (count, palette_offset) = if kind == 0 {
        (ground_count, ground_count_offset + 4)
    } else {
        let cliff_count_offset = offset;
        let cliff_count = read_palette(bytes, &mut offset)?;
        (cliff_count, cliff_count_offset + 4)
    };
    let palette_bytes = count.checked_mul(4).ok_or("地形调色板数量越界")?;
    let end = palette_offset.checked_add(palette_bytes).ok_or("地形头部长度溢出")?;
    let raw = bytes.get(palette_offset..end).ok_or("地形调色板被截断")?;
    let mut ids = Vec::new();
    ids.try_reserve_exact(count).map_err(|_| "地形调色板数量越界")?;
    for id in raw.chunks_exact(4) { ids.push(id.try_into().map_err(|_| "地形调色板被截断")?); }
    Ok(ids)
}

pub(super) fn rebuild_header(header: &[u8], ground: &[[u8; 4]], cliff: &[[u8; 4]]) -> Result<(Vec<u8>, bool), String> {
    let old_ground = palette(header, 0)?; let old_cliff = palette(header, 1)?;
    let changed = old_ground != ground || old_cliff != cliff;
    let mut out = header[..13].to_vec();
    out.extend_from_slice(&(ground.len() as i32).to_le_bytes());
    for id in ground { out.extend_from_slice(id); }
    out.extend_from_slice(&(cliff.len() as i32).to_le_bytes());
    for id in cliff { out.extend_from_slice(id); }
    let suffix = 13 + 4 + old_ground.len() * 4 + 4 + old_cliff.len() * 4;
    out.extend_from_slice(header.get(suffix..).ok_or("地形头部被截断")?);
    if changed { out[9..13].copy_from_slice(&1i32.to_le_bytes()); }
    Ok((out, changed))
}

