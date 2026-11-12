use std::{fs, path::Path};
use sha2::{Digest, Sha256};
use tauri::{http::Response, ipc::{InvokeBody, Request}};

const LIMIT: usize = 20 * 1024 * 1024;
fn valid_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn mime(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { Ok("image/png") }
    else if bytes.starts_with(&[255, 216, 255]) { Ok("image/jpeg") }
    else { Err("仅支持 PNG 或 JPG 素材".into()) }
}
fn store_at(root: &Path, hash: &str, bytes: &[u8]) -> Result<(), String> {
    if !valid_hash(hash) || bytes.len() > LIMIT || format!("{:x}", Sha256::digest(bytes)) != hash {
        return Err("素材大小或内容摘要无效".into());
    }
    mime(bytes)?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let path = root.join(hash);
    if path.exists() {
        if fs::read(&path).map_err(|e| e.to_string())? != bytes { return Err("本地素材校验失败，保留原文件".into()); }
        return Ok(());
    }
    let temporary = root.join(format!("{}.pending", uuid::Uuid::new_v4()));
    let result = (|| {
        fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
        fs::rename(&temporary, &path).map_err(|e| e.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

#[tauri::command]
pub async fn icon_image_store(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let hash = request.headers().get("x-box-image-hash").and_then(|v| v.to_str().ok()).ok_or("缺少素材摘要")?.to_owned();
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if bytes.len() <= LIMIT => bytes.clone(),
        _ => return Err("素材必须使用不超过 20 MB 的二进制传输".into()),
    };
    let directory = crate::app_data::directory(&app)?.join("icon-images");
    tauri::async_runtime::spawn_blocking(move || store_at(&directory, &hash, &bytes)).await.map_err(|e| e.to_string())?
}

pub fn response(app: &tauri::AppHandle, path: &str) -> Response<Vec<u8>> {
    let hash = path.strip_prefix('/').unwrap_or(path);
    let load = || -> Result<Vec<u8>, String> {
        if !valid_hash(hash) { return Err("无效素材引用".into()); }
        let path = crate::app_data::directory(app)?.join("icon-images").join(hash);
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > LIMIT as u64 { return Err("素材过大".into()); }
        fs::read(path).map_err(|e| e.to_string())
    };
    match load() {
        Ok(bytes) => Response::builder().header("Content-Type", mime(&bytes).unwrap_or("application/octet-stream"))
            .header("Access-Control-Allow-Origin", "*").header("Cache-Control", "public, max-age=31536000, immutable")
            .header("X-Content-Type-Options", "nosniff").body(bytes).unwrap(),
        Err(_) => Response::builder().status(404).header("Access-Control-Allow-Origin", "*").body(Vec::new()).unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn content_addressed_storage_is_exact_idempotent_and_rejects_bad_inputs() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results/icon-image-native").join(uuid::Uuid::new_v4().to_string());
        let bytes = b"\x89PNG\r\n\x1a\nfixture";
        let hash = format!("{:x}", Sha256::digest(bytes));
        store_at(&root, &hash, bytes).unwrap();
        store_at(&root, &hash, bytes).unwrap();
        assert_eq!(fs::read(root.join(&hash)).unwrap(), bytes);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        assert!(store_at(&root, "../../outside", bytes).is_err());
        assert!(store_at(&root, &"0".repeat(64), bytes).is_err());
        assert!(store_at(&root, &format!("{:x}", Sha256::digest(b"bad")), b"bad").is_err());
        fs::write(root.join(&hash), b"existing-damaged-file").unwrap();
        assert!(store_at(&root, &hash, bytes).is_err());
        assert_eq!(fs::read(root.join(&hash)).unwrap(), b"existing-damaged-file");
        fs::remove_dir_all(root).unwrap();
    }
}
