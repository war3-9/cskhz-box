use super::{identity, parse, ObjectFile, Record};
use std::collections::{HashMap, HashSet};

pub(in super::super) fn ids(bytes: &[u8], extended: bool) -> Result<HashSet<[u8; 4]>, String> {
    let file = parse(bytes, extended)?;
    Ok(file.original.iter().chain(&file.custom).map(identity).collect())
}

pub(in super::super) fn merge_selected(source: &[u8], target: Option<&Vec<u8>>, extended: bool, needed: &HashSet<[u8; 4]>, existing: &mut HashSet<[u8; 4]>, reserved: &mut HashSet<[u8; 4]>, remap: &mut HashMap<[u8; 4], [u8; 4]>) -> Result<Option<Vec<u8>>, String> {
    let source = parse(source, extended)?;
    let mut target = match target { Some(bytes) => parse(bytes, extended)?, None => ObjectFile { original: vec![], custom: vec![] } };
    let mut changed = false;
    for mut record in source.custom.into_iter().filter(|record| needed.contains(&identity(record))) {
        let id = identity(&record);
        if let Some(old) = target.custom.iter().find(|old| identity(old) == id) {
            if old.parent == record.parent { continue; }
            let new_id = next_id(reserved)?;
            remap.insert(id, new_id);
            record.id = new_id;
            for field in record.fields.values_mut() {
                let end = field.len();
                if field[end - 4..] == id { field[end - 4..].copy_from_slice(&new_id); }
            }
        } else if existing.contains(&id) { continue; }
        existing.insert(identity(&record)); reserved.insert(identity(&record));
        target.custom.push(record); changed = true;
    }
    for record in source.original.into_iter().filter(|record| needed.contains(&identity(record))) {
        let id = identity(&record);
        if !existing.insert(id) { continue; }
        reserved.insert(id); target.original.push(record); changed = true;
    }
    Ok(changed.then(|| serialize(target)))
}

fn next_id(reserved: &HashSet<[u8; 4]>) -> Result<[u8; 4], String> {
    const DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    for mut number in 1..62usize.pow(4) {
        let mut id = [b'0'; 4];
        for digit in id.iter_mut().rev() { *digit = DIGITS[number % 62]; number /= 62; }
        if !reserved.contains(&id) { return Ok(id); }
    }
    Err("没有可用于物编冲突的新编号".into())
}

fn serialize(file: ObjectFile) -> Vec<u8> {
    let mut bytes = 2u32.to_le_bytes().to_vec();
    for records in [file.original, file.custom] {
        bytes.extend_from_slice(&(records.len() as u32).to_le_bytes());
        for Record { parent, id, fields } in records {
            bytes.extend_from_slice(&parent); bytes.extend_from_slice(&id);
            bytes.extend_from_slice(&(fields.len() as u32).to_le_bytes());
            for field in fields.into_values() { bytes.extend_from_slice(&field); }
        }
    }
    bytes
}
