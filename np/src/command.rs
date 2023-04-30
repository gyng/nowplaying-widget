use crate::{AppState, SessionUpdateEventWrapper};

#[tauri::command]
pub async fn get_last_update(
    _message: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<SessionUpdateEventWrapper>, String> {
    let last_update = state.last_update.lock().await;
    Ok(last_update.clone())
}
