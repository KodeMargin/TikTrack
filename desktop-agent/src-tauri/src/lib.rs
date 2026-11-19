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

const DEFAULT_SERVER_URL: &str = "https://tiktrack-portal.vercel.app";
const AGENT_VERSION: &str = "0.3.0";

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
pub struct AgentAuthSession {
    pub server_url: String,
    pub access_token: String,
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub role: String,
    pub status: String,
    pub must_change_password: bool,
    pub tenant_id: String,
    pub tenant_name: String,
    pub device_id: Option<String>,
    pub pairing_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentAuthPublicDto {
    pub server_url: String,
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub role: String,
    pub status: String,
    pub must_change_password: bool,
    pub tenant_id: String,
    pub tenant_name: String,
    pub pairing_token: Option<String>,
}

impl From<&AgentAuthSession> for AgentAuthPublicDto {
    fn from(s: &AgentAuthSession) -> Self {
        Self {
            server_url: s.server_url.clone(),
            user_id: s.user_id.clone(),
            email: s.email.clone(),
            name: s.name.clone(),
            role: s.role.clone(),
            status: s.status.clone(),
            must_change_password: s.must_change_password,
            tenant_id: s.tenant_id.clone(),
            tenant_name: s.tenant_name.clone(),
            pairing_token: s.pairing_token.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignedTaskDto {
    pub id: String,
    pub project_id: String,
    pub project_code: String,
    pub project_name: String,
    pub code: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub estimate_minutes: i32,
    pub default_work_mode: String,
    pub due_date: Option<String>,
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
    pub session_started_at_utc: Option<String>,
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
    pub project_id: String,
    pub task_id: String,
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
    pub auth: Option<AgentAuthPublicDto>,
    pub assigned_tasks: Vec<AssignedTaskDto>,
    pub is_online: bool,
    pub last_sync_at_utc: Option<String>,
    pub last_sync_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitSessionResultDto {
    pub synced_online: bool,
    pub message: String,
    pub status: TrayStatusDto,
}

pub struct AgentRuntimeState {
    pub session_id: Option<String>,
    pub session_started_at_utc: Option<String>,
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
    pub auth: Option<AgentAuthSession>,
    pub assigned_tasks: Vec<AssignedTaskDto>,
    pub is_online: bool,
    pub last_sync_at_utc: Option<String>,
    pub last_sync_error: Option<String>,
    pub encryption_key: [u8; 32],
    pub data_dir: PathBuf,
}

/// F2-002: Maps foreground process bundle ID or executable name locally to a coarse
/// developer category. Never transmits raw window titles, file paths, or URLs.
pub fn categorize_foreground_app(
    app_identifier: &str,
    excluded_apps: &[String],
    privacy_pause: bool,
) -> String {
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

    fn current_clock_drift_seconds(&self) -> i64 {
        if let (Some(mono), Some(wall_start)) =
            (self.started_monotonic, self.started_wall_utc_epoch)
        {
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
            project_id: self.project_id.clone(),
            task_id: self.task_id.clone(),
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
            auth: self.auth.as_ref().map(AgentAuthPublicDto::from),
            assigned_tasks: self.assigned_tasks.clone(),
            is_online: self.is_online,
            last_sync_at_utc: self.last_sync_at_utc.clone(),
            last_sync_error: self.last_sync_error.clone(),
        }
    }

    fn persist_recovery_and_queue(&self) {
        let _ = fs::create_dir_all(&self.data_dir);
        let snapshot = RecoverySnapshot {
            session_id: self.session_id.clone(),
            session_started_at_utc: self.session_started_at_utc.clone(),
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

    fn persist_auth(&self) {
        let _ = fs::create_dir_all(&self.data_dir);
        let auth_path = self.data_dir.join("tiktrack_auth.enc");
        match &self.auth {
            Some(session) => {
                if let Ok(raw) = serde_json::to_vec(session) {
                    if let Ok(encrypted) = encrypt_blob(&self.encryption_key, &raw) {
                        let _ = fs::write(auth_path, encrypted);
                    }
                }
            }
            None => {
                let _ = fs::remove_file(auth_path);
            }
        }
    }

    fn persist_tasks_cache(&self) {
        let _ = fs::create_dir_all(&self.data_dir);
        let tasks_path = self.data_dir.join("tiktrack_tasks.json");
        if let Ok(raw) = serde_json::to_vec(&self.assigned_tasks) {
            let _ = fs::write(tasks_path, raw);
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

fn decrypt_blob(key: &[u8; 32], encrypted_json: &[u8]) -> Result<Vec<u8>, String> {
    let parsed: serde_json::Value =
        serde_json::from_slice(encrypted_json).map_err(|e| e.to_string())?;
    let nonce_b64 = parsed
        .get("nonce")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing nonce".to_string())?;
    let cipher_b64 = parsed
        .get("ciphertext")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing ciphertext".to_string())?;
    let nonce_bytes = BASE64.decode(nonce_b64).map_err(|e| e.to_string())?;
    if nonce_bytes.len() != 12 {
        return Err("invalid nonce length".to_string());
    }
    let ciphertext = BASE64.decode(cipher_b64).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("decrypt failed: {e}"))
}

fn current_os_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

fn normalize_server_url(input: &str) -> String {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        DEFAULT_SERVER_URL.to_string()
    } else {
        trimmed.to_string()
    }
}

fn sync_tray_label(app: &AppHandle, state: &AgentRuntimeState) {
    if let Some(tray) = app.tray_by_id("tiktrack-tray") {
        let title = if state.auth.is_none() {
            "TikTrack Sign In".to_string()
        } else if state.privacy_pause_active {
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

async fn fetch_tasks_remote(
    server_url: &str,
    tenant_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Vec<AssignedTaskDto>, String> {
    let url = format!(
        "{}/api/prisma/desktop/tasks?tenantId={}&userId={}",
        server_url.trim_end_matches('/'),
        tenant_id,
        user_id
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("offline: {e}"))?;

    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("invalid tasks response: {e}"))?;

    if !status.is_success() || !body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        let msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Failed to load assigned tasks.");
        return Err(msg.to_string());
    }

    let tasks: Vec<AssignedTaskDto> = serde_json::from_value(
        body.get("tasks")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
    )
    .map_err(|e| format!("failed to parse tasks: {e}"))?;

    Ok(tasks)
}

#[tauri::command]
fn get_tray_status(state: State<'_, Mutex<AgentRuntimeState>>) -> TrayStatusDto {
    let guard = state.lock().expect("state lock poisoned");
    guard.build_status_dto()
}

#[tauri::command]
async fn login_with_password(
    app: AppHandle,
    state: State<'_, Mutex<AgentRuntimeState>>,
    server_url: String,
    email: String,
    password: String,
) -> Result<TrayStatusDto, String> {
    let base = normalize_server_url(&server_url);
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{base}/api/prisma/desktop/auth"))
        .json(&serde_json::json!({
            "mode": "password",
            "email": email.trim(),
            "password": password,
            "osPlatform": current_os_platform(),
            "agentVersion": AGENT_VERSION,
        }))
        .send()
        .await
        .map_err(|e| format!("Could not reach TikTrack server ({base}): {e}"))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid server response: {e}"))?;

    if !body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Sign-in failed.");
        return Err(err.to_string());
    }

    let session = AgentAuthSession {
        server_url: base.clone(),
        access_token: body["accessToken"].as_str().unwrap_or_default().to_string(),
        user_id: body["user"]["id"].as_str().unwrap_or_default().to_string(),
        email: body["user"]["email"].as_str().unwrap_or_default().to_string(),
        name: body["user"]["name"].as_str().unwrap_or_default().to_string(),
        role: body["user"]["role"].as_str().unwrap_or("developer").to_string(),
        status: body["user"]["status"].as_str().unwrap_or("active").to_string(),
        must_change_password: body["user"]["mustChangePassword"]
            .as_bool()
            .unwrap_or(false),
        tenant_id: body["tenant"]["id"].as_str().unwrap_or_default().to_string(),
        tenant_name: body["tenant"]["name"]
            .as_str()
            .unwrap_or("TikTrack Workspace")
            .to_string(),
        device_id: body["deviceId"].as_str().map(|s| s.to_string()),
        pairing_token: body["pairingToken"].as_str().map(|s| s.to_string()),
    };

    let tasks = if session.status == "active" && !session.must_change_password {
        fetch_tasks_remote(
            &session.server_url,
            &session.tenant_id,
            &session.user_id,
            &session.access_token,
        )
        .await
        .unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    guard.auth = Some(session);
    guard.assigned_tasks = tasks;
    guard.is_online = true;
    guard.last_sync_at_utc = Some(Utc::now().to_rfc3339());
    guard.last_sync_error = None;
    if guard.task_id.is_empty() {
        if let Some((task_id, project_id, work_mode)) = guard
            .assigned_tasks
            .first()
            .map(|first| (first.id.clone(), first.project_id.clone(), first.default_work_mode.clone()))
        {
            guard.task_id = task_id;
            guard.project_id = project_id;
            guard.work_mode = work_mode;
        }
    }
    guard.persist_auth();
    guard.persist_tasks_cache();
    guard.persist_recovery_and_queue();
    sync_tray_label(&app, &guard);

    Ok(guard.build_status_dto())
}

#[tauri::command]
async fn login_with_pairing_token(
    app: AppHandle,
    state: State<'_, Mutex<AgentRuntimeState>>,
    server_url: String,
    token: String,
) -> Result<TrayStatusDto, String> {
    let base = normalize_server_url(&server_url);
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{base}/api/prisma/desktop/auth"))
        .json(&serde_json::json!({
            "mode": "pairing_token",
            "token": token.trim(),
            "osPlatform": current_os_platform(),
            "agentVersion": AGENT_VERSION,
        }))
        .send()
        .await
        .map_err(|e| format!("Could not reach TikTrack server ({base}): {e}"))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid server response: {e}"))?;

    if !body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Device pairing failed.");
        return Err(err.to_string());
    }

    let session = AgentAuthSession {
        server_url: base.clone(),
        access_token: body["accessToken"].as_str().unwrap_or_default().to_string(),
        user_id: body["user"]["id"].as_str().unwrap_or_default().to_string(),
        email: body["user"]["email"].as_str().unwrap_or_default().to_string(),
        name: body["user"]["name"].as_str().unwrap_or_default().to_string(),
        role: body["user"]["role"].as_str().unwrap_or("developer").to_string(),
        status: body["user"]["status"].as_str().unwrap_or("active").to_string(),
        must_change_password: body["user"]["mustChangePassword"]
            .as_bool()
            .unwrap_or(false),
        tenant_id: body["tenant"]["id"].as_str().unwrap_or_default().to_string(),
        tenant_name: body["tenant"]["name"]
            .as_str()
            .unwrap_or("TikTrack Workspace")
            .to_string(),
        device_id: body["deviceId"].as_str().map(|s| s.to_string()),
        pairing_token: body["pairingToken"].as_str().map(|s| s.to_string()),
    };

    let tasks = fetch_tasks_remote(
        &session.server_url,
        &session.tenant_id,
        &session.user_id,
        &session.access_token,
    )
    .await
    .unwrap_or_default();

    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    guard.auth = Some(session);
    guard.assigned_tasks = tasks;
    guard.is_online = true;
    guard.last_sync_at_utc = Some(Utc::now().to_rfc3339());
    guard.last_sync_error = None;
    if let Some((task_id, project_id, work_mode)) = guard
        .assigned_tasks
        .first()
        .map(|first| (first.id.clone(), first.project_id.clone(), first.default_work_mode.clone()))
    {
        guard.task_id = task_id;
        guard.project_id = project_id;
        guard.work_mode = work_mode;
    }
    guard.persist_auth();
    guard.persist_tasks_cache();
    guard.persist_recovery_and_queue();
    sync_tray_label(&app, &guard);

    Ok(guard.build_status_dto())
}

#[tauri::command]
async fn activate_invited_password(
    app: AppHandle,
    state: State<'_, Mutex<AgentRuntimeState>>,
    new_password: String,
) -> Result<TrayStatusDto, String> {
    let auth_snap = {
        let guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
        guard
            .auth
            .clone()
            .ok_or_else(|| "Not signed in.".to_string())?
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(format!(
            "{}/api/prisma/desktop/activate-password",
            auth_snap.server_url.trim_end_matches('/')
        ))
        .json(&serde_json::json!({
            "tenantId": auth_snap.tenant_id,
            "userId": auth_snap.user_id,
            "newPassword": new_password,
            "accessToken": auth_snap.access_token,
        }))
        .send()
        .await
        .map_err(|e| format!("Network error during activation: {e}"))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid activation response: {e}"))?;

    if !body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        let err = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Password activation failed.");
        return Err(err.to_string());
    }

    let tasks = fetch_tasks_remote(
        &auth_snap.server_url,
        &auth_snap.tenant_id,
        &auth_snap.user_id,
        &auth_snap.access_token,
    )
    .await
    .unwrap_or_default();

    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    if let Some(auth) = guard.auth.as_mut() {
        auth.status = "active".to_string();
        auth.must_change_password = false;
    }
    guard.assigned_tasks = tasks;
    guard.is_online = true;
    guard.last_sync_at_utc = Some(Utc::now().to_rfc3339());
    guard.last_sync_error = None;
    guard.persist_auth();
    guard.persist_tasks_cache();
    sync_tray_label(&app, &guard);

    Ok(guard.build_status_dto())
}

#[tauri::command]
fn logout_agent(
    app: AppHandle,
    state: State<'_, Mutex<AgentRuntimeState>>,
) -> Result<TrayStatusDto, String> {
    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    guard.auth = None;
    guard.assigned_tasks.clear();
    guard.session_id = None;
    guard.session_started_at_utc = None;
    guard.project_id.clear();
    guard.task_id.clear();
    guard.lifecycle = TimerLifecycle::Idle;
    guard.started_monotonic = None;
    guard.started_wall_utc_epoch = None;
    guard.break_started_monotonic = None;
    guard.accumulated_seconds = 0;
    guard.break_seconds = 0;
    guard.persist_auth();
    guard.persist_tasks_cache();
    guard.persist_recovery_and_queue();
    sync_tray_label(&app, &guard);
    Ok(guard.build_status_dto())
}

#[tauri::command]
async fn fetch_assigned_tasks(
    state: State<'_, Mutex<AgentRuntimeState>>,
) -> Result<TrayStatusDto, String> {
    let auth_snap = {
        let guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
        guard
            .auth
            .clone()
            .ok_or_else(|| "Sign in first to load assigned tasks.".to_string())?
    };

    if auth_snap.status != "active" || auth_snap.must_change_password {
        return Err("Change your temporary password to activate your profile first.".to_string());
    }

    match fetch_tasks_remote(
        &auth_snap.server_url,
        &auth_snap.tenant_id,
        &auth_snap.user_id,
        &auth_snap.access_token,
    )
    .await
    {
        Ok(tasks) => {
            let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
            guard.assigned_tasks = tasks;
            guard.is_online = true;
            guard.last_sync_at_utc = Some(Utc::now().to_rfc3339());
            guard.last_sync_error = None;
            // Ensure selected task is still valid
            let still_exists = guard.assigned_tasks.iter().any(|t| t.id == guard.task_id);
            if !still_exists && guard.lifecycle == TimerLifecycle::Idle {
                if let Some((task_id, project_id, work_mode)) = guard
                    .assigned_tasks
                    .first()
                    .map(|first| (first.id.clone(), first.project_id.clone(), first.default_work_mode.clone()))
                {
                    guard.task_id = task_id;
                    guard.project_id = project_id;
                    guard.work_mode = work_mode;
                } else {
                    guard.task_id.clear();
                    guard.project_id.clear();
                }
            }
            guard.persist_tasks_cache();
            Ok(guard.build_status_dto())
        }
        Err(err) => {
            let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
            guard.is_online = false;
            guard.last_sync_error = Some(err);
            Ok(guard.build_status_dto())
        }
    }
}

#[tauri::command]
fn select_task(
    state: State<'_, Mutex<AgentRuntimeState>>,
    project_id: String,
    task_id: String,
    work_mode: Option<String>,
) -> Result<TrayStatusDto, String> {
    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    if guard.lifecycle == TimerLifecycle::Running {
        return Err("Pause or submit your current session before switching tasks.".to_string());
    }
    guard.project_id = project_id;
    guard.task_id = task_id;
    if let Some(mode) = work_mode {
        if !mode.trim().is_empty() {
            guard.work_mode = mode;
        }
    }
    guard.persist_recovery_and_queue();
    Ok(guard.build_status_dto())
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

    let auth = guard
        .auth
        .as_ref()
        .ok_or_else(|| "Please sign in before starting the timer.".to_string())?;
    if auth.status != "active" || auth.must_change_password {
        return Err(
            "Your profile is not active yet. Change your temporary password first.".to_string(),
        );
    }

    if target_state == TimerLifecycle::Running {
        if task_id.trim().is_empty() || project_id.trim().is_empty() {
            return Err("Select an assigned task before starting the timer.".to_string());
        }
        let assigned = guard.assigned_tasks.iter().any(|t| t.id == task_id);
        if !assigned {
            return Err("Selected task is not assigned to your account.".to_string());
        }
    }

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

    if !project_id.trim().is_empty() {
        guard.project_id = project_id.clone();
    }
    if !task_id.trim().is_empty() {
        guard.task_id = task_id.clone();
    }
    guard.work_mode = work_mode.clone();

    match target_state {
        TimerLifecycle::Running => {
            if guard.session_id.is_none() || guard.lifecycle == TimerLifecycle::Completed {
                guard.session_id = Some(Uuid::new_v4().to_string());
                guard.session_started_at_utc = Some(Utc::now().to_rfc3339());
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
            guard.session_started_at_utc = None;
            guard.accumulated_seconds = 0;
            guard.break_seconds = 0;
            guard.lifecycle = TimerLifecycle::Idle;
        }
    }

    let _ = sanitize_metadata(
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

    guard.persist_recovery_and_queue();
    sync_tray_label(&app, &guard);

    Ok(guard.build_status_dto())
}

#[tauri::command]
async fn submit_completed_session(
    app: AppHandle,
    state: State<'_, Mutex<AgentRuntimeState>>,
    developer_note: String,
    mark_task_for_review: bool,
    submit_timesheet: bool,
) -> Result<SubmitSessionResultDto, String> {
    let (auth_snap, envelope) = {
        let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
        let auth = guard
            .auth
            .clone()
            .ok_or_else(|| "Please sign in first.".to_string())?;

        if auth.status != "active" || auth.must_change_password {
            return Err("Profile is not active yet.".to_string());
        }
        if guard.task_id.trim().is_empty() || guard.project_id.trim().is_empty() {
            return Err("No assigned task selected.".to_string());
        }

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

        let elapsed_secs = guard.current_elapsed_seconds();
        if elapsed_secs == 0 {
            return Err("Start the timer before submitting a session.".to_string());
        }

        let break_secs = guard.current_break_seconds();
        let ended_at_utc = Utc::now().to_rfc3339();
        let started_at_utc = guard
            .session_started_at_utc
            .clone()
            .unwrap_or_else(|| ended_at_utc.clone());

        let env = OfflineQueueEnvelope {
            id: Uuid::new_v4().to_string(),
            endpoint: "/api/prisma/desktop/sessions/submit".to_string(),
            payload: serde_json::json!({
                "tenantId": auth.tenant_id,
                "userId": auth.user_id,
                "projectId": guard.project_id,
                "taskId": guard.task_id,
                "deviceId": auth.device_id,
                "workMode": guard.work_mode,
                "startedAtUtc": started_at_utc,
                "endedAtUtc": ended_at_utc,
                "elapsedSeconds": elapsed_secs,
                "breakSeconds": break_secs,
                "developerNote": developer_note,
                "markTaskForReview": mark_task_for_review,
                "submitTimesheet": submit_timesheet,
            }),
            created_at_utc: ended_at_utc,
        };

        guard.offline_queue.push(env.clone());
        guard.lifecycle = TimerLifecycle::Completed;
        guard.session_id = None;
        guard.session_started_at_utc = None;
        guard.accumulated_seconds = 0;
        guard.break_seconds = 0;
        guard.persist_recovery_and_queue();
        sync_tray_label(&app, &guard);

        (auth, env)
    };

    // Immediately attempt online submission
    let url = format!(
        "{}{}",
        auth_snap.server_url.trim_end_matches('/'),
        envelope.endpoint
    );
    let client = reqwest::Client::new();
    match client
        .post(&url)
        .bearer_auth(&auth_snap.access_token)
        .json(&envelope.payload)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let refreshed = fetch_tasks_remote(
                &auth_snap.server_url,
                &auth_snap.tenant_id,
                &auth_snap.user_id,
                &auth_snap.access_token,
            )
            .await
            .ok();

            let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
            guard.offline_queue.retain(|e| e.id != envelope.id);
            guard.is_online = true;
            guard.last_sync_at_utc = Some(Utc::now().to_rfc3339());
            guard.last_sync_error = None;
            if let Some(tasks) = refreshed {
                guard.assigned_tasks = tasks;
                guard.persist_tasks_cache();
            }
            guard.persist_recovery_and_queue();
            Ok(SubmitSessionResultDto {
                synced_online: true,
                message: if mark_task_for_review {
                    "Session submitted & task marked Ready for Review!".to_string()
                } else {
                    "Session submitted to TikTrack workspace!".to_string()
                },
                status: guard.build_status_dto(),
            })
        }
        Ok(resp) => {
            let status_code = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
            guard.last_sync_error = Some(format!("Server returned {status_code}: {err_text}"));
            guard.persist_recovery_and_queue();
            Ok(SubmitSessionResultDto {
                synced_online: false,
                message: format!(
                    "Saved in encrypted offline queue (server {status_code}). Will retry on sync."
                ),
                status: guard.build_status_dto(),
            })
        }
        Err(e) => {
            let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
            guard.is_online = false;
            guard.last_sync_error = Some(format!("Offline: {e}"));
            guard.persist_recovery_and_queue();
            Ok(SubmitSessionResultDto {
                synced_online: false,
                message: "Offline mode: session saved in encrypted queue and will auto-sync when back online.".to_string(),
                status: guard.build_status_dto(),
            })
        }
    }
}

#[tauri::command]
async fn sync_offline_queue(
    state: State<'_, Mutex<AgentRuntimeState>>,
) -> Result<TrayStatusDto, String> {
    let (auth_snap, envelopes) = {
        let guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
        let auth = guard
            .auth
            .clone()
            .ok_or_else(|| "Sign in first to sync.".to_string())?;
        (auth, guard.offline_queue.clone())
    };

    if envelopes.is_empty() {
        // Still refresh tasks / connectivity status
        return fetch_assigned_tasks(state).await;
    }

    let client = reqwest::Client::new();
    let mut synced_ids: Vec<String> = Vec::new();
    let mut sync_err: Option<String> = None;

    for env in &envelopes {
        let url = format!(
            "{}{}",
            auth_snap.server_url.trim_end_matches('/'),
            env.endpoint
        );
        match client
            .post(&url)
            .bearer_auth(&auth_snap.access_token)
            .json(&env.payload)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                synced_ids.push(env.id.clone());
            }
            Ok(resp) => {
                sync_err = Some(format!("Sync rejected ({})", resp.status()));
                break;
            }
            Err(e) => {
                sync_err = Some(format!("Offline: {e}"));
                break;
            }
        }
    }

    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    if !synced_ids.is_empty() {
        guard
            .offline_queue
            .retain(|e| !synced_ids.iter().any(|id| id == &e.id));
    }
    if sync_err.is_none() {
        guard.is_online = true;
        guard.last_sync_at_utc = Some(Utc::now().to_rfc3339());
        guard.last_sync_error = None;
    } else {
        guard.is_online = false;
        guard.last_sync_error = sync_err;
    }
    guard.persist_recovery_and_queue();
    Ok(guard.build_status_dto())
}

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
        category
    };
    guard.unobserved_idle_seconds = if has_input_signal { 0 } else { idle_seconds };
    guard.persist_recovery_and_queue();
    Ok(guard.build_status_dto())
}

#[tauri::command]
fn reconcile_idle_gap(
    state: State<'_, Mutex<AgentRuntimeState>>,
    choice: String,
    note: String,
) -> Result<TrayStatusDto, String> {
    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;
    let _reconciled_secs = guard.unobserved_idle_seconds;
    let _ = (choice, note);
    guard.unobserved_idle_seconds = 0;
    guard.foreground_category = "ide".to_string();
    guard.persist_recovery_and_queue();
    Ok(guard.build_status_dto())
}

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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_local_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("tiktrack-agent"));
            let _ = fs::create_dir_all(&data_dir);

            let encryption_key = load_or_create_encryption_key()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            let recovered: Option<RecoverySnapshot> =
                fs::read(data_dir.join("tiktrack_recovery.json"))
                    .ok()
                    .and_then(|bytes| serde_json::from_slice(&bytes).ok());

            let restored_auth: Option<AgentAuthSession> =
                fs::read(data_dir.join("tiktrack_auth.enc"))
                    .ok()
                    .and_then(|bytes| decrypt_blob(&encryption_key, &bytes).ok())
                    .and_then(|plain| serde_json::from_slice(&plain).ok());

            let restored_queue: Vec<OfflineQueueEnvelope> =
                fs::read(data_dir.join("tiktrack_queue.enc"))
                    .ok()
                    .and_then(|bytes| decrypt_blob(&encryption_key, &bytes).ok())
                    .and_then(|plain| serde_json::from_slice(&plain).ok())
                    .unwrap_or_default();

            let restored_tasks: Vec<AssignedTaskDto> =
                fs::read(data_dir.join("tiktrack_tasks.json"))
                    .ok()
                    .and_then(|bytes| serde_json::from_slice(&bytes).ok())
                    .unwrap_or_default();

            let initial = AgentRuntimeState {
                session_id: recovered.as_ref().and_then(|r| r.session_id.clone()),
                session_started_at_utc: recovered
                    .as_ref()
                    .and_then(|r| r.session_started_at_utc.clone()),
                project_id: recovered
                    .as_ref()
                    .map(|r| r.project_id.clone())
                    .unwrap_or_default(),
                task_id: recovered
                    .as_ref()
                    .map(|r| r.task_id.clone())
                    .unwrap_or_default(),
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
                accumulated_seconds: recovered
                    .as_ref()
                    .map(|r| r.accumulated_seconds)
                    .unwrap_or(0),
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
                offline_queue: restored_queue,
                auth: restored_auth,
                assigned_tasks: restored_tasks,
                is_online: true,
                last_sync_at_utc: None,
                last_sync_error: None,
                encryption_key,
                data_dir,
            };

            app.manage(Mutex::new(initial));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_tray_status,
            login_with_password,
            login_with_pairing_token,
            activate_invited_password,
            logout_agent,
            fetch_assigned_tasks,
            select_task,
            start_or_transition_session,
            submit_completed_session,
            sync_offline_queue,
            record_activity_bucket,
            reconcile_idle_gap,
            set_privacy_pause_and_denylist,
            flush_offline_queue
        ])
        .run(tauri::generate_context!())
        .expect("error while running TikTrack Desktop Agent");
}
