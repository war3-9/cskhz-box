use serde_json::{json, Map, Value};
struct Reader<'a> { bytes: &'a [u8], pos: usize }
impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        let end = self.pos.checked_add(n).ok_or("物编数据越界")?;
        let bytes = self.bytes.get(self.pos..end).ok_or("物编文件不完整")?; self.pos = end; Ok(bytes)
    }
    fn int(&mut self) -> Result<i32, String> { Ok(i32::from_le_bytes(self.take(4)?.try_into().unwrap())) }
    fn count(&mut self) -> Result<usize, String> { let n = self.int()?; if !(0..=100000).contains(&n) { Err("物编数量异常".into()) } else { Ok(n as usize) } }
    fn code(&mut self) -> Result<String, String> {
        let id = crate::map_format::rawcode::from_bytes(self.take(4)?.try_into().unwrap());
        if !crate::map_format::rawcode::valid(&id) { return Err("物编标识不能全为零；请核对文件结构".into()); }
        Ok(id)
    }
}
pub fn objects(bytes: &[u8], kind: &str) -> Result<Map<String, Value>, String> {
    let mut r = Reader { bytes, pos: 0 }; let mut context = String::from("文件头");
    let result = read_objects(&mut r, kind, &mut context);
    result.map_err(|error| format!("{context}，读取至偏移 0x{:X}：{error}", r.pos))
}
fn read_objects(r: &mut Reader<'_>, kind: &str, context: &mut String) -> Result<Map<String, Value>, String> {
    let version = r.int()?;
    if version != 1 && version != 2 { return Err(format!("暂不支持物编版本 {version}，原文件未修改")); }
    let levels = ["ability", "upgrade", "doodad"].contains(&kind); let mut result = Map::new(); let mut mods = 0usize;
    for custom in [false, true] {
        for index in 0..r.count()? {
            *context = format!("{}对象 #{}，模板/对象 ID", if custom { "自定义" } else { "原生" }, index + 1);
            let parent = r.code()?; let new = r.take(4)?.to_vec();
            let id = if new == [0; 4] { parent.clone() } else { crate::map_format::rawcode::from_bytes(new.try_into().unwrap()) };
            if custom && id == parent { return Err("自定义对象 ID 与原生模板相同".into()); }
            *context = format!("对象 {id}，字段数量");
            let n = r.count()?; mods += n; if mods > 1_000_000 { return Err("物编字段总数超过限制".into()); }
            let mut fields = Map::new();
            for index in 0..n {
                *context = format!("对象 {id}，字段 #{}", index + 1);
                let field = r.code()?; let ty = r.int()?;
                *context = format!("对象 {id}，字段 {field}");
                let (level, data) = if levels { (r.int()?, r.int()?) } else { (0, 0) };
                if level < 0 || data < 0 { return Err("物编等级/数据索引无效".into()); }
                let value = match ty {
                    0 => json!(r.int()?),
                    1 | 2 => { let v = f32::from_le_bytes(r.take(4)?.try_into().unwrap()); if !v.is_finite() { return Err("物编浮点数无效".into()); } json!(v as f64) },
                    3 => { let len = r.bytes[r.pos..].iter().position(|b| *b == 0).ok_or("物编字符串未结束")?; if len > 4 * 1024 * 1024 { return Err("物编字符串过长".into()); } let s = crate::map_format::map_text::decode(r.take(len)?)?; r.take(1)?; json!(s) },
                    _ => return Err(format!("未知物编类型 {ty}")),
                };
                r.take(4)?; fields.insert(format!("{field}:{level}:{data}"), json!({ "id":field,"type":ty,"level":level,"data":data,"value":value }));
            }
            if result.insert(format!("{kind}:{id}"), json!({"id":id,"parent":parent,"custom":custom,"fields":fields})).is_some() { return Err("重复的物编 ID".into()); }
        }
    }
    if r.pos != r.bytes.len() { return Err("物编有未知尾部数据，已停止读取".into()); } Ok(result)
}
pub fn strings(bytes: &[u8]) -> Result<Map<String, Value>, String> {
    // KK comments can contain literal binary object IDs, independently of the
    // value encoding. Parse ASCII structure first; decode only STRING contents.
    let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    let mut result = Map::new();
    let mut lines = bytes.split(|b| *b == b'\n').map(|line| line.strip_suffix(b"\r").unwrap_or(line));
    while let Some(line) = lines.next() {
        let Some(id) = line.trim_ascii().strip_prefix(b"STRING ")
            .and_then(|s| std::str::from_utf8(s).ok()).and_then(|s| s.trim().parse::<u32>().ok()) else { continue };
        let opening = lines.by_ref().find(|l| !l.trim_ascii().is_empty() && !l.trim_ascii().starts_with(b"//")).ok_or("WTS 缺少起始括号")?;
        if opening.trim_ascii() != b"{" { return Err("WTS 起始括号无效".into()); }
        let mut content = Vec::new(); let mut closed = false;
        for l in lines.by_ref() { if l.trim_ascii() == b"}" { closed = true; break; } content.push(l); }
        if !closed { return Err("WTS 字符串未结束".into()); }
        let text = crate::map_format::map_text::decode(&content.join(&b'\n'))
            .map_err(|e| format!("WTS STRING {id}：{e}"))?;
        if result.insert(id.to_string(), json!(text)).is_some() { return Err("WTS 字符串编号重复".into()); }
    } Ok(result)
}
pub fn imports(bytes: &[u8]) -> Result<Vec<String>, String> {
    let mut r = Reader { bytes, pos: 0 }; if r.int()? != 1 { return Err("未知导入资源表版本".into()); }
    let mut result = Vec::new();
    for _ in 0..r.count()? {
        let flag = r.take(1)?[0]; let len = r.bytes[r.pos..].iter().position(|b| *b == 0).ok_or("资源路径未结束")?;
        let path = std::str::from_utf8(r.take(len)?).map_err(|_| "资源路径不是 UTF-8")?.to_string(); r.take(1)?;
        result.push(if flag == 5 || flag == 8 { format!("war3mapImported\\{path}") } else { path });
    }
    if r.pos != bytes.len() { return Err("导入资源表存在未知尾部".into()); } Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    pub fn fixture(kind: &str) -> Vec<u8> {
        let mut b = Vec::new(); for n in [2i32,0,1] { b.extend(n.to_le_bytes()); } b.extend(b"hfooH001"); b.extend(1i32.to_le_bytes()); b.extend(b"unam"); b.extend(3i32.to_le_bytes());
        if ["ability","upgrade","doodad"].contains(&kind) { b.extend(2i32.to_le_bytes()); b.extend(1i32.to_le_bytes()); }
        b.extend(b"TRIGSTR_001\0H001"); b
    }
    #[test] fn object_six_kinds_and_truncation() {
        for kind in ["item","unit","ability","upgrade","doodad","buff"] {
            let b = fixture(kind); let o = objects(&b, kind).unwrap(); assert_eq!(o[&format!("{kind}:H001")]["custom"], true);
            for end in 0..b.len() { assert!(objects(&b[..end],kind).is_err()); }
            let mut tail=b.clone(); tail.push(0); assert!(objects(&tail,kind).is_err());
        }
    }
    #[test] fn wts_multiline_braces_and_missing_end() {
        let s=strings("STRING 1\n{\n第一行\n{x}\n末行\n}\n".as_bytes()).unwrap(); assert_eq!(s["1"], "第一行\n{x}\n末行");
        assert!(strings(b"STRING 1\n{\nmissing").is_err());
    }
    #[cfg(windows)]
    #[test] fn legacy_gbk_fields_and_wts_read_without_rewriting_source() {
        let mut bytes = fixture("unit");
        let start = 32; bytes.splice(start..bytes.len()-4, [0xd6,0xd0,0xce,0xc4,0]);
        let original=bytes.clone(); let parsed=objects(&bytes,"unit").unwrap();
        assert_eq!(parsed["unit:H001"]["fields"]["unam:0:0"]["value"],"中文");
        assert_eq!(bytes,original);
        assert_eq!(strings(b"STRING 0\r\n{\r\n\xd6\xd0\xce\xc4\r\n}\r\n").unwrap()["0"],"中文");
    }
    #[cfg(windows)]
    #[test] fn kk_binary_id_comments_do_not_change_utf8_or_gbk_values() {
        let mut bytes=b"\xef\xbb\xbfSTRING 8\r\n// ID: \x80\xff\xc4\xe3\xba\xc3\r\n{\r\n".to_vec();
        bytes.extend("旧图名称😀\r\n}\r\nSTRING 9\r\n{\r\n".as_bytes());
        bytes.extend(b"\xd6\xd0\xce\xc4\r\n}\r\n");
        let parsed=strings(&bytes).unwrap();
        assert_eq!(parsed["8"],"旧图名称😀");assert_eq!(parsed["9"],"中文");
        assert!(strings(b"STRING 1\n{\n\xff\n}\n").unwrap_err().contains("WTS STRING 1"));
    }
    #[test] fn legacy_binary_ids_are_lossless_in_all_six_categories_and_versions() {
        for kind in ["item","unit","ability","upgrade","doodad","buff"] {
            for version in [1i32, 2] {
                let mut bytes = fixture(kind);
                bytes[..4].copy_from_slice(&version.to_le_bytes());
                bytes[12..16].copy_from_slice(&[0xc4,0xe3,0xba,0xc3]);
                bytes[16..20].copy_from_slice(&[0x80,0x00,0xff,0x01]);
                bytes[24..28].copy_from_slice(&[0x81,0xfe,0x00,0x20]);
                let original = bytes.clone();
                let parsed = objects(&bytes,kind).unwrap();
                let object = &parsed[&format!("{kind}:0x8000FF01")];
                assert_eq!(object["parent"], "0xC4E3BAC3");
                assert_eq!(object["fields"].as_object().unwrap().values().next().unwrap()["id"], "0x81FE0020");
                assert_eq!(bytes, original);
            }
        }
    }
    #[test] fn malformed_files_keep_structural_guards_and_precise_context() {
        let mut bytes = fixture("ability");
        bytes[24..28].fill(0);
        let error = objects(&bytes,"ability").unwrap_err();
        assert!(error.contains("对象 H001，字段 #1"), "{error}");
        assert!(error.contains("偏移 0x1C"), "{error}");
        assert!(error.contains("全为零"), "{error}");
        bytes = fixture("ability"); bytes[28..32].copy_from_slice(&99i32.to_le_bytes());
        let error = objects(&bytes,"ability").unwrap_err();
        assert!(error.contains("对象 H001，字段 unam") && error.contains("未知物编类型 99"));
    }
}
