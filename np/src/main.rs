#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use gsmtc::{Image, ManagerEvent, SessionModel, SessionUpdateEvent};
use gsmtc::{ManagerEvent::*, SessionUpdateEvent::*};
use serde::Serialize;
use tauri::async_runtime::Mutex;
use tauri::{Manager, State};
use tokio::sync::mpsc;

use crate::command::get_last_update;

pub mod command;

fn emit_update<R: tauri::Runtime>(message: SessionUpdateEventWrapper, manager: &impl Manager<R>) {
    match message {
        SessionUpdateEventWrapper::Model(_) => {
            manager.emit_all("model_update", message).unwrap();
        }
        SessionUpdateEventWrapper::Media(_, _) => {
            manager.emit_all("media_update", message).unwrap();
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ImageWrapper {
    pub content_type: String,
    pub data: Vec<u8>,
}

impl From<Image> for ImageWrapper {
    fn from(value: Image) -> Self {
        ImageWrapper {
            content_type: value.content_type,
            data: value.data,
        }
    }
}

// Serde's remote doesn't seem to work on enum fields? Image in Media wants to be Serialize, but that won't work
#[derive(Clone, Debug, Serialize)]
pub enum SessionUpdateEventWrapper {
    Model(SessionModel),
    Media(SessionModel, Option<ImageWrapper>),
}

impl From<SessionUpdateEvent> for SessionUpdateEventWrapper {
    fn from(value: SessionUpdateEvent) -> Self {
        match value {
            Model(model) => SessionUpdateEventWrapper::Model(model),
            Media(model, image) => SessionUpdateEventWrapper::Media(model, image.map(|i| i.into())),
        }
    }
}

async fn session_listener(
    mut manager_rx: mpsc::UnboundedReceiver<ManagerEvent>,
    tx: mpsc::Sender<SessionUpdateEvent>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    while let Some(evt) = manager_rx.recv().await {
        match evt {
            SessionCreated {
                session_id,
                mut rx,
                source,
            } => {
                println!("Created session: {{id={session_id}, source={source}}}");
                let tx_child = tx.clone();
                tokio::spawn(async move {
                    println!("session spawned {{x={session_id}}}");
                    while let Some(evt) = rx.recv().await {
                        let res = tx_child.send(evt).await;
                        let is_ok = res.is_ok();
                        println!("session event x={session_id} res={is_ok}");
                    }
                    println!("[{session_id}/{source}] exited event-loop");
                });
            }
            SessionRemoved { session_id } => {
                // TODO: reset frontend
                println!("Session {{id={session_id}}} was removed")
            }
            CurrentSessionChanged {
                session_id: Some(id),
            } => {
                // TODO: reset frontend
                println!("Current session: {id}")
            }
            CurrentSessionChanged { session_id: None } => {
                // TODO: clear frontend
                println!("No more current session");
            }
        }
    }

    Ok(())
}

pub struct AppState {
    pub last_media_update: Mutex<Option<SessionUpdateEventWrapper>>,
    pub last_model_update: Mutex<Option<SessionUpdateEventWrapper>>,
}

#[tokio::main]
async fn main() -> Result<(), ()> {
    let (tx_gsmtc, mut rx_gsmtc) = mpsc::channel(1);
    let rx_session_manager = gsmtc::SessionManager::create().await.unwrap();
    // let (async_proc_input_tx, async_proc_input_rx) = mpsc::channel(1);

    tauri::Builder::default()
        .manage(AppState {
            last_media_update: Default::default(),
            last_model_update: Default::default(),
        })
        .invoke_handler(tauri::generate_handler![get_last_update])
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            tauri::async_runtime::spawn(async move {
                session_listener(rx_session_manager, tx_gsmtc).await
            });

            let app_handle = app.handle();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Some(output) = rx_gsmtc.recv().await {
                        let wrapper: SessionUpdateEventWrapper = output.into();
                        emit_update(wrapper.clone(), &app_handle);
                        let state: State<AppState> = app_handle.state();
                        // TODO: see if this can be refactored

                        match wrapper {
                            SessionUpdateEventWrapper::Media(_, _) => {
                                let mut state = state.last_media_update.lock().await;
                                *state = Some(wrapper);
                            }
                            SessionUpdateEventWrapper::Model(_) => {
                                let mut state: tokio::sync::MutexGuard<
                                    Option<SessionUpdateEventWrapper>,
                                > = state.last_model_update.lock().await;
                                *state = Some(wrapper);
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
