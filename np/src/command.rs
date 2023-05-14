use serde::Serialize;

use crate::{AppState, SessionUpdateEventWrapper};

#[derive(Serialize)]
pub struct UpdateResponse {
    pub last_media_update: Option<SessionUpdateEventWrapper>,
    pub last_model_update: Option<SessionUpdateEventWrapper>,
}

#[tauri::command]
pub async fn get_last_update(
    _message: String,
    state: tauri::State<'_, AppState>,
) -> Result<UpdateResponse, String> {
    let last_media_update = state.last_media_update.lock().await;
    let last_model_update = state.last_model_update.lock().await;

    Ok(UpdateResponse {
        last_media_update: last_media_update.clone(),
        last_model_update: last_model_update.clone(),
    })
}
