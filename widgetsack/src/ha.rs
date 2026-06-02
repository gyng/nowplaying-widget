//! Home Assistant proxy source (Phase 8c). The first non-system telemetry source and the
//! worked example of the plugin API's Rust half.
//!
//! HA is a *proxy* source: the long-lived access token and the WebSocket both live here,
//! server-side (`plugins/ha.json` in the app config dir) — the token NEVER crosses the
//! bridge (the more-secure model, locked 2026-06-02). Entity state is forwarded to the
//! webview over the EXISTING `telemetry` event as `ha.<entity_id>` samples, so the
//! unchanged frontend hub ingests it like any other sensor (`SensorValue::Json` always;
//! plus `ha.<entity_id>.state` `Scalar` when the state parses as a number). Control
//! (`ha_call_service`) and the entity catalog (`list_ha_entities`) go over REST so the
//! WS task stays read-only and each command is self-contained.
//!
//! Like `listener.rs`/`sensors.rs` this is an outer-ring adapter: raw HA JSON is wrapped
//! into the project's own `SensorSample`/`SensorValue` at the edge, and the pure seams
//! (`ws_url_from`, `state_to_samples`, `entity_from_state`) are unit-tested without I/O.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::async_runtime::{JoinHandle, Mutex};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio_tungstenite::tungstenite::{Error as WsError, Message};
use tokio_tungstenite::{connect_async, connect_async_tls_with_config, Connector};

use crate::sensors::{SensorSample, SensorValue, TELEMETRY_EVENT};

type BoxErr = Box<dyn std::error::Error + Send + Sync>;

/// Server-side HA config. The token stays in this struct and on disk only — never
/// serialized back to the webview (see `HaStatus` / `ha_config_status`).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HaConfig {
    pub url: String,
    pub token: String,
    /// Accept self-signed / otherwise-invalid TLS certs over `wss`/`https`. Default false —
    /// an explicit opt-in for a LAN HA behind a self-signed cert. `#[serde(default)]` keeps
    /// existing `ha.json` files (which omit it) strict.
    #[serde(default)]
    pub insecure: bool,
}

/// What the webview is allowed to learn about the config: whether it exists and the URL.
/// Deliberately omits the token.
#[derive(Debug, Serialize)]
pub struct HaStatus {
    pub configured: bool,
    pub url: Option<String>,
}

/// One HA entity row for the inspector's sensor dropdown. The widget binds to the sensor
/// id `ha.<entity_id>`.
#[derive(Debug, Serialize)]
pub struct HaEntity {
    pub entity_id: String,
    pub state: String,
    pub friendly_name: Option<String>,
    pub unit: Option<String>,
}

/// Managed state: the running WS task (None when disconnected). Guards against a second
/// `ha_connect` spawning a duplicate socket / duplicate snapshot.
#[derive(Default)]
pub struct HaState {
    handle: Mutex<Option<JoinHandle<()>>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---- config I/O (server-side; token never leaves) ----

fn ha_config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("plugins").join("ha.json"))
}

/// Read `plugins/ha.json`, or `None` if it doesn't exist.
pub fn load_ha_config<R: Runtime>(app: &AppHandle<R>) -> Result<Option<HaConfig>, String> {
    let path = ha_config_path(app)?;
    match std::fs::read_to_string(&path) {
        Ok(txt) => serde_json::from_str(&txt).map(Some).map_err(|e| e.to_string()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

// ---- pure seams (unit-tested, no I/O) ----

/// Derive the WebSocket URL from the configured HTTP base: `http`→`ws`, `https`→`wss`,
/// strip a trailing slash, append `/api/websocket`. (Reverse-proxy subpaths are out of
/// scope for v1.)
fn ws_url_from(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    let (scheme, rest) = if let Some(r) = trimmed.strip_prefix("https://") {
        ("wss://", r)
    } else if let Some(r) = trimmed.strip_prefix("http://") {
        ("ws://", r)
    } else if let Some(r) = trimmed.strip_prefix("wss://") {
        ("wss://", r)
    } else if let Some(r) = trimmed.strip_prefix("ws://") {
        ("ws://", r)
    } else {
        ("ws://", trimmed)
    };
    format!("{scheme}{rest}/api/websocket")
}

/// The REST base URL (trailing slash stripped) for `/api/...` calls.
fn rest_base(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// A reqwest client honouring the `insecure` opt-in. A normal config builds an ordinary
/// (cert-validating) client. Under `insecure` it mirrors the WS connector EXACTLY — dropping
/// BOTH cert and hostname verification — because a self-signed LAN cert usually also has an
/// IP/CN-SAN mismatch, so cert-only would still fail REST hostname checks while wss streamed.
fn ha_http_client(insecure: bool) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder();
    if insecure {
        builder = builder
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true);
    }
    builder.build().map_err(|e| e.to_string())
}

/// Map one HA state object (from `get_states` or a `state_changed` event) to telemetry
/// samples. `Json(new_state)` is emitted ALWAYS so a `ha.<id>` JSON widget always has the
/// full payload; a separate `ha.<id>.state` `Scalar` is emitted only when the state string
/// parses as a number (so a single id never alternates value kinds across ticks and breaks
/// history buffers). `None` when `new_state` is null (entity removed / unknown).
fn state_to_samples(entity_id: &str, new_state: &Value, ts_ms: u64) -> Option<Vec<SensorSample>> {
    if new_state.is_null() {
        return None;
    }
    let base = format!("ha.{entity_id}");
    let mut out = vec![SensorSample {
        sensor: base.clone(),
        ts_ms,
        value: SensorValue::Json(new_state.clone()),
    }];
    if let Some(s) = new_state["state"].as_str()
        && let Ok(n) = s.parse::<f64>()
    {
        out.push(SensorSample::scalar(format!("{base}.state"), ts_ms, n));
    }
    Some(out)
}

/// Project a `/api/states` row into the inspector's `HaEntity`. `None` if it has no id.
fn entity_from_state(state: &Value) -> Option<HaEntity> {
    Some(HaEntity {
        entity_id: state["entity_id"].as_str()?.to_string(),
        state: state["state"].as_str().unwrap_or_default().to_string(),
        friendly_name: state["attributes"]["friendly_name"]
            .as_str()
            .map(String::from),
        unit: state["attributes"]["unit_of_measurement"]
            .as_str()
            .map(String::from),
    })
}

// ---- telemetry emission ----

/// Surface the connection state to widgets as a `ha.status` text sample over the existing
/// telemetry event (a Text meter bound to `ha.status` shows it). Single status transport —
/// no separate bridge event.
fn emit_status<R: Runtime>(app: &AppHandle<R>, status: &str) {
    let batch = vec![SensorSample {
        sensor: "ha.status".to_string(),
        ts_ms: now_ms(),
        value: SensorValue::Text(status.to_string()),
    }];
    let _ = app.emit(TELEMETRY_EVENT, &batch);
}

/// Prime every entity from a `get_states` snapshot so widgets render immediately.
fn emit_snapshot<R: Runtime>(app: &AppHandle<R>, states: &Value) {
    let Some(arr) = states.as_array() else {
        return;
    };
    let ts = now_ms();
    let mut batch = Vec::new();
    for st in arr {
        if let Some(eid) = st["entity_id"].as_str()
            && let Some(mut samples) = state_to_samples(eid, st, ts)
        {
            batch.append(&mut samples);
        }
    }
    if !batch.is_empty() {
        let _ = app.emit(TELEMETRY_EVENT, &batch);
    }
}

// ---- connection task ----

/// Read frames until one of type `expected` arrives (ignoring unrelated frames). Treats
/// `auth_invalid` and a closed/ended stream as errors.
async fn expect_type<S>(ws: &mut S, expected: &str) -> Result<(), BoxErr>
where
    S: Stream<Item = Result<Message, WsError>> + Unpin,
{
    while let Some(msg) = ws.next().await {
        match msg? {
            Message::Text(txt) => {
                let v: Value = serde_json::from_str(&txt)?;
                let ty = v["type"].as_str().unwrap_or_default();
                if ty == expected {
                    return Ok(());
                }
                if ty == "auth_invalid" {
                    let m = v["message"].as_str().unwrap_or_default();
                    return Err(format!("auth_invalid: {m}").into());
                }
            }
            Message::Close(_) => return Err("connection closed during handshake".into()),
            _ => {}
        }
    }
    Err("stream ended during handshake".into())
}

/// One connection lifecycle: connect → auth → seed snapshot → subscribe → stream events.
/// Returns `Ok` on a clean close, `Err` on any failure (the caller backs off + retries).
async fn connect_and_stream<R: Runtime>(
    app: &AppHandle<R>,
    ws_url: &str,
    token: &str,
    insecure: bool,
) -> Result<(), BoxErr> {
    // Valid certs (and plain `ws://`) are handled transparently by the native-tls backend.
    // `insecure` swaps in a connector that accepts self-signed certs — explicit opt-in only.
    let (mut ws, _resp) = if insecure {
        let tls = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true)
            .build()?;
        connect_async_tls_with_config(ws_url, None, false, Some(Connector::NativeTls(tls))).await?
    } else {
        connect_async(ws_url).await?
    };

    // Auth phase: frames carry no id. auth_required → auth → auth_ok (auth_invalid is fatal).
    expect_type(&mut ws, "auth_required").await?;
    let auth = json!({ "type": "auth", "access_token": token }).to_string();
    ws.send(Message::Text(auth)).await?;
    expect_type(&mut ws, "auth_ok").await?;
    emit_status(app, "connected");

    // Command phase: per-connection ids must strictly increase (HA rejects reuse).
    let next_id = AtomicU64::new(1);
    let snapshot_id = next_id.fetch_add(1, Ordering::SeqCst);
    let get_states = json!({ "id": snapshot_id, "type": "get_states" }).to_string();
    ws.send(Message::Text(get_states)).await?;
    let sub_id = next_id.fetch_add(1, Ordering::SeqCst);
    let subscribe = json!({
        "id": sub_id, "type": "subscribe_events", "event_type": "state_changed"
    })
    .to_string();
    ws.send(Message::Text(subscribe)).await?;

    while let Some(msg) = ws.next().await {
        match msg? {
            Message::Text(txt) => {
                let v: Value = serde_json::from_str(&txt)?;
                match v["type"].as_str() {
                    Some("result") => {
                        let id = v["id"].as_u64();
                        if v["success"].as_bool().unwrap_or(false) {
                            if id == Some(snapshot_id) {
                                emit_snapshot(app, &v["result"]);
                            }
                        } else {
                            let code = v["error"]["code"].as_str().unwrap_or("unknown");
                            // A failed subscribe would leave us connected but deaf — bail so
                            // the outer loop reconnects rather than lying about "connected".
                            if id == Some(sub_id) {
                                return Err(format!("subscribe_events failed: {code}").into());
                            }
                            eprintln!("HA result error (id {id:?}): {code}");
                        }
                    }
                    Some("event") if v["event"]["event_type"] == "state_changed" => {
                        let data = &v["event"]["data"];
                        if let Some(eid) = data["entity_id"].as_str()
                            && let Some(batch) = state_to_samples(eid, &data["new_state"], now_ms())
                        {
                            let _ = app.emit(TELEMETRY_EVENT, &batch);
                        }
                    }
                    _ => {}
                }
            }
            Message::Ping(p) => ws.send(Message::Pong(p)).await?,
            Message::Close(_) => break,
            _ => {}
        }
    }
    Ok(())
}

/// Reconnecting client loop: owns the single backoff. Exponential backoff (1s→30s) with
/// jitter; the backoff is reset to 1s only after a session that stayed up long enough to be
/// considered healthy (so an auth-then-immediate-close flap can't pin a 1s hammer loop).
/// Runs until the task is aborted by `ha_disconnect`.
pub async fn run_ha_client<R: Runtime>(app: AppHandle<R>, cfg: HaConfig) {
    let ws_url = ws_url_from(&cfg.url);
    let mut backoff = Duration::from_secs(1);
    const STABLE: Duration = Duration::from_secs(30);
    const CAP: Duration = Duration::from_secs(30);
    loop {
        emit_status(&app, "connecting");
        let started = Instant::now();
        match connect_and_stream(&app, &ws_url, &cfg.token, cfg.insecure).await {
            Ok(()) => emit_status(&app, "disconnected"),
            Err(err) => {
                eprintln!("HA client error: {err}");
                emit_status(&app, "error");
            }
        }
        if started.elapsed() >= STABLE {
            backoff = Duration::from_secs(1);
        }
        let jitter = Duration::from_millis(now_ms() % 750);
        tokio::time::sleep(backoff + jitter).await;
        backoff = (backoff * 2).min(CAP);
    }
}

// ---- Tauri commands ----

/// Persist `plugins/ha.json` (creates `plugins/`). The token is written server-side only.
#[tauri::command]
pub async fn save_ha_config<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    token: String,
    insecure: Option<bool>,
) -> Result<(), String> {
    let path = ha_config_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let cfg = HaConfig {
        url,
        token,
        insecure: insecure.unwrap_or(false),
    };
    let txt = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, txt).map_err(|e| e.to_string())
}

/// Whether HA is configured + its URL — NEVER the token.
#[tauri::command]
pub fn ha_config_status<R: Runtime>(app: AppHandle<R>) -> Result<HaStatus, String> {
    match load_ha_config(&app)? {
        Some(cfg) => Ok(HaStatus {
            configured: true,
            url: Some(cfg.url),
        }),
        None => Ok(HaStatus {
            configured: false,
            url: None,
        }),
    }
}

/// Start the streaming WS task iff configured and not already running. Idempotent: a second
/// call while running is a no-op (no duplicate socket).
#[tauri::command]
pub async fn ha_connect<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, HaState>,
) -> Result<(), String> {
    let cfg = match load_ha_config(&app)? {
        Some(cfg) => cfg,
        None => return Ok(()), // not configured: nothing to connect
    };
    let mut guard = state.handle.lock().await;
    if guard.is_some() {
        return Ok(());
    }
    let app_for_task = app.clone();
    *guard = Some(tauri::async_runtime::spawn(async move {
        run_ha_client(app_for_task, cfg).await;
    }));
    Ok(())
}

/// Stop the streaming WS task (if any).
#[tauri::command]
pub async fn ha_disconnect(state: State<'_, HaState>) -> Result<(), String> {
    if let Some(handle) = state.handle.lock().await.take() {
        handle.abort();
    }
    Ok(())
}

/// The HA entities (via REST `/api/states`), for the inspector's sensor dropdown. Its own
/// fetch, so it works regardless of the WS task's timing.
#[tauri::command]
pub async fn list_ha_entities<R: Runtime>(app: AppHandle<R>) -> Result<Vec<HaEntity>, String> {
    let cfg = load_ha_config(&app)?.ok_or("HA not configured")?;
    let client = ha_http_client(cfg.insecure)?;
    let resp = client
        .get(format!("{}/api/states", rest_base(&cfg.url)))
        .bearer_auth(&cfg.token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("GET /api/states failed: {}", resp.status()));
    }
    let states: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(states.iter().filter_map(entity_from_state).collect())
}

/// Call an HA service (REST `POST /api/services/<domain>/<service>`). `data` is the body
/// (e.g. `{ "entity_id": "light.kitchen" }`). Domain/service are validated to contain no
/// path separators (`/`, `.`) to prevent path injection. Returns HA's changed-states array.
#[tauri::command]
pub async fn ha_call_service<R: Runtime>(
    app: AppHandle<R>,
    domain: String,
    service: String,
    data: Value,
) -> Result<Value, String> {
    let bad = |s: &str| s.is_empty() || s.contains('/') || s.contains('.');
    if bad(&domain) || bad(&service) {
        return Err("invalid domain/service".to_string());
    }
    let cfg = load_ha_config(&app)?.ok_or("HA not configured")?;
    let client = ha_http_client(cfg.insecure)?;
    let resp = client
        .post(format!(
            "{}/api/services/{}/{}",
            rest_base(&cfg.url),
            domain,
            service
        ))
        .bearer_auth(&cfg.token)
        .json(&data)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HA service call failed: {}", resp.status()));
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_url_maps_scheme_and_appends_path() {
        assert_eq!(
            ws_url_from("http://homeassistant.local:8123"),
            "ws://homeassistant.local:8123/api/websocket"
        );
        assert_eq!(
            ws_url_from("https://ha.example.com"),
            "wss://ha.example.com/api/websocket"
        );
    }

    #[test]
    fn ws_url_strips_trailing_slash_and_passes_ws_schemes() {
        assert_eq!(
            ws_url_from("http://ha:8123/"),
            "ws://ha:8123/api/websocket"
        );
        assert_eq!(ws_url_from("ws://ha:8123"), "ws://ha:8123/api/websocket");
        assert_eq!(ws_url_from("wss://ha:8123/"), "wss://ha:8123/api/websocket");
        // No scheme defaults to ws://.
        assert_eq!(ws_url_from("ha:8123"), "ws://ha:8123/api/websocket");
    }

    #[test]
    fn rest_base_strips_trailing_slash() {
        assert_eq!(rest_base("http://ha:8123/"), "http://ha:8123");
        assert_eq!(rest_base("http://ha:8123"), "http://ha:8123");
    }

    #[test]
    fn numeric_state_emits_json_and_scalar() {
        let st = json!({ "state": "21.6", "attributes": { "unit_of_measurement": "°C" } });
        let samples = state_to_samples("sensor.temp", &st, 7).unwrap();
        assert_eq!(samples.len(), 2);
        assert_eq!(samples[0].sensor, "ha.sensor.temp");
        assert_eq!(samples[1].sensor, "ha.sensor.temp.state");
        let json0 = serde_json::to_value(&samples[0]).unwrap();
        let json1 = serde_json::to_value(&samples[1]).unwrap();
        assert_eq!(json0["value"]["kind"], "json");
        assert_eq!(json1["value"]["kind"], "scalar");
        assert_eq!(json1["value"]["value"], 21.6);
    }

    #[test]
    fn non_numeric_state_emits_json_only() {
        let st = json!({ "state": "unavailable", "attributes": {} });
        let samples = state_to_samples("binary_sensor.x", &st, 0).unwrap();
        assert_eq!(samples.len(), 1);
        let v = serde_json::to_value(&samples[0]).unwrap();
        assert_eq!(v["value"]["kind"], "json");

        let on = json!({ "state": "on", "attributes": {} });
        assert_eq!(state_to_samples("switch.x", &on, 0).unwrap().len(), 1);
    }

    #[test]
    fn null_state_emits_nothing() {
        assert!(state_to_samples("sensor.gone", &Value::Null, 0).is_none());
    }

    #[test]
    fn entity_projects_friendly_name_and_unit() {
        let st = json!({
            "entity_id": "sensor.temp",
            "state": "21.4",
            "attributes": { "friendly_name": "Temp", "unit_of_measurement": "°C" }
        });
        let e = entity_from_state(&st).unwrap();
        assert_eq!(e.entity_id, "sensor.temp");
        assert_eq!(e.state, "21.4");
        assert_eq!(e.friendly_name.as_deref(), Some("Temp"));
        assert_eq!(e.unit.as_deref(), Some("°C"));
    }

    #[test]
    fn config_insecure_defaults_false_and_round_trips() {
        // An existing ha.json without `insecure` must still parse (strict by default).
        let legacy: HaConfig =
            serde_json::from_str(r#"{ "url": "http://ha:8123", "token": "t" }"#).unwrap();
        assert!(!legacy.insecure);
        // And the opt-in is honoured when present.
        let optin: HaConfig =
            serde_json::from_str(r#"{ "url": "https://ha:8123", "token": "t", "insecure": true }"#)
                .unwrap();
        assert!(optin.insecure);
    }

    #[test]
    fn status_never_serializes_a_token() {
        let v = serde_json::to_value(HaStatus {
            configured: true,
            url: Some("http://ha:8123".to_string()),
        })
        .unwrap();
        assert!(v.get("token").is_none());
        assert_eq!(v["configured"], true);
        assert_eq!(v["url"], "http://ha:8123");
    }
}
