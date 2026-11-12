use super::reader::{append, float, number, sized, Reader, Result};

// MDB3 keeps small tracks verbatim; five or more keys quantize each component
// against a per-track base and range. Tangents use the same range as values.
pub(super) fn track(reader: &mut Reader, tag: &[u8; 4], dimensions: usize, quantized: bool) -> Result<Vec<u8>> {
    let count = reader.u16()?;
    let interpolation = reader.u8()?;
    if count == 0 || interpolation > 3 { return Err("MDB3 动画关键帧或插值类型无效".into()); }
    let mut output = tag.to_vec(); number(&mut output, count)?; number(&mut output, interpolation)?;
    append(&mut output, reader.take(4)?)?;
    let compressed = quantized && count >= 5;
    let mut base = vec![0.0; dimensions]; let mut scale = base.clone();
    if compressed {
        for value in &mut base { *value = reader.f32()?; }
        for value in &mut scale { *value = reader.f32()?; }
    }
    for _ in 0..count {
        append(&mut output, reader.take(4)?)?;
        for _ in 0..if interpolation > 1 { 3 } else { 1 } {
            for component in 0..dimensions {
                let value = if compressed { reader.u16()? as f32 * (1.0 / 65535.0) * scale[component] + base[component] } else { reader.f32()? };
                float(&mut output, value)?;
            }
        }
    }
    Ok(output)
}

pub(super) fn node(reader: &mut Reader) -> Result<Vec<u8>> {
    let mut record = reader.record()?;
    let length = record.u8()? as usize;
    let mut output = record.string(length, 80)?;
    append(&mut output, record.take(8)?)?;
    number(&mut output, record.u8()?)?;
    while record.remaining() > 0 {
        let (tag, dimensions) = match record.u8()? {
            1 => (b"KGTR", 3), 2 => (b"KGRT", 4), 3 => (b"KGSC", 3),
            _ => return Err("MDB3 节点包含未知动画字段".into()),
        };
        append(&mut output, &track(&mut record, tag, dimensions, true)?)?;
    }
    sized(output)
}

pub(super) fn animated_records(reader: &mut Reader, geoset: bool) -> Result<Vec<u8>> {
    let mut output = Vec::new();
    while reader.remaining() > 0 {
        let mut record = reader.record()?; let mut item = Vec::new();
        if geoset { append(&mut item, record.take(24)?)?; }
        while record.remaining() > 0 {
            let index = record.u8()?;
            let (tag, dimensions) = match (geoset, index) {
                (true, 1) => (b"KGAO", 1), (true, 2) => (b"KGAC", 3),
                (false, 1) => (b"KTAT", 3), (false, 2) => (b"KTAR", 4), (false, 3) => (b"KTAS", 3),
                _ => return Err("MDB3 材质动画包含未知字段".into()),
            };
            append(&mut item, &track(&mut record, tag, dimensions, !geoset)?)?;
        }
        append(&mut output, &sized(item)?)?;
    }
    Ok(output)
}
