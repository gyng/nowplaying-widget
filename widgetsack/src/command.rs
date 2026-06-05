use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use notify::Watcher;
use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::{log, AppState, SessionRecord};

#[derive(Serialize)]
pub struct UpdateResponse {
    pub sessions: HashMap<usize, SessionRecord>,
}

#[tauri::command]
pub async fn get_initial_sessions(
    _message: String,
    state: tauri::State<'_, AppState>,
) -> Result<UpdateResponse, String> {
    let sessions = state.sessions.lock().await;

    let mut cloned: HashMap<usize, SessionRecord> = HashMap::new();
    cloned.clone_from(&sessions);

    Ok(UpdateResponse { sessions: cloned })
}

/// Path to the persisted widget layout (`widgets.json` in the app config dir).
fn layout_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("widgets.json"))
}

/// Read the saved layout file, or `None` if it does not exist yet. The frontend
/// validates/parses the contents (see core/layout.ts) so this stays dumb I/O.
#[tauri::command]
pub async fn load_layout(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = layout_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Write the layout file, creating the config directory if needed.
#[tauri::command]
pub async fn save_layout(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = layout_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Path to the persisted control remaps (`controls.json` in the app config dir).
fn controls_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("controls.json"))
}

/// Read the saved control overrides, or `None` if none saved yet. The frontend validates/parses
/// the contents (core/controls.ts `parseControlOverrides`) so this stays dumb I/O — mirrors
/// `load_layout`, and an absent/garbage file simply falls back to the code defaults.
#[tauri::command]
pub async fn load_controls(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = controls_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Write the control overrides file, creating the config directory if needed.
#[tauri::command]
pub async fn save_controls(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = controls_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Open the webview devtools/inspector for the calling window (CSS development from the studio's
/// context menu). `open_devtools` is available because tauri's `devtools` feature is enabled in
/// Cargo.toml (it is also always available in debug builds).
#[tauri::command]
pub fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFont {
    /// Family name (CSS `font-family`).
    pub name: String,
    /// PostScript name (often a spaceless variant of the family).
    pub font_name: String,
    /// Absolute path to the font file (for the webview to @font-face via the asset protocol).
    pub path: String,
}

/// Enumerate installed fonts (incl. PER-USER ones) with their file paths. Chromium's sandboxed
/// webview won't render a per-user-installed font by name — but fontdb can find it here, and the
/// frontend then loads the file directly via @font-face + the asset protocol (the approach of
/// tauri-plugin-system-fonts, inlined). The per-user fonts dir is added explicitly (where Windows
/// puts "install for me only" fonts).
#[tauri::command]
pub fn system_fonts() -> Vec<SystemFont> {
    use fontdb::{Database, Source};
    let mut db = Database::new();
    db.load_system_fonts();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        db.load_fonts_dir(std::path::Path::new(&local).join("Microsoft\\Windows\\Fonts"));
    }
    db.faces()
        .filter_map(|f| match &f.source {
            Source::File(path) => {
                let name = f.families.first()?.0.clone();
                if name.starts_with('.') {
                    return None; // hidden/system aliases
                }
                Some(SystemFont {
                    name,
                    font_name: f.post_script_name.clone(),
                    path: path.to_string_lossy().into_owned(),
                })
            }
            _ => None,
        })
        .collect()
}

// ---- themes (Phase 7c): a `themes/<name>.css` plugin folder in the app config dir ----

fn themes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("themes"))
}

/// The theme names (file stems of `themes/*.css`), sorted. The frontend adds a synthetic
/// "(default)" option (no theme = the meters' token fallbacks).
#[tauri::command]
pub fn list_themes(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = themes_dir(&app)?;
    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|x| x.to_str()) == Some("css")
                && let Some(stem) = path.file_stem().and_then(|s| s.to_str())
            {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// The CSS of theme `name` (a bare file stem), or `None` if it doesn't exist.
#[tauri::command]
pub fn load_theme(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    if !valid_name(&name) {
        return Err("invalid theme name".to_string());
    }
    let path = themes_dir(&app)?.join(format!("{name}.css"));
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Write theme `name` (used by the studio's token panel, Phase 7d). Creates `themes/`.
#[tauri::command]
pub fn save_theme(app: tauri::AppHandle, name: String, contents: String) -> Result<(), String> {
    if !valid_name(&name) {
        return Err("invalid theme name".to_string());
    }
    let dir = themes_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{name}.css")), contents).map_err(|e| e.to_string())
}

// ---- sacks: shareable bundles (`sacks/<name>.sack.json` in the app config dir) ----
// A "sack" packs the widget library + active theme CSS + token overrides as one JSON file so a
// user can share/reuse a set. Dumb I/O to a fixed folder (no native file picker); the frontend
// owns the format + merge logic (core/sack.ts).

fn sacks_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("sacks"))
}

/// Shared filename allowlist for user-named config files (themes, sacks). The name becomes a
/// path segment, so it must be a safe, bounded token: 1–64 chars of `[A-Za-z0-9 _-]` only. This
/// rejects control chars, path separators, `..`, and Windows-reserved characters by construction;
/// the explicit empty/`..`/separator checks below are kept as a defensive backstop.
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '_' || c == '-')
}

fn valid_sack_name(name: &str) -> bool {
    valid_name(name)
}

/// The sack names (file stems of `sacks/*.sack.json`), sorted.
#[tauri::command]
pub fn list_sacks(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = sacks_dir(&app)?;
    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(file) = path.file_name().and_then(|s| s.to_str())
                && let Some(stem) = file.strip_suffix(".sack.json")
            {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// The JSON of sack `name`, or `None` if it doesn't exist. The frontend parses/validates it.
#[tauri::command]
pub fn read_sack(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    if !valid_sack_name(&name) {
        return Err("invalid sack name".to_string());
    }
    let path = sacks_dir(&app)?.join(format!("{name}.sack.json"));
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Write sack `name` (creates `sacks/`). Returns the absolute path written, for the UI to show.
#[tauri::command]
pub fn write_sack(app: tauri::AppHandle, name: String, contents: String) -> Result<String, String> {
    if !valid_sack_name(&name) {
        return Err("invalid sack name".to_string());
    }
    let dir = sacks_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{name}.sack.json"));
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

// ---- saved layouts: named layout profiles (`layouts/<name>.layout.json` in the app config dir) ----
// A saved layout is one monitor's arrangement (root tree + floating widgets) the user can name, list,
// load back, and delete from the studio. Dumb I/O to a fixed folder (same shape as sacks/themes); the
// frontend owns the JSON format + the load/replace logic (core/savedLayout.ts).

fn layouts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("layouts"))
}

/// The saved-layout names (file stems of `layouts/*.layout.json`), sorted.
#[tauri::command]
pub fn list_layouts(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = layouts_dir(&app)?;
    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(file) = path.file_name().and_then(|s| s.to_str())
                && let Some(stem) = file.strip_suffix(".layout.json")
            {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// The JSON of saved layout `name`, or `None` if it doesn't exist. The frontend parses/validates it.
#[tauri::command]
pub fn read_layout(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    if !valid_name(&name) {
        return Err("invalid layout name".to_string());
    }
    let path = layouts_dir(&app)?.join(format!("{name}.layout.json"));
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Write saved layout `name` (creates `layouts/`). Returns the absolute path written.
#[tauri::command]
pub fn save_layout_as(app: tauri::AppHandle, name: String, contents: String) -> Result<String, String> {
    if !valid_name(&name) {
        return Err("invalid layout name".to_string());
    }
    let dir = layouts_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{name}.layout.json"));
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Delete saved layout `name`. Ok even if it's already gone (idempotent).
#[tauri::command]
pub fn delete_layout(app: tauri::AppHandle, name: String) -> Result<(), String> {
    if !valid_name(&name) {
        return Err("invalid layout name".to_string());
    }
    let path = layouts_dir(&app)?.join(format!("{name}.layout.json"));
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

/// Seed a couple of example themes on first run so the picker has something to show
/// (the default look needs no theme). No-op once `themes/` exists.
pub fn seed_themes(app: &tauri::AppHandle) {
    let dir = match themes_dir(app) {
        Ok(d) => d,
        Err(_) => return,
    };
    if dir.exists() {
        return;
    }
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let samples: &[(&str, &str)] = &[
        (
            "amber",
            ":root {\n\t--np-accent: #ffb000;\n\t--np-label: #ffd27f;\n\t--np-track: rgba(255, 176, 0, 0.18);\n}\n",
        ),
        (
            "mono",
            ":root {\n\t--np-accent: #d8dee9;\n\t--np-fg: #eceff4;\n\t--np-label: #9aa5b1;\n\t--np-track: rgba(255, 255, 255, 0.12);\n}\n",
        ),
    ];
    for (name, css) in samples {
        let _ = fs::write(dir.join(format!("{name}.css")), css);
    }
}

/// Watch `themes/` and emit `themes_changed` so the frontend live-reloads the active theme.
pub fn watch_themes(app: tauri::AppHandle) -> Result<(), String> {
    let dir = themes_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(watcher) => watcher,
            Err(err) => {
                log::error("watch", "themes watcher init failed")
                    .field("error", err)
                    .emit();
                return;
            }
        };
        if let Err(err) = watcher.watch(&dir, notify::RecursiveMode::NonRecursive) {
            log::error("watch", "themes watch failed").field("error", err).emit();
            return;
        }
        for res in rx {
            match res {
                Ok(_) => {
                    let _ = app.emit("themes_changed", ());
                }
                Err(err) => log::warn("watch", "themes watch error").field("error", err).emit(),
            }
        }
    });

    Ok(())
}

/// Watch the config dir for changes to widgets.json and emit `layout_changed`
/// so the frontend can live-reload. Best-effort: logs and returns on failure.
pub fn watch_layout(app: tauri::AppHandle) -> Result<(), String> {
    let path = layout_path(&app)?;
    let dir = path
        .parent()
        .ok_or_else(|| "layout path has no parent".to_string())?
        .to_path_buf();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(watcher) => watcher,
            Err(err) => {
                log::error("watch", "layout watcher init failed")
                    .field("error", err)
                    .emit();
                return;
            }
        };
        if let Err(err) = watcher.watch(&dir, notify::RecursiveMode::NonRecursive) {
            log::error("watch", "layout watch failed").field("error", err).emit();
            return;
        }
        // Keep `watcher` alive by blocking on the channel for the app's lifetime.
        for res in rx {
            match res {
                Ok(event) => {
                    if event.paths.iter().any(|p| p.file_name() == path.file_name()) {
                        let _ = app.emit("layout_changed", ());
                    }
                }
                Err(err) => log::warn("watch", "layout watch error").field("error", err).emit(),
            }
        }
    });

    Ok(())
}

/// Watch the config dir for changes to controls.json and emit `controls_changed` so the frontend
/// can live-reload remaps (e.g. an external edit, or another window saving). Mirrors `watch_layout`.
pub fn watch_controls(app: tauri::AppHandle) -> Result<(), String> {
    let path = controls_path(&app)?;
    let dir = path
        .parent()
        .ok_or_else(|| "controls path has no parent".to_string())?
        .to_path_buf();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(watcher) => watcher,
            Err(err) => {
                log::error("watch", "controls watcher init failed")
                    .field("error", err)
                    .emit();
                return;
            }
        };
        if let Err(err) = watcher.watch(&dir, notify::RecursiveMode::NonRecursive) {
            log::error("watch", "controls watch failed").field("error", err).emit();
            return;
        }
        for res in rx {
            match res {
                Ok(event) => {
                    if event.paths.iter().any(|p| p.file_name() == path.file_name()) {
                        let _ = app.emit("controls_changed", ());
                    }
                }
                Err(err) => log::warn("watch", "controls watch error").field("error", err).emit(),
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::valid_name;

    #[test]
    fn valid_name_accepts_plain_tokens() {
        assert!(valid_name("amber"));
        assert!(valid_name("My Theme 2"));
        assert!(valid_name("dark_mode-v2"));
        assert!(valid_name(&"x".repeat(64)));
    }

    #[test]
    fn valid_name_rejects_unsafe_or_oversized() {
        assert!(!valid_name("")); // empty
        assert!(!valid_name("..")); // traversal
        assert!(!valid_name("a/b")); // separator
        assert!(!valid_name("a\\b")); // separator
        assert!(!valid_name("a..b")); // contains ..
        assert!(!valid_name("name.css")); // dot (extension is added by the caller)
        assert!(!valid_name("a:b")); // reserved char
        assert!(!valid_name("tab\tname")); // control char
        assert!(!valid_name("café")); // non-ASCII
        assert!(!valid_name(&"x".repeat(65))); // too long
    }
}
