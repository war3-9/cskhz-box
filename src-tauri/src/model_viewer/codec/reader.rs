pub(super) const LIMIT: usize = u32::MAX as usize;
pub(super) type Result<T> = std::result::Result<T, String>;

pub(super) struct Reader<'a> { bytes: &'a [u8], pub pos: usize }
impl<'a> Reader<'a> {
    pub fn new(bytes: &'a [u8]) -> Self { Self { bytes, pos: 0 } }
    pub fn remaining(&self) -> usize { self.bytes.len() - self.pos }
    pub fn take(&mut self, length: usize) -> Result<&'a [u8]> {
        if length > self.remaining() { return Err(format!("特殊资源数据截断：偏移 {}，需要 {} 字节", self.pos, length)); }
        let start = self.pos; self.pos += length; Ok(&self.bytes[start..self.pos])
    }
    pub fn u8(&mut self) -> Result<u32> { Ok(self.take(1)?[0] as u32) }
    pub fn u16(&mut self) -> Result<u32> { Ok(u16::from_le_bytes(self.take(2)?.try_into().unwrap()) as u32) }
    pub fn u32(&mut self) -> Result<u32> { Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap())) }
    pub fn f32(&mut self) -> Result<f32> {
        let value = f32::from_le_bytes(self.take(4)?.try_into().unwrap());
        if !value.is_finite() { return Err("特殊模型包含非有限坐标".into()); } Ok(value)
    }
    pub fn expect(&mut self, tag: u32) -> Result<()> {
        if self.u8()? != tag { return Err(format!("MDB3 字段标记不匹配：偏移 {}，预期 {tag}", self.pos - 1)); } Ok(())
    }
    pub fn string(&mut self, length: usize, capacity: usize) -> Result<Vec<u8>> {
        if length >= capacity { return Err("MDB3 名称或贴图路径过长".into()); }
        let mut result = self.take(length)?.to_vec(); result.resize(capacity, 0); Ok(result)
    }
    pub fn record(&mut self) -> Result<Reader<'a>> {
        let size = self.u32()? as usize;
        if size < 4 { return Err("MDB3 记录长度无效".into()); }
        Ok(Reader::new(self.take(size - 4)?))
    }
}

pub(super) fn append(output: &mut Vec<u8>, bytes: &[u8]) -> Result<()> {
    if bytes.len() > LIMIT.saturating_sub(output.len()) { return Err("转换资源超过 MPQ 单文件 4 GiB 格式上限".into()); }
    output.extend_from_slice(bytes); Ok(())
}
pub(super) fn number(output: &mut Vec<u8>, value: u32) -> Result<()> { append(output, &value.to_le_bytes()) }
pub(super) fn float(output: &mut Vec<u8>, value: f32) -> Result<()> {
    if !value.is_finite() { return Err("MDB3 解压后的坐标无效".into()); }
    append(output, &value.to_le_bytes())
}
pub(super) fn sized(bytes: Vec<u8>) -> Result<Vec<u8>> {
    let size = bytes.len().checked_add(4).and_then(|size| u32::try_from(size).ok()).ok_or("转换记录超过 MPQ 单文件 4 GiB 格式上限")?;
    let mut output = Vec::new(); number(&mut output, size)?; append(&mut output, &bytes)?; Ok(output)
}
pub(super) fn chunk(output: &mut Vec<u8>, tag: &[u8; 4], bytes: &[u8]) -> Result<()> {
    let size = u32::try_from(bytes.len()).map_err(|_| "转换区块超过 MPQ 单文件 4 GiB 格式上限")?;
    append(output, tag)?; number(output, size)?; append(output, bytes)
}
