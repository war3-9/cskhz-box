//! ModelEncrypt v1 resource compatibility. No map code or DLL is executed.
//! The bundled format key was recovered from the verified resource loader
//! eade036514875c02afc443e9353bcf44dabd9277107a4e89b956f9e646eb1a46.
//! Other keys/versions fail explicitly; the signature alone cannot identify a key.
//! MHEC v1 key/section semantics were recovered from the Zstd resource in
//! 19ccd3bce7be894a740bad996fa1b63b9e63834cf98519b1dfcf3b9bfed42a9f.
use std::{io::Read, sync::OnceLock};
use aes::cipher::{KeyIvInit, StreamCipher};
use base64::Engine;
use rsa::{pkcs8::DecodePrivateKey, Pkcs1v15Encrypt, RsaPrivateKey};

const LIMIT: usize = 64 * 1024 * 1024;
const TAGS: [&[u8; 4]; 22] = [b"VERS", b"MODL", b"SEQS", b"MTLS", b"TEXS", b"GEOS", b"GEOA", b"BONE", b"HELP", b"ATCH", b"PIVT", b"CAMS", b"EVTS", b"CLID", b"RIBB", b"GLBS", b"TXAN", b"LITE", b"PREM", b"PRE2", b"SNDS", b"SNEM"];

struct Reader<'a> { bytes: &'a [u8], pos: usize }
impl<'a> Reader<'a> {
    fn take(&mut self, size: usize) -> Result<&'a [u8], String> {
        let end = self.pos.checked_add(size).filter(|end| *end <= self.bytes.len()).ok_or("MHAC/MHEB 资源被截断")?;
        let result = &self.bytes[self.pos..end]; self.pos = end; Ok(result)
    }
    fn u32(&mut self) -> Result<u32, String> { Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap())) }
}

fn material_for(envelope: &[u8], mhec: bool) -> Result<[u8; 48], String> {
    static KEY: OnceLock<Result<RsaPrivateKey, String>> = OnceLock::new();
    static MHEC_KEY: OnceLock<Result<RsaPrivateKey, String>> = OnceLock::new();
    let (cache, der) = if mhec { (&MHEC_KEY, include_bytes!("mhec-v1.der").as_slice()) } else { (&KEY, include_bytes!("mhac-v1.der").as_slice()) };
    let key = cache.get_or_init(|| RsaPrivateKey::from_pkcs8_der(der).map_err(|_| "资源兼容密钥无效".to_string())).as_ref().map_err(Clone::clone)?;
    let encoded = key.decrypt(Pkcs1v15Encrypt, envelope).map_err(|_| "MHAC/MHEB 的加密密钥尚不兼容，或资源已损坏；当前支持已验证的 ModelEncrypt v1 变体")?;
    let decoded = base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_| "MHAC/MHEB 加密参数无效")?;
    decoded.try_into().map_err(|_| "MHAC/MHEB 加密参数长度无效".into())
}
fn material(envelope: &[u8]) -> Result<[u8; 48], String> { material_for(envelope, false) }

fn decrypt(bytes: &[u8], key: &[u8; 48]) -> Vec<u8> {
    let mut output = bytes.to_vec();
    let mut cipher = ctr::Ctr128BE::<aes::Aes256>::new((&key[..32]).into(), (&key[32..]).into());
    cipher.apply_keystream(&mut output); output
}

fn inflate(bytes: &[u8], remaining: usize) -> Result<Vec<u8>, String> {
    let mut decoder = zstd::stream::read::Decoder::new(bytes).map_err(|_| "MHAC 压缩数据无效")?;
    decoder.window_log_max(26).map_err(|_| "MHAC 压缩窗口无效")?;
    let mut output = Vec::new();
    decoder.take(remaining as u64 + 1).read_to_end(&mut output).map_err(|_| "MHAC 压缩数据损坏或窗口超过上限")?;
    if output.len() > remaining { return Err("MHAC 解压后超过 64 MiB 预览上限".into()); }
    Ok(output)
}

fn model(reader: &mut Reader<'_>, mhec: bool) -> Result<Vec<u8>, String> {
    let bits = u128::from_le_bytes(reader.take(16)?.try_into().unwrap());
    let count = (bits & 31) as usize;
    if count == 0 || count > TAGS.len() { return Err("MHAC 区块数量无效".into()); }
    let mut ids = Vec::with_capacity(count); let mut seen = 0u32;
    for i in 0..count {
        let id = ((bits >> (5 + 5 * i)) & 31) as usize;
        if id >= TAGS.len() || seen & (1 << id) != 0 { return Err("MHAC 区块标记无效或重复".into()); }
        ids.push(id); seen |= 1 << id;
    }
    if seen & 3 != 3 { return Err("MHAC 缺少版本或模型区块".into()); }
    let flags = reader.u32()?;
    if flags >> TAGS.len() != 0 { return Err("MHAC 加密标记无效".into()); }
    let key = if flags != 0 { Some(material_for(reader.take(256)?, mhec)?) } else { None };
    let mut output = b"MDLX".to_vec();
    for id in ids {
        let size = reader.u32()? as usize; let payload = reader.take(size)?;
        let payload = if id == 0 {
            // v1 encrypts VERS including runtime map-matching JSON. That JSON is
            // not part of standard MDX; retain only its original version integer.
            // MHEC keeps VERS in plain bytes; MHAC encrypts it independently
            // of the section flag. Never infer this from successful AES output.
            let decoded = if mhec { payload.to_vec() } else { key.as_ref().map_or_else(|| payload.to_vec(), |key| decrypt(payload, key)) };
            if decoded.get(..4) != Some(800u32.to_le_bytes().as_slice()) { return Err("MHAC 模型版本尚不支持或版本数据损坏".into()); }
            decoded[..4].to_vec()
        } else if flags & (1 << id) != 0 {
            inflate(&decrypt(payload, key.as_ref().ok_or("MHAC 缺少加密参数")?), LIMIT.saturating_sub(output.len() + 8))?
        } else { payload.to_vec() };
        if output.len() + 8 + payload.len() > LIMIT { return Err("MHAC 解码后超过 64 MiB 预览上限".into()); }
        output.extend_from_slice(TAGS[id]); output.extend_from_slice(&(payload.len() as u32).to_le_bytes()); output.extend_from_slice(&payload);
    }
    if reader.pos != reader.bytes.len() { return Err("MHAC 存在未识别的尾部数据".into()); }
    Ok(output)
}

pub(super) fn decode(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() > LIMIT { return Err("MHAC/MHEB 资源超过 64 MiB 预览上限".into()); }
    let mut reader = Reader { bytes, pos: 0 };
    let magic = reader.take(4)?;
    if reader.u32()? != 1 { return Err("MHAC/MHEB 资源版本尚不支持（当前支持 v1）".into()); }
    match magic {
        b"MHAC" => model(&mut reader, false),
        b"MHEC" => model(&mut reader, true),
        b"MHEB" => {
            let key = material(reader.take(256)?)?;
            let mut output = b"BLP1".to_vec(); output.extend(decrypt(&bytes[reader.pos..], &key));
            if output.len() < 156 { return Err("MHEB 贴图文件头被截断".into()); }
            super::texture::validate(&output).map_err(|error| error.replace("BLX1", "MHEB"))?;
            Ok(output)
        }
        _ => Err("MHAC/MHEB 文件头无效".into()),
    }
}

#[cfg(test)]
mod tests;
