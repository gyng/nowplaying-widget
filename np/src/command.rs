use serde::Serialize;

use crate::{AppState, SessionUpdateEventWrapper};

#[derive(Serialize)]
pub struct UpdateResponse {
    pub last_media_update: Option<SessionUpdateEventWrapper>,
    pub last_model_update: Option<SessionUpdateEventWrapper>,
}

// #[tauri::command]
// pub async fn get_last_update(
//     _message: String,
//     state: tauri::State<'_, AppState>,
// ) -> Result<UpdateResponse, String> {
//     let last_media_update = state.last_media_update.lock().await;
//     let last_model_update = state.last_model_update.lock().await;

//     Ok(UpdateResponse {
//         last_media_update: last_media_update.clone(),
//         last_model_update: last_model_update.clone(),
//     })
// }

#[tauri::command]
pub async fn get_last_update(
    _message: String,
    state: tauri::State<'_, AppState>,
) -> Result<UpdateResponse, String> {
    // let last_media_update = state.last_media_update.lock().await;
    // let last_model_update = state.last_model_update.lock().await;
    let sessions = state.sessions.lock().await;

    let latest_maybe =
        sessions.iter().max_by(
            |a, b| match (a.1.timestamp_created, b.1.timestamp_created) {
                (Some(x), Some(y)) => x.cmp(&y),
                (None, Some(y)) => std::cmp::Ordering::Less,
                (Some(x), None) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            },
        );

    // TODO: change UpdateResponse to be more informative and easier to use
    if let Some((_session_id, record)) = latest_maybe {
        return Ok(UpdateResponse {
            last_media_update: record.last_media_update.clone(),
            last_model_update: record.last_model_update.clone(),
        });
    } else {
        return Ok(UpdateResponse {
            last_media_update: None,
            last_model_update: None,
        });
    }
}
