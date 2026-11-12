mod parse;
#[cfg(test)] mod fixtures;
use crate::model_viewer::storm::Archive;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, io::Read, path::{Path, PathBuf}, sync::{Mutex, OnceLock}, time::SystemTime};
type Stamp = (u64, SystemTime, String);
static SOURCES: OnceLock<Mutex<HashMap<PathBuf, Stamp>>> = OnceLock::new();
fn stamp(path: &Path) -> Result<(u64,SystemTime),String> { let m=fs::metadata(path).map_err(|e|e.to_string())?; Ok((m.len(),m.modified().map_err(|e|e.to_string())?)) }
fn checked(path: &str) -> Result<PathBuf, String> {
    let path=Path::new(path);
    if !path.is_absolute() || !["w3x","w3m"].contains(&path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str()) { return Err("请选择绝对路径的 w3x / w3m 地图".into()); }
    fs::canonicalize(path).map_err(|e| e.to_string())
}
fn fingerprint(path: &Path) -> Result<String, String> {
    let mut file=fs::File::open(path).map_err(|e|e.to_string())?; let mut hash=Sha256::new(); let mut b=[0u8;65536];
    loop { let n=file.read(&mut b).map_err(|e|e.to_string())?; if n==0 { break; } hash.update(&b[..n]); }
    Ok(format!("{:x}",hash.finalize()))
}
fn limited(archive: &Archive, name: &str) -> Result<Vec<u8>,String> {
    let bytes=archive.prefix_limit(name.as_bytes(), 32*1024*1024+1)?;
    if bytes.len()>32*1024*1024 { return Err(format!("地图资源过大：{name}")); } Ok(bytes)
}
pub(crate) fn read(path: &str) -> Result<Value,String> {
    let path=checked(path)?; let initial_stamp=stamp(&path)?; let before=fingerprint(&path)?; let archive=Archive::open(&path)?;
    let mut objects=Map::new(); let mut raw=Map::new(); let mut warnings=Vec::new();
    for (kind,ext) in [("item","w3t"),("unit","w3u"),("ability","w3a"),("upgrade","w3q"),("doodad","w3d"),("buff","w3h")] {
        let name=format!("war3map.{ext}"); if !archive.has(&name) { continue; }
        let bytes=limited(&archive,&name)?; objects.extend(parse::objects(&bytes,kind).map_err(|e|format!("{name}：{e}"))?); raw.insert(kind.into(),json!(bytes));
    }
    let strings=if archive.has("war3map.wts") { let b=limited(&archive,"war3map.wts")?; raw.insert("wts".into(),json!(b)); parse::strings(&b)? } else { Map::new() };
    let imports=if archive.has("war3map.imp") { let b=limited(&archive,"war3map.imp")?; raw.insert("imports".into(),json!(b)); match parse::imports(&b) { Ok(v)=>v,Err(e)=>{ warnings.push(e);vec![] } } } else { vec![] };
    if stamp(&path)?!=initial_stamp || fingerprint(&path)?!=before { return Err("读取期间地图发生变化，请重试".into()); }
    let mut sources=SOURCES.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
    if sources.len()>100 { sources.clear(); } sources.insert(path.clone(),(initial_stamp.0,initial_stamp.1,before.clone()));
    Ok(json!({"path":path.to_string_lossy().trim_start_matches("\\\\?\\"),"fingerprint":before,"objects":objects,"raw":raw,"strings":strings,"imports":imports,"warnings":warnings}))
}
#[tauri::command]
pub async fn object_map_read(path: String) -> Result<Value,String> { tauri::async_runtime::spawn_blocking(move || read(&path)).await.map_err(|e|e.to_string())? }
#[tauri::command]
pub async fn object_map_resource(path: String, resource: String, expected: String) -> Result<tauri::ipc::Response,String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path=checked(&path)?;
        if resource.contains('\0') || resource.split(['\\','/']).any(|s| s=="..") { return Err("无效地图资源路径".into()); }
        let initial_stamp=stamp(&path)?;
        let sources=SOURCES.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
        let verified=sources.get(&path).is_some_and(|s| s.0==initial_stamp.0 && s.1==initial_stamp.1 && s.2==expected); drop(sources);
        if !verified {
            if fingerprint(&path)?!=expected || stamp(&path)?!=initial_stamp { return Err("地图已变化，请重新读取并核对".into()); }
            let mut sources=SOURCES.get_or_init(Default::default).lock().map_err(|e|e.to_string())?;
            if sources.len()>100 { sources.clear(); } sources.insert(path.clone(),(initial_stamp.0,initial_stamp.1,expected.clone()));
        }
        let archive=Archive::open(&path)?; let bytes=limited(&archive,&resource.replace('/',"\\"))?;
        if stamp(&path)?!=initial_stamp { return Err("读取期间地图发生变化".into()); } Ok(tauri::ipc::Response::new(bytes))
    }).await.map_err(|e|e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn object_map_read_archive_is_readonly() {
        let root=Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results").join(format!("object-map-{}",uuid::Uuid::new_v4())); fs::create_dir_all(&root).unwrap(); let path=root.join("地图.w3x");
        { let a=Archive::create_fixture(&path,true); for ext in ["w3t","w3u","w3a","w3q","w3d","w3h"] { let mut b=Vec::new(); for n in [2i32,0,0] { b.extend(n.to_le_bytes()); } a.write(&format!("war3map.{ext}"),&b,false).unwrap(); } a.write("war3map.wts",b"STRING 1\n{\nName\n}\n",false).unwrap(); a.flush().unwrap(); }
        let before=fs::read(&path).unwrap(); let result=read(path.to_str().unwrap()).unwrap(); assert_eq!(result["raw"].as_object().unwrap().len(),7); assert_eq!(result["strings"]["1"],"Name"); assert_eq!(before,fs::read(&path).unwrap()); fs::remove_dir_all(root).unwrap();
    }
}
