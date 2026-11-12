use super::{index::Source, persistence, ViewerState};
use std::path::PathBuf;

// A game source is used for dependency lookup only. Enumerating every game model is unnecessary.
#[tauri::command]
pub fn viewer_game_resources(path: String, state: tauri::State<ViewerState>) -> Result<Vec<Source>, String> {
    if path.trim().is_empty() {
        #[cfg(windows)]
        for root in registered_game_paths() {
            if let Ok(archives) = persistence::viewer_game_archives(root.to_string_lossy().into_owned()) {
                if !archives.is_empty() { return Ok(mount_archives(archives, &state)); }
            }
        }
        return Ok(vec![]);
    }
    let path = PathBuf::from(path);
    if !path.is_absolute() { return Err("请选择绝对游戏目录或地图路径".into()); }
    let start = if path.is_file() { path.parent().ok_or("来源目录无效")? } else { path.as_path() };
    let archives = start.ancestors().find_map(|root| persistence::viewer_game_archives(root.to_string_lossy().into_owned()).ok().filter(|paths| !paths.is_empty())).unwrap_or_default();
    Ok(mount_archives(archives, &state))
}

fn mount_archives(archives: Vec<String>, state: &ViewerState) -> Vec<Source> {
    let mut mounted = state.sources.lock().unwrap();
    let mut sources = vec![];
    for path in archives {
        let hash = path.replace('\\', "/").to_lowercase().encode_utf16().fold(2166136261u32, |n, c| (n ^ c as u32).wrapping_mul(16777619));
        let id = format!("viewer-{hash}");
        let source = Source { id: id.clone(), name: PathBuf::from(&path).file_name().unwrap_or_default().to_string_lossy().into_owned(), path, kind: "archive".into(), entries: vec![], complete: false, warning: None, analysis: None };
        mounted.insert(id, source.clone()); sources.push(source);
    }
    sources
}

#[cfg(windows)]
pub(crate) fn registered_game_paths() -> Vec<PathBuf> {
    use std::ptr::null_mut;
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    fn value(hive: windows_sys::Win32::System::Registry::HKEY, key: &str) -> Option<PathBuf> {
        let key: Vec<u16> = key.encode_utf16().chain(Some(0)).collect();
        let name: Vec<u16> = "InstallPath".encode_utf16().chain(Some(0)).collect();
        let mut bytes = 0u32;
        let status = unsafe { RegGetValueW(hive, key.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ, null_mut(), null_mut(), &mut bytes) };
        if status != 0 || bytes < 2 || bytes > 32768 { return None; }
        let mut data = vec![0u16; (bytes as usize).div_ceil(2)];
        let status = unsafe { RegGetValueW(hive, key.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ, null_mut(), data.as_mut_ptr().cast(), &mut bytes) };
        if status != 0 { return None; }
        let path = String::from_utf16_lossy(&data).trim_matches('\0').trim().to_string();
        (!path.is_empty()).then(|| PathBuf::from(path))
    }
    let keys = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Blizzard Entertainment\Warcraft III"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Blizzard Entertainment\Warcraft III"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Blizzard Entertainment\Warcraft III"),
    ];
    let mut paths = vec![];
    for (hive, key) in keys {
        if let Some(path) = value(hive, key) {
            if !paths.iter().any(|known: &PathBuf| known.to_string_lossy().eq_ignore_ascii_case(&path.to_string_lossy())) { paths.push(path); }
        }
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::persistence;
    use crate::model_viewer::index::{self, Source};
    use std::path::PathBuf;

    #[test]
    #[ignore = "requires BOX_VIEWER_TEST_GAME_DIR pointing to a local classic Warcraft III install"]
    fn reads_common_unit_textures_from_classic_game_archives() {
        let root = PathBuf::from(std::env::var_os("BOX_VIEWER_TEST_GAME_DIR").expect("set BOX_VIEWER_TEST_GAME_DIR"));
        let archives = persistence::viewer_game_archives(root.to_string_lossy().into_owned()).unwrap();
        assert!(!archives.is_empty(), "no classic MPQ archives found in {}", root.display());
        let references = [
            "Textures\\Footman.blp", "Textures\\gutz.blp", "Textures\\Arthas.blp",
            "Textures\\RibbonBlur1.blp", "Textures\\Flame4.blp", "Textures\\Tornado2b.blp",
            "Textures\\Red_Glow3.blp", "Textures\\GenericGlow2c.blp", "Textures\\HeroBlademaster.blp",
            "ReplaceableTextures\\Weather\\Clouds8x8.blp", "units\\Human\\HeroPaladinBoss\\HeropaladinBoss.blp",
            "units\\Human\\Jaina\\Jaina.blp", "Units\\Human\\Sorceress\\Sorceress.blp",
            "Units\\Creeps\\HumanMage\\HumanMage.blp", "Units\\Critters\\VillagerWoman\\VillagerWoman.blp",
            "Units\\Creeps\\HighElfArcher\\HighElfArcher.blp", "Units\\Critters\\HighElfPeasant\\HighElfPeasant.blp",
            "Textures\\Priest.blp", "Units\\Human\\HeroArchMage\\HeroArchmage.blp", "Textures\\Ice.blp",
            "Textures\\Yellow_Star.blp", "Textures\\Yellow_Star_Dim.blp", "Textures\\white.blp",
            "UI\\Glues\\SinglePlayer\\HumanCampaign3D\\HumanCampaignFootman.blp",
            "ui\\Glues\\SinglePlayer\\HumanCampaign3D\\HumanCampaignCrest2c.blp",
            "ui\\Glues\\SinglePlayer\\HumanCampaign3D\\HumanCampaignCrest2a.blp",
            "ui\\Glues\\SinglePlayer\\HumanCampaign3D\\HumanCampaignSwordHandlr.blp",
            "UI\\Glues\\SinglePLayer\\HumanCampaign3D\\HumanCampaignSwordBlade.blp",
            "units\\Creeps\\BanditLord\\BanditLord.blp", "Textures\\Headhunter.blp",
            "Units\\Creeps\\GnollOverSeer\\GnollOverseer.blp", "Units\\Human\\Militia\\PeasantMilitia.blp",
            "Textures\\KotoBeast.blp", "Textures\\BatTroll.blp", "Textures\\Bandit.blp",
            "Units\\Other\\BloodElfLieutenant\\BloodElfLieutenant.blp", "Units\\Orc\\Grunt\\Grunt.blp",
            "Units\\Orc\\Hellscream\\Hellscream.blp", "Textures\\Knight.blp",
            "ui\\Glues\\SinglePlayer\\NightElf_Exp\\Arrow.blp", "Units\\Creeps\\HumanBattleship\\HumanBattleShip.blp",
        ];
        let mut missing = vec![];
        let dump = std::env::var_os("BOX_VIEWER_TEXTURE_DUMP_DIR").map(PathBuf::from);
        for (index, reference) in references.into_iter().enumerate() {
            let bytes = archives.iter().find_map(|path| {
                let source = Source { id: "test".into(), path: path.clone(), name: path.clone(), kind: "archive".into(), entries: vec![], complete: false, warning: None, analysis: None };
                index::read(&source, reference).ok()
            });
            if let Some(bytes) = bytes {
                if let Some(directory) = &dump {
                    std::fs::create_dir_all(directory).unwrap();
                    std::fs::write(directory.join(format!("{index:02}.blp")), &bytes).unwrap();
                }
            } else { missing.push(reference); }
        }
        eprintln!("MPQ texture references missing from installed classic archives: {missing:?}");
        assert!(missing.is_empty(), "classic Warcraft texture references missing: {missing:?}");
    }

    #[test]
    #[ignore = "requires BOX_VIEWER_TEST_GAME_DIR and BOX_VIEWER_TEST_MODELS_DIR"]
    fn reads_folder_texture_dependencies_from_classic_game_archives() {
        use std::{collections::BTreeSet, sync::atomic::AtomicBool};
        use crate::model_viewer::{export::texture_paths, storm::Archive};
        let root = std::env::var("BOX_VIEWER_TEST_MODELS_DIR").expect("set BOX_VIEWER_TEST_MODELS_DIR");
        let game = std::env::var("BOX_VIEWER_TEST_GAME_DIR").expect("set BOX_VIEWER_TEST_GAME_DIR");
        let source = index::scan(root, "folder-test".into(), &AtomicBool::new(false)).unwrap();
        let archives: Vec<_> = persistence::viewer_game_archives(game).unwrap().into_iter().map(|path| Archive::open(&PathBuf::from(path)).unwrap()).collect();
        assert!(!archives.is_empty());
        let mut references = BTreeSet::new();
        for entry in source.entries.iter().filter(|entry| entry.model) {
            references.extend(texture_paths(&index::read(&source, &entry.path).unwrap(), &entry.path));
        }
        let dump = std::env::var_os("BOX_VIEWER_TEXTURE_DUMP_DIR").map(PathBuf::from);
        let mut matched = 0;
        for reference in references {
            if let Some(bytes) = archives.iter().find_map(|archive| archive.read(&reference.replace('/', "\\")).ok()) {
                assert!(bytes.starts_with(b"BLP"), "unexpected classic texture {reference}");
                matched += 1;
                if let Some(directory) = &dump {
                    let output = directory.join(index::safe_relative(&reference).unwrap());
                    std::fs::create_dir_all(output.parent().unwrap()).unwrap();
                    std::fs::write(output, bytes).unwrap();
                }
            }
        }
        assert!(matched > 0, "no dependencies read from classic archives");
        eprintln!("classic texture dependencies read: {matched}");
    }
}
