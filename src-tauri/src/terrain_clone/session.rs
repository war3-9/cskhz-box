#[derive(Clone)]
pub(super) struct MapDocument {
    pub path: std::path::PathBuf,
    pub w3e: Vec<u8>,
    pub saved_w3e: Vec<u8>,
    pub members: std::collections::HashMap<String, Vec<u8>>,
    pub saved_members: std::collections::HashMap<String, Vec<u8>>,
    pub removed_members: std::collections::HashSet<String>,
    pub saved_removed_members: std::collections::HashSet<String>,
    pub history: Vec<MapSnapshot>,
    pub history_base: Option<MapSnapshot>,
    pub history_cursor: usize,
    pub blank: bool,
    pub disk_hash: Option<Vec<u8>>,
    pub normalized_tables: usize,
}

#[derive(Clone)]
pub(super) struct MapSnapshot {
    pub w3e: Vec<u8>,
    pub members: std::collections::HashMap<String, Vec<u8>>,
    pub removed_members: std::collections::HashSet<String>,
}

impl MapDocument {
    pub fn new(path: std::path::PathBuf, w3e: Vec<u8>) -> Self {
        let disk_hash = Self::file_hash(&path).ok();
        Self { path, saved_w3e: w3e.clone(), w3e, members: Default::default(), saved_members: Default::default(), removed_members: Default::default(), saved_removed_members: Default::default(), history: Vec::new(), history_base: None, history_cursor: 0, blank: false, disk_hash, normalized_tables: 0 }
    }

    pub fn file_hash(path: &std::path::Path) -> Result<Vec<u8>, String> {
        use sha2::{Digest, Sha256};
        use std::io::Read;
        let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        let mut digest = Sha256::new(); let mut buffer = vec![0; 1024 * 1024];
        loop { let count = file.read(&mut buffer).map_err(|e| e.to_string())?; if count == 0 { break; } digest.update(&buffer[..count]); }
        Ok(digest.finalize().to_vec())
    }

    pub fn push_history(&mut self) {
        if self.history_base.is_none() {
            self.history_base = Some(MapSnapshot { w3e: self.saved_w3e.clone(), members: self.saved_members.clone(), removed_members: self.saved_removed_members.clone() });
        }
        self.history.truncate(self.history_cursor);
        self.history.push(MapSnapshot { w3e: self.w3e.clone(), members: self.members.clone(), removed_members: self.removed_members.clone() });
        if self.history.len() > 20 {
            self.history_base = Some(self.history.remove(0));
        }
        self.history_cursor = self.history.len();
    }

    pub fn undo(&mut self) {
        if self.history_cursor == 0 { return; }
        self.history_cursor -= 1;
        if self.history_cursor == 0 {
            if let Some(snapshot) = &self.history_base {
                self.w3e = snapshot.w3e.clone();
                self.members = snapshot.members.clone();
                self.removed_members = snapshot.removed_members.clone();
            }
        } else {
            let snapshot = &self.history[self.history_cursor - 1];
            self.w3e = snapshot.w3e.clone();
            self.members = snapshot.members.clone();
            self.removed_members = snapshot.removed_members.clone();
        }
    }

    pub fn mark_saved(&mut self, path: std::path::PathBuf) {
        self.path = path;
        self.saved_w3e = self.w3e.clone();
        self.saved_members = self.members.clone();
        self.saved_removed_members = self.removed_members.clone();
        self.history.clear();
        self.history_base = None;
        self.history_cursor = 0;
        self.blank = false;
        self.disk_hash = Self::file_hash(&self.path).ok();
    }
}

#[cfg(test)]
mod tests {
    use super::MapDocument;
    use std::{collections::HashSet, path::PathBuf};

    #[test]
    fn undo_restores_removed_archive_members_with_the_document_snapshot() {
        let mut doc = MapDocument::new(PathBuf::from("missing-test-map.w3x"), vec![1]);
        doc.members.insert("war3map.imp".into(), vec![2]);
        doc.removed_members.insert("replaceabletextures/cliff/cliff1.blp".into());
        doc.push_history();
        doc.members.insert("war3map.imp".into(), vec![3]);
        doc.removed_members = HashSet::new();
        doc.push_history();
        doc.undo();
        assert_eq!(doc.members.get("war3map.imp"), Some(&vec![2]));
        assert!(doc.removed_members.contains("replaceabletextures/cliff/cliff1.blp"));
        doc.undo();
        assert!(doc.removed_members.is_empty());
    }

    #[test]
    fn retains_exactly_twenty_undo_steps_without_jumping_to_the_saved_map() {
        let mut doc = MapDocument::new(PathBuf::from("missing-test-map.w3x"), vec![0]);
        for step in 1..=25u8 {
            doc.w3e = vec![step];
            doc.members.insert("model.mdx".into(), vec![step]);
            doc.removed_members = HashSet::from([format!("removed-{step}.blp")]);
            doc.push_history();
        }
        assert_eq!(doc.history.len(), 20);
        assert_eq!(doc.history_cursor, 20);
        for expected in (5..25u8).rev() {
            doc.undo();
            assert_eq!(doc.w3e, vec![expected]);
            assert_eq!(doc.members.get("model.mdx"), Some(&vec![expected]));
            assert!(doc.removed_members.contains(&format!("removed-{expected}.blp")));
        }
        doc.undo();
        assert_eq!(doc.w3e, vec![5]);
        doc.w3e = vec![90]; doc.push_history(); doc.undo();
        assert_eq!(doc.w3e, vec![5]);
    }

    #[test]
    fn a_new_operation_after_undo_replaces_the_abandoned_branch() {
        let mut doc = MapDocument::new(PathBuf::from("missing-test-map.w3x"), vec![0]);
        for step in 1..=3u8 { doc.w3e = vec![step]; doc.push_history(); }
        doc.undo(); doc.undo();
        doc.w3e = vec![9]; doc.push_history();
        assert_eq!(doc.history.len(), 2);
        doc.undo(); assert_eq!(doc.w3e, vec![1]);
        doc.undo(); assert_eq!(doc.w3e, vec![0]);
        doc.mark_saved(PathBuf::from("missing-test-map.w3x"));
        assert_eq!(doc.history_cursor, 0); assert!(doc.history_base.is_none());
        doc.w3e = vec![10]; doc.push_history(); doc.undo();
        assert_eq!(doc.w3e, vec![0]);
    }
}

