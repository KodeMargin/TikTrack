use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use keyring::{Entry as KeyringEntry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const PROHIBITED_KEYS: &[&str] = &[
    "keystrokes",
    "key_log",
    "typed_text",
    "password",
    "clipboard",
    "clipboard_text",
    "raw_source_code",
    "file_contents",
    "git_diff_raw",
    "terminal_output",
    "private_message",
    "email_body",
    "chat_transcript",
    "screenshot",
    "screenshot_bytes",
    "screen_recording",
    "webcam_frame",
    "microphone_audio",
    "window_title",
    "window_title_raw",
    "url",
    "full_url_with_query",
    "raw_file_content",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TimerLifecycle {
    Idle,
    Running,
    Paused,
    OnBreak,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineQueueEnvelope {
    pub id: String,
    pub endpoint: String,
    pub payload: serde_json::Value,
    pub created_at_utc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoverySnapshot {
    pub session_id: Option<String>,
    pub project_id: String,
    pub task_id: String,
    pub work_mode: String,
    pub lifecycle: TimerLifecycle,
    pub accumulated_seconds: u64,
    pub break_seconds: u64,
    pub privacy_pause_active: bool,
    pub excluded_apps: Vec<String>,
    pub saved_at_utc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayStatusDto {
    pub session_id: Option<String>,
    pub lifecycle: TimerLifecycle,
    pub work_mode: String,
    pub elapsed_seconds: u64,
    pub break_seconds: u64,
    pub queued_envelopes: usize,
    pub foreground_category: String,
    pub privacy_pause_active: bool,
    pub excluded_apps: Vec<String>,
    pub unobserved_idle_seconds: u64,
    pub needs_idle_reconciliation: bool,
    pub clock_drift_seconds: i64,
    pub multi_display_policy: String,
}

pub struct AgentRuntimeState {
    pub session_id: Option<String>,
    pub project_id: String,
    pub task_id: String,
    pub work_mode: String,
    pub lifecycle: TimerLifecycle,
    pub started_monotonic: Option<Instant>,
    pub started_wall_utc_epoch: Option<i64>,
    pub break_started_monotonic: Option<Instant>,
    pub accumulated_seconds: u64,
    pub break_seconds: u64,
    pub foreground_category: String,
    pub privacy_pause_active: bool,
    pub excluded_apps: Vec<String>,
    pub unobserved_idle_seconds: u64,
    pub offline_queue: Vec<OfflineQueueEnvelope>,
    pub encryption_key: [u8; 32],
    pub data_dir: PathBuf,
}

/// F2-002: Maps foreground process bundle ID or executable name locally to a coarse
/// developer category. Never transmits raw window titles, file paths, or URLs.
pub fn categorize_foreground_app(app_identifier: &str, excluded_apps: &[String], privacy_pause: bool) -> String {
    if privacy_pause {
        return "excluded_private".to_string();
    }
    let lower = app_identifier.to_ascii_lowercase();
    if excluded_apps
        .iter()
        .any(|ex| !ex.trim().is_empty() && lower.contains(&ex.to_ascii_lowercase()))
    {
        return "excluded_private".to_string();
    }
    if lower.contains("vscode")
        || lower.contains("code")
        || lower.contains("cursor")
        || lower.contains("zed")
        || lower.contains("intellij")
        || lower.contains("rustrover")
        || lower.contains("webstorm")
    {
        "ide".to_string()
    } else if lower.contains("iterm")
        || lower.contains("warp")
        || lower.contains("terminal")
        || lower.contains("alacritty")
        || lower.contains("kitty")
    {
        "terminal".to_string()
    } else if lower.contains("chrome")
        || lower.contains("arc")
        || lower.contains("firefox")
        || lower.contains("safari")
        || lower.contains("brave")
    {
        "docs_browser".to_string()
    } else if lower.contains("slack")
        || lower.contains("zoom")
        || lower.contains("teams")
        || lower.contains("discord")
        || lower.contains("meet")
    {
        "communication".to_string()
    } else if lower.contains("figma") || lower.contains("excalidraw") || lower.contains("miro") {
        "design".to_string()
    } else {
        "other".to_string()
    }
}

impl AgentRuntimeState {
    fn current_elapsed_seconds(&self) -> u64 {
        let live = if self.lifecycle == TimerLifecycle::Running {
            self.started_monotonic
                .map(|t| t.elapsed().as_secs())
                .unwrap_or(0)
        } else {
            0
        };
        self.accumulated_seconds + live
    }

    fn current_break_seconds(&self) -> u64 {
        let live = if self.lifecycle == TimerLifecycle::OnBreak {
            self.break_started_monotonic
                .map(|t| t.elapsed().as_secs())
                .unwrap_or(0)
        } else {
            0
        };
        self.break_seconds + live
    }

    /// F2-007: Compares monotonic clock elapsed seconds against system wall-clock delta
    fn current_clock_drift_seconds(&self) -> i64 {
        if let (Some(mono), Some(wall_start)) = (self.started_monotonic, self.started_wall_utc_epoch) {
            let mono_secs = mono.elapsed().as_secs() as i64;
            let wall_secs = Utc::now().timestamp() - wall_start;
            wall_secs - mono_secs
        } else {
            0
        }
    }

    fn build_status_dto(&self) -> TrayStatusDto {
        let is_deep_work = matches!(
            self.work_mode.as_str(),
            "thinking" | "architecture" | "research" | "design" | "meeting"
        );
        let threshold_secs = if is_deep_work { 90 * 60 } else { 15 * 60 };
        TrayStatusDto {
            session_id: self.session_id.clone(),
            lifecycle: self.lifecycle.clone(),
            work_mode: self.work_mode.clone(),
            elapsed_seconds: self.current_elapsed_seconds(),
            break_seconds: self.current_break_seconds(),
            queued_envelopes: self.offline_queue.len(),
            foreground_category: self.foreground_category.clone(),
            privacy_pause_active: self.privacy_pause_active,
            excluded_apps: self.excluded_apps.clone(),
            unobserved_idle_seconds: self.unobserved_idle_seconds,
            needs_idle_reconciliation: self.unobserved_idle_seconds >= threshold_secs,
            clock_drift_seconds: self.current_clock_drift_seconds(),
            multi_display_policy: "coarse_metadata_only".to_string(),
        }
    }

    fn persist_recovery_and_queue(&self) {
        let _ = fs::create_dir_all(&self.data_dir);
        let snapshot = RecoverySnapshot {
            session_id: self.session_id.clone(),
            project_id: self.project_id.clone(),
            task_id: self.task_id.clone(),
            work_mode: self.work_mode.clone(),
            lifecycle: self.lifecycle.clone(),
            accumulated_seconds: self.current_elapsed_seconds(),
            break_seconds: self.current_break_seconds(),
            privacy_pause_active: self.privacy_pause_active,
            excluded_apps: self.excluded_apps.clone(),
            saved_at_utc: Utc::now().to_rfc3339(),
        };
        if let Ok(json) = serde_json::to_vec(&snapshot) {
            let _ = fs::write(self.data_dir.join("tiktrack_recovery.json"), json);
        }
        if let Ok(queue_json) = serde_json::to_vec(&self.offline_queue) {
            if let Ok(encrypted) = encrypt_blob(&self.encryption_key, &queue_json) {
                let _ = fs::write(self.data_dir.join("tiktrack_queue.enc"), encrypted);
            }
        }
    }
}

pub fn sanitize_metadata(
    raw: HashMap<String, serde_json::Value>,
    excluded_apps: &[String],
) -> Result<HashMap<String, serde_json::Value>, String> {
    for key in raw.keys() {
        let lower = key.to_ascii_lowercase();
        if PROHIBITED_KEYS.iter().any(|p| lower.contains(*p)) {
            return Err(format!("DPIA violation: prohibited metadata key '{key}'"));
        }
    }
    if let Some(app_val) = raw.get("app_identifier").and_then(|v| v.as_str()) {
        let lower_app = app_val.to_ascii_lowercase();
        if excluded_apps
            .iter()
            .any(|ex| !ex.trim().is_empty() && lower_app.contains(&ex.to_ascii_lowercase()))
        {
            return Err(format!("Privacy denylist blocked app '{app_val}'"));
        }
    }
    Ok(raw)
}

const KEYRING_SERVICE: &str = "com.tiktrack.desktopagent";
const KEYRING_USER: &str = "offline_queue_encryption_key";

/// Loads the per-device 256-bit AES-GCM key from the OS credential store,
/// or generates a new random key via `OsRng` on first launch and persists it.
fn load_or_create_encryption_key() -> Result<[u8; 32], String> {
    let entry = KeyringEntry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("keyring entry init failed: {e}"))?;

    match entry.get_password() {
        Ok(encoded) => {
            let decoded = BASE64
                .decode(encoded.trim())
                .map_err(|e| format!("invalid base64 encryption key in OS keyring: {e}"))?;
            let key: [u8; 32] = decoded.try_into().map_err(|v: Vec<u8>| {
                format!(
                    "unexpected encryption key length in OS keyring: expected 32 bytes, got {}",
                    v.len()
                )
            })?;
            Ok(key)
        }
        Err(KeyringError::NoEntry) => {
            let mut key = [0u8; 32];
            aes_gcm::aead::rand_core::RngCore::fill_bytes(&mut OsRng, &mut key);
            let encoded = BASE64.encode(key);
            entry
                .set_password(&encoded)
                .map_err(|e| format!("failed to store encryption key in OS keyring: {e}"))?;
            Ok(key)
        }
        Err(e) => Err(format!("failed to read encryption key from OS keyring: {e}")),
    }
}

fn encrypt_blob(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    aes_gcm::aead::rand_core::RngCore::fill_bytes(&mut OsRng, &mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("encrypt failed: {e}"))?;
    let payload = serde_json::json!({
        "nonce": BASE64.encode(nonce_bytes),
        "ciphertext": BASE64.encode(ciphertext)
    });
    serde_json::to_vec(&payload).map_err(|e| e.to_string())
}

fn sync_tray_label(app: &AppHandle, state: &AgentRuntimeState) {
    if let Some(tray) = app.tray_by_id("tiktrack-tray") {
        let title = if state.privacy_pause_active {
            "TikTrack PRIVACY PAUSE".to_string()
        } else {
            match state.lifecycle {
                TimerLifecycle::Running => format!("TikTrack REC ({})", state.work_mode),
                TimerLifecycle::Paused => "TikTrack PAUSED".to_string(),
                TimerLifecycle::OnBreak => "TikTrack BREAK".to_string(),
                TimerLifecycle::Completed => "TikTrack SAVED".to_string(),
                TimerLifecycle::Idle => "TikTrack Idle".to_string(),
            }
        };
        let _ = tray.set_title(Some(&title));
    }
}

#[tauri::command]
fn get_tray_status(state: State<'_, Mutex<AgentRuntimeState>>) -> TrayStatusDto {
    let guard = state.lock().expect("state lock poisoned");
    guard.build_status_dto()
}

#[tauri::command]
fn start_or_transition_session(
    app: AppHandle,
    state: State<'_, Mutex<AgentRuntimeState>>,
    project_id: String,
    task_id: String,
    work_mode: String,
    target_state: TimerLifecycle,
) -> Result<TrayStatusDto, String> {
    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;

    if guard.lifecycle == TimerLifecycle::Running {
        if let Some(started) = guard.started_monotonic.take() {
            guard.accumulated_seconds += started.elapsed().as_secs();
        }
        guard.started_wall_utc_epoch = None;
    }
    if guard.lifecycle == TimerLifecycle::OnBreak {
        if let Some(started) = guard.break_started_monotonic.take() {
            guard.break_seconds += started.elapsed().as_secs();
        }
    }

    guard.project_id = project_id.clone();
    guard.task_id = task_id.clone();
    guard.work_mode = work_mode.clone();

    match target_state {
        TimerLifecycle::Running => {
            if guard.session_id.is_none() || guard.lifecycle == TimerLifecycle::Completed {
                guard.session_id = Some(Uuid::new_v4().to_string());
                guard.accumulated_seconds = 0;
                guard.break_seconds = 0;
            }
            guard.started_monotonic = Some(Instant::now());
            guard.started_wall_utc_epoch = Some(Utc::now().timestamp());
            guard.lifecycle = TimerLifecycle::Running;
        }
        TimerLifecycle::OnBreak => {
            guard.break_started_monotonic = Some(Instant::now());
            guard.lifecycle = TimerLifecycle::OnBreak;
        }
        TimerLifecycle::Paused => {
            guard.lifecycle = TimerLifecycle::Paused;
        }
        TimerLifecycle::Completed => {
            guard.lifecycle = TimerLifecycle::Completed;
        }
        TimerLifecycle::Idle => {
            guard.session_id = None;
            guard.accumulated_seconds = 0;
            guard.break_seconds = 0;
            guard.lifecycle = TimerLifecycle::Idle;
        }
    }

    let safe_meta = sanitize_metadata(
        HashMap::from([
            (
                "client_monotonic_seconds".to_string(),
                serde_json::json!(guard.current_elapsed_seconds()),
            ),
            (
                "work_mode".to_string(),
                serde_json::json!(guard.work_mode.clone()),
            ),
            (
                "foreground_category".to_string(),
                serde_json::json!(guard.foreground_category.clone()),
            ),
        ]),
        &guard.excluded_apps,
    )?;

    let envelope = OfflineQueueEnvelope {
        id: Uuid::new_v4().to_string(),
        endpoint: "/functions/v1/sessions-transition".to_string(),
        payload: serde_json::json!({
            "sessionId": guard.session_id,
            "projectId": project_id,
            "taskId": task_id,
            "state": guard.lifecycle,
            "metadata": safe_meta,
        }),
        created_at_utc: Utc::now().to_rfc3339(),
    };
    guard.offline_queue.push(envelope);

    guard.persist_recovery_and_queue();
    sync_tray_label(&app, &guard);

    Ok(guard.build_status_dto())
}

/// F2-001, F2-002, F2-003, F2-005: Records a coarse 1-minute activity rollup bucket
#[tauri::command]
fn record_activity_bucket(
    state: State<'_, Mutex<AgentRuntimeState>>,
    foreground_app: String,
    has_input_signal: bool,
    idle_seconds: u64,
) -> Result<TrayStatusDto, String> {
    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    let category = categorize_foreground_app(
        &foreground_app,
        &guard.excluded_apps,
        guard.privacy_pause_active,
    );
    guard.foreground_category = if !has_input_signal && idle_seconds >= 900 {
        "unobserved".to_string()
    } else {
        category.clone()
    };
    guard.unobserved_idle_seconds = if has_input_signal { 0 } else { idle_seconds };

    if category != "excluded_private" {
        let event_id = Uuid::new_v4().to_string();
        let batch_id = Uuid::new_v4().to_string();
        let envelope = OfflineQueueEnvelope {
            id: batch_id.clone(),
            endpoint: "/functions/v1/tracking-events-batch".to_string(),
            payload: serde_json::json!({
                "batch_id": batch_id,
                "session_id": guard.session_id,
                "agent_build": "0.2.0",
                "events": [{
                    "event_id": event_id,
                    "schema_version": 1,
                    "source": "desktop",
                    "event_type": "activity_rollup_1m",
                    "occurred_at_utc": Utc::now().to_rfc3339(),
                    "monotonic_elapsed_ms": guard.current_elapsed_seconds() * 1000,
                    "consent_policy_version": "v1.0-2026-11",
                    "metadata": {
                        "app_category": guard.foreground_category,
                        "work_mode": guard.work_mode,
                        "has_input_signal": has_input_signal,
                        "multi_display_policy": "coarse_metadata_only"
                    }
                }]
            }),
            created_at_utc: Utc::now().to_rfc3339(),
        };
        guard.offline_queue.push(envelope);
        guard.persist_recovery_and_queue();
    }

    Ok(guard.build_status_dto())
}

/// F2-004: Return-from-idle reconciliation prompt handler
#[tauri::command]
fn reconcile_idle_gap(
    state: State<'_, Mutex<AgentRuntimeState>>,
    choice: String,
    note: String,
) -> Result<TrayStatusDto, String> {
    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    let reconciled_secs = guard.unobserved_idle_seconds;
    guard.unobserved_idle_seconds = 0;

    let event_id = Uuid::new_v4().to_string();
    let batch_id = Uuid::new_v4().to_string();
    let envelope = OfflineQueueEnvelope {
        id: batch_id.clone(),
        endpoint: "/functions/v1/tracking-events-batch".to_string(),
        payload: serde_json::json!({
            "batch_id": batch_id,
            "session_id": guard.session_id,
            "agent_build": "0.2.0",
            "events": [{
                "event_id": event_id,
                "schema_version": 1,
                "source": "desktop",
                "event_type": "idle_gap_reconciled",
                "occurred_at_utc": Utc::now().to_rfc3339(),
                "monotonic_elapsed_ms": guard.current_elapsed_seconds() * 1000,
                "consent_policy_version": "v1.0-2026-11",
                "metadata": {
                    "reconciled_seconds": reconciled_secs,
                    "reconciliation_choice": choice,
                    "reconciliation_note": note
                }
            }]
        }),
        created_at_utc: Utc::now().to_rfc3339(),
    };
    guard.offline_queue.push(envelope);
    guard.persist_recovery_and_queue();
    Ok(guard.build_status_dto())
}

/// F2-005: Configures per-app privacy exclusions and personal/non-work privacy pause
#[tauri::command]
fn set_privacy_pause_and_denylist(
    app: AppHandle,
    state: State<'_, Mutex<AgentRuntimeState>>,
    privacy_pause_active: bool,
    excluded_apps: Vec<String>,
) -> Result<TrayStatusDto, String> {
    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    guard.privacy_pause_active = privacy_pause_active;
    guard.excluded_apps = excluded_apps;
    if privacy_pause_active {
        guard.foreground_category = "excluded_private".to_string();
    }
    guard.persist_recovery_and_queue();
    sync_tray_label(&app, &guard);
    Ok(guard.build_status_dto())
}

#[tauri::command]
async fn flush_offline_queue(
    state: State<'_, Mutex<AgentRuntimeState>>,
    supabase_url: String,
    bearer_token: String,
) -> Result<usize, String> {
    let envelopes: Vec<OfflineQueueEnvelope> = {
        let guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
        guard.offline_queue.clone()
    };

    if envelopes.is_empty() {
        return Ok(0);
    }

    let client = reqwest::Client::new();
    let mut synced = 0usize;

    for env in &envelopes {
        let url = format!("{}{}", supabase_url.trim_end_matches('/'), env.endpoint);
        let resp = client
            .post(&url)
            .bearer_auth(&bearer_token)
            .json(&env.payload)
            .send()
            .await
            .map_err(|e| format!("network error during batch sync: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("edge sync rejected with status {}", resp.status()));
        }
        synced += 1;
    }

    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    guard.offline_queue.drain(0..synced);
    guard.persist_recovery_and_queue();
    Ok(synced)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("tiktrack-agent"));
            let _ = fs::create_dir_all(&data_dir);

            let encryption_key = load_or_create_encryption_key()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            let recovered: Option<RecoverySnapshot> = fs::read(data_dir.join("tiktrack_recovery.json"))
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok());

            let initial = AgentRuntimeState {
                session_id: recovered.as_ref().and_then(|r| r.session_id.clone()),
                project_id: recovered
                    .as_ref()
                    .map(|r| r.project_id.clone())
                    .unwrap_or_else(|| "proj_core_api".to_string()),
                task_id: recovered
                    .as_ref()
                    .map(|r| r.task_id.clone())
                    .unwrap_or_else(|| "task_101".to_string()),
                work_mode: recovered
                    .as_ref()
                    .map(|r| r.work_mode.clone())
                    .unwrap_or_else(|| "coding".to_string()),
                lifecycle: recovered
                    .as_ref()
                    .map(|r| {
                        if r.lifecycle == TimerLifecycle::Running {
                            TimerLifecycle::Paused
                        } else {
                            r.lifecycle.clone()
                        }
                    })
                    .unwrap_or(TimerLifecycle::Idle),
                started_monotonic: None,
                started_wall_utc_epoch: None,
                break_started_monotonic: None,
                accumulated_seconds: recovered.as_ref().map(|r| r.accumulated_seconds).unwrap_or(0),
                break_seconds: recovered.as_ref().map(|r| r.break_seconds).unwrap_or(0),
                foreground_category: "ide".to_string(),
                privacy_pause_active: recovered
                    .as_ref()
                    .map(|r| r.privacy_pause_active)
                    .unwrap_or(false),
                excluded_apps: recovered
                    .as_ref()
                    .map(|r| r.excluded_apps.clone())
                    .unwrap_or_else(|| vec!["1Password".to_string(), "Signal".to_string()]),
                unobserved_idle_seconds: 0,
                offline_queue: Vec::new(),
                encryption_key,
                data_dir,
            };

            app.manage(Mutex::new(initial));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_tray_status,
            start_or_transition_session,
            record_activity_bucket,
            reconcile_idle_gap,
            set_privacy_pause_and_denylist,
            flush_offline_queue
        ])
        .run(tauri::generate_context!())
        .expect("error while running TikTrack Desktop Agent");
}
