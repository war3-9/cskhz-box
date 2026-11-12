use super::{w3e::W3e, SelectionRect};

pub(super) struct SpecialDoodads { version: [u8; 4], records: Vec<[u8; 16]> }

impl SpecialDoodads {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < 8 { return Err("特殊地形装饰物区块被截断".into()); }
        let count = i32::from_le_bytes(bytes[4..8].try_into().unwrap());
        if !(0..=1_000_000).contains(&count) || bytes.len() != 8 + count as usize * 16 {
            return Err("特殊地形装饰物数据长度无效".into());
        }
        Ok(Self { version: bytes[..4].try_into().unwrap(), records: bytes[8..].chunks_exact(16).map(|record| record.try_into().unwrap()).collect() })
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = self.version.to_vec();
        bytes.extend_from_slice(&(self.records.len() as i32).to_le_bytes());
        for record in &self.records { bytes.extend_from_slice(record); }
        bytes
    }

    pub fn markers(&self) -> Vec<[f32; 2]> {
        self.records.iter().map(|record| { let (x, y) = coordinates(record); [x as f32, y as f32] }).collect()
    }

    pub fn selected_ids(&self, terrain: &W3e, rect: &SelectionRect) -> Vec<[u8; 4]> {
        self.records.iter().filter(|record| { let (x, y) = coordinates(record); selected(x, y, terrain, rect) })
            .map(|record| record[..4].try_into().unwrap()).collect()
    }

    pub fn remap(&mut self, remap: &std::collections::HashMap<[u8; 4], [u8; 4]>) {
        for record in &mut self.records {
            if let Some(id) = remap.get(&<[u8; 4]>::try_from(&record[..4]).unwrap()) { record[..4].copy_from_slice(id); }
        }
    }

    pub fn copy_from(&mut self, source: &Self, terrain: &W3e, rect: &SelectionRect, destination: [u32; 2]) -> usize {
        self.records.retain(|record| {
            let (x, y) = coordinates(record);
            let sx = x - destination[0] as i64 + rect.x0 as i64;
            let sy = y - destination[1] as i64 + rect.y0 as i64;
            !selected(sx, sy, terrain, rect)
        });
        let mut count = 0;
        for record in &source.records {
            let (x, y) = coordinates(record);
            if !selected(x, y, terrain, rect) { continue; }
            let mut copy = *record;
            copy[8..12].copy_from_slice(&((x - rect.x0 as i64 + destination[0] as i64) as u32).to_le_bytes());
            copy[12..16].copy_from_slice(&((y - rect.y0 as i64 + destination[1] as i64) as u32).to_le_bytes());
            self.records.push(copy);
            count += 1;
        }
        count
    }
}

fn coordinates(record: &[u8; 16]) -> (i64, i64) {
    (u32::from_le_bytes(record[8..12].try_into().unwrap()) as i64, u32::from_le_bytes(record[12..16].try_into().unwrap()) as i64)
}

fn selected(x: i64, y: i64, terrain: &W3e, rect: &SelectionRect) -> bool {
    x >= rect.x0 as i64 && x <= rect.x1 as i64 && y >= rect.y0 as i64 && y <= rect.y1 as i64 &&
        rect.mask.as_ref().is_none_or(|mask| mask[y as usize * terrain.width as usize + x as usize])
}
