use std::{collections::{BTreeMap, HashSet}, fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}};
use super::index::{model_path, safe_relative, Source};
pub fn root(source: &Source) -> Result<PathBuf, String> {
    if source.kind != "folder" { return Err("此操作只支持本地文件夹".into()); }
    PathBuf::from(&source.path).canonicalize().map_err(|e| e.to_string())
}
pub fn resolve(root: &Path, name: &str) -> Result<PathBuf, String> {
    let path = root.join(safe_relative(name)?).canonicalize().map_err(|e| e.to_string())?;
    if !path.starts_with(root) || !path.is_file() { return Err("文件越过来源目录或不存在".into()); }
    Ok(path)
}
pub fn backup(root: &Path, paths: &[String]) -> Result<PathBuf, String> {
    let directory = root.join(".box-model-backups").join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    if !directory.canonicalize().map_err(|e| e.to_string())?.starts_with(root) { return Err("备份路径越过来源目录".into()); }
    for name in paths {
        let source = resolve(root, name)?;
        let target = directory.join(safe_relative(name)?);
        fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::copy(source, target).map_err(|e| e.to_string())?;
    }
    Ok(directory)
}
pub fn delete(source: &Source, paths: &[String], base: Option<&Path>) -> Result<String, String> {
    let root = root(source)?;
    let files = paths.iter().map(|name| resolve(&root, name)).collect::<Result<Vec<_>, _>>()?;
    let backup = super::delete_backup::create(&source.path, base)?;
    for (name, bytes) in super::delete_resources::collect(source, paths)? { super::delete_backup::write(&backup, &name, &bytes)?; }
    for (index, file) in files.iter().enumerate() {
        if let Err(error) = fs::remove_file(file) {
            for (name, file) in paths[..index].iter().zip(&files[..index]) { fs::copy(backup.join(safe_relative(name)?), file).map_err(|e| format!("回滚失败：{e}；备份：{}", backup.display()))?; }
            return Err(format!("删除已回滚：{error}"));
        }
    }
    Ok(backup.to_string_lossy().into())
}
pub fn rename(source: &Source, paths: &[String], prefix: &str, start: u64) -> Result<(BTreeMap<String, String>, String), String> {
    if prefix.trim().is_empty() || prefix.len() > 240 || prefix.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)) || prefix.ends_with(['.', ' ']) || start.checked_add(paths.len() as u64).is_none_or(|end| end > 999999999) { return Err("重命名前缀或序号无效".into()); }
    let root = root(source)?;
    let mut names = paths.to_vec(); names.sort_by_key(|s| s.to_lowercase());
    let originals: HashSet<_> = names.iter().map(|s| s.replace('\\', "/").to_lowercase()).collect();
    let mut mapping = BTreeMap::new();
    for (index, name) in names.iter().enumerate() {
        if !model_path(name) { return Err("只可重命名 MDX/MDL 模型".into()); }
        let old = resolve(&root, name)?;
        let ext = old.extension().unwrap().to_string_lossy();
        let target = old.with_file_name(format!("{prefix}{}.{ext}", start + index as u64));
        let relative = target.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/");
        if target.exists() && !originals.contains(&relative.to_lowercase()) { return Err(format!("目标文件已存在：{relative}")); }
        mapping.insert(name.clone(), relative);
    }
    let backup = backup(&root, &names)?;
    let bytes = mapping.iter().map(|(from, to)| Ok((to.clone(), fs::read(backup.join(safe_relative(from)?)).map_err(|e| e.to_string())?))).collect::<Result<BTreeMap<_, _>, String>>()?;
    let mut removed = vec![];
    for name in &names {
        if let Err(error) = fs::remove_file(resolve(&root, name)?) {
            for old in &removed { fs::copy(backup.join(old), root.join(old)).map_err(|e| e.to_string())?; }
            return Err(format!("重命名已回滚：{error}"));
        }
        removed.push(safe_relative(name)?);
    }
    if let Err(error) = import(&root, &bytes) {
        for name in &names { fs::copy(backup.join(safe_relative(name)?), root.join(safe_relative(name)?)).map_err(|e| format!("回滚失败：{e}；备份：{}", backup.display()))?; }
        return Err(error);
    }
    Ok((mapping, backup.to_string_lossy().into()))
}
pub fn import(root: &Path, files: &BTreeMap<String, Vec<u8>>) -> Result<usize, String> {
    for (name, bytes) in files {
        let target = root.join(safe_relative(name)?);
        if target.exists() && fs::read(resolve(root, name)?).map_err(|e| e.to_string())? != *bytes { return Err(format!("拒绝覆盖不同内容的文件：{name}")); }
    }
    let mut created = vec![];
    let result = (|| {
        for (name, bytes) in files {
            let target = root.join(safe_relative(name)?);
            if target.exists() { continue; }
            fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
            if !target.parent().unwrap().canonicalize().map_err(|e| e.to_string())?.starts_with(root) { return Err("目标越过来源目录".into()); }
            let mut file = OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e| e.to_string())?;
            created.push(target); file.write_all(bytes).map_err(|e| e.to_string())?;
        }
        Ok(created.len())
    })();
    if result.is_err() { for path in &created { fs::remove_file(path).map_err(|e| format!("导入回滚失败：{e}"))?; } }
    result
}
