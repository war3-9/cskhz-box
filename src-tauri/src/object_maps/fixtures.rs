//! Private synthetic MPQs for native command acceptance. No user-map inputs.
use super::*;
fn object(kind: &str, parent: &str, id: &str, field: &str, unknown: bool) -> Vec<u8> {
    let levels=["ability","upgrade","doodad"].contains(&kind);
    let mut mods: Vec<(&str,i32,i32,i32,Vec<u8>)>=vec![(field,3,if kind=="upgrade" {1} else {0},0,b"TRIGSTR_001\0".to_vec())];
    if kind=="ability" { mods.push(("aare",2,2,0,200.25f32.to_le_bytes().to_vec())); mods.push(("Hbz1",0,2,1,17i32.to_le_bytes().to_vec())); }
    if unknown { mods.push(("zzzz",3,0,0,"未知但必须保留\0".as_bytes().to_vec())); }
    let mut b=Vec::new(); for n in [2i32,0,1] { b.extend(n.to_le_bytes()); } b.extend(crate::map_format::rawcode::to_bytes(parent).unwrap()); b.extend(crate::map_format::rawcode::to_bytes(id).unwrap()); b.extend((mods.len() as i32).to_le_bytes());
    for (field,ty,level,data,value) in mods {
        b.extend(field.as_bytes()); b.extend(ty.to_le_bytes()); if levels { b.extend(level.to_le_bytes()); b.extend(data.to_le_bytes()); } b.extend(value); b.extend(crate::map_format::rawcode::to_bytes(id).unwrap());
    } b
}
#[test]
fn object_map_acceptance_archives() {
    let project=Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let requested=std::env::var("BOX_OBJECT_MAP_FIXTURES").ok();
    let root=requested.as_ref().map(PathBuf::from).unwrap_or_else(||project.join("test-results").join(format!("object-map-fixtures-{}",uuid::Uuid::new_v4())));
    assert!(root.is_absolute() && root.starts_with(project.join("test-results")) && !root.components().any(|c|c==std::path::Component::ParentDir));
    for (folder,label) in [("a","甲地图"),("b","乙地图"),("unknown","未知字段地图"),("legacy","旧图特殊ID")] {
        let path=root.join(folder).join("同名地图.w3x"); fs::create_dir_all(path.parent().unwrap()).unwrap(); assert!(!path.exists());
        { let a=Archive::create_fixture(&path,true);
          for (kind,ext,parent,id,field) in [("item","w3t","ratf","I001","unam"),("unit","w3u","hfoo","U001","unam"),("ability","w3a","AHbz","A001","anam"),("upgrade","w3q","Rhme","R001","gnam"),("doodad","w3d","APct","D001","dnam"),("buff","w3h","BHbz","B001","fnam")] {
            let id=if folder=="legacy" { "0x8000FF01" } else { id };
            a.write(&format!("war3map.{ext}"),&object(kind,parent,id,field,folder=="unknown" && kind=="unit"),false).unwrap();
          }
          let wts=if folder=="legacy" { b"STRING 1\r\n{\r\n\xbe\xc9\xcd\xbc\xcc\xd8\xca\xe2ID\r\n}\r\n".to_vec() } else {format!("STRING 1\n{{\n{label}\n第二行|cffff0000颜色|r\n}}\n").into_bytes()};
          a.write("war3map.wts",&wts,false).unwrap();
          let mut imports=Vec::new(); imports.extend(1i32.to_le_bytes()); imports.extend(1i32.to_le_bytes()); imports.extend(b"\rmap-icon.png\0");
          a.write("war3map.imp",&imports,false).unwrap(); a.write("map-icon.png",b"map-priority-fixture",false).unwrap(); a.flush().unwrap();
        }
        let bytes=fs::read(&path).unwrap(); let result=read(path.to_str().unwrap()).unwrap(); assert_eq!(result["objects"].as_object().unwrap().len(),6); assert_eq!(result["imports"][0],"map-icon.png"); assert_eq!(fs::read(&path).unwrap(),bytes);
        if folder=="legacy" { for kind in ["item", "unit", "ability", "upgrade", "doodad", "buff"] { assert_eq!(result["objects"][format!("{kind}:0x8000FF01")]["id"],"0x8000FF01"); } }
    }
    if requested.is_none() { fs::remove_dir_all(root).unwrap(); }
}
