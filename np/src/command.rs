use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use notify::Watcher;
use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::{AppState, SessionRecord};

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
                eprintln!("layout watcher init failed: {err}");
                return;
            }
        };
        if let Err(err) = watcher.watch(&dir, notify::RecursiveMode::NonRecursive) {
            eprintln!("layout watch failed: {err}");
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
                Err(err) => eprintln!("layout watch error: {err}"),
            }
        }
    });

    Ok(())
}
