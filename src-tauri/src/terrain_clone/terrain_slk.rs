use std::collections::BTreeMap;

// SYLK coordinates are sticky across C records; separators inside quoted K
// values are literal. Ignore non-cell records and columns unrelated to paths.
pub(super) fn texture_paths(bytes: &[u8], dir: &str, file: &str) -> Result<Vec<String>, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "地形路径 SLK 不是 UTF-8")?;
    let mut cells: BTreeMap<u32, BTreeMap<u32, String>> = BTreeMap::new();
    let (mut x, mut y) = (0, 0);
    for line in text.lines().filter(|line| line.starts_with("C;")) {
        let mut value = None;
        for field in fields(line).into_iter().skip(1) {
            if let Some(raw) = field.strip_prefix('X') { x = raw.parse().map_err(|_| "地形 SLK 列坐标无效")?; }
            else if let Some(raw) = field.strip_prefix('Y') { y = raw.parse().map_err(|_| "地形 SLK 行坐标无效")?; }
            else if let Some(raw) = field.strip_prefix('K') { value = Some(raw.trim_matches('"').replace("\"\"", "\"")); }
        }
        if let Some(value) = value { cells.entry(y).or_default().insert(x, value); }
    }
    let header = cells.remove(&1).ok_or("地形 SLK 缺少表头")?;
    let column = |name: &str| header.iter().find(|(_, value)| value.eq_ignore_ascii_case(name)).map(|(column, _)| *column).ok_or_else(|| format!("地形 SLK 缺少 {name} 列"));
    let (dir, file) = (column(dir)?, column(file)?);
    Ok(cells.values().filter_map(|row| {
        let (dir, file) = (row.get(&dir)?, row.get(&file)?);
        if dir.is_empty() || file.is_empty() || dir == "_" || file == "_" { return None; }
        let file = if file.to_ascii_lowercase().ends_with(".blp") { file.clone() } else { format!("{file}.blp") };
        Some(format!("{}/{file}", dir.replace('\\', "/").trim_end_matches('/')))
    }).collect())
}

fn fields(line: &str) -> Vec<&str> {
    let mut result = Vec::new();
    let (mut start, mut quoted) = (0, false);
    for (index, byte) in line.bytes().enumerate() {
        if byte == b'"' { quoted = !quoted; }
        if byte == b';' && !quoted { result.push(&line[start..index]); start = index + 1; }
    }
    result.push(&line[start..]);
    result
}
