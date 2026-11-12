use std::{ffi::{c_void, CString}, os::windows::ffi::OsStrExt, path::Path};
type Handle = *mut c_void;
#[repr(C)]
pub struct Found {
    pub name: [u8; 260], plain: *const u8,
    pub hash: u32, pub block: u32, pub size: u32, flags: u32,
    compressed: u32, time_low: u32, time_high: u32, locale: u32,
}
extern "system" {
    fn SFileOpenArchive(path: *const u16, priority: u32, flags: u32, out: *mut Handle) -> bool;
    fn SFileCloseArchive(archive: Handle) -> bool;
    fn SFileOpenFileEx(archive: Handle, name: *const i8, scope: u32, out: *mut Handle) -> bool;
    fn SFileCloseFile(file: Handle) -> bool;
    fn SFileGetFileSize(file: Handle, high: *mut u32) -> u32;
    fn SFileReadFile(file: Handle, buffer: *mut u8, size: u32, actual: *mut u32, overlapped: Handle) -> bool;
    fn SFileFindFirstFile(archive: Handle, mask: *const i8, found: *mut Found, list: *const u16) -> Handle;
    fn SFileFindNextFile(search: Handle, found: *mut Found) -> bool;
    fn SFileFindClose(search: Handle) -> bool;
    fn SFileHasFile(archive: Handle, name: *const i8) -> bool;
    fn SFileGetFileInfo(handle: Handle, class: u32, info: *mut c_void, size: u32, needed: *mut u32) -> bool;
    fn SFileCreateFile(archive: Handle, name: *const i8, time: u64, size: u32, locale: u32, flags: u32, out: *mut Handle) -> bool;
    fn SFileWriteFile(file: Handle, bytes: *const u8, size: u32, compression: u32) -> bool;
    fn SFileFinishFile(file: Handle) -> bool;
    fn SFileRemoveFile(archive: Handle, name: *const i8, scope: u32) -> bool;
    fn SFileFlushArchive(archive: Handle) -> bool;
}
pub struct Archive(Handle, Option<std::sync::Arc<super::came::Container>>);
impl Archive {
    #[cfg(test)]
    pub(crate) fn create_fixture(path: &Path, listed: bool) -> Self {
        Self::create(path, listed, 32).expect("fixture archive creation")
    }
    pub(crate) fn create_classic(path: &Path, capacity: usize) -> Result<Self, String> {
        let capacity = capacity.checked_add(16).and_then(usize::checked_next_power_of_two).filter(|n| *n <= 1_000_000).ok_or("地图资源数量超过限制")?;
        Self::create(path, true, capacity as u32)
    }
    fn create(path: &Path, listed: bool, capacity: u32) -> Result<Self, String> {
        #[repr(C)]
        struct CreateInfo { size: u32, version: u32, user: Handle, user_size: u32, stream: u32, list_flags: u32, attribute_flags: u32, signature_flags: u32, attributes: u32, sector: u32, raw_chunk: u32, capacity: u32 }
        extern "system" { fn SFileCreateArchive2(path: *const u16, info: *const CreateInfo, out: *mut Handle) -> bool; }
        let wide: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut handle = std::ptr::null_mut();
        let info = CreateInfo { size: std::mem::size_of::<CreateInfo>() as u32, version: 0, user: std::ptr::null_mut(), user_size: 0, stream: 0, list_flags: if listed { 0xffffffff } else { 0 }, attribute_flags: 0, signature_flags: 0, attributes: 0, sector: 4096, raw_chunk: 0, capacity };
        if !unsafe { SFileCreateArchive2(wide.as_ptr(), &info, &mut handle) } { return Err(format!("无法创建地图归档：{}", std::io::Error::last_os_error())); }
        Ok(Self(handle, None))
    }
    pub(crate) fn hashes(&self) -> Result<Vec<[u32; 4]>, String> {
        let mut needed = 0;
        unsafe { SFileGetFileInfo(self.0, 19, std::ptr::null_mut(), 0, &mut needed); }
        if needed == 0 || needed > 16_000_000 || needed % 16 != 0 { return Err("地图归档哈希表无效".into()); }
        let mut entries = vec![[0u32; 4]; needed as usize / 16];
        if unsafe { SFileGetFileInfo(self.0, 19, entries.as_mut_ptr().cast(), needed, std::ptr::null_mut()) } { Ok(entries) } else { Err("无法读取地图归档哈希表".into()) }
    }
    pub(crate) fn resource_hashes(&self) -> Result<Vec<[u32; 4]>, String> {
        let mut entries = self.hashes()?;
        if let Some(container) = &self.1 { entries.extend(container.resource_hashes()); }
        Ok(entries)
    }
    pub fn open(path: &Path) -> Result<Self, String> {
        Self::open_flags(path, 0x100)
    }
    pub fn writable_copy(path: &Path) -> Result<Self, String> { Self::open_flags(path, 0) }
    fn open_flags(path: &Path, flags: u32) -> Result<Self, String> {
        let came_header = super::came::header(path)?;
        if flags == 0 && came_header.is_some() { return Err("CAME 保护地图仅支持只读预览和资源导出，不能修改地图".into()); }
        let wide: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut handle = std::ptr::null_mut();
        if !unsafe { SFileOpenArchive(wide.as_ptr(), 0, flags, &mut handle) } {
            return Err(format!("无法打开归档：{} ({})", path.display(), std::io::Error::last_os_error()));
        }
        let mut archive = Self(handle, None);
        if let Some(header) = came_header {
            archive.1 = super::came::cached(path)?;
            if archive.1.is_none() {
                let mut module = None;
                archive.enumerate(|_, raw, size, _| {
                    if super::came::module_size(size) { if let Ok(bytes) = archive.read_raw(&raw) {
                        if super::came::module_supported(&bytes) { module = Some(bytes); return false; }
                    } }
                    true
                });
                archive.1 = Some(super::came::open(path, &header, &module.ok_or("不兼容的 CAME 保护模块版本，尚未验证此密钥配置")?)?);
            }
        }
        Ok(archive)
    }
    pub(crate) fn external_count(&self) -> Option<usize> { self.1.as_ref().map(|container| container.records.len()) }
    pub fn write(&self, name: &str, bytes: &[u8], replace: bool) -> Result<(), String> {
        if self.1.is_some() { return Err("CAME 地图仅支持只读访问".into()); }
        let name = CString::new(name.replace('/', "\\")).map_err(|e| e.to_string())?;
        let mut file = std::ptr::null_mut();
        if bytes.len() > u32::MAX as usize { return Err("单个 MPQ 资源超过 4 GiB 格式上限".into()); }
        let flags = 0x200 | if replace { 0x80000000 } else { 0 };
        if !unsafe { SFileCreateFile(self.0, name.as_ptr(), 0, bytes.len() as u32, 0, flags, &mut file) } { return Err(format!("无法创建地图资源：{}", std::io::Error::last_os_error())); }
        let written = unsafe { SFileWriteFile(file, bytes.as_ptr(), bytes.len() as u32, 2) };
        let finished = unsafe { SFileFinishFile(file) };
        if written && finished { Ok(()) } else { Err(format!("地图资源写入失败：{}", std::io::Error::last_os_error())) }
    }
    pub fn remove(&self, name: &[u8]) -> Result<(), String> {
        if self.1.is_some() { return Err("CAME 地图仅支持只读访问".into()); }
        let name = CString::new(name).map_err(|e| e.to_string())?;
        if unsafe { SFileRemoveFile(self.0, name.as_ptr(), 0) } { Ok(()) } else { Err(format!("地图资源删除失败：{}", std::io::Error::last_os_error())) }
    }
    pub fn flush(&self) -> Result<(), String> { if unsafe { SFileFlushArchive(self.0) } { Ok(()) } else { Err(format!("地图保存失败：{}", std::io::Error::last_os_error())) } }
    pub fn has(&self, name: &str) -> bool {
        if self.1.as_ref().is_some_and(|container| container.find(name.as_bytes()).is_some()) { return true; }
        CString::new(name).map(|n| unsafe { SFileHasFile(self.0, n.as_ptr()) }).unwrap_or(false)
    }
    pub fn read(&self, name: &str) -> Result<Vec<u8>, String> {
        self.read_raw(name.as_bytes())
    }
    pub fn read_raw(&self, name: &[u8]) -> Result<Vec<u8>, String> {
        self.read_limit(name, None)
    }
    pub fn prefix(&self, name: &[u8]) -> Result<Vec<u8>, String> { self.read_limit(name, Some(64)) }
    pub fn prefix_limit(&self, name: &[u8], size: u32) -> Result<Vec<u8>, String> { self.read_limit(name, Some(size)) }
    pub fn block(&self, name: &str) -> Option<u32> {
        self.block_raw(name.replace('/', "\\").as_bytes())
    }
    pub(crate) fn block_raw(&self, name: &[u8]) -> Option<u32> {
        if let Some(index) = self.1.as_ref().and_then(|container| container.find(name)) { return Some(super::came::BLOCK_BASE + index as u32); }
        let name = CString::new(name).ok()?;
        let mut file = std::ptr::null_mut();
        if !unsafe { SFileOpenFileEx(self.0, name.as_ptr(), 0, &mut file) } { return None; }
        // SFileInfoFileIndex is enum value 48 in the bundled StormLib 9.40 header.
        let mut block = 0u32;
        let ok = unsafe { SFileGetFileInfo(file, 48, (&mut block as *mut u32).cast(), 4, std::ptr::null_mut()) };
        unsafe { SFileCloseFile(file); }
        ok.then_some(block)
    }
    fn read_limit(&self, name: &[u8], limit: Option<u32>) -> Result<Vec<u8>, String> {
        if let Some(container) = &self.1 { if let Some(index) = container.find(name) {
            let record = &container.records[index];
            if limit.is_some_and(|limit| limit <= 64) { return Ok(record.prefix[..record.prefix.len().min(limit.unwrap() as usize)].to_vec()); }
            let mut bytes = container.read(index)?;
            if let Some(limit) = limit { bytes.truncate(limit as usize); }
            return Ok(bytes);
        } }
        let name = CString::new(name).map_err(|e| e.to_string())?;
        let mut file = std::ptr::null_mut();
        if !unsafe { SFileOpenFileEx(self.0, name.as_ptr(), 0, &mut file) } { return Err("资源不存在或已损坏".into()); }
        let result = (|| {
            let mut high = 0;
            let size = unsafe { SFileGetFileSize(file, &mut high) };
            if high != 0 { return Err("单个 MPQ 资源超过 4 GiB 格式上限".into()); }
            let size = limit.map_or(size, |limit| size.min(limit));
            let mut bytes = vec![0; size as usize];
            let mut actual = 0;
            if !unsafe { SFileReadFile(file, bytes.as_mut_ptr(), size, &mut actual, std::ptr::null_mut()) } || actual != size {
                return Err(format!("归档资源读取失败：{}", std::io::Error::last_os_error()));
            }
            Ok(bytes)
        })();
        unsafe { SFileCloseFile(file); }
        result
    }
    pub fn enumerate(&self, mut visit: impl FnMut(String, Vec<u8>, u32, u32) -> bool) {
        let mut found: Found = unsafe { std::mem::zeroed() };
        let search = unsafe { SFileFindFirstFile(self.0, b"*\0".as_ptr().cast(), &mut found, std::ptr::null()) };
        if search.is_null() { return; }
        loop {
            let end = found.name.iter().position(|b| *b == 0).unwrap_or(260);
            let name = String::from_utf8_lossy(&found.name[..end]).into_owned();
            if !visit(name, found.name[..end].to_vec(), found.size, found.block) { unsafe { SFileFindClose(search); } return; }
            if !unsafe { SFileFindNextFile(search, &mut found) } { break; }
        }
        unsafe { SFileFindClose(search); }
        if let Some(container) = &self.1 { for (index, record) in container.records.iter().enumerate() {
            let block = super::came::BLOCK_BASE + index as u32;
            if !visit(format!("File{block:010}.xxx"), container.token(index), record.size, block) { break; }
        } }
    }
}
impl Drop for Archive { fn drop(&mut self) { unsafe { SFileCloseArchive(self.0); } } }
