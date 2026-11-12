#[cfg(windows)]
pub fn protect(bytes: &[u8], decrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN}};
    let input = CRYPT_INTEGER_BLOB { cbData: bytes.len() as u32, pbData: bytes.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB::default();
    // DPAPI binds the encrypted configuration to the current Windows user.
    let result = unsafe {
        if decrypt {
            CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        }
    };
    if result == 0 { return Err("Windows 无法加密或解密 AI 配置".into()); }
    let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData as *mut std::ffi::c_void); }
    Ok(bytes)
}

#[cfg(not(windows))]
pub fn protect(_: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Err("当前仅 Windows 桌面版支持密钥持久保存".into())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn dpapi_roundtrip_does_not_store_plaintext() {
        let text = b"test-api-key-private";
        let protected = super::protect(text, false).unwrap();
        assert!(!protected.windows(text.len()).any(|part| part == text));
        assert_eq!(super::protect(&protected, true).unwrap(), text);
    }
}
