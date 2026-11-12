use std::{fs::OpenOptions, io::{Read, Seek, SeekFrom, Write}, path::Path};

pub(super) fn anonymous(name: &str) -> bool {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    base.strip_prefix("File").is_some_and(|tail| tail.split('.').next().is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())))
}

pub(super) fn key(hash: [u32; 4]) -> String { format!("__box_raw__/{:08x}_{:08x}_{:08x}.bin", hash[0], hash[1], hash[2]) }

pub(super) fn parse_key(name: &str) -> Option<[u32; 3]> {
    let value = name.strip_prefix("__box_raw__/")?.strip_suffix(".bin")?;
    let parts = value.split('_').map(|s| u32::from_str_radix(s, 16).ok()).collect::<Option<Vec<_>>>()?;
    parts.try_into().ok()
}

pub(super) fn matches_name(key: &str, name: &str) -> bool {
    key.replace('\\', "/").eq_ignore_ascii_case(name) || parse_key(key).is_some_and(|id| id[0] == hash(name, 1) && id[1] == hash(name, 2))
}

// StormLib can only rebuild a hash table when every filename is known. Grow
// classic tables on the private output copy without changing any file blocks.
// Deleted slots preserve lookup chains when the starting name hash is unknown.
pub(super) fn reserve(path: &Path, additions: usize) -> Result<(), String> {
    let archive = crate::model_viewer::storm::Archive::open(path)?;
    let entries = archive.hashes()?;
    drop(archive);
    let occupied = entries.iter().filter(|entry| entry[3] < 0xfffffffe).count();
    let mut file = OpenOptions::new().read(true).write(true).open(path).map_err(|e| e.to_string())?;
    let mut prefix = vec![0; 1024 * 1024]; let length = file.read(&mut prefix).map_err(|e| e.to_string())?;
    let base = prefix[..length].windows(4).position(|b| b == b"MPQ\x1a").ok_or("输出地图缺少 MPQ 头")?;
    let header = prefix.get(base..base + 32).ok_or("输出 MPQ 头被截断")?;
    let blocks = u32::from_le_bytes(header[28..32].try_into().unwrap()) as usize;
    let needed = occupied.max(blocks).checked_add(additions).and_then(|n| n.checked_add(16)).ok_or("资源容量越界")?;
    if needed <= entries.len() { return Ok(()); }
    if u16::from_le_bytes(header[12..14].try_into().unwrap()) != 0 { return Err("匿名地图扩容当前支持经典 MPQ v1".into()); }
    let count = needed.checked_next_power_of_two().filter(|n| *n <= 1_000_000).ok_or("资源容量超过限制")?;
    let mut grown = vec![[0xffffffff, 0xffffffff, 0xffffffff, 0xfffffffe]; count];
    for (index, mut entry) in entries.into_iter().enumerate() {
        if entry[3] == 0xffffffff { entry[3] = 0xfffffffe; }
        grown[index] = entry;
    }
    let mut data = Vec::with_capacity(count * 16);
    for entry in grown { for word in entry { data.extend_from_slice(&word.to_le_bytes()); } }
    crypt(&mut data, hash("(hash table)", 3), true);
    let end = file.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
    let offset = u32::try_from(end - base as u64).map_err(|_| "输出地图超过经典 MPQ 容量")?;
    let size = offset.checked_add(data.len() as u32).ok_or("输出地图超过经典 MPQ 容量")?;
    file.write_all(&data).map_err(|e| e.to_string())?;
    for (field, bytes) in [(8u64, size.to_le_bytes()), (16, offset.to_le_bytes()), (24, (count as u32).to_le_bytes())] {
        file.seek(SeekFrom::Start(base as u64 + field)).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    file.sync_all().map_err(|e| e.to_string())
}

// Anonymous enumeration names are not paths. Restore the original MPQ name
// hashes after writing their decoded bytes through StormLib under private names.
pub(super) fn restore_filtered(path: &Path, members: &std::collections::HashMap<String, Vec<u8>>, removed: &std::collections::HashSet<String>) -> Result<(), String> {
    let replacements: Vec<_> = members.keys().filter_map(|name| parse_key(name).map(|identity| (hash(name, 1), hash(name, 2), identity))).collect();
    if replacements.is_empty() && removed.is_empty() { return Ok(()); }
    let mut file = OpenOptions::new().read(true).write(true).open(path).map_err(|e| e.to_string())?;
    let mut prefix = vec![0; 1024 * 1024]; let length = file.read(&mut prefix).map_err(|e| e.to_string())?;
    let base = prefix[..length].windows(4).position(|b| b == b"MPQ\x1a").ok_or("输出地图缺少 MPQ 头")?;
    let header = prefix.get(base..base + 32).ok_or("输出 MPQ 头被截断")?;
    if u16::from_le_bytes(header[12..14].try_into().unwrap()) != 0 { return Err("匿名资源写入当前支持经典 MPQ v1".into()); }
    let offset = u32::from_le_bytes(header[16..20].try_into().unwrap()) as u64 + base as u64;
    let count = u32::from_le_bytes(header[24..28].try_into().unwrap()) as usize;
    if count == 0 || count > 1_000_000 { return Err("输出 MPQ 哈希表尺寸无效".into()); }
    let mut data = vec![0; count * 16]; file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?; file.read_exact(&mut data).map_err(|e| e.to_string())?;
    crypt(&mut data, hash("(hash table)", 3), false);
    let mut entries: Vec<[u32; 4]> = data.chunks_exact(16).map(|b| std::array::from_fn(|i| u32::from_le_bytes(b[i * 4..i * 4 + 4].try_into().unwrap()))).collect();
    for (a, b, identity) in replacements {
        let index = entries.iter().position(|entry| entry[3] < 0xfffffffe && entry[0] == a && entry[1] == b).ok_or("写入匿名资源后未找到其哈希条目")?;
        for (i, entry) in entries.iter_mut().enumerate() {
            if i != index && entry[3] < 0xfffffffe && entry[..3] == identity { entry[3] = 0xfffffffe; }
        }
        entries[index][..3].copy_from_slice(&identity);
    }
    for name in removed {
        let (a, b) = (hash(name, 1), hash(name, 2));
        for entry in &mut entries { if entry[0] == a && entry[1] == b { entry[3] = 0xfffffffe; } }
    }
    // Unknown names have no recoverable starting hash. Deleted slots keep the
    // probe chain open so both Warcraft and StormLib find the exact identity.
    for entry in &mut entries { if entry[3] == 0xffffffff { entry[3] = 0xfffffffe; } }
    for (chunk, entry) in data.chunks_exact_mut(16).zip(entries) { for i in 0..4 { chunk[i * 4..i * 4 + 4].copy_from_slice(&entry[i].to_le_bytes()); } }
    crypt(&mut data, hash("(hash table)", 3), true);
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?; file.write_all(&data).map_err(|e| e.to_string())?; file.sync_all().map_err(|e| e.to_string())
}

fn table() -> [u32; 1280] {
    let mut table = [0; 1280]; let mut seed = 0x100001u32;
    for i in 0..256 { for j in 0..5 {
        seed = (seed * 125 + 3) % 0x2aaaab; let high = (seed & 0xffff) << 16;
        seed = (seed * 125 + 3) % 0x2aaaab; table[i + j * 256] = high | (seed & 0xffff);
    } } table
}
fn hash(name: &str, kind: usize) -> u32 {
    let table = table(); let mut a = 0x7fed7fedu32; let mut b = 0xeeeeeeeeu32;
    for value in name.replace('/', "\\").bytes().map(|b| b.to_ascii_uppercase()) {
        a = table[kind * 256 + value as usize] ^ a.wrapping_add(b);
        b = u32::from(value).wrapping_add(a).wrapping_add(b).wrapping_add(b << 5).wrapping_add(3);
    } a
}
fn crypt(bytes: &mut [u8], mut key: u32, encrypt: bool) {
    let table = table(); let mut seed = 0xeeeeeeeeu32;
    for word in bytes.chunks_exact_mut(4) {
        seed = seed.wrapping_add(table[0x400 + (key & 0xff) as usize]);
        let input = u32::from_le_bytes(word.try_into().unwrap()); let output = input ^ key.wrapping_add(seed);
        let plain = if encrypt { input } else { output };
        key = ((!key << 21).wrapping_add(0x11111111)) | (key >> 11);
        seed = plain.wrapping_add(seed).wrapping_add(seed << 5).wrapping_add(3); word.copy_from_slice(&output.to_le_bytes());
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn known_hash_key_and_roundtrip() { assert_eq!(hash("(hash table)", 3), 0xc3af3770); let mut bytes = vec![0x55; 64]; let original = bytes.clone(); crypt(&mut bytes, 42, true); assert_ne!(bytes, original); crypt(&mut bytes, 42, false); assert_eq!(bytes, original); }
    #[test] fn growing_private_archive_keeps_every_name_identity_and_byte_stream() {
        use crate::model_viewer::storm::Archive;
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let source = super::super::tests::archive_fixture();
        let output = root.join(format!("test-results/model-map-integrity-20261012/reserve-{}.w3m", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(output.parent().unwrap()).unwrap();
        let original = std::fs::read(&source).unwrap(); std::fs::copy(&source, &output).unwrap();
        let archive = Archive::open(&source).unwrap(); let hashes = archive.hashes().unwrap();
        let mut resources = vec![];
        archive.enumerate(|_, raw, _, _| { resources.push((raw.clone(), archive.read_raw(&raw).unwrap())); true });
        reserve(&output, 4096).unwrap();
        let saved = Archive::open(&output).unwrap(); let actual = saved.hashes().unwrap();
        assert!(actual.len() > hashes.len());
        for entry in hashes.iter().filter(|entry| entry[3] < 0xfffffffe) { assert!(actual.contains(entry)); }
        for (raw, bytes) in resources { assert_eq!(saved.read_raw(&raw).unwrap(), bytes); }
        assert_eq!(std::fs::read(source).unwrap(), original);
    }
}
