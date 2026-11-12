use super::{animation, geoset, reader::{append, chunk, number, Reader, Result}};

pub(super) fn decode(bytes: &[u8]) -> Result<Vec<u8>> {
    let mut reader = Reader::new(&bytes[4..]); let r = &mut reader; let mut output = b"MDLX".to_vec();
    let mut version = false; let mut model = false;
    while r.remaining() > 0 {
        let tag = r.u8()?; let size = if tag == 22 { 4 } else { r.u32()? };
        match tag {
            22 => {
                if version { return Err("MDB3 版本字段重复".into()); }
                let value = r.u32()? ^ 0x34968729;
                if value != 800 { return Err(format!("尚未支持的 MDB3 模型版本 {value}")); }
                chunk(&mut output, b"VERS", &value.to_le_bytes())?; version = true;
            }
            11 => {
                if model { return Err("MDB3 模型名称字段重复".into()); }
                let mut data = r.string((size & 255) as usize, 80)?;
                append(&mut data, &r.string((size >> 16) as usize, 260)?)?;
                append(&mut data, r.take(32)?)?; chunk(&mut output, b"MODL", &data)?; model = true;
            }
            17 => {
                let mut data = Vec::new();
                if size as usize > r.remaining() / 53 { return Err("MDB3 动作数量越界".into()); }
                for _ in 0..size { let length = r.u8()? as usize; append(&mut data, &r.string(length, 80)?)?; append(&mut data, r.take(52)?)?; }
                chunk(&mut output, b"SEQS", &data)?;
            }
            20 => {
                let start = r.pos; let mut data = Vec::new();
                if (size & 65535) as usize > r.remaining() / 9 { return Err("MDB3 贴图数量越界".into()); }
                for _ in 0..size & 65535 {
                    let length = r.u8()? as usize; let name = r.string(length, 260)?;
                    append(&mut data, r.take(4)?)?; append(&mut data, &name)?; append(&mut data, r.take(4)?)?;
                }
                if r.pos - start != (size >> 16) as usize { return Err("MDB3 贴图记录长度不匹配".into()); }
                chunk(&mut output, b"TEXS", &data)?;
            }
            18 => {
                let mut data = Vec::new();
                if size as usize > r.remaining() / 13 { return Err("MDB3 声音数量越界".into()); }
                for _ in 0..size { let length = r.u8()? as usize; append(&mut data, &r.string(length, 260)?)?; append(&mut data, r.take(12)?)?; }
                chunk(&mut output, b"SNDS", &data)?;
            }
            _ => {
                let mut section = Reader::new(r.take(size as usize)?); let s = &mut section; let mut data = Vec::new();
                let name = match tag {
                    2 | 5 | 9 => {
                        while s.remaining() > 0 {
                            append(&mut data, &animation::node(s)?)?;
                            if tag == 2 { append(&mut data, s.take(8)?)?; }
                            if tag == 5 {
                                if s.take(4)? != b"KEVT" { return Err("MDB3 事件标记无效".into()); }
                                append(&mut data, b"KEVT")?; let count = s.u32()?; number(&mut data, count)?;
                                append(&mut data, s.take(4 + count as usize * 4)?)?;
                            }
                        }
                        if tag == 2 { b"BONE" } else if tag == 5 { b"EVTS" } else { b"HELP" }
                    }
                    6 | 21 => { data = animation::animated_records(s, tag == 6)?; if tag == 6 { b"GEOA" } else { b"TXAN" } }
                    7 => { while s.remaining() > 0 { append(&mut data, &geoset::decode(s)?)?; } b"GEOS" }
                    8 => {
                        if size % 3 != 0 { return Err("MDB3 全局动画长度无效".into()); }
                        while s.remaining() > 0 { let value = s.take(3)?; number(&mut data, u32::from_le_bytes([value[0],value[1],value[2],0]))?; } b"GLBS"
                    }
                    1 | 3 | 4 | 10 | 12 | 13 | 14 | 15 | 16 | 19 => {
                        append(&mut data, s.take(s.remaining())?)?;
                        match tag { 1=>b"ATCH",3=>b"CAMS",4=>b"CLID",10=>b"LITE",12=>b"MTLS",13=>b"PIVT",14=>b"PRE2",15=>b"PREM",16=>b"RIBB",_=>b"SNEM" }
                    }
                    _ => return Err(format!("MDB3 包含尚未支持的字段 {tag}")),
                };
                chunk(&mut output, name, &data)?;
            }
        }
    }
    if !version || !model { return Err("MDB3 缺少版本或模型字段".into()); }
    Ok(output)
}
