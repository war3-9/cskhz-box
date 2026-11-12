use super::{grids, tests::fixture, SelectionRect};

fn terrain() -> Vec<u8> { fixture(5, 4, &[*b"Ldrt"], &[*b"CLdi"], 2) }

fn grid(value: u8, header: bool) -> Vec<u8> {
    let mut bytes = Vec::new();
    if header {
        bytes.extend_from_slice(b"MP3W");
        for word in [0u32, 16, 12] { bytes.extend_from_slice(&word.to_le_bytes()); }
    }
    bytes.extend_from_slice(&[value; 192]);
    bytes
}

#[test]
fn whole_map_pathing_and_shadows_copy_without_an_extra_grid_row_or_column() {
    let terrain = terrain();
    let rect = SelectionRect { x0: 0, y0: 0, x1: 4, y1: 3, mask: None };
    for header in [true, false] {
        let source = grid(0xa5, header);
        let (result, copied) = grids::copy(&source, &grid(0x11, header), &terrain, &terrain, &rect, [0, 0], header).unwrap();
        assert_eq!(copied, 192);
        assert_eq!(result, source);
    }
}

#[test]
fn edge_clipping_preserves_offset_and_every_unselected_cell() {
    let terrain = terrain();
    // Source edge, target edge, and a selection containing only border points.
    let cases = [(2, 1, 4, 3, [0, 0]), (0, 0, 2, 2, [2, 1]), (4, 0, 4, 3, [0, 0]), (0, 3, 4, 3, [0, 0])];
    for header in [true, false] { for (x0, y0, x1, y1, dest) in cases {
        let rect = SelectionRect { x0, y0, x1, y1, mask: None };
        let mut source = grid(0, header);
        let start = if header { 16 } else { 0 };
        for (i, byte) in source[start..].iter_mut().enumerate() { *byte = i as u8; }
        let (result, copied) = grids::copy(&source, &grid(0xfe, header), &terrain, &terrain, &rect, dest, header).unwrap();
        let mut expected_count = 0;
        for y in 0..12u32 { for x in 0..16u32 {
            let dx = x as i32 - dest[0] as i32 * 4;
            let dy = y as i32 - dest[1] as i32 * 4;
            let sx = x0 * 4 + dx.max(0) as u32;
            let sy = y0 * 4 + dy.max(0) as u32;
            let selected = dx >= 0 && dy >= 0 && dx < (x1 - x0 + 1) as i32 * 4 && dy < (y1 - y0 + 1) as i32 * 4 && sx < 16 && sy < 12;
            let expected = if selected { expected_count += 1; source[start + (sy * 16 + sx) as usize] } else { 0xfe };
            assert_eq!(result[start + (y * 16 + x) as usize], expected);
        } }
        assert_eq!(copied, expected_count);
    } }
}

#[test]
fn border_mask_holes_are_preserved_and_invalid_geometry_or_data_still_fail() {
    let terrain = terrain();
    let mut mask = vec![false; 20]; mask[13] = true; mask[19] = true;
    let rect = SelectionRect { x0: 0, y0: 0, x1: 4, y1: 3, mask: Some(mask) };
    for header in [true, false] {
        let source = grid(0xa5, header);
        let target = grid(0x11, header);
        let (result, copied) = grids::copy(&source, &target, &terrain, &terrain, &rect, [0, 0], header).unwrap();
        assert_eq!(copied, 16); // Border point 19 has no grid cell.
        let start = if header { 16 } else { 0 };
        for y in 0..12 { for x in 0..16 {
            assert_eq!(result[start + y * 16 + x], if x >= 12 && y >= 8 { 0xa5 } else { 0x11 });
        } }
        let invalid = SelectionRect { x1: 5, ..rect.clone() };
        assert!(grids::copy(&source, &target, &terrain, &terrain, &invalid, [0, 0], header).is_err());
        assert!(grids::copy(&source, &target, &terrain, &terrain, &rect, [1, 0], header).is_err());
        assert!(grids::copy(&source[..source.len() - 1], &target, &terrain, &terrain, &rect, [0, 0], header).is_err());
    }
}
