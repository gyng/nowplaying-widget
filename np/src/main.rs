#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::collections::HashMap;
use std::time::SystemTime;

use gsmtc::{Image, ManagerEvent, SessionModel, SessionUpdateEvent};
use gsmtc::{ManagerEvent::*, SessionUpdateEvent::*};
use serde::Serialize;
use tauri::async_runtime::Mutex;
use tauri::{Manager, State, WindowEvent};
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

#[derive(Clone, Debug, Serialize)]
pub enum NpSessionEvent {
    /// session ID, source, event
    /// ManagerEvent actually already contains this information but we still keep session ID to be consistent
    Create(usize, ManagerEventWrapper),
    Update(usize, SessionUpdateEventWrapper),
    Delete(usize, ManagerEventWrapper),
    Unsupported(Option<usize>, String),
}

impl From<ManagerEventWrapper> for NpSessionEvent {
    fn from(event: ManagerEventWrapper) -> Self {
        match &event {
            ManagerEventWrapper::SessionCreated {
                session_id,
                source: _,
            } => NpSessionEvent::Create(*session_id, event),
            ManagerEventWrapper::SessionRemoved { session_id } => {
                NpSessionEvent::Delete(*session_id, event)
            }
            ManagerEventWrapper::CurrentSessionChanged { session_id } => {
                NpSessionEvent::Unsupported(*session_id, "CurrentSessionChanged".to_owned())
            }
        }
    }
}

impl NpSessionEvent {
    fn from_session_update_event(event: SessionUpdateEventWrapper, session_id: usize) -> Self {
        NpSessionEvent::Update(session_id, event)
    }
}

#[derive(Clone, Debug, Serialize)]
pub enum ManagerEventWrapper {
    SessionCreated {
        session_id: usize,
        // rx: mpsc::UnboundedReceiver<SessionUpdateEvent>,
        source: String,
    },
    SessionRemoved {
        session_id: usize,
    },
    CurrentSessionChanged {
        session_id: Option<usize>,
    },
}

impl From<ManagerEvent> for ManagerEventWrapper {
    fn from(value: ManagerEvent) -> Self {
        match value {
            SessionCreated {
                session_id,
                rx: _,
                source,
            } => Self::SessionCreated { session_id, source },
            SessionRemoved { session_id } => Self::SessionRemoved { session_id },
            CurrentSessionChanged { session_id } => Self::CurrentSessionChanged { session_id },
        }
    }
}

async fn session_listener(
    mut manager_rx: mpsc::UnboundedReceiver<ManagerEvent>,
    tx_2: mpsc::Sender<NpSessionEvent>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    while let Some(evt) = manager_rx.recv().await {
        match evt {
            SessionCreated {
                session_id,
                mut rx,
                source,
            } => {
                let evt_wrapper: ManagerEventWrapper = ManagerEventWrapper::SessionCreated {
                    session_id: session_id,
                    source: source.clone(),
                };

                println!("Created session: {{id={session_id}, {:?}}}", evt_wrapper);

                let res_create = tx_2.send(evt_wrapper.into()).await;
                println!(
                    "send create session event x={session_id} res={:?}",
                    res_create.is_ok()
                );

                let tx_2_child = tx_2.clone();
                tokio::spawn(async move {
                    println!("session spawned {{x={session_id}}}");
                    while let Some(evt_update) = rx.recv().await {
                        let evt_update_wrapper: SessionUpdateEventWrapper = evt_update.into();

                        let res_2 = tx_2_child
                            .send(NpSessionEvent::from_session_update_event(
                                evt_update_wrapper,
                                session_id,
                            ))
                            .await;

                        println!("session event x={session_id} res={}", res_2.is_ok());
                    }
                    // println!("[{session_id}/{:?}] exited event-loop", evt_wrapper);
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

pub struct SessionRecord {
    pub session_id: usize,
    pub source: Option<String>,
    pub timestamp_created: Option<SystemTime>,
    pub timestamp_updated: Option<SystemTime>,
    pub last_media_update: Option<SessionUpdateEventWrapper>,
    pub last_model_update: Option<SessionUpdateEventWrapper>,
}

// pub struct Store {
//     storage: HashMap<usize, SessionRecord>,
// }

// impl Store {
//     fn get(key: usize) -> Option<SessionRecord> {
        
//     }
// }

pub struct AppState {
    pub sessions: Mutex<HashMap<usize, SessionRecord>>,
}

#[tokio::main]
async fn main() -> Result<(), ()> {
    let rx_session_manager = gsmtc::SessionManager::create().await.unwrap();
    // let (async_proc_input_tx, async_proc_input_rx) = mpsc::channel(1);

    let (tx_gsmtc, mut rx_gsmtc) = mpsc::channel(1);

    tauri::Builder::default()
        .manage(AppState {
            sessions: Default::default(),
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
                        let state: State<AppState> = app_handle.state();
                        let mut sessions = state.sessions.lock().await;

                        match output {
                            NpSessionEvent::Create(
                                _session_id_dupe,
                                ManagerEventWrapper::SessionCreated {
                                    session_id,
                                    source,
                                },
                            ) => {
                                let new_record = SessionRecord {
                                    session_id: session_id,
                                    source: Some(source),
                                    timestamp_created: Some(SystemTime::now()),
                                    timestamp_updated: None,
                                    last_media_update: None,
                                    last_model_update: None,
                                };
                                let _ = (*sessions).insert(session_id, new_record);
                            }
                            NpSessionEvent::Create(
                                _session_id_dupe,
                                ev,
                            ) => {
                                eprintln!(
                                    "Got a ManagerEvent::SessionRemoved or CurrentSessionChanged for MpSessionEvent::Create {:?}", ev
                                );
                            }
                            NpSessionEvent::Update(session_id, ev) => {
                                let maybe_existing = (*sessions).get(&session_id);
                                // WIP refactor; update state by storing sessions
                                // TODO: create np-widget-specific models for sessions and map gsmtc to it

                                let updated_record = if let Some(existing) = maybe_existing {
                                    let mut record_mut = SessionRecord {
                                        session_id: existing.session_id,
                                        source: existing.source.clone(),
                                        timestamp_created: existing.timestamp_created,
                                        timestamp_updated: Some(SystemTime::now()),
                                        // Check if this can be CoW?
                                        last_media_update: existing.last_media_update.clone(),
                                        last_model_update: existing.last_model_update.clone(),
                                    };

                                    match ev {
                                        SessionUpdateEventWrapper::Model(_) => {
                                            record_mut.last_model_update = Some(ev.into());
                                        }
                                        SessionUpdateEventWrapper::Media(_, _) => {
                                            record_mut.last_media_update = Some(ev.into());
                                        }
                                    }

                                    record_mut
                                } else {
                                    let updated_ev: SessionUpdateEventWrapper = ev.into();
                                    SessionRecord {
                                        session_id: session_id,
                                        source: None,
                                        timestamp_created: Some(SystemTime::now()),
                                        timestamp_updated: Some(SystemTime::now()),
                                        last_media_update: match updated_ev {
                                            SessionUpdateEventWrapper::Model(_) => None,
                                            // FIXME: awful clone here
                                            SessionUpdateEventWrapper::Media(_, _) => {
                                                Some(updated_ev.clone())
                                            }
                                        },
                                        last_model_update: match updated_ev {
                                            SessionUpdateEventWrapper::Model(_) => Some(updated_ev),
                                            SessionUpdateEventWrapper::Media(_, _) => None,
                                        },
                                    }
                                };

                                let _ = (*sessions).insert(session_id, updated_record);
                            }
                            NpSessionEvent::Delete(session_id, _ev) => {
                                (*sessions).remove(&session_id);
                            }
                            NpSessionEvent::Unsupported(session_id, label) => {
                                println!("Unsupported event {label}, session_id={:?}", session_id)
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|event| {
            // A bug in tauri-plugin-window-state means that window sizes for undecorated windows
            // are not restored with decoration sizes considered.
            // This is causing restored windows to grow in size on each app restart.
            // To get around this, restore decorations when the app is closed and hide decorations again
            // manually when the app is launched.
            // Decorations are disabled by the client on startup to work around another bug regarding window transparency
            // so there is no need to explicitly disable them in Rust code.
            if let WindowEvent::CloseRequested { .. } = event.event() {
                let _ = event.window().set_decorations(true);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
