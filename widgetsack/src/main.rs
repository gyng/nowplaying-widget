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
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tokio::sync::mpsc;

use crate::command::get_initial_sessions;
use crate::event::emit_to_bridge;
use crate::state::updater;

pub mod clickthrough;
pub mod command;
pub mod event;
pub mod ha;
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
        // Persist window size/position, but DO NOT let the plugin manage DECORATIONS or VISIBLE:
        // - DECORATIONS: our overlays are intentionally borderless (config `decorations:false`),
        //   and the default `StateFlags::all()` would restore a stale saved `decorations:true` at
        //   startup — re-adding a title bar/border that our JS never counters (it only re-asserts
        //   shadow).
        // - VISIBLE: the main window is born hidden (config `visible:false`) and only revealed by
        //   the frontend AFTER it has been sized/positioned to fill the primary monitor and the
        //   layout has rendered (overlay.ts `setMainWindowVisible` via `syncPrimaryOverlays`).
        //   Restoring the saved `visible:true` here would un-hide it at its stale boot geometry,
        //   reintroducing the startup flash of mis-placed/blank content this is meant to prevent.
        // Excluding both flags makes config + JS the single source of truth for them.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState {
            sessions: Default::default(),
        })
        .manage(clickthrough::InteractiveRects::default())
        .manage(ha::HaState::default())
        .invoke_handler(tauri::generate_handler![
            get_initial_sessions,
            command::load_layout,
            command::save_layout,
            command::list_themes,
            command::load_theme,
            command::save_theme,
            command::list_sacks,
            command::read_sack,
            command::write_sack,
            command::open_devtools,
            command::system_fonts,
            clickthrough::set_interactive_rects,
            clickthrough::current_work_area,
            ha::ha_connect,
            ha::ha_disconnect,
            ha::list_ha_entities,
            ha::ha_call_service,
            ha::save_ha_config,
            ha::ha_config_status
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

            // Themes (Phase 7c): seed example themes on first run + watch the folder.
            command::seed_themes(&app.handle().clone());
            if let Err(err) = command::watch_themes(app.handle().clone()) {
                eprintln!("failed to start themes watcher: {err}");
            }

            clickthrough::run_clickthrough_watcher(app.handle().clone());

            // Tray menu: the only reliable way to toggle edit mode while the overlay
            // is click-through (a passive window receives no in-app keys).
            let edit_item = MenuItemBuilder::with_id("edit", "Edit layout").build(app)?;
            let designer_item = MenuItemBuilder::with_id("designer", "Open designer").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&edit_item)
                .item(&designer_item)
                .item(&quit_item)
                .build()?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Widget overlay — right-click for menu")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "edit" => {
                        let _ = app.emit("toggle_edit", ());
                    }
                    "designer" => {
                        // The primary overlay listens and opens the studio window (5s).
                        let _ = app.emit("open_studio", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // Global hotkey: toggle edit mode from anywhere (a passive click-through
            // overlay receives no in-app keys). Broadcasts the same event the tray and
            // Ctrl+E use, so every monitor's overlay toggles together.
            let toggle_edit_shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyE);
            if let Err(err) =
                app.global_shortcut()
                    .on_shortcut(toggle_edit_shortcut, |app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            let _ = app.emit("toggle_edit", ());
                        }
                    })
            {
                eprintln!("failed to register global shortcut: {err}");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
