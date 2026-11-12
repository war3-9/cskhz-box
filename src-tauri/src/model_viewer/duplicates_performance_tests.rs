use std::{path::PathBuf, sync::{Arc, atomic::{AtomicBool, Ordering}, mpsc}, thread, time::{Duration, Instant}};
use super::{duplicates, index::Source};

#[test]
#[ignore = "Requires BOX_DUPLICATE_BENCH_MAP pointing to a private test copy"]
fn real_map_duplicate_scan_completes_within_deadline() {
    let path = PathBuf::from(std::env::var_os("BOX_DUPLICATE_BENCH_MAP").expect("private test map is required")).canonicalize().unwrap();
    let source = Source { id: "duplicate-performance".into(), path: path.to_string_lossy().into_owned(), name: "private test".into(), kind: "archive".into(), entries: vec![], complete: false, warning: None, analysis: None };
    let cancel = Arc::new(AtomicBool::new(false));
    let timer_cancel = cancel.clone(); let (done, wait) = mpsc::channel();
    let timer = thread::spawn(move || { if wait.recv_timeout(Duration::from_secs(30)).is_err() { timer_cancel.store(true, Ordering::Relaxed); } });
    let start = Instant::now();
    let result = (|| {
        let snapshot = duplicates::snapshot_with_cancel(&source, &cancel)?;
        eprintln!("DUPLICATE_SNAPSHOT entries={} models={} elapsed_ms={}", snapshot.files.len(), snapshot.source.entries.iter().filter(|entry| entry.model).count(), start.elapsed().as_millis());
        let scan = duplicates::scan_with_cancel(&snapshot, &cancel)?;
        eprintln!("DUPLICATE_COMPLETE models={} textures={} elapsed_ms={}", scan.models.len(), scan.textures.len(), start.elapsed().as_millis());
        Ok::<_, String>(())
    })();
    let _ = done.send(()); timer.join().unwrap();
    assert!(result.is_ok(), "duplicate scan did not complete: {:?}, elapsed={:?}", result.err(), start.elapsed());
}
