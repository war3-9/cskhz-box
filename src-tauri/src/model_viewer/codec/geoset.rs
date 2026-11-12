use super::reader::{append, float, number, sized, Reader, Result};

fn vector(reader: &mut Reader) -> Result<[f32; 3]> { Ok([reader.f32()?, reader.f32()?, reader.f32()?]) }

pub(super) fn decode(reader: &mut Reader) -> Result<Vec<u8>> {
    let mut record = reader.record()?; let r = &mut record; let mut output = Vec::new();
    r.expect(1)?; let count = r.u16()?;
    let base = vector(r)?; let scale = vector(r)?;
    append(&mut output, b"VRTX")?; number(&mut output, count)?;
    for _ in 0..count { for i in 0..3 { float(&mut output, r.u16()? as f32 * (1.0 / 65535.0) * scale[i] + base[i])?; } }
    r.expect(2)?; let normals = r.u16()?;
    if count != normals { return Err("MDB3 顶点与法线数量不一致".into()); }
    append(&mut output, b"NRMS")?; number(&mut output, normals)?;
    for _ in 0..normals {
        let mut y = r.u16()? as f32 / 65535.0 * 2.0 - 1.0;
        let mut x = r.u16()? as f32 / 65535.0 * 2.0 - 1.0;
        let z = 1.0 - x.abs() - y.abs();
        // Octahedral normal encoding folds the lower hemisphere.
        if z < 0.0 { let old_x = x; x = (1.0 - y.abs()) * if x >= 0.0 { 1.0 } else { -1.0 }; y = (1.0 - old_x.abs()) * if y >= 0.0 { 1.0 } else { -1.0 }; }
        let length = (x*x + y*y + z*z).sqrt();
        for value in [x/length, y/length, z/length] { float(&mut output, value)?; }
    }
    r.expect(3)?; let primitives = r.u16()?;
    append(&mut output, b"PTYP")?; number(&mut output, primitives)?;
    for _ in 0..primitives { number(&mut output, 4)?; }
    for (index, tag, width, expand) in [(4, b"PCNT", 4, true), (5, b"PVTX", 2, false), (6, b"GNDX", 1, false), (7, b"MTGC", 2, true), (8, b"MATS", 2, true)] {
        r.expect(index)?; let size = r.u16()?;
        append(&mut output, tag)?; number(&mut output, size)?;
        if expand { for _ in 0..size { number(&mut output, if width == 4 { r.u32()? } else { r.u16()? })?; } }
        else { append(&mut output, r.take(size as usize * width)?)?; }
    }
    // Material ID, selection group/flags, overall extent and sequence extents.
    append(&mut output, r.take(40)?)?;
    let count = r.u32()?; number(&mut output, count)?;
    append(&mut output, r.take(count as usize * 28)?)?;
    r.expect(9)?; let sets = r.u16()?;
    append(&mut output, b"UVAS")?; number(&mut output, sets)?;
    for _ in 0..sets {
        r.expect(10)?; let count = r.u16()?;
        append(&mut output, b"UVBS")?; number(&mut output, count)?;
        for _ in 0..count * 2 { float(&mut output, r.u16()? as f32 * (1.0 / 65535.0) * 4.0 - 2.0)?; }
    }
    if r.remaining() > 0 { return Err("MDB3 网格包含未识别的尾部数据".into()); }
    sized(output)
}
