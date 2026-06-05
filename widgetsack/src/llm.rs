//! The AI provider abstraction — a server-side LLM proxy, PEER to ha.rs / mqtt.rs / stocks.rs.
//! One config (`plugins/llm.json`) holds the provider choice + endpoint + (secret) API key; the key
//! lives server-side ONLY and never crosses the bridge (mirrors the HA token rule). All outbound HTTP
//! is done here in reqwest — the webview CSP (`connect-src 'self' ipc:`) blocks a direct fetch to an
//! LLM host, so the frontend `invoke`s these commands instead.
//!
//! Three providers behind one shape, selected by `provider`:
//!   - `anthropic`: POST `/v1/messages`, `x-api-key` + `anthropic-version` headers, `system` is a top-level field, text in `content[].text`.
//!   - `openai`: POST `/chat/completions`, `Authorization: Bearer`, text in `choices[0].message.content`. Covers any OpenAI-compatible endpoint (Groq, OpenRouter, LM Studio, llama.cpp, Ollama's `/v1`) via a custom `base_url`.
//!   - `ollama`: POST `/api/chat`, keyless (local), text in `message.content`.
//!
//! Outer-ring adapter like its peers: the per-provider request/response/stream logic lives in pure
//! seams (`chat_endpoint`, `build_chat_body`, `parse_chat_text`, `parse_models`, `stream_event_from_line`,
//! `provider_error`) that are unit-tested without a socket. Two surfaces:
//!   - request/response: `llm_complete` (the workhorse — used by the layout assistant + briefing),
//!     `llm_test_connection`, `llm_list_models`.
//!   - streaming: `llm_stream` spawns a task that emits `llm_delta` events token-by-token; `llm_cancel`
//!     aborts an in-flight stream by id. Handles are tracked in the managed `LlmState`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::async_runtime::{JoinHandle, Mutex};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::log;

/// Streamed tokens ride their OWN event (not `telemetry`) because a chat transcript is a growing
/// whole-value, not a per-id sensor sample. The frontend `lib/llm/source.ts` listens here.
const LLM_DELTA_EVENT: &str = "llm_delta";

fn default_provider() -> String {
    "openai".to_string()
}
fn default_temperature() -> f64 {
    0.7
}
fn default_max_tokens() -> u32 {
    1024
}

/// Server-side AI provider config (`plugins/llm.json`). The `api_key` is the secret — it is written
/// here and NEVER serialized back to the webview (see `LlmStatus`). `#[serde(default)]` everywhere so
/// a partial / older file still parses (AGENTS.md forward-compat rule).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LlmConfig {
    #[serde(default = "default_provider")]
    pub provider: String,
    /// Empty means "use the provider's default base URL" (see `default_base_url`). Set this to point
    /// at a self-hosted / compatible endpoint (e.g. `http://localhost:11434` for Ollama).
    #[serde(default)]
    pub base_url: String,
    /// The secret. Stays in this struct + on disk only.
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    /// Accept self-signed / invalid TLS (a local endpoint behind a self-signed cert). Mirrors the HA
    /// opt-in: drops BOTH cert and hostname checks.
    #[serde(default)]
    pub insecure: bool,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    /// Opt-in: run the local agent-control server (media/HA actuation over a localhost port). OFF by
    /// default — this opens a token-guarded 127.0.0.1 endpoint (see control.rs).
    #[serde(default)]
    pub agent_control: bool,
}

/// What the webview is allowed to learn — deliberately WITHOUT the api_key (only `has_key`, a bool).
/// camelCase on the wire (matches `llm-types.ts`).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStatus {
    /// Usable: a keyless provider (ollama) is always configured; a keyed one needs a saved key.
    pub configured: bool,
    pub provider: String,
    /// The EFFECTIVE base url (the provider default when none is set), so the UI can show it.
    pub base_url: String,
    pub model: String,
    /// Whether a key is on file — the only thing the UI learns about the secret.
    pub has_key: bool,
    pub temperature: f64,
    pub max_tokens: u32,
    /// Whether the opt-in agent-control server is enabled.
    pub agent_control: bool,
}

/// Result of a successful `llm_test_connection` — the model that answered + a short echo of its reply.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmTestResult {
    pub model: String,
    pub reply: String,
}

/// One selectable model from `llm_list_models`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModel {
    pub id: String,
    pub label: String,
}

/// One chat turn the webview sends in. `role` ∈ {system,user,assistant}; the provider mapping
/// (e.g. anthropic lifts `system` out of the list) happens in `build_chat_body`.
#[derive(Clone, Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// One streamed delta emitted over `llm_delta`. camelCase on the wire (mirrors `LlmDelta` in
/// `core/llm.ts`). `done` marks the final frame; `error` is set instead of `token` on failure.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmDelta {
    request_id: String,
    token: String,
    done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Managed state: in-flight stream tasks keyed by their request id, so `llm_cancel` can abort one.
/// Each entry pairs the handle with a monotonic generation so a completing task only reclaims its OWN
/// slot (not one a same-id restart just inserted). `gen` hands out those generations.
#[derive(Default)]
pub struct LlmState {
    streams: Mutex<HashMap<String, (u64, JoinHandle<()>)>>,
    next_gen: AtomicU64,
}

// ---- config I/O (server-side; api_key never leaves) ----

fn llm_config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("plugins").join("llm.json"))
}

/// Read `plugins/llm.json`, or `None` if it doesn't exist.
pub fn load_llm_config<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LlmConfig>, String> {
    let path = llm_config_path(app)?;
    match std::fs::read_to_string(&path) {
        Ok(txt) => serde_json::from_str(&txt).map(Some).map_err(|e| e.to_string()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

// ---- pure seams (unit-tested, no I/O) ----

/// Whether the provider needs an API key. Ollama is local/keyless; everything else is keyed.
fn needs_key(provider: &str) -> bool {
    !matches!(provider, "ollama")
}

/// The default base URL for a provider (used when the config leaves `base_url` blank).
fn default_base_url(provider: &str) -> &'static str {
    match provider {
        "anthropic" => "https://api.anthropic.com",
        "ollama" => "http://localhost:11434",
        // openai + any OpenAI-compatible default
        _ => "https://api.openai.com/v1",
    }
}

/// The effective base URL (config override, else provider default), trailing slash stripped.
fn effective_base(cfg: &LlmConfig) -> String {
    let b = cfg.base_url.trim().trim_end_matches('/');
    if b.is_empty() {
        default_base_url(&cfg.provider).to_string()
    } else {
        b.to_string()
    }
}

/// The chat-completion endpoint for a provider given its (already-normalized) base URL.
fn chat_endpoint(provider: &str, base: &str) -> String {
    match provider {
        "anthropic" => format!("{base}/v1/messages"),
        "ollama" => format!("{base}/api/chat"),
        _ => format!("{base}/chat/completions"),
    }
}

/// The model-list endpoint (GET) for a provider.
fn models_endpoint(provider: &str, base: &str) -> String {
    match provider {
        "anthropic" => format!("{base}/v1/models"),
        "ollama" => format!("{base}/api/tags"),
        _ => format!("{base}/models"),
    }
}

/// The OpenAI-style speech-to-text endpoint (whisper). anthropic + ollama have none.
fn transcribe_endpoint(base: &str) -> String {
    format!("{base}/audio/transcriptions")
}

/// Whether the provider exposes an OpenAI-style transcription endpoint. anthropic + ollama do not.
fn supports_transcription(provider: &str) -> bool {
    !matches!(provider, "anthropic" | "ollama")
}

/// A file extension for the recorded audio's mime type (the API infers the format from the filename).
fn mime_ext(mime: &str) -> &'static str {
    if mime.contains("webm") {
        "webm"
    } else if mime.contains("ogg") {
        "ogg"
    } else if mime.contains("wav") {
        "wav"
    } else if mime.contains("mp4") || mime.contains("m4a") || mime.contains("mpeg") {
        "m4a"
    } else {
        "webm"
    }
}

/// Pull the transcript text out of a transcription response (`{ "text": "..." }`).
fn parse_transcription(v: &Value) -> Option<String> {
    v["text"].as_str().map(str::to_string).filter(|s| !s.is_empty())
}

/// A reasonable default model name per provider when the user hasn't picked one (a starting point — the
/// user configures the real one). Names drift, so this is best-effort, not authoritative.
fn default_model(provider: &str) -> &'static str {
    match provider {
        "anthropic" => "claude-sonnet-4-5",
        "ollama" => "llama3.2",
        _ => "gpt-4o-mini",
    }
}

fn model_or_default(cfg: &LlmConfig) -> String {
    if cfg.model.trim().is_empty() {
        default_model(&cfg.provider).to_string()
    } else {
        cfg.model.trim().to_string()
    }
}

/// Map the incoming messages to a provider's wire array. For anthropic, system turns are EXCLUDED
/// (they are lifted into the top-level `system` field by `build_chat_body`) and any non-`assistant`
/// role is coerced to `user` (anthropic only accepts user/assistant in the list).
fn messages_json(provider: &str, messages: &[ChatMessage]) -> Vec<Value> {
    messages
        .iter()
        .filter(|m| !(provider == "anthropic" && m.role == "system"))
        .map(|m| {
            let role = if provider == "anthropic" && m.role != "assistant" {
                "user"
            } else {
                m.role.as_str()
            };
            json!({ "role": role, "content": m.content })
        })
        .collect()
}

/// Concatenate all `system`-role messages (anthropic carries the system prompt out-of-band).
fn system_text(messages: &[ChatMessage]) -> String {
    messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Build the JSON request body for a chat completion, per provider.
fn build_chat_body(
    provider: &str,
    model: &str,
    messages: &[ChatMessage],
    temperature: f64,
    max_tokens: u32,
    stream: bool,
) -> Value {
    match provider {
        "anthropic" => {
            let mut body = json!({
                "model": model,
                "max_tokens": max_tokens,
                // Anthropic caps temperature at 1.0 (the UI allows up to 2 for OpenAI) — clamp so an
                // Anthropic user who raised it past 1 doesn't get a hard 400 on every request.
                "temperature": temperature.min(1.0),
                "stream": stream,
                "messages": messages_json(provider, messages),
            });
            let sys = system_text(messages);
            if !sys.is_empty() {
                body["system"] = json!(sys);
            }
            body
        }
        "ollama" => json!({
            "model": model,
            "messages": messages_json(provider, messages),
            "stream": stream,
            "options": { "temperature": temperature, "num_predict": max_tokens },
        }),
        _ => json!({
            "model": model,
            "messages": messages_json(provider, messages),
            "stream": stream,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }),
    }
}

/// Extract the assistant's reply text from a non-streamed response body, per provider.
fn parse_chat_text(provider: &str, v: &Value) -> Option<String> {
    let text = match provider {
        "anthropic" => v["content"]
            .as_array()
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|b| b["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
        "ollama" => v["message"]["content"].as_str().unwrap_or("").to_string(),
        _ => v["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string(),
    };
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Pull a human-readable error message out of an error response body (best-effort).
fn provider_error(v: &Value) -> Option<String> {
    v["error"]["message"]
        .as_str()
        .or_else(|| v["error"].as_str())
        .or_else(|| v["message"].as_str())
        .map(String::from)
}

/// Map a model-list response body to selectable models, per provider.
fn parse_models(provider: &str, v: &Value) -> Vec<LlmModel> {
    let ids: Vec<String> = match provider {
        "ollama" => v["models"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|m| m["name"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        // anthropic + openai both use `data: [{ id }]`
        _ => v["data"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|m| m["id"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
    };
    ids.into_iter()
        .map(|id| LlmModel {
            label: id.clone(),
            id,
        })
        .collect()
}

/// What a single line of a streamed response means.
#[derive(Debug, PartialEq)]
enum StreamEvent {
    Token(String),
    Done,
    Ignore,
}

/// Parse ONE line of a streamed body into a `StreamEvent`. SSE providers (anthropic/openai) prefix
/// payloads with `data: `; ollama emits a raw JSON object per line. Pure — the task owns the buffering.
fn stream_event_from_line(provider: &str, line: &str) -> StreamEvent {
    let line = line.trim();
    if line.is_empty() {
        return StreamEvent::Ignore;
    }
    if provider == "ollama" {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            return StreamEvent::Ignore;
        };
        if v["done"].as_bool() == Some(true) {
            return StreamEvent::Done;
        }
        return match v["message"]["content"].as_str() {
            Some(t) if !t.is_empty() => StreamEvent::Token(t.to_string()),
            _ => StreamEvent::Ignore,
        };
    }
    // SSE
    let Some(rest) = line.strip_prefix("data:") else {
        return StreamEvent::Ignore; // `event:` / comment lines
    };
    let rest = rest.trim();
    if rest == "[DONE]" {
        return StreamEvent::Done;
    }
    let Ok(v) = serde_json::from_str::<Value>(rest) else {
        return StreamEvent::Ignore;
    };
    if provider == "anthropic" {
        match v["type"].as_str() {
            Some("message_stop") => StreamEvent::Done,
            Some("content_block_delta") => match v["delta"]["text"].as_str() {
                Some(t) => StreamEvent::Token(t.to_string()),
                None => StreamEvent::Ignore,
            },
            _ => StreamEvent::Ignore,
        }
    } else {
        match v["choices"][0]["delta"]["content"].as_str() {
            Some(t) if !t.is_empty() => StreamEvent::Token(t.to_string()),
            _ => StreamEvent::Ignore,
        }
    }
}

// ---- HTTP ----

/// A reqwest client honouring the `insecure` opt-in (mirrors ha_http_client). 120s timeout — LLM
/// responses can be slow.
fn llm_http_client(insecure: bool) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(120));
    if insecure {
        builder = builder
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true);
    }
    builder.build().map_err(|e| e.to_string())
}

/// Attach the provider's auth headers to a request. The key never leaves this process.
fn apply_auth(rb: reqwest::RequestBuilder, provider: &str, api_key: &str) -> reqwest::RequestBuilder {
    match provider {
        "anthropic" => rb
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        "ollama" => rb, // keyless
        _ => rb.bearer_auth(api_key),
    }
}

/// A non-streamed chat completion. Loads nothing — the caller passes a resolved config.
async fn chat_once(cfg: &LlmConfig, messages: &[ChatMessage]) -> Result<String, String> {
    if needs_key(&cfg.provider) && cfg.api_key.trim().is_empty() {
        return Err("no API key configured — set one in the AI Provider settings".into());
    }
    let base = effective_base(cfg);
    let url = chat_endpoint(&cfg.provider, &base);
    let body = build_chat_body(
        &cfg.provider,
        &model_or_default(cfg),
        messages,
        cfg.temperature,
        cfg.max_tokens,
        false,
    );
    let client = llm_http_client(cfg.insecure)?;
    let resp = apply_auth(client.post(&url), &cfg.provider, &cfg.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    // Read the body as text first so a NON-JSON error (a proxy 502, an HTML block page, a wrong base
    // URL) surfaces the HTTP status instead of a confusing serde "expected value" error. Mirrors the
    // streaming path's error handling.
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| provider_error(&v))
            .unwrap_or_else(|| format!("LLM request failed: HTTP {status}"));
        return Err(msg);
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    parse_chat_text(&cfg.provider, &v).ok_or_else(|| "the model returned no text".into())
}

/// Resolve the api_key for an ad-hoc (UNSAVED) request: a blank incoming key means "use the saved
/// one" (the UI holds the key write-only, so testing a changed URL must reuse the stored secret).
fn resolve_key<R: Runtime>(app: &AppHandle<R>, incoming: String) -> Result<String, String> {
    if !incoming.is_empty() {
        return Ok(incoming);
    }
    Ok(load_llm_config(app)?.map(|c| c.api_key).unwrap_or_default())
}

// ---- Tauri commands ----

/// Persist `plugins/llm.json` (creates `plugins/`). The api_key is written server-side only. A blank
/// `api_key` keeps the previously-saved one (write-only UI). Studio-only, like every config write.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_llm_config(
    window: tauri::WebviewWindow,
    app: AppHandle,
    provider: String,
    base_url: Option<String>,
    api_key: String,
    model: Option<String>,
    insecure: Option<bool>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    agent_control: Option<bool>,
) -> Result<(), String> {
    if window.label() != "studio" {
        return Err("save_llm_config is only allowed from the studio window".into());
    }
    let path = llm_config_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let api_key = if api_key.is_empty() {
        load_llm_config(&app)?.map(|c| c.api_key).unwrap_or_default()
    } else {
        api_key
    };
    let cfg = LlmConfig {
        provider: if provider.is_empty() {
            default_provider()
        } else {
            provider
        },
        base_url: base_url.unwrap_or_default(),
        api_key,
        model: model.unwrap_or_default(),
        insecure: insecure.unwrap_or(false),
        temperature: temperature.unwrap_or_else(default_temperature),
        max_tokens: max_tokens.unwrap_or_else(default_max_tokens),
        agent_control: agent_control.unwrap_or(false),
    };
    let txt = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, txt).map_err(|e| e.to_string())
}

/// The (non-secret) config — never the api_key, only `has_key`.
#[tauri::command]
pub fn llm_config_status<R: Runtime>(app: AppHandle<R>) -> Result<LlmStatus, String> {
    match load_llm_config(&app)? {
        Some(cfg) => {
            let has_key = !cfg.api_key.trim().is_empty();
            Ok(LlmStatus {
                configured: !needs_key(&cfg.provider) || has_key,
                base_url: effective_base(&cfg),
                provider: cfg.provider,
                model: cfg.model,
                has_key,
                temperature: cfg.temperature,
                max_tokens: cfg.max_tokens,
                agent_control: cfg.agent_control,
            })
        }
        None => Ok(LlmStatus {
            configured: false,
            provider: default_provider(),
            base_url: default_base_url(&default_provider()).to_string(),
            model: String::new(),
            has_key: false,
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
            agent_control: false,
        }),
    }
}

/// Validate an UNSAVED provider/url/key/model by sending a tiny prompt, so the settings UI can tell
/// "bad key" / "unreachable" / "wrong model" apart before persisting. Studio-only.
#[tauri::command]
pub async fn llm_test_connection(
    window: tauri::WebviewWindow,
    app: AppHandle,
    provider: String,
    base_url: Option<String>,
    api_key: String,
    model: Option<String>,
    insecure: Option<bool>,
) -> Result<LlmTestResult, String> {
    if window.label() != "studio" {
        return Err("llm_test_connection is only allowed from the studio window".into());
    }
    let cfg = LlmConfig {
        provider: if provider.is_empty() {
            default_provider()
        } else {
            provider
        },
        base_url: base_url.unwrap_or_default(),
        api_key: resolve_key(&app, api_key)?,
        model: model.unwrap_or_default(),
        insecure: insecure.unwrap_or(false),
        temperature: 0.0,
        max_tokens: 32,
        agent_control: false,
    };
    let messages = vec![ChatMessage {
        role: "user".into(),
        content: "Reply with the single word: OK".into(),
    }];
    let reply = chat_once(&cfg, &messages).await?;
    Ok(LlmTestResult {
        model: model_or_default(&cfg),
        reply: reply.trim().chars().take(120).collect(),
    })
}

/// One-shot completion — the workhorse used across the app (layout assistant, briefing). Loads the
/// saved config, runs the messages, returns the assistant's text. NOT studio-guarded: any window may
/// ask (the overlay's briefing widget runs here too); the key never crosses the bridge regardless.
#[tauri::command]
pub async fn llm_complete<R: Runtime>(
    app: AppHandle<R>,
    messages: Vec<ChatMessage>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let mut cfg = load_llm_config(&app)?.ok_or("AI provider not configured")?;
    if let Some(t) = temperature {
        cfg.temperature = t;
    }
    if let Some(m) = max_tokens {
        cfg.max_tokens = m;
    }
    chat_once(&cfg, &messages).await
}

/// The configured provider's available models (for the settings model picker). Best-effort: returns an
/// empty list if the provider doesn't expose a catalog or the call fails.
#[tauri::command]
pub async fn llm_list_models<R: Runtime>(app: AppHandle<R>) -> Result<Vec<LlmModel>, String> {
    let cfg = load_llm_config(&app)?.ok_or("AI provider not configured")?;
    let base = effective_base(&cfg);
    let url = models_endpoint(&cfg.provider, &base);
    let client = llm_http_client(cfg.insecure)?;
    let resp = apply_auth(client.get(&url), &cfg.provider, &cfg.api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("could not list models: HTTP {}", resp.status()));
    }
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parse_models(&cfg.provider, &v))
}

/// Transcribe recorded audio (speech-to-text). The webview captures the mic (getUserMedia/MediaRecorder)
/// and hands the raw bytes here; this uploads them to the provider's OpenAI-style transcription endpoint
/// (key server-side) and returns the text. Only OpenAI-compatible providers expose this — anthropic and
/// ollama do not.
#[tauri::command]
pub async fn llm_transcribe<R: Runtime>(
    app: AppHandle<R>,
    audio: Vec<u8>,
    mime: Option<String>,
    model: Option<String>,
    language: Option<String>,
) -> Result<String, String> {
    let cfg = load_llm_config(&app)?.ok_or("AI provider not configured")?;
    if !supports_transcription(&cfg.provider) {
        return Err(format!(
            "the '{}' provider has no speech-to-text endpoint — use an OpenAI-compatible provider",
            cfg.provider
        ));
    }
    if needs_key(&cfg.provider) && cfg.api_key.trim().is_empty() {
        return Err("no API key configured".into());
    }
    if audio.is_empty() {
        return Err("no audio captured".into());
    }
    let base = effective_base(&cfg);
    let url = transcribe_endpoint(&base);
    // Trim + treat empty as unset (mirrors model_or_default), so a blank model never reaches the API.
    let model = model
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "whisper-1".to_string());
    let mime = mime.unwrap_or_else(|| "audio/webm".to_string());
    let part = reqwest::multipart::Part::bytes(audio)
        .file_name(format!("audio.{}", mime_ext(&mime)))
        .mime_str(&mime)
        .map_err(|e| e.to_string())?;
    let mut form = reqwest::multipart::Form::new()
        .text("model", model)
        .part("file", part);
    // An explicit spoken-language hint (ISO code) improves accuracy; "auto"/blank = let Whisper detect.
    if let Some(lang) = language {
        let lang = lang.trim();
        if !lang.is_empty() && !lang.eq_ignore_ascii_case("auto") {
            form = form.text("language", lang.to_string());
        }
    }
    let client = llm_http_client(cfg.insecure)?;
    let resp = apply_auth(client.post(&url), &cfg.provider, &cfg.api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| provider_error(&v))
            .unwrap_or_else(|| format!("transcription failed: HTTP {status}")));
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    parse_transcription(&v).ok_or_else(|| "no transcription text in response".into())
}

fn emit_delta<R: Runtime>(app: &AppHandle<R>, request_id: &str, token: &str, done: bool, error: Option<String>) {
    let _ = app.emit(
        LLM_DELTA_EVENT,
        &LlmDelta {
            request_id: request_id.to_string(),
            token: token.to_string(),
            done,
            error,
        },
    );
}

/// The streaming worker: open the streamed response and emit `llm_delta` frames token-by-token, then a
/// final `{ done: true }`. Errors emit a `{ done: true, error }` frame so the UI always terminates.
async fn run_stream<R: Runtime>(app: AppHandle<R>, request_id: String, cfg: LlmConfig, messages: Vec<ChatMessage>) {
    if needs_key(&cfg.provider) && cfg.api_key.trim().is_empty() {
        emit_delta(&app, &request_id, "", true, Some("no API key configured".into()));
        return;
    }
    let base = effective_base(&cfg);
    let url = chat_endpoint(&cfg.provider, &base);
    let body = build_chat_body(
        &cfg.provider,
        &model_or_default(&cfg),
        &messages,
        cfg.temperature,
        cfg.max_tokens,
        true,
    );
    let client = match llm_http_client(cfg.insecure) {
        Ok(c) => c,
        Err(e) => return emit_delta(&app, &request_id, "", true, Some(e)),
    };
    let resp = match apply_auth(client.post(&url), &cfg.provider, &cfg.api_key)
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return emit_delta(&app, &request_id, "", true, Some(e.to_string())),
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let msg = resp
            .text()
            .await
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| provider_error(&v))
            .unwrap_or_else(|| format!("HTTP {status}"));
        return emit_delta(&app, &request_id, "", true, Some(msg));
    }

    // Buffer RAW bytes (not a String) and decode only COMPLETE lines: a multi-byte UTF-8 char split
    // across two network chunks would be mangled by a per-chunk lossy decode, but a full line is valid.
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    'outer: while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => return emit_delta(&app, &request_id, "", true, Some(e.to_string())),
        };
        buf.extend_from_slice(&bytes);
        while let Some(nl) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=nl).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            match stream_event_from_line(&cfg.provider, &line) {
                StreamEvent::Token(t) => emit_delta(&app, &request_id, &t, false, None),
                StreamEvent::Done => break 'outer,
                StreamEvent::Ignore => {}
            }
        }
    }
    // Flush any final buffered line (a stream that ends without a trailing newline).
    if !buf.is_empty() {
        let line = String::from_utf8_lossy(&buf);
        if let StreamEvent::Token(t) = stream_event_from_line(&cfg.provider, &line) {
            emit_delta(&app, &request_id, &t, false, None);
        }
    }
    emit_delta(&app, &request_id, "", true, None);
}

/// Start a streamed completion identified by `request_id`. Tokens arrive over the `llm_delta` event;
/// `llm_cancel(request_id)` aborts. A duplicate id aborts the previous stream first (idempotent start).
#[tauri::command]
pub async fn llm_stream<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LlmState>,
    request_id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    let cfg = load_llm_config(&app)?.ok_or("AI provider not configured")?;
    let my_gen = state.next_gen.fetch_add(1, Ordering::Relaxed);
    let mut streams = state.streams.lock().await;
    if let Some((_, prev)) = streams.remove(&request_id) {
        prev.abort();
    }
    let app_for_task = app.clone();
    let id = request_id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        run_stream(app_for_task.clone(), id.clone(), cfg, messages).await;
        // Reclaim our own slot on natural completion (an aborted task never reaches here), but only if a
        // same-id restart hasn't already replaced it — the generation tag guards that race.
        let state = app_for_task.state::<LlmState>();
        let mut streams = state.streams.lock().await;
        if streams.get(&id).map(|(g, _)| *g) == Some(my_gen) {
            streams.remove(&id);
        }
    });
    streams.insert(request_id, (my_gen, handle));
    Ok(())
}

/// Abort an in-flight stream (if any) and emit a terminal `done` frame so the UI settles.
#[tauri::command]
pub async fn llm_cancel<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LlmState>,
    request_id: String,
) -> Result<(), String> {
    if let Some((_, handle)) = state.streams.lock().await.remove(&request_id) {
        handle.abort();
        log::info("llm", "stream cancelled").field("id", &request_id).emit();
        emit_delta(&app, &request_id, "", true, None);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.into(),
            content: content.into(),
        }
    }

    #[test]
    fn endpoints_per_provider() {
        assert_eq!(
            chat_endpoint("anthropic", "https://api.anthropic.com"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            chat_endpoint("openai", "https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint("ollama", "http://localhost:11434"),
            "http://localhost:11434/api/chat"
        );
        assert_eq!(
            models_endpoint("ollama", "http://localhost:11434"),
            "http://localhost:11434/api/tags"
        );
    }

    #[test]
    fn effective_base_defaults_and_trims() {
        let mut cfg = LlmConfig {
            provider: "anthropic".into(),
            base_url: String::new(),
            api_key: String::new(),
            model: String::new(),
            insecure: false,
            temperature: 0.7,
            max_tokens: 1024,
            agent_control: false,
        };
        assert_eq!(effective_base(&cfg), "https://api.anthropic.com");
        cfg.base_url = "http://localhost:11434/".into();
        assert_eq!(effective_base(&cfg), "http://localhost:11434");
    }

    #[test]
    fn anthropic_body_lifts_system_and_coerces_roles() {
        let messages = vec![
            msg("system", "you are terse"),
            msg("user", "hi"),
            msg("tool", "noise"), // non-assistant -> user
        ];
        let body = build_chat_body("anthropic", "claude", &messages, 0.5, 200, false);
        assert_eq!(body["system"], "you are terse");
        assert_eq!(body["max_tokens"], 200);
        let arr = body["messages"].as_array().unwrap();
        // system is lifted out, so only the two non-system turns remain
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["role"], "user");
        assert_eq!(arr[1]["role"], "user"); // coerced from "tool"
    }

    #[test]
    fn anthropic_clamps_temperature_to_one() {
        let body = build_chat_body("anthropic", "claude", &[msg("user", "hi")], 1.7, 200, false);
        assert_eq!(body["temperature"], 1.0);
        // OpenAI is NOT clamped (it accepts up to 2).
        let oai = build_chat_body("openai", "gpt", &[msg("user", "hi")], 1.7, 200, false);
        assert_eq!(oai["temperature"], 1.7);
    }

    #[test]
    fn openai_body_keeps_system_in_list_and_max_tokens() {
        let messages = vec![msg("system", "sys"), msg("user", "q")];
        let body = build_chat_body("openai", "gpt", &messages, 0.5, 200, true);
        let arr = body["messages"].as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["role"], "system");
        assert_eq!(body["stream"], true);
        assert_eq!(body["max_tokens"], 200);
    }

    #[test]
    fn ollama_body_uses_options() {
        let body = build_chat_body("ollama", "llama3.2", &[msg("user", "q")], 0.3, 64, false);
        assert_eq!(body["options"]["temperature"], 0.3);
        assert_eq!(body["options"]["num_predict"], 64);
    }

    #[test]
    fn parse_text_per_provider() {
        let anth = serde_json::json!({ "content": [ { "type": "text", "text": "he" }, { "type": "text", "text": "llo" } ] });
        assert_eq!(parse_chat_text("anthropic", &anth).as_deref(), Some("hello"));
        let oai = serde_json::json!({ "choices": [ { "message": { "content": "hi there" } } ] });
        assert_eq!(parse_chat_text("openai", &oai).as_deref(), Some("hi there"));
        let oll = serde_json::json!({ "message": { "content": "yo" } });
        assert_eq!(parse_chat_text("ollama", &oll).as_deref(), Some("yo"));
        // empty -> None (so the caller surfaces "no text" rather than an empty string)
        assert_eq!(parse_chat_text("openai", &serde_json::json!({})), None);
    }

    #[test]
    fn parse_models_per_provider() {
        let oai = serde_json::json!({ "data": [ { "id": "gpt-4o" }, { "id": "gpt-4o-mini" } ] });
        let m = parse_models("openai", &oai);
        assert_eq!(m.len(), 2);
        assert_eq!(m[0].id, "gpt-4o");
        let oll = serde_json::json!({ "models": [ { "name": "llama3.2" } ] });
        assert_eq!(parse_models("ollama", &oll)[0].id, "llama3.2");
    }

    #[test]
    fn provider_error_extracts_message() {
        let v = serde_json::json!({ "error": { "message": "invalid api key" } });
        assert_eq!(provider_error(&v).as_deref(), Some("invalid api key"));
        let v2 = serde_json::json!({ "error": "model not found" });
        assert_eq!(provider_error(&v2).as_deref(), Some("model not found"));
    }

    #[test]
    fn openai_sse_lines() {
        assert_eq!(
            stream_event_from_line("openai", "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}"),
            StreamEvent::Token("Hi".into())
        );
        assert_eq!(stream_event_from_line("openai", "data: [DONE]"), StreamEvent::Done);
        // a role-only opening delta carries no content -> Ignore
        assert_eq!(
            stream_event_from_line("openai", "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}"),
            StreamEvent::Ignore
        );
        assert_eq!(stream_event_from_line("openai", ""), StreamEvent::Ignore);
    }

    #[test]
    fn anthropic_sse_lines() {
        assert_eq!(
            stream_event_from_line(
                "anthropic",
                "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hel\"}}"
            ),
            StreamEvent::Token("Hel".into())
        );
        assert_eq!(
            stream_event_from_line("anthropic", "data: {\"type\":\"message_stop\"}"),
            StreamEvent::Done
        );
        // `event:` lines are ignored (anthropic sends both event: and data:)
        assert_eq!(
            stream_event_from_line("anthropic", "event: content_block_delta"),
            StreamEvent::Ignore
        );
    }

    #[test]
    fn ollama_stream_lines() {
        assert_eq!(
            stream_event_from_line("ollama", "{\"message\":{\"content\":\"yo\"},\"done\":false}"),
            StreamEvent::Token("yo".into())
        );
        assert_eq!(
            stream_event_from_line("ollama", "{\"message\":{\"content\":\"\"},\"done\":true}"),
            StreamEvent::Done
        );
    }

    #[test]
    fn transcription_seams() {
        assert_eq!(
            transcribe_endpoint("https://api.openai.com/v1"),
            "https://api.openai.com/v1/audio/transcriptions"
        );
        assert!(supports_transcription("openai"));
        assert!(!supports_transcription("anthropic"));
        assert!(!supports_transcription("ollama"));
        assert_eq!(mime_ext("audio/webm;codecs=opus"), "webm");
        assert_eq!(mime_ext("audio/wav"), "wav");
        assert_eq!(mime_ext("audio/mp4"), "m4a");
        assert_eq!(mime_ext("application/octet-stream"), "webm"); // fallback
        assert_eq!(
            parse_transcription(&serde_json::json!({ "text": "hello world" })).as_deref(),
            Some("hello world")
        );
        assert_eq!(parse_transcription(&serde_json::json!({ "text": "" })), None);
    }

    #[test]
    fn needs_key_only_for_keyed_providers() {
        assert!(needs_key("anthropic"));
        assert!(needs_key("openai"));
        assert!(!needs_key("ollama"));
    }

    #[test]
    fn config_defaults_keep_a_minimal_json_valid() {
        let cfg: LlmConfig = serde_json::from_str(r#"{ "provider": "anthropic" }"#).unwrap();
        assert_eq!(cfg.temperature, 0.7);
        assert_eq!(cfg.max_tokens, 1024);
        assert!(cfg.api_key.is_empty());
    }

    #[test]
    fn status_never_serializes_the_api_key() {
        let v = serde_json::to_value(LlmStatus {
            configured: true,
            provider: "openai".into(),
            base_url: "https://api.openai.com/v1".into(),
            model: "gpt-4o-mini".into(),
            has_key: true,
            temperature: 0.7,
            max_tokens: 1024,
            agent_control: false,
        })
        .unwrap();
        assert!(v.get("api_key").is_none() && v.get("apiKey").is_none());
        assert_eq!(v["hasKey"], true);
        assert_eq!(v["baseUrl"], "https://api.openai.com/v1");
        assert_eq!(v["maxTokens"], 1024);
    }
}
