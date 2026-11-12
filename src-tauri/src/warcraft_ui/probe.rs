use serde::Serialize;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeSnapshot {
    pub game_running: bool,
    pub editor_running: bool,
    pub game_path: Option<String>,
    pub editor_path: Option<String>,
    pub note: String,
}

#[cfg(windows)]
pub fn inspect() -> Result<BridgeSnapshot, String> {
    use std::mem::size_of;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    // Only process metadata is queried. No memory access, injection or map writes.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(std::io::Error::last_os_error().to_string());
        }
        let mut result = BridgeSnapshot::default();
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut found = Process32FirstW(snapshot, &mut entry);
        while found != 0 {
            let end = entry.szExeFile.iter().position(|v| *v == 0).unwrap_or(260);
            let name = String::from_utf16_lossy(&entry.szExeFile[..end]).to_lowercase();
            let game = matches!(name.as_str(), "war3.exe" | "warcraft iii.exe");
            let editor = matches!(name.as_str(), "worldeditkkwe.exe" | "kkwe.exe");
            if game || editor {
                let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID);
                let mut path = None;
                if !process.is_null() {
                    let mut buffer = [0u16; 32768];
                    let mut length = buffer.len() as u32;
                    if QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) != 0 {
                        path = Some(String::from_utf16_lossy(&buffer[..length as usize]));
                    }
                    CloseHandle(process);
                }
                if game {
                    result.game_running = true;
                    result.game_path = path;
                } else {
                    result.editor_running = true;
                    result.editor_path = path;
                }
            }
            found = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
        result.note = "UI bridge not connected; process presence only".into();
        Ok(result)
    }
}

#[cfg(not(windows))]
pub fn inspect() -> Result<BridgeSnapshot, String> {
    Err("The KKWE process probe requires Windows".into())
}
