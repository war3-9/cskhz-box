use std::{collections::BTreeMap, fs, path::{Path, PathBuf}};
use super::{settings::{Cleanup, Context, DirectoryInfo, Preferences, Remap}, storage};

pub fn cleanup(context: &Context, preferences: &mut Preferences) -> Result<(), String> {
    let mut remaining = vec![];
    for entry in &preferences.cleanup {
        let path = Path::new(&entry.path);
        if !path.exists() { continue; }
        let valid = storage::read(path).is_ok_and(|text| storage::parse(&text).is_ok() && storage::fingerprint(text.as_bytes()) == entry.sha256);
        if !valid || fs::remove_file(path).is_err() { remaining.push(entry.clone()); }
    }
    preferences.cleanup = remaining;
    context.store(preferences)
}
pub fn migrate(context: &Context, requested: Option<String>) -> Result<DirectoryInfo, String> {
    let mut preferences = context.load()?;
    if !preferences.cleanup.is_empty() {
        cleanup(context, &mut preferences)?;
        if !preferences.cleanup.is_empty() { return Err("上次迁移的旧稿尚未清理，请先重试清理；原文件已保留".into()); }
    }
    let source = context.root(&preferences)?;
    let target = storage::directory(&requested.as_ref().map(PathBuf::from).unwrap_or_else(|| context.default_directory.clone()))?;
    if source.exists() && source.canonicalize().map_err(|e| e.to_string())? == target {
        preferences.directory = requested.map(|_| storage::display(&target));
        context.store(&preferences)?; return context.info(&preferences);
    }
    let mut created = vec![];
    let mut pending = vec![];
    let mut remapped = BTreeMap::new();
    let result = (|| {
        for file in storage::files(&source)? {
            let original = storage::read(&file)?;
            let (mut value, meta) = storage::parse(&original)?;
            let mut destination = storage::path(&target, &meta.id)?;
            let mut text = original.clone();
            if destination.exists() && storage::read(&destination)? != original {
                let id = uuid::Uuid::new_v4().to_string();
                value["design"]["id"] = id.clone().into();
                value["design"]["name"] = format!("{}（迁入副本）", meta.name.chars().take(90).collect::<String>()).into();
                text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
                destination = storage::path(&target, &id)?;
                remapped.insert(meta.id.clone(), id);
            }
            if !destination.exists() {
                // Reserve without overwriting a file created by another process.
                use std::io::Write;
                let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&destination).map_err(|e| e.to_string())?;
                created.push(destination.clone());
                output.write_all(text.as_bytes()).map_err(|e| e.to_string())?; output.sync_all().map_err(|e| e.to_string())?;
            }
            if storage::read(&destination)? != text { return Err("迁移后的保存稿校验失败".into()); }
            pending.push(Cleanup { path: storage::display(&file), sha256: storage::fingerprint(original.as_bytes()) });
        }
        preferences.revision += 1;
        preferences.migrations.push(Remap { revision: preferences.revision, ids: remapped.clone() });
        preferences.directory = requested.map(|_| storage::display(&target));
        preferences.cleanup = pending;
        context.store(&preferences)
    })();
    if let Err(error) = result {
        for file in created { let _ = fs::remove_file(file); }
        return Err(format!("保存目录未切换，旧稿已保留：{error}"));
    }
    // Preferences already point to verified copies. Cleanup failures are retryable.
    if let Err(error) = cleanup(context, &mut preferences) {
        let mut info = context.info(&context.load()?)?;
        info.remapped = remapped;
        info.warning = Some(format!("新目录已启用，但旧目录清理未完成：{error}。请重试清理。"));
        return Ok(info);
    }
    let mut info = context.info(&preferences)?; info.remapped = remapped; Ok(info)
}
