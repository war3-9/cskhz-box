use super::reader::Result;

pub(super) fn decode(bytes: &[u8]) -> Result<Vec<u8>> {
    if bytes.len() < 156 { return Err("BLX1 贴图文件头被截断".into()); }
    let mut output = bytes.to_vec(); output[..4].copy_from_slice(b"BLP1");
    let mut key = bytes.len() as u32 ^ 0x24125689; let mut previous = 0u32;
    for word in output[4..].chunks_mut(4) {
        let mut padded = [0u8; 4]; padded[..word.len()].copy_from_slice(word);
        previous ^= u32::from_le_bytes(padded) ^ key;
        word.copy_from_slice(&previous.to_le_bytes()[..word.len()]); key = key.rotate_left(2);
    }
    validate(&output)?; Ok(output)
}

pub(super) fn validate(bytes: &[u8]) -> Result<()> {
    let value = |offset| u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap());
    let compression = value(4); let alpha = value(8); let width = value(12); let height = value(16);
    if compression > 1 || !matches!(alpha, 0 | 1 | 4 | 8) || width == 0 || height == 0 || width > 8192 || height > 8192 || width as u64 * height as u64 > 16_777_216 {
        return Err("BLX1 解码后的 BLP1 贴图头无效".into());
    }
    let header = if compression == 1 { 1180 } else { 160 };
    if bytes.len() < header { return Err("BLX1 调色板或 JPEG 头被截断".into()); }
    if compression == 0 && value(156) as usize > bytes.len() - 160 { return Err("BLX1 JPEG 头长度越界".into()); }
    let mut found = false;
    for level in 0..16 {
        let offset = value(28 + level * 4) as usize; let length = value(92 + level * 4) as usize;
        if offset == 0 && length == 0 { continue; }
        if offset < header || length == 0 || offset.checked_add(length).is_none_or(|end| end > bytes.len()) { return Err("BLX1 mipmap 数据长度越界".into()); }
        if compression == 1 {
            let pixels = (width >> level).max(1) as usize * (height >> level).max(1) as usize;
            if length < pixels + (pixels * alpha as usize).div_ceil(8) { return Err("BLX1 像素或透明通道被截断".into()); }
        }
        if level == 0 { found = true; }
    }
    if !found { return Err("BLX1 缺少主贴图数据".into()); } Ok(())
}
