use std::{collections::BTreeMap, fs, path::{Path, PathBuf}};
use serde::Deserialize;
use super::index::{model_path, safe_relative};
#[derive(Deserialize)]
pub struct ImportInput { pub path: String, #[serde(default)] pub textures: Vec<String> }
pub fn resource_path(name: &str) -> bool { model_path(name) || ["blp", "tga", "dds", "png", "jpg", "jpeg"].contains(&Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str()) }
pub fn input_read(path: &str) -> Result<Vec<u8>, String> {
    let file = Path::new(path);
    if !file.is_absolute() || !resource_path(path) { return Err("请选择模型或贴图文件的绝对路径".into()); }
    let bytes = fs::read(file).map_err(|e| e.to_string())?;
    super::codec::convert(&bytes).map(|value| value.into_owned())
}
fn add(files: &mut BTreeMap<String, Vec<u8>>, name: String, bytes: Vec<u8>) -> Result<(), String> {
    safe_relative(&name)?;
    if let Some((_, old)) = files.iter().find(|(key, _)| key.eq_ignore_ascii_case(&name)) {
        if old != &bytes { return Err(format!("导入资源同名且内容不同：{name}")); }
    } else { files.insert(name, bytes); }
    Ok(())
}
pub fn prepare(inputs: &[ImportInput], archive: bool) -> Result<BTreeMap<String, Vec<u8>>, String> {
    if inputs.is_empty() { return Err("请选择导入文件".into()); }
    let mut files = BTreeMap::new();
    for input in inputs {
        let file = Path::new(&input.path);
        let name = file.file_name().and_then(|s| s.to_str()).ok_or("文件名无效")?;
        add(&mut files, if archive { format!("war3mapImported/{name}") } else { name.into() }, input_read(&input.path)?)?;
        for texture in &input.textures {
            let relative = safe_relative(texture)?;
            if !resource_path(texture) { return Err(format!("不支持的贴图路径：{texture}")); }
            let mut candidate: Option<PathBuf> = None;
            // Search at the model's directory and each resource root above it.
            for parent in file.parent().ok_or("文件没有父目录")?.ancestors() {
                let path = parent.join(&relative);
                if path.is_file() { candidate = Some(path); break; }
            }
            let path = candidate.or_else(|| inputs.iter().find(|item| Path::new(&item.path).file_name() == relative.file_name()).map(|item| PathBuf::from(&item.path))).ok_or_else(|| format!("缺少依赖贴图：{texture}；请一并选择贴图或保持原目录结构"))?;
            add(&mut files, texture.replace('\\', "/"), input_read(&path.to_string_lossy())?)?;
        }
    }
    Ok(files)
}
