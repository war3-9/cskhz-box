use std::{path::{Path, PathBuf}, ptr, thread, time::Duration};
use windows_sys::Win32::{Foundation::{GlobalFree, HGLOBAL, HWND}, System::{DataExchange::*, Memory::*}};

pub(super) fn shell_path(path: &Path) -> Result<String, String> {
    if !path.is_absolute() { return Err("剪贴板文件必须使用绝对路径".into()); }
    let text = path.to_str().ok_or("剪贴板文件路径编码无效")?.replace('/', "\\");
    if text.contains('\0') { return Err("剪贴板文件路径无效".into()); }
    // Shell DROPFILES / Explorer do not accept Rust's mixed separators or
    // canonicalize's extended-length prefix, even though filesystem APIs do.
    let text = if let Some(unc) = text.strip_prefix("\\\\?\\UNC\\") { format!("\\\\{unc}") }
        else { text.strip_prefix("\\\\?\\").unwrap_or(&text).to_owned() };
    if text.encode_utf16().count() >= 260 { return Err("文件复制路径过长，请缩短模型名称或目录".into()); }
    Ok(text)
}

pub(super) fn drop_payload(paths: &[PathBuf]) -> Result<Vec<u8>, String> {
    if paths.is_empty() { return Err("没有可复制的文件".into()); }
    // DROPFILES: pFiles, POINT.x, POINT.y, fNC, fWide. Paths follow as a
    // double-null-terminated UTF-16 list; top-level directories preserve layout.
    let mut bytes = [20u32, 0, 0, 0, 1].into_iter().flat_map(u32::to_le_bytes).collect::<Vec<_>>();
    for path in paths {
        let text = shell_path(path)?;
        for unit in text.encode_utf16().chain([0]) { bytes.extend_from_slice(&unit.to_le_bytes()); }
    }
    bytes.extend_from_slice(&[0, 0]);
    Ok(bytes)
}

struct Block(HGLOBAL);
impl Drop for Block { fn drop(&mut self) { if !self.0.is_null() { unsafe { GlobalFree(self.0); } } } }
fn block(bytes: &[u8]) -> Result<Block, String> {
    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes.len());
        if memory.is_null() { return Err("剪贴板内存分配失败".into()); }
        let block = Block(memory);
        let data = GlobalLock(memory);
        if data.is_null() { return Err("剪贴板内存锁定失败".into()); }
        ptr::copy_nonoverlapping(bytes.as_ptr(), data.cast::<u8>(), bytes.len());
        GlobalUnlock(memory);
        Ok(block)
    }
}
struct Clipboard;
impl Drop for Clipboard { fn drop(&mut self) { unsafe { CloseClipboard(); } } }
fn open(owner: HWND) -> Result<Clipboard, String> {
    for _ in 0..8 {
        if unsafe { OpenClipboard(owner) } != 0 { return Ok(Clipboard); }
        thread::sleep(Duration::from_millis(20));
    }
    Err("剪贴板被其他程序占用，请重试".into())
}

pub(super) fn write(paths: &[PathBuf], owner: usize) -> Result<(), String> {
    if owner == 0 || paths.iter().any(|path| !Path::new(path).exists()) { return Err("剪贴板窗口或文件无效".into()); }
    let mut files = block(&drop_payload(paths)?)?;
    let mut effect = block(&1u32.to_le_bytes())?; // DROPEFFECT_COPY, never move source files.
    let name: Vec<u16> = "Preferred DropEffect".encode_utf16().chain([0]).collect();
    let format = unsafe { RegisterClipboardFormatW(name.as_ptr()) };
    if format == 0 { return Err("无法注册文件复制格式".into()); }
    let _guard = open(owner as HWND)?;
    unsafe {
        if EmptyClipboard() == 0 { return Err("无法清空剪贴板".into()); }
        if SetClipboardData(15, files.0).is_null() { return Err("写入文件剪贴板失败".into()); }
        files.0 = ptr::null_mut();
        if SetClipboardData(format, effect.0).is_null() { return Err("写入文件复制方式失败".into()); }
        effect.0 = ptr::null_mut();
    }
    Ok(())
}
