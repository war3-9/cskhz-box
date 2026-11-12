// JRP1 v1: HKDF-SHA256 / AES-256-GCM, Zstd and keyed eight-lane byteweave.
// This is a read-buffer decoder. It never executes a loader or reads a process.
use aes_gcm::{aead::{Aead, Payload}, Aes256Gcm, KeyInit, Nonce};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::io::Read;

const LIMIT: usize = 256 * 1024 * 1024;
// Verified against the 231ccf80 loader's runtime key and all 5314 resources.
// Other roots/versions fail authentication; this is not a universal JRP key.
const ROOT: [u8; 32] = [0x63, 0x78, 0x91, 0xa3, 0xa9, 0xdd, 0x82, 0x3b, 0x68, 0x47, 0x5f, 0x4a, 0xa7, 0xd3, 0xd8, 0x11, 0xcc, 0x25, 0xba, 0x9b, 0x75, 0xd9, 0xeb, 0xd6, 0xc3, 0xbd, 0xff, 0x1f, 0xb6, 0xa5, 0x0b, 0x2c];

fn span(b: &[u8], at: usize, n: usize) -> Result<&[u8], String> {
    b.get(at..at.checked_add(n).ok_or("长度溢出")?).ok_or_else(|| "数据被截断".into())
}
fn u16_at(b: &[u8], at: usize) -> Result<u16, String> { Ok(u16::from_le_bytes(span(b, at, 2)?.try_into().unwrap())) }
fn u32_at(b: &[u8], at: usize) -> Result<u32, String> { Ok(u32::from_le_bytes(span(b, at, 4)?.try_into().unwrap())) }
fn u64_at(b: &[u8], at: usize) -> Result<usize, String> {
    usize::try_from(u64::from_le_bytes(span(b, at, 8)?.try_into().unwrap())).map_err(|_| "长度超出平台范围".into())
}
fn derive(key: &[u8], b: &[u8], label: &[u8], extra: &[u8]) -> Result<[u8; 32], String> {
    let info = [label, &b[16..32], &b[8..12], extra].concat();
    let mut result = [0; 32];
    Hkdf::<Sha256>::new(Some(&b[32..48]), key).expand(&info, &mut result).map_err(|_| "密钥派生失败")?;
    Ok(result)
}
fn decrypt(key: &[u8], nonce: &[u8], cipher: &[u8], tag: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
    let aes = Aes256Gcm::new_from_slice(key).map_err(|_| "密钥长度无效")?;
    aes.decrypt(Nonce::from_slice(nonce), Payload { msg: &[cipher, tag].concat(), aad })
        .map_err(|_| "资源认证失败：密钥配置不兼容或数据已损坏".into())
}
fn unweave(key: &[u8], id: u32, bytes: &[u8]) -> Vec<u8> {
    let mut lanes: Vec<_> = (0u32..8).map(|lane| {
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("HMAC accepts arbitrary key lengths");
        mac.update(b"JRP1/byteweave/v1"); mac.update(&id.to_le_bytes()); mac.update(&lane.to_le_bytes());
        (mac.finalize().into_bytes(), lane as usize)
    }).collect();
    lanes.sort();
    let mut out = vec![0; bytes.len()]; let mut position = 0;
    for (_, lane) in lanes {
        for target in out.iter_mut().skip(lane).step_by(8) { *target = bytes[position]; position += 1; }
    }
    out
}
fn decompress(bytes: &[u8], expected: usize) -> Result<Vec<u8>, String> {
    if zstd::zstd_safe::find_frame_compressed_size(bytes).map_err(|_| "Zstd 帧无效")? != bytes.len() {
        return Err("Zstd 帧存在多余数据".into());
    }
    let mut stream = zstd::stream::read::Decoder::new(bytes).map_err(|e| e.to_string())?;
    stream.window_log_max(26).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    stream.take(expected as u64 + 1).read_to_end(&mut out).map_err(|e| format!("Zstd 解压失败：{e}"))?;
    if out.len() != expected { return Err("分段解压长度不符".into()); }
    Ok(out)
}
pub(super) fn decode(b: &[u8]) -> Result<Vec<u8>, String> {
    if b.len() < 160 || b.len() > LIMIT || !b.starts_with(b"JRP1") { return Err("头部或资源长度无效".into()); }
    if u16_at(b, 4)? != 1 || u16_at(b, 6)? != 160 || u32_at(b, 12)? != 0 || u32_at(b, 156)? != 0 {
        return Err("不支持的 JRP1 版本或标志".into());
    }
    let kind = u32_at(b, 8)?;
    if !(1..=3).contains(&kind) { return Err("不支持的资源类型".into()); }
    let index_len = u32_at(b, 120)? as usize;
    let payload_start = u64_at(b, 140)?;
    if index_len > 16 * 1024 * 1024 || payload_start != 160 + index_len || u64_at(b, 148)? != b.len() {
        return Err("索引或载荷范围无效".into());
    }
    let wrapping = derive(&ROOT, b, b"JRP1/key-envelope/v1", &[])?;
    let key = decrypt(&wrapping, &b[48..60], &b[60..92], &b[92..108], &b[..48])?;
    if key.len() != 32 { return Err("内容密钥长度无效".into()); }
    let index_key = derive(&key, b, b"JRP1/index/v1", &[])?;
    let aad = [&b[..124], &b[140..160]].concat();
    let index = decrypt(&index_key, &b[108..120], span(b, 160, index_len)?, &b[124..140], &aad)?;
    if u16_at(&index, 0)? != 1 || u32_at(&index, 2)? != kind || u16_at(&index, 26)? != 72 || u16_at(&index, 28)? != 0 {
        return Err("索引版本、类型或记录格式无效".into());
    }
    let size = u64_at(&index, 10)?;
    let prefix_len = u32_at(&index, 18)? as usize;
    let count = u32_at(&index, 22)? as usize;
    if size > LIMIT || size == 0 || count == 0 || count > 65535 || prefix_len > index.len()
        || 30 + prefix_len + count * 72 != index.len() { return Err("索引长度或资源大小超限".into()); }
    let prefix = span(&index, 30, prefix_len)?;
    let signature = span(&index, 6, 4)?;
    if signature != match kind { 1 => b"MDLX", 2 => b"BLP1", _ => b"TGA1" }
        || (kind != 2 && prefix_len != 0) { return Err("不支持的资源签名或前缀".into()); }
    let mut out = Vec::new();
    let mut output_ranges = Vec::new();
    if kind == 1 { out.extend_from_slice(b"MDLX"); }
    else {
        out.resize(size, 0);
        if kind == 2 {
            // v1 BLP1 manifest: 80 bytes of mip metadata, followed by the
            // original 156-byte BLP header. Segments retain absolute offsets.
            if prefix.len() != 236 || size < 156 || &prefix[80..84] != b"BLP1" { return Err("BLP1 清单无效".into()); }
            out[..156].copy_from_slice(&prefix[80..]); output_ranges.push((0, 156));
        }
    }
    let mut payload_ranges = Vec::new();
    for i in 0..count {
        let rec = span(&index, 30 + prefix_len + i * 72, 72)?;
        let id = u32_at(rec, 0)?;
        let category = u32_at(rec, 4)?;
        let offset = u32_at(rec, 8)? as usize;
        let weave = u16_at(rec, 12)?; let compression = u16_at(rec, 14)?;
        let decoded_size = u32_at(rec, 16)? as usize;
        let woven_size = u32_at(rec, 20)? as usize;
        let cipher_size = u32_at(rec, 24)? as usize;
        let payload_offset = u64_at(rec, 28)?;
        if id as usize != i || weave > 1 || compression > 1 || decoded_size > size || woven_size != decoded_size
            || u32_at(rec, 36)? as usize != cipher_size || u32_at(rec, 68)? != 0 {
            return Err("分段编号、变换或长度无效".into());
        }
        let start = payload_start.checked_add(payload_offset).ok_or("载荷偏移溢出")?;
        let encrypted = span(b, start, cipher_size)?;
        payload_ranges.push((start, start + cipher_size));
        let segment_key = derive(&key, b, b"JRP1/segment/v1", &[id.to_le_bytes(), category.to_le_bytes()].concat())?;
        let aad = [&b[..48], &b[140..156], &rec[..52]].concat();
        let plain = decrypt(&segment_key, &rec[40..52], encrypted, &rec[52..68], &aad)?;
        let plain = if compression == 1 { decompress(&plain, woven_size)? } else { plain };
        if plain.len() != woven_size { return Err("分段明文长度不符".into()); }
        let plain = if weave == 1 { unweave(&segment_key, id, &plain) } else { plain };
        // BLP manifests may include an authenticated padding segment. It is
        // stored in the shuffled payload but never copied into the BLP image.
        if kind == 2 && category == 0x3ff { continue; }
        if kind == 1 {
            if category as usize != offset || out.len() + 8 + plain.len() > size { return Err("MDX 区块长度无效".into()); }
            out.extend_from_slice(&category.to_le_bytes()); out.extend_from_slice(&(plain.len() as u32).to_le_bytes()); out.extend_from_slice(&plain);
        } else {
            let end = offset.checked_add(plain.len()).ok_or("资源偏移溢出")?;
            out.get_mut(offset..end).ok_or("分段超出资源范围")?.copy_from_slice(&plain);
            output_ranges.push((offset, end));
        }
    }
    fn covers(ranges: &mut [(usize, usize)], start: usize, end: usize, overlaps: bool) -> bool {
        ranges.sort_unstable(); let mut cursor = start;
        for &(a, b) in ranges.iter() {
            if a > cursor || (!overlaps && a != cursor) || b < a { return false; }
            cursor = cursor.max(b);
        }
        cursor == end
    }
    // Original BLP mip ranges can alias each other and even the palette. The
    // loader writes them in index order; preserve that exact byte behavior.
    if !covers(&mut payload_ranges, payload_start, b.len(), false) || out.len() != size
        || (kind != 1 && !covers(&mut output_ranges, 0, size, kind == 2)) { return Err("分段重叠、缺失或总长度不符".into()); }
    Ok(out)
}

#[cfg(test)]
mod tests;
