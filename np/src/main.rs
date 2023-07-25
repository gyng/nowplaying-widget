#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use listener::{session_listener_windows_gsmtc, ManagerEventWrapper, SessionUpdateEventWrapper};
use state::SessionRecord;
use std::collections::HashMap;
use tauri::async_runtime::Mutex;
use tauri::{Manager, State, WindowEvent};
use tokio::sync::mpsc;

use crate::command::get_initial_sessions;
use crate::event::emit_to_bridge;
use crate::state::updater;

pub mod command;
pub mod event;
pub mod listener;
pub mod state;

pub struct AppState {
    pub sessions: Mutex<HashMap<usize, SessionRecord>>,
}

#[tokio::main]
async fn main() -> Result<(), ()> {
    let rx_session_manager = gsmtc::SessionManager::create().await.unwrap();
    let (tx_gsmtc, mut rx_gsmtc) = mpsc::channel(1);

    tauri::Builder::default()
        .manage(AppState {
            sessions: Default::default(),
        })
        .invoke_handler(tauri::generate_handler![get_initial_sessions])
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            tauri::async_runtime::spawn(async move {
                session_listener_windows_gsmtc(rx_session_manager, tx_gsmtc).await
            });

            let app_handle = app.handle();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Some(event) = rx_gsmtc.recv().await {
                        let state: State<AppState> = app_handle.state();
                        let mut sessions = state.sessions.lock().await;
                        let delta = updater(&mut sessions, event);
                        emit_to_bridge(&app_handle, delta);
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
