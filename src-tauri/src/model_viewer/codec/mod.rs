mod animation;
mod geoset;
mod model;
mod reader;
mod texture;
mod mhac;
mod jrp;
#[cfg(test)]
mod tests;
use std::borrow::Cow;

/// Converts a private read buffer. The source file/archive is never modified.
pub(crate) fn convert(bytes: &[u8]) -> Result<Cow<'_, [u8]>, String> {
    let format = super::content::protected_format(bytes);
    if format.is_none() { return Ok(Cow::Borrowed(bytes)); }
    if bytes.len() > reader::LIMIT { return Err("特殊资源超过 MPQ 单文件 4 GiB 格式上限".into()); }
    let converted = match format {
        Some("MDB3") => model::decode(bytes),
        Some("BLX1") => texture::decode(bytes),
        Some("MHAC" | "MHEB" | "MHEC") => mhac::decode(bytes),
        Some("JRP1") => jrp::decode(bytes),
        _ => unreachable!(),
    };
    converted.map(Cow::Owned).map_err(|error| format!("{} 转换失败：{error}", format.unwrap()))
}
