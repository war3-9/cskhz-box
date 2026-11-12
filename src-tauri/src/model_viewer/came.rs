// CAME is an authenticated external resource container, not a different MDX.
// The loader is inspected as data only; no map code is loaded or executed.
use aes_gcm::{aead::{Aead, Payload}, Aes256Gcm, KeyInit, Nonce};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs::{File, Metadata}, io::{Read, Seek, SeekFrom}, path::{Path, PathBuf}, sync::{Arc, Mutex, OnceLock}};

const MAX_RESOURCE: usize = 256 * 1024 * 1024;
const MAX_RECORDS: usize = 100_000;
const PROFILE: &str = "d776357f398bf78ac1f21c462100bfcdb73678d7b035d8715cb150761df34340";
const JRP_PROFILE: &str = "231ccf80afdf8b8e4e8a90435f00f67b256780bf84c8a432bb2cee3d7c2a5d88";
pub(super) fn module_size(size: u32) -> bool { matches!(size, 8_329_344 | 11_543_112) }
pub(super) fn module_supported(bytes: &[u8]) -> bool {
    matches!(format!("{:x}", Sha256::digest(bytes)).as_str(), PROFILE | JRP_PROFILE)
}
const RAW_TOKEN: &[u8] = b"\0BOXCAME";
pub(super) const BLOCK_BASE: u32 = 0x8000_0000;
type Identity = [u32; 2];

pub(super) struct Record {
    identity: Identity,
    offset: u64,
    encrypted: u32,
    pub size: u32,
    pub prefix: Vec<u8>,
}
pub(super) struct Container {
    file: Mutex<File>,
    aes: Aes256Gcm,
    pub records: Vec<Record>,
    index: HashMap<Identity, usize>,
}
impl Container {
    // CAME records use the same A/B filename identity as classic MPQ, with
    // neutral locale. Keep these separate from the outer physical hash table.
    pub fn resource_hashes(&self) -> impl Iterator<Item = [u32; 4]> + '_ {
        self.records.iter().enumerate().map(|(index, record)|
            [record.identity[0], record.identity[1], 0, BLOCK_BASE + index as u32])
    }
}
struct Cached { path: PathBuf, metadata: Metadata, container: Arc<Container> }
static CACHE: OnceLock<Mutex<Vec<Cached>>> = OnceLock::new();

fn read_at(file: &mut File, offset: u64, size: usize) -> Result<Vec<u8>, String> {
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut bytes = vec![0; size];
    file.read_exact(&mut bytes).map_err(|e| format!("CAME 资源读取失败：{e}"))?;
    Ok(bytes)
}
fn u32_at(bytes: &[u8], offset: usize) -> Result<u32, String> {
    Ok(u32::from_le_bytes(bytes.get(offset..offset + 4).ok_or("CAME 数据被截断")?.try_into().unwrap()))
}
pub(super) fn header(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = vec![0; 0x820];
    let count = file.read(&mut bytes).map_err(|e| e.to_string())?;
    bytes.truncate(count);
    Ok((bytes.starts_with(b"HM3W") && bytes.get(0x800..0x808) == Some(b"MPQ\x1aCAME")).then_some(bytes))
}
// Returns None for a new identity; callers supply the verified outer loader.
pub(super) fn cached(path: &Path) -> Result<Option<Arc<Container>>, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let cache = CACHE.get_or_init(Default::default).lock().map_err(|_| "CAME 缓存不可用")?;
    Ok(cache.iter().find(|entry| entry.path == path && entry.metadata.len() == metadata.len()
        && entry.metadata.modified().ok() == metadata.modified().ok()
        && entry.metadata.created().ok() == metadata.created().ok()).map(|entry| entry.container.clone()))
}
pub(super) fn open(path: &Path, header: &[u8], module: &[u8]) -> Result<Arc<Container>, String> {
    let master = master_key(module)?;
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let start = u32_at(header, 0x808)? as u64;
    if start < 0x820 || start >= metadata.len() { return Err("CAME 外置资源偏移无效".into()); }
    let mut records = Vec::new();
    let mut index = HashMap::new();
    let mut position = start;
    while position < metadata.len() {
        if records.len() >= MAX_RECORDS || metadata.len() - position < 12 { return Err("CAME 资源表超限或被截断".into()); }
        let bytes = read_at(&mut file, position, 12)?;
        let identity = [u32_at(&bytes, 0)?, u32_at(&bytes, 4)?];
        let encrypted = u32_at(&bytes, 8)?;
        let end = position + 12 + encrypted as u64;
        if encrypted < 28 || encrypted as usize > MAX_RESOURCE || end > metadata.len() { return Err("CAME 资源长度无效".into()); }
        if index.insert(identity, records.len()).is_some() { return Err("CAME 资源标识重复".into()); }
        records.push(Record { identity, offset: position + 12, encrypted, size: 0, prefix: Vec::new() });
        position = end;
    }
    let first = records.first().ok_or("CAME 资源表为空")?;
    let first_blob = read_at(&mut file, first.offset, first.encrypted as usize)?;
    let master = Aes256Gcm::new_from_slice(&master).map_err(|_| "CAME 主密钥长度无效")?;
    let mut cipher = None;
    for envelope in header[..0x800].windows(60) {
        if let Ok(key) = decrypt(&master, envelope, &[]) {
            if key.len() != 32 { continue; }
            let candidate = Aes256Gcm::new_from_slice(&key).map_err(|_| "CAME 地图密钥长度无效")?;
            if decrypt(&candidate, &first_blob, &aad(first.identity)).is_ok() { cipher = Some(candidate); break; }
        }
    }
    let aes = cipher.ok_or("CAME 地图密钥封装无法认证：不支持的密钥或损坏数据")?;
    // Authenticate every listed record once. Retain only sizes and small prefixes,
    // never the entire decoded map. Subsequent previews use random access.
    for record in &mut records {
        let blob = read_at(&mut file, record.offset, record.encrypted as usize)?;
        let decoded = decode(&aes, &blob, record.identity)?;
        record.size = decoded.len() as u32;
        record.prefix = decoded[..decoded.len().min(64)].to_vec();
    }
    let after = file.metadata().map_err(|e| e.to_string())?;
    if after.len() != metadata.len() || after.modified().ok() != metadata.modified().ok() { return Err("CAME 扫描过程中地图发生变化，请重新打开".into()); }
    let container = Arc::new(Container { file: Mutex::new(file), aes, records, index });
    let mut cache = CACHE.get_or_init(Default::default).lock().map_err(|_| "CAME 缓存不可用")?;
    cache.retain(|entry| entry.path != path);
    if cache.len() >= 4 { cache.remove(0); }
    cache.push(Cached { path: path.into(), metadata, container: container.clone() });
    Ok(container)
}
fn aad(identity: Identity) -> [u8; 8] {
    let mut bytes = [0; 8]; bytes[..4].copy_from_slice(&identity[0].to_le_bytes()); bytes[4..].copy_from_slice(&identity[1].to_le_bytes()); bytes
}
fn decrypt(cipher: &Aes256Gcm, blob: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
    if blob.len() < 28 { return Err("CAME GCM 数据被截断".into()); }
    cipher.decrypt(Nonce::from_slice(&blob[..12]), Payload { msg: &blob[12..], aad }).map_err(|_| "CAME 资源认证失败，数据或资源标识已损坏".into())
}
fn decode(cipher: &Aes256Gcm, blob: &[u8], identity: Identity) -> Result<Vec<u8>, String> {
    let compressed = decrypt(cipher, blob, &aad(identity))?;
    let frame = zstd::zstd_safe::find_frame_compressed_size(&compressed).map_err(|_| "CAME Zstd 帧无效")?;
    if frame != compressed.len() { return Err("CAME Zstd 帧存在多余数据".into()); }
    let mut decoder = zstd::stream::read::Decoder::new(compressed.as_slice()).map_err(|e| e.to_string())?;
    decoder.window_log_max(26).map_err(|e| e.to_string())?;
    let mut decoded = Vec::new();
    decoder.take(MAX_RESOURCE as u64 + 1).read_to_end(&mut decoded).map_err(|e| format!("CAME 解压失败：{e}"))?;
    if decoded.len() > MAX_RESOURCE { return Err("CAME 解压资源超过 256 MiB 限制".into()); }
    if decoded.starts_with(b"JRP1") { return super::codec::convert(&decoded).map(|bytes| bytes.into_owned()); }
    Ok(decoded)
}
fn master_key(module: &[u8]) -> Result<Vec<u8>, String> {
    let key_rva = match format!("{:x}", Sha256::digest(module)).as_str() {
        PROFILE => 0x3cb2a0,
        JRP_PROFILE => 0x5d890e,
        _ => return Err("不兼容的 CAME 保护模块版本，尚未验证此密钥配置".into()),
    };
    let nt = u32_at(module, 0x3c)? as usize;
    if !module.starts_with(b"MZ") || module.get(nt..nt + 4) != Some(b"PE\0\0") { return Err("CAME 模块 PE 无效".into()); }
    let word = |offset| -> Result<usize, String> { Ok(u16::from_le_bytes(module.get(offset..offset + 2).ok_or("CAME PE 被截断")?.try_into().unwrap()) as usize) };
    let table = nt + 24 + word(nt + 20)?;
    for section in 0..word(nt + 6)? {
        let entry = table + section * 40;
        let rva = u32_at(module, entry + 12)? as usize;
        let size = u32_at(module, entry + 16)? as usize;
        let raw = u32_at(module, entry + 20)? as usize;
        if rva <= key_rva && key_rva + 32 <= rva.saturating_add(size) {
            let offset = raw + key_rva - rva;
            return module.get(offset..offset + 32).map(Vec::from).ok_or_else(|| "CAME 密钥超出 PE 文件范围".into());
        }
    }
    Err("CAME 主密钥不在文件节内".into())
}
impl Container {
    pub fn find(&self, name: &[u8]) -> Option<usize> {
        if let Some(token) = name.strip_prefix(RAW_TOKEN) {
            if token.len() != 12 { return None; }
            let index = u32_at(token, 0).ok()? as usize;
            return self.records.get(index).filter(|record| aad(record.identity).as_slice() == &token[4..]).map(|_| index);
        }
        self.index.get(&[path_hash(name, 0x100), path_hash(name, 0x200)]).copied()
    }
    pub fn token(&self, index: usize) -> Vec<u8> {
        [RAW_TOKEN, &(index as u32).to_le_bytes(), &aad(self.records[index].identity)].concat()
    }
    pub fn read(&self, index: usize) -> Result<Vec<u8>, String> {
        let record = self.records.get(index).ok_or("CAME 资源索引无效")?;
        let blob = { let mut file = self.file.lock().map_err(|_| "CAME 资源流不可用")?;
            read_at(&mut file, record.offset, record.encrypted as usize)? };
        decode(&self.aes, &blob, record.identity)
    }
}
fn path_hash(path: &[u8], kind: usize) -> u32 {
    static TABLE: OnceLock<[u32; 0x500]> = OnceLock::new();
    let table = TABLE.get_or_init(|| {
        let mut table = [0; 0x500]; let mut seed = 0x100001u32;
        for low in 0..256 { for high in 0..5 {
            seed = (seed * 125 + 3) % 0x2aaaab; let upper = (seed & 0xffff) << 16;
            seed = (seed * 125 + 3) % 0x2aaaab; table[high * 256 + low] = upper | (seed & 0xffff);
        } } table
    });
    let (mut a, mut b) = (0x7fed7fedu32, 0xeeeeeeeeu32);
    for &byte in path {
        let byte = if byte == b'/' { b'\\' } else { byte.to_ascii_uppercase() };
        a = table[kind + byte as usize] ^ a.wrapping_add(b);
        b = (byte as u32).wrapping_add(a).wrapping_add(b).wrapping_add(b << 5).wrapping_add(3);
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_tag_identity_and_trailing_frame_tampering() {
        let cipher = Aes256Gcm::new_from_slice(&[7; 32]).unwrap(); let identity = [13, 27];
        let compressed = zstd::encode_all(b"MDLXtest".as_slice(), 1).unwrap();
        let seal = |plain: &[u8]| { let nonce = [3; 12]; [nonce.to_vec(), cipher.encrypt(Nonce::from_slice(&nonce), Payload { msg: plain, aad: &aad(identity) }).unwrap()].concat() };
        let mut blob = seal(&compressed);
        assert_eq!(decode(&cipher, &blob, identity).unwrap(), b"MDLXtest");
        assert!(decode(&cipher, &blob, [13, 28]).is_err());
        *blob.last_mut().unwrap() ^= 1; assert!(decode(&cipher, &blob, identity).is_err());
        assert!(decode(&cipher, &[0; 27], identity).is_err());
        assert!(decode(&cipher, &seal(&[compressed, vec![0]].concat()), identity).is_err());
        assert!(master_key(b"MZunknown").unwrap_err().contains("不兼容"));
    }
    #[test] fn storm_hash_folds_case_and_slashes() {
        assert_eq!(path_hash(b"war3mapImported/test.blp", 0x100), path_hash(b"WAR3MAPIMPORTED\\TEST.BLP", 0x100));
        assert_ne!(path_hash(b"a", 0x100), path_hash(b"a", 0x200));
    }
}
