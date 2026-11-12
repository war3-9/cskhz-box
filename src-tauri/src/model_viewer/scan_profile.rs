use std::time::Instant;

pub struct ScanProfile { started: Instant, mark: Instant, enabled: bool, stages: Vec<(String, u128)> }
impl ScanProfile {
    pub fn new() -> Self { let now = Instant::now(); Self { started: now, mark: now, enabled: std::env::var_os("BOX_VIEWER_PROFILE").is_some(), stages: vec![] } }
    pub fn stage(&mut self, label: &str) { let now = Instant::now(); self.stages.push((label.into(), now.duration_since(self.mark).as_millis())); self.mark = now; }
    pub fn finish(&self, entries: usize, models: usize) { if self.enabled { eprintln!("VIEWER_SCAN {}", serde_json::json!({ "totalMs": self.started.elapsed().as_millis(), "stagesMs": self.stages, "entries": entries, "models": models })); } }
}
