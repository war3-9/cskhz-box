use super::{entities, regions, session::MapDocument};
use crate::model_viewer::storm::Archive;

pub(super) fn validate(before: &MapDocument, after: &MapDocument) -> Result<(), String> {
    if before.blank { return Ok(()); }
    let archive = Archive::open(&before.path)?;
    let mut logic = vec![];
    for name in ["war3map.wtg", "war3map.wct", "war3map.j", "scripts\\war3map.j", "war3map.lua", "scripts\\war3map.lua"] {
        if archive.has(name) { logic.push(archive.read(name)?); }
    }
    for name in ["war3map.doo", "war3mapUnits.doo", "war3map.w3r"] {
        let Some(old) = before.members.get(name) else { continue; };
        let Some(new) = after.members.get(name).filter(|bytes| *bytes != old) else { continue; };
        let names = |bytes: &[u8]| if name == "war3map.w3r" { regions::trigger_names(bytes) } else { entities::trigger_names(bytes, name == "war3mapUnits.doo") };
        let existing: std::collections::HashSet<_> = names(new)?.into_iter().collect();
        for reference in names(old)? {
            if !existing.contains(&reference) && logic.iter().any(|bytes| references(bytes, &reference)) {
                return Err(format!("复制会移除目标触发器引用的 {reference}，已取消且目标地图未修改。请避开该对象/区域，取消对应复制项，或使用新建空白地图。"));
            }
        }
    }
    Ok(())
}

fn references(bytes: &[u8], name: &str) -> bool {
    if contains(bytes, name.as_bytes()) { return true; }
    // KK can transliterate Chinese region names when generating JASS. Without
    // that editor's spelling table, protect a matching ASCII prefix rather
    // than silently remove a potentially referenced region.
    if let Some(at) = name.bytes().position(|b| !b.is_ascii()) {
        let prefix = &name.as_bytes()[..at];
        return bytes.windows(prefix.len()).enumerate().any(|(at, part)| part == prefix && (at == 0 || !identifier(bytes[at - 1])));
    }
    false
}

fn contains(bytes: &[u8], name: &[u8]) -> bool {
    bytes.windows(name.len()).enumerate().any(|(at, part)| part == name
        && (at == 0 || !identifier(bytes[at - 1]))
        && bytes.get(at + name.len()).is_none_or(|next| !identifier(*next)))
}
fn identifier(byte: u8) -> bool { byte.is_ascii_alphanumeric() || byte == b'_' || byte >= 0x80 }

#[cfg(test)] mod tests {
    #[test] fn checks_whole_jass_identifiers_in_binary_trigger_data() {
        assert!(super::contains(b"\0gg_unit_hfoo_0001\0", b"gg_unit_hfoo_0001"));
        assert!(!super::contains(b"gg_unit_hfoo_00010", b"gg_unit_hfoo_0001"));
        assert!(!super::contains(b"prefix_gg_unit_hfoo_0001", b"gg_unit_hfoo_0001"));
        assert!(super::references(b"set gg_rct_1_1_ChuGuaiQuYu = null", "gg_rct_1_1_出怪区域"));
    }
}
