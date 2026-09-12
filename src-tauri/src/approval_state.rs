//! Validated approval state survives renderer reloads while the native runtime owns its streams.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Default)]
pub struct ApprovalState {
    pending: HashMap<String, Value>,
    receipts: Vec<Value>,
}

impl ApprovalState {
    pub fn capture(&mut self, stream: &str, line: &str) {
        if line.len() > 2 * 1024 * 1024 {
            return;
        }
        let Ok(envelope) = serde_json::from_str::<agent_approval_interchange::Envelope>(line)
        else {
            return;
        };
        if agent_approval_interchange::validate(&envelope).is_err() {
            return;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return;
        };
        if envelope.event_type == "approval.requested" {
            if let Some(id) = value["request"]["id"].as_str() {
                self.pending
                    .insert(id.to_string(), json!({"streamId":stream,"envelope":value}));
            }
        } else if envelope.event_type == "approval.resolved" {
            let Some(id) = value["resolution"]["request_id"].as_str() else {
                return;
            };
            if let Some(pending) = self.pending.get(id) {
                if pending["streamId"] != stream
                    || pending["envelope"]["request"]["action_digest"]
                        != value["resolution"]["action_digest"]
                {
                    return;
                }
                self.pending.remove(id);
                self.receipts
                    .push(json!({"streamId":stream,"envelope":value}));
                if self.receipts.len() > 100 {
                    self.receipts.remove(0);
                }
            }
        }
    }

    pub fn finish(&mut self, stream: &str) {
        self.pending.retain(|_, item| item["streamId"] != stream);
    }

    pub fn snapshot(&self) -> Value {
        json!({"pending":self.pending.values().collect::<Vec<_>>(),"receipts":self.receipts})
    }
}

pub fn state() -> &'static Mutex<ApprovalState> {
    static STATE: OnceLock<Mutex<ApprovalState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(ApprovalState::default()))
}

#[tauri::command]
pub fn approval_snapshot() -> Result<Value, String> {
    Ok(state()
        .lock()
        .map_err(|_| "approval registry unavailable")?
        .snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_survives_snapshot_until_matching_authority_receipt() {
        let fixture: Value =
            serde_json::from_str(include_str!("../tests/fixtures/approval-lifecycle.json"))
                .unwrap();
        let mut state = ApprovalState::default();
        state.capture("owner", &fixture["request"].to_string());
        assert_eq!(state.snapshot()["pending"].as_array().unwrap().len(), 1);
        state.capture("other", &fixture["resolution"].to_string());
        assert_eq!(state.snapshot()["pending"].as_array().unwrap().len(), 1);
        state.capture("owner", &fixture["resolution"].to_string());
        assert_eq!(state.snapshot()["pending"], json!([]));
        assert_eq!(state.snapshot()["receipts"].as_array().unwrap().len(), 1);
        state.capture("owner", &fixture["resolution"].to_string());
        assert_eq!(state.snapshot()["receipts"].as_array().unwrap().len(), 1);
        state.capture("owner", &fixture["request"].to_string());
        state.finish("owner");
        assert_eq!(state.snapshot()["pending"], json!([]));
    }

    #[test]
    fn malformed_output_cannot_become_an_approval() {
        let mut state = ApprovalState::default();
        state.capture(
            "stream",
            r#"{"aais":"1.0","type":"approval.requested","request":{"id":"fake"}}"#,
        );
        assert_eq!(state.snapshot()["pending"], json!([]));
    }
}
