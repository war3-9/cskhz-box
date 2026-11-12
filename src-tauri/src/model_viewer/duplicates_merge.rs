use std::{collections::{BTreeMap, HashSet}, path::Path};
use super::{duplicates::{self, MergeGroup, Snapshot}, index::{self, Source}, mutations::MutationResult};

fn paths(snapshot: &Snapshot, groups: &[MergeGroup], models: bool) -> Result<Vec<(String, String)>, String> {
    if groups.is_empty() || groups.len() > 100000 { return Err("请先选择要处理的重复项".into()); }
    let kind = if models { duplicates::DuplicateKind::Models } else { duplicates::DuplicateKind::Textures };
    let scan = duplicates::scan_selected(snapshot, Some(kind), &std::sync::atomic::AtomicBool::new(false), &super::duplicates_progress::Progress::default())?;
    let available = if models { &scan.models } else { &scan.textures };
    let mut touched = HashSet::new(); let mut mapping = vec![];
    for selection in groups {
        if selection.remove.is_empty() { return Err("每组必须保留一份并选择至少一个重复项".into()); }
        let group = available.iter().find(|group| group.paths.iter().any(|path| duplicates::key(path) == duplicates::key(&selection.keep))).ok_or("重复分组已变化，请重新扫描")?;
        if !models && group.blocked_reason.is_some() { return Err(group.blocked_reason.clone().unwrap()); }
        let keep = group.paths.iter().find(|path| duplicates::key(path) == duplicates::key(&selection.keep)).unwrap();
        if !touched.insert(duplicates::key(keep)) { return Err("重复分组存在交叉，请重新选择".into()); }
        for remove in &selection.remove {
            let remove = group.paths.iter().find(|path| duplicates::key(path) == duplicates::key(remove)).ok_or("删除项不在同一重复分组")?;
            if duplicates::key(remove) == duplicates::key(keep) || !touched.insert(duplicates::key(remove)) { return Err("不能删除保留项或重复处理同一文件".into()); }
            mapping.push((remove.clone(), keep.clone()));
        }
    }
    Ok(mapping)
}

pub(super) fn delete_models(source: &Source, fingerprint: &str, groups: &[MergeGroup], base: Option<&Path>) -> Result<MutationResult, String> {
    let snapshot = duplicates::snapshot(source)?;
    if snapshot.fingerprint != fingerprint { return Err("来源内容已变化，请重新扫描后再删除".into()); }
    super::duplicates_transaction::writable(&snapshot.source)?;
    let removed: Vec<_> = paths(&snapshot, groups, true)?.into_iter().map(|(remove, _)| remove).collect();
    let backup = super::duplicates_transaction::apply(&snapshot, &removed, &BTreeMap::new(), base)?;
    Ok(MutationResult { source: index::scan(source.path.clone(), source.id.clone(), &std::sync::atomic::AtomicBool::new(false))?, renamed: BTreeMap::new(), backup: Some(backup), changed: removed.len() })
}

pub(super) fn execute(source: &Source, fingerprint: &str, groups: &[MergeGroup], base: Option<&Path>) -> Result<MutationResult, String> {
    let snapshot = duplicates::snapshot(source)?;
    if snapshot.fingerprint != fingerprint { return Err("来源内容已变化，请重新扫描后再合并".into()); }
    super::duplicates_transaction::writable(&snapshot.source)?;
    if !snapshot.failures.is_empty() { return Err("存在无法安全读取引用的模型，未执行贴图合并".into()); }
    let mapping = paths(&snapshot, groups, false)?;
    let removed: Vec<_> = mapping.iter().map(|(remove, _)| remove.clone()).collect();
    let lookup: BTreeMap<_, _> = mapping.iter().cloned().collect();
    let mut models: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    for (remove, keep) in &mapping {
        if snapshot.files[remove] != snapshot.files[keep] { return Err("贴图内容不同，未执行合并".into()); }
        for (model, original) in snapshot.references.get(remove).into_iter().flatten() { models.entry(model.clone()).or_default().push((original.clone(), keep.clone())); }
    }
    let mut changed = BTreeMap::new();
    let texture_lookup = super::duplicates_paths::TexturePaths::new(&snapshot.files);
    for (model, replacements) in models {
        let bytes = super::export_rename::rewrite(&snapshot.files[&model], &model, &replacements)?;
        for name in super::export_rename::texture_paths(&bytes, &model)? {
            let target = texture_lookup.resolve(&model, &name);
            if target.is_some_and(|target| lookup.contains_key(target)) { return Err(format!("模型仍引用待删除贴图：{model}")); }
        }
        // Rewritten references must resolve to the retained source texture, not
        // a different model-relative file with the same basename.
        for (_, keep) in &replacements {
            if texture_lookup.resolve(&model, keep) != Some(keep) { return Err(format!("保留贴图路径无法安全解析：{keep}")); }
        }
        changed.insert(model, bytes);
    }
    let backup = super::duplicates_transaction::apply(&snapshot, &removed, &changed, base)?;
    Ok(MutationResult { source: index::scan(source.path.clone(), source.id.clone(), &std::sync::atomic::AtomicBool::new(false))?, renamed: BTreeMap::new(), backup: Some(backup), changed: removed.len() })
}
