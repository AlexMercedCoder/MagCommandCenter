//! Validated approval state survives renderer reloads while the native runtime owns its streams.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Default)]
pub struct ApprovalState {
    pending: HashMap<String, Value>,
    receipts: Vec<Value>,
    interrupted: Vec<Value>,
}

/// Bounded history so a long session cannot grow the snapshot without limit.
const HISTORY_LIMIT: usize = 100;

fn unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
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
                if self.receipts.len() > HISTORY_LIMIT {
                    self.receipts.remove(0);
                }
            }
        }
    }

    /// Called when a run's process exits. Requests it still owned can never be resolved
    /// by that process, so each one becomes an explicit "interrupted" outcome instead of
    /// silently disappearing. Nothing is approved. Returns how many were interrupted.
    pub fn finish(&mut self, stream: &str, exit_code: Option<i32>) -> usize {
        let mut ids: Vec<String> = self
            .pending
            .iter()
            .filter(|(_, item)| item["streamId"] == stream)
            .map(|(id, _)| id.clone())
            .collect();
        ids.sort();
        let interrupted_at = unix_millis();
        for id in &ids {
            let Some(item) = self.pending.remove(id) else {
                continue;
            };
            let request = &item["envelope"]["request"];
            self.interrupted.push(json!({
                "streamId": stream,
                "requestId": id,
                "actionName": request["action"]["name"],
                "actionSummary": request["action"]["summary"],
                "actionDigest": request["action_digest"],
                "exitCode": exit_code,
                "interruptedAtMs": interrupted_at,
                "outcome": "interrupted",
                "message": "The run ended before a decision reached it. Nothing was approved; start the run again to retry.",
            }));
        }
        if self.interrupted.len() > HISTORY_LIMIT {
            let overflow = self.interrupted.len() - HISTORY_LIMIT;
            self.interrupted.drain(..overflow);
        }
        ids.len()
    }

    pub fn snapshot(&self) -> Value {
        json!({
            "pending": self.pending.values().collect::<Vec<_>>(),
            "receipts": self.receipts,
            "interrupted": self.interrupted,
        })
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
        state.finish("owner", Some(0));
        assert_eq!(state.snapshot()["pending"], json!([]));
    }

    #[test]
    fn exiting_run_turns_its_pending_requests_into_interrupted_outcomes() {
        let fixture: Value =
            serde_json::from_str(include_str!("../tests/fixtures/approval-lifecycle.json"))
                .unwrap();
        let request_id = fixture["request"]["request"]["id"].as_str().unwrap();
        let mut state = ApprovalState::default();
        state.capture("owner", &fixture["request"].to_string());

        assert_eq!(state.finish("other-run", Some(0)), 0);
        assert_eq!(state.snapshot()["pending"].as_array().unwrap().len(), 1);
        assert_eq!(state.snapshot()["interrupted"], json!([]));

        assert_eq!(state.finish("owner", Some(1)), 1);
        let snapshot = state.snapshot();
        assert_eq!(snapshot["pending"], json!([]));
        let interrupted = snapshot["interrupted"].as_array().unwrap();
        assert_eq!(interrupted.len(), 1);
        assert_eq!(interrupted[0]["requestId"], request_id);
        assert_eq!(interrupted[0]["streamId"], "owner");
        assert_eq!(interrupted[0]["outcome"], "interrupted");
        assert_eq!(interrupted[0]["exitCode"], 1);
        assert_eq!(
            interrupted[0]["actionDigest"],
            fixture["request"]["request"]["action_digest"]
        );
        // A late resolution for an interrupted request is not a receipt.
        state.capture("owner", &fixture["resolution"].to_string());
        assert_eq!(state.snapshot()["receipts"], json!([]));
        // Finishing again does not duplicate the outcome.
        assert_eq!(state.finish("owner", None), 0);
        assert_eq!(state.snapshot()["interrupted"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn interrupted_history_is_bounded() {
        let mut state = ApprovalState::default();
        for index in 0..(HISTORY_LIMIT + 5) {
            state.pending.insert(
                format!("req_{index}"),
                json!({"streamId": format!("run_{index}"), "envelope": {"request": {}}}),
            );
            state.finish(&format!("run_{index}"), None);
        }
        let interrupted = state.snapshot()["interrupted"].as_array().unwrap().clone();
        assert_eq!(interrupted.len(), HISTORY_LIMIT);
        assert_eq!(interrupted[0]["requestId"], "req_5");
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
