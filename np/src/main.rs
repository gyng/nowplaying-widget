#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use listener::{session_listener_windows_gsmtc, ManagerEventWrapper, SessionUpdateEventWrapper};
use state::SessionRecord;
use std::collections::HashMap;
use tauri::async_runtime::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, State};
use tokio::sync::mpsc;

use crate::command::get_initial_sessions;
use crate::event::emit_to_bridge;
use crate::state::updater;

pub mod command;
pub mod event;
pub mod listener;
pub mod sensors;
pub mod state;

pub struct AppState {
    pub sessions: Mutex<HashMap<usize, SessionRecord>>,
}

#[tokio::main]
async fn main() -> Result<(), ()> {
    let rx_session_manager = gsmtc::SessionManager::create()
        .await
        .expect("{failed to create gsmtc::SessionManager");
    let (tx_gsmtc, mut rx_gsmtc) = mpsc::channel(1);

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(AppState {
            sessions: Default::default(),
        })
        .invoke_handler(tauri::generate_handler![
            get_initial_sessions,
            command::load_layout,
            command::save_layout
        ])
        .setup(|app| {
            tauri::async_runtime::spawn(async move {
                session_listener_windows_gsmtc(rx_session_manager, tx_gsmtc).await
            });

            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                loop {
                    if let Some(event) = rx_gsmtc.recv().await {
                        let state: State<AppState> = app_handle.state();
                        let mut sessions = state.sessions.lock().await;
                        let delta = updater(&mut sessions, event);
                        emit_to_bridge(&app_handle.clone(), delta);
                    }
                }
            });

            let sensors_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                sensors::run_system_sensors(sensors_handle).await;
            });

            if let Err(err) = command::watch_layout(app.handle().clone()) {
                eprintln!("failed to start layout watcher: {err}");
            }

            // Tray menu: the only reliable way to toggle edit mode while the overlay
            // is click-through (a passive window receives no in-app keys).
            let edit_item = MenuItemBuilder::with_id("edit", "Edit layout").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app).item(&edit_item).item(&quit_item).build()?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Widget overlay — right-click for menu")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "edit" => {
                        let _ = app.emit("toggle_edit", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
