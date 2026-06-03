//! Structured logging for the backend. Replaces ad-hoc `println!`/`eprintln!` with a typed
//! `LogRecord` (level + `target` subsystem + message + stringified `fields`) that is, in one place:
//!   1. printed to the console (dev convenience — warn/error to stderr, else stdout),
//!   2. pushed to a bounded in-memory ring buffer, and
//!   3. emitted to the webview as a `log` event.
//!
//! So a future in-app logs UI can both stream new entries (the `log` event via `subscribeLogs`) and
//! load the backlog (the `get_logs` command). The schema is mirrored in client/src/lib/core/logs.ts
//! (AGENTS.md §5 — keep both sides in sync).
//!
//! Usage: `log::info("gsmtc", "session created").field("session_id", id).emit();`

use std::collections::{BTreeMap, VecDeque};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Tauri event name carrying one `LogRecord` to the webview (the logs UI's live stream).
pub const LOG_EVENT: &str = "log";

/// Most recent entries retained for a UI that opens after the fact. Oldest drop past this.
const BUFFER_CAP: usize = 1000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    fn label(self) -> &'static str {
        match self {
            LogLevel::Trace => "TRACE",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO ",
            LogLevel::Warn => "WARN ",
            LogLevel::Error => "ERROR",
        }
    }
}

/// One structured log entry. `target` names the subsystem ("gsmtc", "sensors", "ha", "watch", …);
/// `fields` are arbitrary structured key/values (stringified) for filtering/inspection in the UI.
#[derive(Clone, Debug, Serialize)]
pub struct LogRecord {
    pub ts_ms: u64,
    pub level: LogLevel,
    pub target: String,
    pub message: String,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub fields: BTreeMap<String, String>,
}

static BUFFER: OnceLock<Mutex<VecDeque<LogRecord>>> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();

fn buffer() -> &'static Mutex<VecDeque<LogRecord>> {
    BUFFER.get_or_init(|| Mutex::new(VecDeque::with_capacity(BUFFER_CAP)))
}

/// Wire the logger to the app so records also stream to the webview. Call once in `setup`. Logging
/// works before this (console + buffer) — it just can't emit the `log` event until wired.
pub fn init(app: AppHandle) {
    let _ = APP.set(app);
}

/// Records below this level are dropped entirely (not printed/buffered/emitted). Debug builds keep
/// `debug` and up; release keeps `info` and up. `trace` is opt-in only by lowering this.
fn min_level() -> LogLevel {
    if cfg!(debug_assertions) {
        LogLevel::Debug
    } else {
        LogLevel::Info
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// An in-progress log entry: attach `field`s, then `emit`. Build via `info`/`warn`/`error`/etc.
#[must_use = "a LogBuilder does nothing until .emit() is called"]
pub struct LogBuilder {
    level: LogLevel,
    target: &'static str,
    message: String,
    fields: BTreeMap<String, String>,
}

impl LogBuilder {
    /// Attach a structured field (value is stringified via `Display`). Chainable.
    pub fn field(mut self, key: &str, value: impl std::fmt::Display) -> Self {
        self.fields.insert(key.to_string(), value.to_string());
        self
    }

    /// Finalize: stamp the time, then print + buffer + emit (subject to `min_level`).
    pub fn emit(self) {
        if self.level < min_level() {
            return;
        }
        dispatch(LogRecord {
            ts_ms: now_ms(),
            level: self.level,
            target: self.target.to_string(),
            message: self.message,
            fields: self.fields,
        });
    }
}

fn builder(level: LogLevel, target: &'static str, message: impl Into<String>) -> LogBuilder {
    LogBuilder {
        level,
        target,
        message: message.into(),
        fields: BTreeMap::new(),
    }
}

pub fn trace(target: &'static str, message: impl Into<String>) -> LogBuilder {
    builder(LogLevel::Trace, target, message)
}
pub fn debug(target: &'static str, message: impl Into<String>) -> LogBuilder {
    builder(LogLevel::Debug, target, message)
}
pub fn info(target: &'static str, message: impl Into<String>) -> LogBuilder {
    builder(LogLevel::Info, target, message)
}
pub fn warn(target: &'static str, message: impl Into<String>) -> LogBuilder {
    builder(LogLevel::Warn, target, message)
}
pub fn error(target: &'static str, message: impl Into<String>) -> LogBuilder {
    builder(LogLevel::Error, target, message)
}

fn dispatch(record: LogRecord) {
    // 1. console — a compact one-liner; warn/error to stderr, everything else to stdout.
    let mut line = format!("{} {}: {}", record.level.label(), record.target, record.message);
    for (k, v) in &record.fields {
        line.push_str(&format!(" {k}={v}"));
    }
    if record.level >= LogLevel::Warn {
        eprintln!("{line}");
    } else {
        println!("{line}");
    }

    // 2. ring buffer — drop oldest past the cap.
    if let Ok(mut buf) = buffer().lock() {
        while buf.len() >= BUFFER_CAP {
            buf.pop_front();
        }
        buf.push_back(record.clone());
    }

    // 3. live stream to the webview, once wired (no-op before `init`, e.g. early startup / tests).
    if let Some(app) = APP.get() {
        let _ = app.emit(LOG_EVENT, &record);
    }
}

/// The buffered log backlog, oldest first — for a logs UI that opens after entries were produced.
#[tauri::command]
pub fn get_logs() -> Vec<LogRecord> {
    buffer()
        .lock()
        .map(|b| b.iter().cloned().collect())
        .unwrap_or_default()
}
