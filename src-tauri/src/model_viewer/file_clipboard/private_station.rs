use super::*;
use sha2::{Digest, Sha256};
use std::{ffi::c_void, ptr};
use windows_sys::Win32::{System::{DataExchange::*, Memory::*}, UI::{Shell::*, WindowsAndMessaging::*}};

#[link(name = "user32")]
extern "system" {
    fn GetProcessWindowStation() -> *mut c_void;
    fn GetUserObjectInformationW(object: *mut c_void, index: i32, buffer: *mut c_void, size: u32, needed: *mut u32) -> i32;
}
fn wide(text: &str) -> Vec<u16> { text.encode_utf16().chain([0]).collect() }
fn hash(bytes: &[u8]) -> String { Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect() }

#[test]
#[ignore = "Requires a dedicated noninteractive window station; never run on WinSta0"]
fn private_station_file_clipboard_shell_paste() {
    unsafe {
        let mut station = [0u16; 256]; let mut needed = 0;
        assert_ne!(GetUserObjectInformationW(GetProcessWindowStation(), 2, station.as_mut_ptr().cast(), (station.len() * 2) as u32, &mut needed), 0);
        let station = String::from_utf16_lossy(&station[..station.iter().position(|unit| *unit == 0).unwrap()]);
        assert!(station.starts_with("BoxClipboardTest-"), "Refusing to alter non-isolated clipboard: {station}");
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results/file-clipboard-native").join(uuid::Uuid::new_v4().to_string());
        let source_root = root.join("source"); fs::create_dir_all(&source_root).unwrap();
        fs::write(source_root.join("a.mdl"), b"Textures 1 { Bitmap { Image \"skin.blp\", } }").unwrap();
        fs::write(source_root.join("skin.blp"), b"clipboard-native-texture").unwrap();
        let source = index::scan(source_root.to_string_lossy().into(), "fixture".into(), &AtomicBool::new(false)).unwrap();
        let item = Item { source_id: "fixture".into(), path: "a.mdl".into(), output: "Models/中文模型.mdl".into(), dependency: false, rename_textures: false };
        let (copied, paths) = prepare(vec![source], vec![item], &root.join("clipboard")).unwrap();
        let class = wide("STATIC"); let title = wide("BoxClipboardTest");
        let hwnd = CreateWindowExW(0, class.as_ptr(), title.as_ptr(), 0, 0, 0, 1, 1, ptr::null_mut(), ptr::null_mut(), ptr::null_mut(), ptr::null());
        assert!(!hwnd.is_null());
        windows::write(&paths, hwnd as usize).unwrap();
        assert_ne!(OpenClipboard(hwnd), 0);
        let handle = GetClipboardData(15); assert!(!handle.is_null());
        let count = DragQueryFileW(handle, u32::MAX, ptr::null_mut(), 0);
        let mut received = Vec::new();
        for index in 0..count {
            let length = DragQueryFileW(handle, index, ptr::null_mut(), 0);
            let mut text = vec![0u16; length as usize + 1];
            assert_eq!(DragQueryFileW(handle, index, text.as_mut_ptr(), text.len() as u32), length);
            received.push(PathBuf::from(String::from_utf16(&text[..length as usize]).unwrap()));
        }
        let effect = GetClipboardData(RegisterClipboardFormatW(wide("Preferred DropEffect").as_ptr()));
        assert!(!effect.is_null()); let effect_bytes = GlobalLock(effect); assert!(!effect_bytes.is_null());
        let copy_effect = *effect_bytes.cast::<u32>(); GlobalUnlock(effect);
        CloseClipboard(); assert_eq!(received, paths.iter().map(|path| PathBuf::from(windows::shell_path(path).unwrap())).collect::<Vec<_>>()); assert_eq!(copy_effect, 1);
        // Feed the actual CF_HDROP paths to the Windows shell's copy operation,
        // rather than using Rust's file copier or interpreting a text clipboard.
        let destination = root.join("pasted"); fs::create_dir(&destination).unwrap();
        let from = received.iter().flat_map(|path| wide(&path.to_string_lossy())).chain([0]).collect::<Vec<_>>();
        let to = wide(&windows::shell_path(&destination).unwrap()).into_iter().chain([0]).collect::<Vec<_>>();
        let mut operation: SHFILEOPSTRUCTW = std::mem::zeroed();
        operation.hwnd = hwnd; operation.wFunc = FO_COPY; operation.pFrom = from.as_ptr(); operation.pTo = to.as_ptr();
        operation.fFlags = (FOF_SILENT | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_NOCONFIRMMKDIR) as u16;
        assert_eq!(SHFileOperationW(&mut operation), 0); assert_eq!(operation.fAnyOperationsAborted, 0);
        let stage = PathBuf::from(&copied.directory);
        let model_path = "Models/中文模型.mdl"; let texture_path = "Models/中文模型1.blp";
        let staged_model = fs::read(stage.join(model_path)).unwrap(); let pasted_model = fs::read(destination.join(model_path)).unwrap();
        let staged_texture = fs::read(stage.join(texture_path)).unwrap(); let pasted_texture = fs::read(destination.join(texture_path)).unwrap();
        assert_eq!(staged_model, pasted_model); assert_eq!(staged_texture, pasted_texture);
        assert!(String::from_utf8(pasted_model.clone()).unwrap().contains("Image \"Models\\中文模型1.blp\""));
        assert_eq!(fs::read(source_root.join("skin.blp")).unwrap(), pasted_texture);
        let project = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
        let evidence = project.join(".private/model-file-clipboard-20261025"); fs::create_dir_all(&evidence).unwrap();
        fs::write(evidence.join("native.json"), serde_json::to_vec_pretty(&serde_json::json!({
            "passed": true, "station": station, "actualCFHDROP": true, "copyEffect": copy_effect,
            "shellFileCopy": true, "models": copied.models, "textures": copied.textures,
            "modelSHA256": hash(&pasted_model), "textureSHA256": hash(&pasted_texture),
            "nestedUnicodePaths": true, "referencesRewritten": true, "sourcePreserved": true,
            "explorerKeyboardPaste": false
        })).unwrap()).unwrap();
        if OpenClipboard(hwnd) != 0 { EmptyClipboard(); CloseClipboard(); }
        DestroyWindow(hwnd);
        fs::remove_dir_all(root).unwrap();
    }
}
