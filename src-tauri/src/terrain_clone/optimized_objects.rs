use std::collections::HashMap;
use crate::model_viewer::storm::Archive;

pub(super) fn paths() -> Vec<String> {
    let mut paths: Vec<String> = ["units/abilitydata.slk", "units/destructabledata.slk", "doodads/doodads.slk", "units/abilitybuffdata.slk", "units/upgradedata.slk", "units/itemdata.slk", "units/unitui.slk", "units/unitdata.slk", "units/unitbalance.slk", "units/unitabilities.slk", "units/unitweapons.slk", "units/itemstrings.txt", "units/itemfunc.txt", "units/destructableskin.txt", "units/unitskin.txt", "units/unitweaponsskin.txt", "units/abilityskin.txt", "units/upgradeskin.txt", "units/itemskin.txt", "doodads/doodadskins.txt"].into_iter().map(String::from).collect();
    for race in ["campaign", "common", "human", "neutral", "nightelf", "orc", "undead", "item"] {
        for kind in ["unit", "ability", "upgrade"] { for suffix in ["strings", "func"] { paths.push(format!("units/{race}{kind}{suffix}.txt")); } }
    }
    paths
}

pub(super) fn load(archive: &Archive, members: &mut HashMap<String, Vec<u8>>) -> Result<(), String> {
    for path in paths() { let name = path.replace('/', "\\"); if archive.has(&name) { members.insert(path, archive.read(&name)?); } }
    Ok(())
}

