use std::{collections::BTreeMap, fs, path::{Path, PathBuf}};
use serde::{Deserialize, Serialize};
use super::storage;

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Preferences {
    pub directory: Option<String>,
    #[serde(default)] pub cleanup: Vec<Cleanup>,
    #[serde(default)] pub revision: u64,
    #[serde(default)] pub migrations: Vec<Remap>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Remap { pub revision: u64, pub ids: BTreeMap<String, String> }
#[derive(Clone, Serialize, Deserialize)]
pub struct Cleanup { pub path: String, pub sha256: String }
pub struct Context { pub preferences: PathBuf, pub default_directory: PathBuf }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryInfo {
    pub directory: String, pub default_directory: String,
    pub warning: Option<String>, pub remapped: BTreeMap<String, String>,
    pub revision: u64, pub migrations: Vec<Remap>,
}
impl Context {
    pub fn load(&self) -> Result<Preferences, String> {
        if !self.preferences.exists() { return Ok(Preferences::default()); }
        serde_json::from_str(&fs::read_to_string(&self.preferences).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
    }
    pub fn store(&self, preferences: &Preferences) -> Result<(), String> {
        storage::atomic(&self.preferences, &serde_json::to_string(preferences).map_err(|e| e.to_string())?)
    }
    pub fn root(&self, preferences: &Preferences) -> Result<PathBuf, String> {
        let root = preferences.directory.as_ref().map(PathBuf::from).unwrap_or_else(|| self.default_directory.clone());
        if !root.is_absolute() { return Err("保存目录必须使用绝对路径".into()); }
        Ok(root)
    }
    pub fn info(&self, preferences: &Preferences) -> Result<DirectoryInfo, String> {
        Ok(DirectoryInfo { directory: storage::display(&self.root(preferences)?), default_directory: storage::display(&self.default_directory),
            warning: (!preferences.cleanup.is_empty()).then(|| format!("新目录已启用，{} 份旧稿尚未清理。请点击重试；旧稿发生变化时会保留原文件。", preferences.cleanup.len())),
            remapped: BTreeMap::new(), revision: preferences.revision, migrations: preferences.migrations.clone() })
    }
}
pub fn default_directory(executable: &Path) -> Result<PathBuf, String> {
    Ok(executable.parent().ok_or("无法确定软件所在目录")?.join("UI设计保存稿-开源版"))
}
pub fn context(app: &tauri::AppHandle) -> Result<Context, String> {
    Ok(Context { preferences: crate::app_data::directory(app)?.join("warcraft-ui/design-directory.json"),
        default_directory: default_directory(&std::env::current_exe().map_err(|e| e.to_string())?)? })
}
