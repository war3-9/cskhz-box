use super::*;
use std::sync::atomic::{AtomicU32, Ordering};
static ID: AtomicU32 = AtomicU32::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("test-results/icon-pairs-rust");
        let path = root.join(format!("{}-{}", std::process::id(), ID.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn directory(&self) -> &str { self.0.to_str().unwrap() }
}
impl Drop for Fixture { fn drop(&mut self) { fs::remove_dir_all(&self.0).unwrap(); } }

#[test]
fn creates_exact_directories_and_writes_matching_names() {
    let f = Fixture::new();
    let (a, b) = prepare(f.directory()).unwrap();
    assert!(a.ends_with("ReplaceableTextures/CommandButtons"));
    assert!(b.ends_with("ReplaceableTextures/CommandButtonsDisabled"));
    let output = write_pair(f.directory(), "tb", 1, &[1, 2], &[3, 4]).unwrap().unwrap();
    assert_eq!(output, ["ReplaceableTextures/CommandButtons/BTNtb(1).blp", "ReplaceableTextures/CommandButtonsDisabled/DISBTNtb(1).blp"]);
    assert_eq!(fs::read(f.0.join(&output[0])).unwrap(), [1, 2]);
    assert_eq!(fs::read(f.0.join(&output[1])).unwrap(), [3, 4]);
}
#[test]
fn either_folder_collision_skips_both_and_never_overwrites() {
    let f = Fixture::new();
    let (a, b) = prepare(f.directory()).unwrap();
    fs::write(a.join("BTNtb(1).blp"), [7]).unwrap();
    fs::write(b.join("DISBTNtb(2).blp"), [8]).unwrap();
    assert_eq!(next_sequence(f.directory(), "tb", 1).unwrap(), 3);
    assert_eq!(write_pair(f.directory(), "tb", 1, &[1], &[2]).unwrap(), None);
    assert_eq!(write_pair(f.directory(), "tb", 2, &[1], &[2]).unwrap(), None);
    assert!(!a.join("BTNtb(2).blp").exists());
    assert!(!b.join("DISBTNtb(1).blp").exists());
    assert_eq!(fs::read(a.join("BTNtb(1).blp")).unwrap(), [7]);
    assert_eq!(fs::read(b.join("DISBTNtb(2).blp")).unwrap(), [8]);
}
#[test]
fn rejects_traversal_empty_prefix_and_bad_sequence() {
    let f = Fixture::new();
    for prefix in ["", " ", "../escape", "a\\b", "a:stream", "a*", "a.", "a "] {
        assert!(next_sequence(f.directory(), prefix, 1).is_err());
        assert!(write_pair(f.directory(), prefix, 1, &[], &[]).is_err());
    }
    for sequence in [0, 100001] { assert!(next_sequence(f.directory(), "tb", sequence).is_err()); }
    assert!(prepare("relative").is_err());
}
#[test]
fn directory_file_conflict_is_reported() {
    let f = Fixture::new();
    fs::write(f.0.join("ReplaceableTextures"), [9]).unwrap();
    assert!(prepare(f.directory()).is_err());
    assert_eq!(fs::read(f.0.join("ReplaceableTextures")).unwrap(), [9]);
}
#[test]
fn second_file_write_failure_removes_both_partial_files() {
    let f = Fixture::new();
    let (a, b) = prepare(f.directory()).unwrap();
    let normal = a.join("BTNtb(1).blp");
    let disabled = b.join("DISBTNtb(1).blp");
    let first = create(&normal).unwrap();
    drop(create(&disabled).unwrap());
    let read_only = File::open(&disabled).unwrap();
    assert!(finish_pair(first, read_only, &[1, 2], &[3, 4], &[&normal, &disabled]).is_err());
    assert!(!normal.exists());
    assert!(!disabled.exists());
}
#[test]
fn concurrent_writers_commit_only_one_complete_pair() {
    let f = Fixture::new();
    prepare(f.directory()).unwrap();
    let directory = f.directory().to_string();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
    let threads: Vec<_> = (0..8).map(|i| {
        let directory = directory.clone();
        let barrier = barrier.clone();
        std::thread::spawn(move || { barrier.wait(); (i, write_pair(&directory, "tb", 1, &[i], &[i]).unwrap()) })
    }).collect();
    let outputs: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).filter(|(_, r)| r.is_some()).collect();
    assert_eq!(outputs.len(), 1);
    let (winner, pair) = &outputs[0];
    for path in pair.as_ref().unwrap() { assert_eq!(fs::read(f.0.join(path)).unwrap(), [*winner]); }
}
