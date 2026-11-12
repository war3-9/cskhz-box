use super::{entities, tests::fixture, SelectionRect};

fn header(count: i32) -> Vec<u8> {
    let mut bytes = b"W3do".to_vec();
    for value in [8i32, 11, count] { bytes.extend_from_slice(&value.to_le_bytes()); }
    bytes
}

fn unit(random: i32) -> Vec<u8> {
    let mut bytes = header(1);
    let mut record = vec![0; 55];
    for offset in [8, 12] { record[offset..offset + 4].copy_from_slice(&(-4032f32).to_le_bytes()); }
    bytes.extend_from_slice(&record);
    bytes.extend_from_slice(&0i32.to_le_bytes()); // drops
    bytes.extend_from_slice(&[0; 24]);
    bytes.extend_from_slice(&1i32.to_le_bytes()); bytes.extend_from_slice(&[1; 8]); // inventory
    bytes.extend_from_slice(&1i32.to_le_bytes()); bytes.extend_from_slice(&[2; 12]); // abilities
    bytes.extend_from_slice(&random.to_le_bytes());
    match random {
        0 => bytes.extend_from_slice(&[0; 4]),
        1 => bytes.extend_from_slice(&[0; 8]),
        _ => { bytes.extend_from_slice(&1i32.to_le_bytes()); bytes.extend_from_slice(&[3; 8]); }
    }
    bytes.extend_from_slice(&[0; 12]);
    bytes
}

#[test]
fn classic_unit_variants_round_trip_and_copy_with_inventory_and_abilities() {
    let terrain = fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let rect = SelectionRect { x0: 0, y0: 0, x1: 1, y1: 1, mask: None };
    for random in 0..=2 {
        let bytes = unit(random);
        assert_eq!(entities::round_trip(&bytes, true).unwrap(), bytes);
        let (copy, count) = entities::copy(&bytes, &header(0), &terrain, &terrain, &rect, [2, 2], true).unwrap();
        assert_eq!(count, 1);
        assert_eq!(entities::round_trip(&copy, true).unwrap(), copy);
        assert_eq!(f32::from_le_bytes(copy[24..28].try_into().unwrap()), -3776.0);
    }
}

#[test]
fn special_doodads_are_translated_and_unknown_or_truncated_tails_are_rejected() {
    let terrain = fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let mut bytes = header(0);
    bytes.extend_from_slice(&[0; 4]); bytes.extend_from_slice(&1i32.to_le_bytes());
    bytes.extend_from_slice(b"LTbr"); bytes.extend_from_slice(&[0; 4]);
    bytes.extend_from_slice(&1u32.to_le_bytes()); bytes.extend_from_slice(&1u32.to_le_bytes());
    assert_eq!(entities::round_trip(&bytes, false).unwrap(), bytes);
    let mut empty = header(0); empty.extend_from_slice(&[0; 8]);
    let rect = SelectionRect { x0: 0, y0: 0, x1: 1, y1: 1, mask: None };
    let (copy, count) = entities::copy(&bytes, &empty, &terrain, &terrain, &rect, [2, 2], false).unwrap();
    assert_eq!(count, 1);
    assert_eq!(entities::markers(&copy, &super::w3e::parse(&terrain).unwrap()).unwrap(), vec![[3.0, 3.0]]);
    let mut extra = bytes.clone(); extra.push(1);
    assert!(entities::round_trip(&extra, false).is_err());
    assert!(entities::round_trip(&bytes[..bytes.len() - 1], false).is_err());
}

#[test]
fn masked_copy_preserves_target_entities_in_mask_holes() {
    let terrain = fixture(5, 5, &[*b"Ldrt"], &[*b"CLdi"], 2);
    let mut mask = vec![false; 25]; mask[1] = true;
    let rect = SelectionRect { x0: 0, y0: 0, x1: 1, y1: 1, mask: Some(mask) };
    let bytes = unit(0);
    let (copy, count) = entities::copy(&header(0), &bytes, &terrain, &terrain, &rect, [0, 0], true).unwrap();
    assert_eq!(count, 0); assert_eq!(copy, bytes);
}

#[test]
fn real_user_map_doodads_round_trip_and_copy_without_losing_the_special_section() {
    let Ok(directory) = std::env::var("TERRAIN_ENTITY_FIXTURES") else { return; };
    for number in 1..=3 {
        let root = std::path::Path::new(&directory);
        let bytes = std::fs::read(root.join(format!("{number}-war3map.doo"))).unwrap();
        let terrain = std::fs::read(root.join(format!("{number}-war3map.w3e"))).unwrap();
        assert_eq!(entities::round_trip(&bytes, false).unwrap(), bytes);
        let map = super::w3e::parse(&terrain).unwrap();
        let points = entities::markers(&bytes, &map).unwrap();
        assert_eq!(points.len(), 987);
        let rect = SelectionRect { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1, mask: None };
        let (copy, count) = entities::copy(&bytes, &bytes, &terrain, &terrain, &rect, [0, 0], false).unwrap();
        assert_eq!(count, 987);
        assert_eq!(entities::markers(&copy, &map).unwrap(), points);
        assert_eq!(entities::round_trip(&copy, false).unwrap(), copy);
    }
}
