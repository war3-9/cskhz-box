use super::{tests::fixture, w3e, SelectionRect};

fn extended_ground() -> Vec<[u8; 4]> {
    (0..17).map(|i| [b'G', b'0' + i / 100, b'0' + (i / 10) % 10, b'0' + i % 10]).collect()
}

#[test]
fn parses_and_preserves_palette_entries_beyond_addressable_slots() {
    let ids = extended_ground();
    let bytes = fixture(2, 2, &ids, &ids, 2);
    let map = w3e::parse(&bytes).unwrap();
    assert_eq!(w3e::palette(&bytes, 0).unwrap(), ids);
    assert_eq!(w3e::palette(&bytes, 1).unwrap(), ids);
    assert_eq!(map.to_bytes(), bytes);
    let (rebuilt, changed) = w3e::rebuild_header(&map.header, &ids, &ids).unwrap();
    assert_eq!(rebuilt, map.header);
    assert!(!changed);
}

#[test]
fn rejects_invalid_counts_without_allocating_from_untrusted_header_values() {
    for kind in [0, 1] {
        for count in [-1i32, i32::MAX] {
            let mut bytes = fixture(2, 2, &[*b"Ldrt"], &[*b"CLdi"], 2);
            let offset = if kind == 0 { 13 } else { 21 };
            bytes[offset..offset + 4].copy_from_slice(&count.to_le_bytes());
            assert!(w3e::parse(&bytes).is_err());
            assert!(w3e::palette(&bytes, kind).is_err());
        }
    }
    let bytes = fixture(2, 2, &extended_ground(), &[*b"CLdi"], 2);
    assert!(w3e::parse(&bytes[..32]).is_err());
    assert!(w3e::palette(&bytes[..32], 0).is_err());
}

#[test]
fn copies_from_extended_palette_without_changing_unselected_cells_or_header() {
    let bytes = fixture(4, 4, &extended_ground(), &[*b"CLdi"], 2);
    let mut source = w3e::parse(&bytes).unwrap();
    source.cell_mut(0, 0)[4] = 15;
    let mut target = bytes.clone();
    let rect = SelectionRect { x0: 0, y0: 0, x1: 0, y1: 0, mask: None };
    let (changed, _) = super::copy::copy_region(&source.to_bytes(), &mut target, &rect, [1, 1], false, false).unwrap();
    assert_eq!(changed, 1);
    let result = w3e::parse(&target).unwrap();
    assert_eq!(result.header, source.header);
    for y in 0..4 { for x in 0..4 {
        if (x, y) == (1, 1) { assert_eq!(result.cell(x, y)[4] & 15, 15); }
        else { assert_eq!(result.cell(x, y), w3e::parse(&bytes).unwrap().cell(x, y)); }
    } }
}

#[test]
fn cliff_remapping_preserves_water_boundary_and_blight_flags() {
    let mut source = w3e::parse(&fixture(4, 4, &[*b"Ldrt"], &[*b"CLdi", *b"CLgr"], 2)).unwrap();
    let mut target = w3e::parse(&fixture(6, 6, &[*b"Lrok"], &[*b"CLdi", *b"CLgr"], 2)).unwrap();
    // W3E byte 4: ground + flags. Byte 6: cliff index + layer height.
    source.cell_mut(1, 1)[4] = 0xf0;
    source.cell_mut(1, 1)[6] = 0x12;
    source.cell_mut(2, 1)[6] = 0xf2; // No-cliff sentinel must survive.
    for cell in target.cells.chunks_exact_mut(7) { cell[4] = 0x90; }
    let before = target.to_bytes();
    let rect = SelectionRect { x0: 1, y0: 1, x1: 2, y1: 1, mask: None };
    let mut bytes = before.clone();
    super::copy::copy_region(&source.to_bytes(), &mut bytes, &rect, [2, 2], true, true).unwrap();
    let result = w3e::parse(&bytes).unwrap();
    assert_eq!(result.cell(2, 2)[4] & 0xf0, 0xf0);
    assert_eq!(result.cell(2, 2)[6], 0x12); // CLgr keeps its target slot 1.
    assert_eq!(result.cell(3, 2)[6], 0xf2);
    assert_eq!(result.cell(0, 0)[4] & 0xf0, 0x90);
    assert_eq!(result.cell(0, 0)[6], 0x02); // CLdi remains in target slot 0.
    assert_eq!(w3e::palette(&bytes, 1).unwrap(), [*b"CLdi", *b"CLgr"]);
}

#[test]
fn no_cliff_sentinel_keeps_a_valid_cliff_palette() {
    let mut source = w3e::parse(&fixture(2, 2, &[*b"Ldrt"], &[*b"CLdi"], 2)).unwrap();
    for cell in source.cells.chunks_exact_mut(7) { cell[6] = 0xf2; }
    let mut target = source.to_bytes();
    let rect = SelectionRect { x0: 0, y0: 0, x1: 1, y1: 1, mask: None };
    super::copy::copy_region(&source.to_bytes(), &mut target, &rect, [0, 0], true, true).unwrap();
    assert_eq!(w3e::palette(&target, 1).unwrap(), [*b"CLdi"]);
    assert!(w3e::parse(&target).unwrap().cells.chunks_exact(7).all(|cell| cell[6] >> 4 == 15));
}

#[test]
#[ignore = "requires TERRAIN_CLONE_REPORTED_MAP to point at a private copy of 测试地图.w3x"]
fn reported_private_map_with_seventeen_ground_entries_opens() {
    use std::path::PathBuf;
    use crate::model_viewer::storm::Archive;

    let path = PathBuf::from(std::env::var_os("TERRAIN_CLONE_REPORTED_MAP").expect("set TERRAIN_CLONE_REPORTED_MAP"));
    let archive = Archive::open(&path).unwrap();
    let bytes = archive.read("war3map.w3e").unwrap();
    let map = w3e::parse(&bytes).unwrap();
    assert_eq!((map.width, map.height), (257, 257));
    assert_eq!(w3e::palette(&bytes, 0).unwrap().len(), 17);
    assert_eq!(w3e::palette(&bytes, 1).unwrap().len(), 5);
    assert_eq!(map.rgb().len(), 257 * 257 * 3);
    assert_eq!(map.to_bytes(), bytes);
}
