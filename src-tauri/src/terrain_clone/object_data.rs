use std::collections::BTreeMap;
mod selected;
mod models;
pub(super) use selected::{ids, merge_selected};
pub(super) use models::model_paths;

#[derive(Clone)]
struct Record { parent: [u8; 4], id: [u8; 4], fields: BTreeMap<Vec<u8>, Vec<u8>> }
struct ObjectFile { original: Vec<Record>, custom: Vec<Record> }

pub(super) fn resolve_strings(bytes: &[u8], wts: &[u8], extended: bool) -> Result<Vec<u8>, String> {
    let strings = super::trigger_strings::parse(wts)?;
    let mut file = parse(bytes, extended)?;
    let start = if extended { 16 } else { 8 };
    for record in file.original.iter_mut().chain(file.custom.iter_mut()) {
        for field in record.fields.values_mut() {
            if u32::from_le_bytes(field[4..8].try_into().unwrap()) != 3 { continue; }
            let value = &field[start..field.len() - 5];
            if let Some(number) = value.strip_prefix(b"TRIGSTR_").and_then(|id| std::str::from_utf8(id).ok()).and_then(|id| id.parse::<u32>().ok()) {
                let text = strings.get(&number).ok_or_else(|| format!("物编引用的 TRIGSTR_{number} 未在 war3map.wts 中找到"))?;
                let tail = field[field.len() - 4..].to_vec();
                field.truncate(start); field.extend_from_slice(text); field.push(0); field.extend_from_slice(&tail);
            }
        }
    }
    let mut result = 2u32.to_le_bytes().to_vec();
    for group in [file.original, file.custom] {
        result.extend_from_slice(&(group.len() as u32).to_le_bytes());
        for record in group {
            result.extend_from_slice(&record.parent); result.extend_from_slice(&record.id);
            result.extend_from_slice(&(record.fields.len() as u32).to_le_bytes());
            for field in record.fields.values() { result.extend_from_slice(field); }
        }
    }
    Ok(result)
}

#[cfg(test)]
pub(super) fn merge(source: &[u8], target: Option<&Vec<u8>>, extended: bool) -> Result<Vec<u8>, String> {
    let source = parse(source, extended)?;
    let target = match target { Some(bytes) => parse(bytes, extended)?, None => ObjectFile { original: vec![], custom: vec![] } };
    let mut bytes = 2i32.to_le_bytes().to_vec();
    for (old, new) in [(target.original, source.original), (target.custom, source.custom)] {
        let mut records = BTreeMap::<[u8; 4], Record>::new();
        for record in old { records.insert(identity(&record), record); }
        for record in new {
            let key = identity(&record);
            if let Some(old) = records.get_mut(&key) {
                if old.parent == record.parent { old.fields.extend(record.fields); }
                else { *old = record; }
            } else { records.insert(key, record); }
        }
        bytes.extend_from_slice(&(records.len() as u32).to_le_bytes());
        for record in records.into_values() {
            bytes.extend_from_slice(&record.parent); bytes.extend_from_slice(&record.id);
            bytes.extend_from_slice(&(record.fields.len() as u32).to_le_bytes());
            for field in record.fields.into_values() { bytes.extend_from_slice(&field); }
        }
    }
    Ok(bytes)
}

fn identity(record: &Record) -> [u8; 4] { if record.id == [0; 4] { record.parent } else { record.id } }

fn parse(bytes: &[u8], extended: bool) -> Result<ObjectFile, String> {
    let mut reader = Reader { bytes, offset: 0 };
    let version = reader.number()?;
    if ![1, 2].contains(&version) { return Err(format!("物编格式版本 {version} 尚不支持合并")); }
    let mut groups = Vec::new();
    for _ in 0..2 {
        let count = reader.count()?; let mut records = Vec::new();
        for _ in 0..count {
            let parent = reader.take(4)?.try_into().unwrap(); let id = reader.take(4)?.try_into().unwrap();
            let modifications = reader.count()?; let mut fields = BTreeMap::new();
            for _ in 0..modifications {
                let start = reader.offset; let mut key = reader.take(4)?.to_vec();
                let kind = reader.number()?;
                if extended { key.extend_from_slice(reader.take(8)?); }
                match kind {
                    0..=2 => { reader.take(4)?; }
                    3 => { reader.string()?; }
                    _ => return Err(format!("物编字段类型 {kind} 无效")),
                }
                reader.take(4)?;
                fields.insert(key, bytes[start..reader.offset].to_vec());
            }
            records.push(Record { parent, id, fields });
        }
        groups.push(records);
    }
    if reader.offset != bytes.len() { return Err("物编文件包含无法识别的尾随数据".into()); }
    let custom = groups.pop().unwrap(); let original = groups.pop().unwrap();
    Ok(ObjectFile { original, custom })
}

struct Reader<'a> { bytes: &'a [u8], offset: usize }
impl<'a> Reader<'a> {
    fn take(&mut self, count: usize) -> Result<&'a [u8], String> {
        let end = self.offset.checked_add(count).ok_or("物编偏移溢出")?;
        let part = self.bytes.get(self.offset..end).ok_or("物编记录被截断")?;
        self.offset = end; Ok(part)
    }
    fn number(&mut self) -> Result<u32, String> { Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap())) }
    fn count(&mut self) -> Result<u32, String> { let value = self.number()?; if value > 100_000 { return Err("物编条目数量越界".into()); } Ok(value) }
    fn string(&mut self) -> Result<(), String> {
        let rest = self.bytes.get(self.offset..).ok_or("物编字符串被截断")?;
        let count = rest.iter().position(|b| *b == 0).ok_or("物编字符串未结束")?;
        self.take(count + 1)?; Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::merge;
    fn fixture(id: &[u8; 4], value: u32, extended: bool) -> Vec<u8> {
        let mut bytes = vec![]; for number in [2u32, 0, 1] { bytes.extend_from_slice(&number.to_le_bytes()); }
        bytes.extend_from_slice(b"hfoo"); bytes.extend_from_slice(id); bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(b"uhpm"); bytes.extend_from_slice(&0u32.to_le_bytes());
        if extended { bytes.extend_from_slice(&[0; 8]); }
        bytes.extend_from_slice(&value.to_le_bytes()); bytes.extend_from_slice(id); bytes
    }
    #[test] fn preserves_target_ids_and_source_wins_the_same_id_field() {
        for extended in [true, false] {
            let source = fixture(b"u000", 1234, extended); let target = fixture(b"u001", 100, extended);
            let output = merge(&source, Some(&target), extended).unwrap();
            assert_eq!(u32::from_le_bytes(output[8..12].try_into().unwrap()), 2);
            assert_eq!(merge(&source, Some(&fixture(b"u000", 100, extended)), extended).unwrap(), source);
            assert_eq!(merge(&source, None, extended).unwrap(), source);
        }
    }
    #[test] fn malformed_source_is_rejected_even_without_target() {
        let mut source = fixture(b"u000", 42, false); source.pop(); assert!(merge(&source, None, false).is_err());
        source = fixture(b"u000", 42, false); source.push(1); assert!(merge(&source, None, false).is_err());
    }
    #[test] fn classic_version_one_and_bom_string_zero_are_resolved_without_losing_the_field() {
        for extended in [false, true] {
            let mut bytes = fixture(b"u000", 42, extended);
            bytes[..4].copy_from_slice(&1u32.to_le_bytes());
            assert_eq!(merge(&bytes, None, extended).unwrap()[..4], 2u32.to_le_bytes());
            bytes[28..32].copy_from_slice(&3u32.to_le_bytes());
            let at = if extended { 40 } else { 32 };
            bytes.splice(at..at + 4, b"TRIGSTR_000\0".iter().copied());
            let output = super::resolve_strings(&bytes, b"\xef\xbb\xbfSTRING 0\n{\nzero\n}\n", extended).unwrap();
            assert_eq!(&output[at..at + 5], b"zero\0");
            assert!(super::resolve_strings(&bytes, b"STRING 1\n{\nwrong\n}\n", extended).is_err());
        }
    }
    #[test] fn merging_preserves_intentionally_empty_gate_models() {
        let mut empty = vec![]; for number in [2u32, 0, 1] { empty.extend_from_slice(&number.to_le_bytes()); }
        empty.extend_from_slice(b"DTg6B003"); empty.extend_from_slice(&1u32.to_le_bytes());
        empty.extend_from_slice(b"bfil"); empty.extend_from_slice(&3u32.to_le_bytes()); empty.push(0); empty.extend_from_slice(b"B003");
        assert_eq!(merge(&empty, None, false).unwrap(), empty);
    }
}
