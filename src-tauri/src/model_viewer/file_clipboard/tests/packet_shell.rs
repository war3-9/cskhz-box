use super::{Fixture, item};
use super::super::{prepare, windows};
use std::{fs, path::PathBuf, ptr};
use windows_sys::Win32::{Foundation::{GlobalFree, HGLOBAL}, System::Memory::*, UI::Shell::*};

struct Memory(HGLOBAL);
impl Drop for Memory { fn drop(&mut self) { unsafe { GlobalFree(self.0); } } }
fn wide(text: &str) -> Vec<u16> { text.encode_utf16().chain([0]).collect() }

// This verifies the actual Windows DROPFILES parser and Shell file copier.
// It intentionally never opens or writes any clipboard and is not an
// Explorer Ctrl+V / SetClipboardData integration test.
#[test]
fn drop_packet_parses_with_windows_and_shell_copies_intact_without_clipboard() {
    let fixture = Fixture::new();
    let source = fixture.source("source", Some(b"original-model-texture"));
    let original_model = fs::read(fixture.0.join("source/a.mdl")).unwrap();
    let (copied, paths) = prepare(vec![source], vec![item("source", "Models/中文模型.mdl")], &fixture.0.join("clipboard")).unwrap();
    let payload = windows::drop_payload(&paths).unwrap();
    let received = unsafe {
        let memory = Memory(GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, payload.len()));
        assert!(!memory.0.is_null());
        let bytes = GlobalLock(memory.0); assert!(!bytes.is_null());
        ptr::copy_nonoverlapping(payload.as_ptr(), bytes.cast::<u8>(), payload.len());
        GlobalUnlock(memory.0);
        let count = DragQueryFileW(memory.0, u32::MAX, ptr::null_mut(), 0);
        assert_eq!(count, paths.len() as u32);
        let mut received = Vec::new();
        for index in 0..count {
            let length = DragQueryFileW(memory.0, index, ptr::null_mut(), 0);
            let mut text = vec![0u16; length as usize + 1];
            assert_eq!(DragQueryFileW(memory.0, index, text.as_mut_ptr(), text.len() as u32), length);
            received.push(PathBuf::from(String::from_utf16(&text[..length as usize]).unwrap()));
        }
        received
    };
    assert_eq!(received, paths.iter().map(|path| PathBuf::from(windows::shell_path(path).unwrap())).collect::<Vec<_>>());
    let destination = fixture.0.join("pasted"); fs::create_dir(&destination).unwrap();
    let from = received.iter().flat_map(|path| wide(&path.to_string_lossy())).chain([0]).collect::<Vec<_>>();
    let to = wide(&windows::shell_path(&destination).unwrap()).into_iter().chain([0]).collect::<Vec<_>>();
    let mut operation: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() };
    operation.wFunc = FO_COPY; operation.pFrom = from.as_ptr(); operation.pTo = to.as_ptr();
    operation.fFlags = (FOF_SILENT | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_NOCONFIRMMKDIR) as u16;
    assert_eq!(unsafe { SHFileOperationW(&mut operation) }, 0);
    let aborted = operation.fAnyOperationsAborted; assert_eq!(aborted, 0);
    let stage = PathBuf::from(copied.directory);
    let model = "Models/中文模型.mdl"; let texture = "Models/中文模型1.blp";
    let exported_model = fs::read(stage.join(model)).unwrap();
    let pasted_model = fs::read(destination.join(model)).unwrap();
    assert_eq!(exported_model, pasted_model);
    assert_eq!(fs::read(stage.join(texture)).unwrap(), fs::read(destination.join(texture)).unwrap());
    assert_eq!(fs::read(destination.join(texture)).unwrap(), b"original-model-texture");
    assert!(String::from_utf8(pasted_model).unwrap().contains("Image \"Models\\中文模型1.blp\""));
    assert_eq!(fs::read(fixture.0.join("source/a.mdl")).unwrap(), original_model);
    assert_eq!(fs::read(fixture.0.join("source/skin.blp")).unwrap(), b"original-model-texture");
}
