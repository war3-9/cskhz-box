use std::{fs::{self, OpenOptions}, io, path::Path};
use super::{map_ops, storm::Archive};

pub const PATHS: &[&str] = &[
    r"UI\Console\Human\HumanUITile01.blp", r"UI\Console\Human\HumanUITile02.blp",
    r"UI\Console\Human\HumanUITile03.blp", r"UI\Console\Human\HumanUITile04.blp",
    r"UI\Console\Human\HumanUITile-InventoryCover.blp", r"UI\Console\Human\HumanUITile-TimeIndicatorFrame.blp",
    r"UI\Widgets\Console\Human\human-console-buttonstates2.blp",
    r"UI\Feedback\Resources\ResourceGold.blp", r"UI\Feedback\Resources\ResourceLumber.blp",
    r"UI\Widgets\Console\Human\infocard-heroattributes-str.blp",
    r"UI\Widgets\Console\Human\infocard-heroattributes-agi.blp",
    r"UI\Widgets\Console\Human\infocard-heroattributes-int.blp",
    r"UI\Feedback\HPBarConsole\human-healthbar-fill.blp",
    r"UI\Feedback\ManaBarConsole\human-manabar-fill.blp",
];
fn map_path(path: &Path) -> bool {
    path.is_absolute() && path.extension().and_then(|s| s.to_str()).is_some_and(|s| s.eq_ignore_ascii_case("w3x") || s.eq_ignore_ascii_case("w3m"))
}
fn same_resource(a: &str, b: &str) -> bool { a.replace('/', "\\").eq_ignore_ascii_case(&b.replace('/', "\\")) }

pub fn replace(source: &Path, target: &Path, destination: &Path) -> Result<usize, String> {
    if ![source, target, destination].into_iter().all(map_path) { return Err("请选择魔兽地图的绝对路径（w3x 或 w3m）".into()); }
    if destination.exists() { return Err("请另存为新地图，不能覆盖原地图或已有文件".into()); }
    let donor = Archive::open(source)?;
    let original = Archive::open(target)?;
    // Read every resource before creating any output. A failed read must not become a deletion.
    let mut resources = Vec::new();
    for path in PATHS { resources.push((*path, if donor.has(path) { Some(donor.read(path)?) } else { None })); }
    let had_imports = original.has("war3map.imp");
    let mut imports = if had_imports { map_ops::import_list(&original.read("war3map.imp")?)? } else { vec![] };
    imports.retain(|(flag, name)| {
        let name = String::from_utf8_lossy(name);
        let full = if *flag == 5 || *flag == 8 { format!("war3mapImported\\{name}") } else { name.into_owned() };
        !PATHS.iter().any(|path| same_resource(&full, path))
    });
    for (path, bytes) in &resources { if bytes.is_some() { imports.push((13, path.as_bytes().to_vec())); } }
    drop(original); drop(donor);
    let mut input = fs::File::open(target).map_err(|e| e.to_string())?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(destination).map_err(|e| e.to_string())?;
    let result = (|| {
        // Copy the complete archive, retaining unknown entries and the Warcraft map header.
        io::copy(&mut input, &mut output).map_err(|e| e.to_string())?; drop(output);
        let archive = Archive::writable_copy(destination)?;
        for (path, bytes) in &resources {
            match bytes {
                Some(bytes) => archive.write(path, bytes, true)?,
                None if archive.has(path) => archive.remove(path.as_bytes())?,
                None => (),
            }
        }
        if had_imports || resources.iter().any(|(_, bytes)| bytes.is_some()) {
            archive.write("war3map.imp", &map_ops::encode_list(&imports), true)?;
        }
        archive.flush()?; drop(archive);
        let verify = Archive::open(destination)?;
        for (path, expected) in &resources {
            match expected {
                Some(bytes) if verify.read(path)? != *bytes => return Err(format!("替换后资源校验失败：{path}")),
                None if verify.has(path) => return Err(format!("原生资源还原失败：{path}")),
                _ => (),
            }
        }
        Ok(resources.iter().filter(|(_, bytes)| bytes.is_some()).count())
    })();
    if result.is_err() { fs::remove_file(destination).map_err(|e| format!("失败的地图副本无法清理：{e}"))?; }
    result
}

#[tauri::command]
pub async fn console_replace_map(source: String, target: String, destination: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || replace(Path::new(&source), Path::new(&target), Path::new(&destination)))
        .await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_named_resources_and_restores_missing_defaults_without_listfile() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results/ui-console-native").join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source.w3x"); let target = root.join("target.w3x"); let output = root.join("new.w3x");
        let archive = Archive::create_fixture(&source, false); archive.write(PATHS[0], b"left console", false).unwrap(); drop(archive);
        let archive = Archive::create_fixture(&target, false);
        archive.write(PATHS[0], b"right console", false).unwrap(); archive.write(PATHS[1], b"right override", false).unwrap();
        archive.write("war3map.j", b"original script", false).unwrap();
        archive.write("unknown/private.bin", b"preserve anonymous data", false).unwrap();
        archive.write("war3map.imp", &map_ops::encode_list(&[(13, PATHS[1].as_bytes().to_vec()), (13, b"unrelated.blp".to_vec())]), false).unwrap(); drop(archive);
        let before = (fs::read(&source).unwrap(), fs::read(&target).unwrap());
        assert_eq!(replace(&source, &target, &output).unwrap(), 1);
        let archive = Archive::open(&output).unwrap();
        assert_eq!(archive.read(PATHS[0]).unwrap(), b"left console"); assert!(!archive.has(PATHS[1]));
        assert_eq!(archive.read("war3map.j").unwrap(), b"original script");
        assert_eq!(archive.read(r"unknown\private.bin").unwrap(), b"preserve anonymous data");
        let imports = map_ops::import_list(&archive.read("war3map.imp").unwrap()).unwrap();
        assert!(imports.iter().any(|(_, path)| path == b"unrelated.blp"));
        assert!(!imports.iter().any(|(_, path)| path == PATHS[1].as_bytes())); drop(archive);
        assert!(replace(&source, &target, &output).is_err());
        assert!(replace(&source, &target, &target).is_err());
        assert_eq!((fs::read(&source).unwrap(), fs::read(&target).unwrap()), before);
        fs::remove_dir_all(root).unwrap();
    }
}
