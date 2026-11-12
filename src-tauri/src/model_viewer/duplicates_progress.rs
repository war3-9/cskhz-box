use std::{cell::Cell, time::{Duration, Instant}};
use serde::Serialize;
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
pub struct DuplicateProgress { stage: &'static str, completed: usize, total: usize }
pub(super) struct Progress {
    channel: Option<Channel<DuplicateProgress>>,
    stage: Cell<&'static str>,
    last: Cell<Instant>,
    profile: bool,
}
impl Default for Progress { fn default() -> Self { Self::new(None) } }
impl Progress {
    pub(super) fn new(channel: Option<Channel<DuplicateProgress>>) -> Self { Self { channel, stage: Cell::new(""), last: Cell::new(Instant::now()), profile: std::env::var_os("BOX_DUPLICATE_PROFILE").is_some() } }
    pub(super) fn update(&self, stage: &'static str, completed: usize, total: usize) {
        if self.channel.is_none() && !self.profile { return; }
        if self.profile && (self.stage.get() != stage || completed == total) { eprintln!("DUPLICATE_PROGRESS {stage} {completed}/{total}"); }
        if self.stage.get() != stage || completed == total || self.last.get().elapsed() >= Duration::from_millis(100) {
            self.stage.set(stage); self.last.set(Instant::now());
            if let Some(channel) = &self.channel { let _ = channel.send(DuplicateProgress { stage, completed, total }); }
        }
    }
}
