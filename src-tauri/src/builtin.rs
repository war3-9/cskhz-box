use flate2::read::ZlibDecoder;
use serde_json::Value;
use std::{io::Read, sync::OnceLock};

const PACK: &[u8] = include_bytes!("../../.private/builtin/library.json.zlib");
static LIBRARY: OnceLock<Result<Value, String>> = OnceLock::new();

fn load_pack(pack: &[u8]) -> Result<Value, String> {
    let mut decoded = Vec::new();
    ZlibDecoder::new(pack).take(256 * 1024 * 1024).read_to_end(&mut decoded)
        .map_err(|error| error.to_string())?;
    serde_json::from_slice(&decoded).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_builtin_library() -> Result<Value, String> {
    LIBRARY.get_or_init(|| load_pack(PACK)).clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pack_loads_with_ordered_groups_and_expected_assets() {
        let library = load_pack(PACK).unwrap();
        let groups: Vec<_> = library["categories"].as_array().unwrap().iter()
            .filter(|category| category["parentId"].is_null())
            .map(|category| category["name"].as_str().unwrap()).collect();
        assert_eq!(groups, vec!["底图", "方框", "品阶", "插图", "道具", "横幅", "字体"]);
        let assets = library["assets"].as_array().unwrap();
        assert!(library["templates"].is_array());
        let templates = library["templates"].as_array().unwrap();
        assert_eq!(templates.len(), 2);
        assert_eq!(templates[0]["id"], "5beb5c91-1809-4d17-9e6d-b121a64bea84");
        assert_eq!(templates[1]["id"], "bca0b810-5765-4062-8240-c95079bc9cd4");
        assert_eq!(templates[0]["project"]["document"]["width"], 122);
        assert_eq!(templates[1]["project"]["document"]["width"], 300);
        assert_eq!(assets.iter().filter(|asset| asset["categoryId"] == "props-added").count(), 11);
        assert_eq!(assets.iter().filter(|asset| asset["groupId"] == "rank").count(), 31);
        let wild = library["categories"].as_array().unwrap().iter()
            .find(|category| category["parentId"] == "rank" && category["name"] == "狂野").unwrap();
        assert_eq!(assets.iter().filter(|asset| asset["categoryId"] == wild["id"]).count(), 6);
        assert_eq!(assets.iter().filter(|asset| asset["categoryId"] == "rank").count(), 0);
        for (group, count) in [("backgrounds", 7), ("frames", 39), ("illustrations", 29), ("props", 273), ("banners", 1), ("fonts", 3)] {
            assert_eq!(assets.iter().filter(|asset| asset["groupId"] == group).count(), count);
        }
    }
    #[test]
    fn invalid_zlib_pack_is_rejected() {
        assert!(load_pack(b"not a zlib stream").is_err());
    }
}
