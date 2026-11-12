#[cfg(target_os = "windows")]
mod windows {
    use std::{ffi::c_void, ptr};

    #[link(name = "kernel32")]
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    }

    #[link(name = "user32")]
    extern "system" {
        fn LoadImageW(
            instance: *mut c_void,
            name: *const u16,
            kind: u32,
            width: i32,
            height: i32,
            flags: u32,
        ) -> *mut c_void;
        fn SendMessageW(window: *mut c_void, message: u32, wparam: usize, lparam: isize) -> isize;
    }

    pub fn apply(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
        let hwnd = window.hwnd()?.0;
        // Tao's default window icon covers ICON_SMALL; Windows taskbar uses ICON_BIG.
        unsafe {
            let module = GetModuleHandleW(ptr::null());
            if module.is_null() {
                return Err(std::io::Error::last_os_error().into());
            }
            for (kind, size) in [(0, 16), (1, 32)] {
                // 32512 is Tauri's bundled app icon resource; LR_SHARED keeps it process-owned.
                let icon = LoadImageW(module, 32512usize as *const u16, 1, size, size, 0x8000);
                if icon.is_null() {
                    return Err(std::io::Error::last_os_error().into());
                }
                SendMessageW(hwnd, 0x80, kind, icon as isize);
            }
        }
        Ok(())
    }
}

pub fn apply(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    windows::apply(window)?;
    #[cfg(not(target_os = "windows"))]
    let _ = window;
    Ok(())
}
