use super::parse;
use std::collections::{HashMap, HashSet};

pub(in super::super) fn model_paths(members: &HashMap<String, Vec<u8>>) -> Result<HashSet<String>, String> {
    let mut paths = HashSet::new();
    let defaults: HashMap<String, i32> = serde_json::from_str(include_str!("default_variations.json")).expect("embedded object variation catalog");
    let placed = members.get("war3map.doo").map(|bytes| super::super::entities::variations(bytes)).transpose()?.unwrap_or_default();
    for (name, extended, model_field, variation_field) in [
        ("war3map.w3d", true, b"dfil", Some(b"dvar")),
        ("war3map.w3b", false, b"bfil", Some(b"bvar")),
        ("war3map.w3u", false, b"umdl", None),
    ] {
        let Some(bytes) = members.get(name) else { continue; };
        let file = parse(bytes, extended)?;
        for record in file.original.iter().chain(&file.custom) {
            let Some(field) = record.fields.iter().find(|(key, _)| key.starts_with(model_field)).map(|(_, value)| value) else { continue; };
            if field[4..8] != 3u32.to_le_bytes() { continue; }
            let start = if extended { 16 } else { 8 };
            let model = std::str::from_utf8(&field[start..field.len() - 5]).map_err(|_| "物编模型路径不是 UTF-8")?;
            if model.is_empty() { continue; }
            let inherited = defaults.get(std::str::from_utf8(&record.parent).unwrap_or("")).copied().unwrap_or(1);
            let variations = variation_field.and_then(|id| record.fields.iter().find(|(key, _)| key.starts_with(id)).map(|(_, value)| value))
                .filter(|value| value[4..8] == 0u32.to_le_bytes())
                .map(|value| i32::from_le_bytes(value[start..start + 4].try_into().unwrap())).unwrap_or(inherited);
            let variations = variations.max(placed.get(&super::identity(record)).map(|index| index.saturating_add(1) as i32).unwrap_or(0));
            if !(0..=100).contains(&variations) { return Err(format!("物编模型变体数量无效：{variations}")); }
            paths.extend(candidates(model, variation_field.map(|_| variations as usize)));
        }
    }
    Ok(paths)
}

fn candidates(model: &str, variations: Option<usize>) -> HashSet<String> {
    let lower = model.to_ascii_lowercase();
    let stem = if lower.ends_with(".mdl") || lower.ends_with(".mdx") { &model[..model.len() - 4] } else { model };
    let mut paths = HashSet::from([format!("{stem}.mdx"), format!("{stem}.mdl")]);
    // The editor resolves doodad/destructable variants from a base path, even
    // when that base has no extension and is absent from the MPQ listfile.
    if let Some(count) = variations {
        for index in 0..count.max(1) {
            paths.insert(format!("{stem}{index}.mdx"));
            paths.insert(format!("{stem}{index}.mdl"));
        }
    }
    paths
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolves_extensionless_and_explicit_variants_without_changing_the_base() {
        let paths = candidates("LxXModel\\TreeA", Some(6));
        assert!(paths.contains("LxXModel\\TreeA0.mdx"));
        assert!(paths.contains("LxXModel\\TreeA5.mdx"));
        assert!(!paths.contains("LxXModel\\TreeA6.mdx"));
        assert_eq!(paths, candidates("LxXModel\\TreeA.MDL", Some(6)));
        assert!(!candidates("units\\hero.mdl", None).contains("units\\hero0.mdx"));
    }

    #[test]
    fn extended_fields_resolve_inherited_doodad_variations() {
        let mut bytes = [2u32, 0, 1].into_iter().flat_map(u32::to_le_bytes).collect::<Vec<_>>();
        bytes.extend_from_slice(b"DOlcD006");
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(b"dfil");
        bytes.extend_from_slice(&3u32.to_le_bytes());
        bytes.extend_from_slice(&[0; 8]);
        bytes.extend_from_slice(b"LxXModel\\Brazier\0D006");
        let paths = model_paths(&HashMap::from([("war3map.w3d".into(), bytes)])).unwrap();
        assert!(paths.contains("LxXModel\\Brazier3.mdx"));
        assert!(!paths.contains("LxXModel\\Brazier4.mdx"));
    }
}
