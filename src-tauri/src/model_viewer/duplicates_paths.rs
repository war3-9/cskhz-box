use std::collections::BTreeMap;
use super::duplicates::{key, texture};

pub(super) struct TexturePaths<'a> { paths: BTreeMap<String, &'a String> }
impl<'a> TexturePaths<'a> {
    pub(super) fn new(files: &'a BTreeMap<String, Vec<u8>>) -> Self {
        let mut paths = BTreeMap::new();
        for path in files.keys().filter(|path| texture(path)) { paths.entry(key(path)).or_insert(path); }
        Self { paths }
    }
    pub(super) fn resolve(&self, model: &str, name: &str) -> Option<&'a String> {
        let name = name.replace('\\', "/");
        let directory = model.replace('\\', "/").rsplit_once('/').map(|(dir, _)| dir.to_string()).unwrap_or_default();
        let mut parts: Vec<_> = directory.split('/').filter(|part| !part.is_empty()).collect();
        let mut valid = true;
        for part in name.split('/') { match part { "" | "." => {}, ".." => { if parts.pop().is_none() { valid = false; break; } }, _ => parts.push(part) } }
        let mut candidates = vec![name.clone()];
        if valid { candidates.push(parts.join("/")); }
        candidates.push(if directory.is_empty() { name.rsplit('/').next()?.to_string() } else { format!("{directory}/{}", name.rsplit('/').next()?) });
        candidates.iter().find_map(|candidate| self.paths.get(&key(candidate)).copied())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn indexed_paths_preserve_root_relative_and_basename_precedence() {
        let files = BTreeMap::from_iter(["Textures/skin.blp", "Models/Textures/skin.blp", "Models/local.blp", "Models/Textures/local.blp"].map(|path| (path.to_string(), vec![])));
        let lookup = TexturePaths::new(&files);
        assert_eq!(lookup.resolve("Models/a.mdx", "TEXTURES\\SKIN.BLP").unwrap(), "Textures/skin.blp");
        assert_eq!(lookup.resolve("Models/a.mdx", "../Textures/skin.blp").unwrap(), "Textures/skin.blp");
        assert_eq!(lookup.resolve("Models/a.mdx", "missing/local.blp").unwrap(), "Models/local.blp");
        assert!(lookup.resolve("Models/a.mdx", "none.blp").is_none());
    }
}
