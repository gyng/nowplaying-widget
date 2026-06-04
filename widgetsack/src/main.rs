#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use listener::{session_listener_windows_gsmtc, ManagerEventWrapper, SessionUpdateEventWrapper};
use state::SessionRecord;
use std::collections::HashMap;
use tauri::async_runtime::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
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
pub mod log;
pub mod media;
pub mod mqtt;
pub mod sensors;
pub mod state;

pub struct AppState {
    pub sessions: Mutex<HashMap<usize, SessionRecord>>,
}

#[tokio::main]
async fn main() -> Result<(), ()> {
    // Route panics through the logging pipeline (stderr + rotating file + webview) so a panic on
    // any thread is never silent. Installed before anything else, so even a panic during startup
    // (before `log::init` wires the app handle) still hits stderr + the file.
    std::panic::set_hook(Box::new(log::log_panic));

    let rx_session_manager = gsmtc::SessionManager::create()
        .await
        .expect("{failed to create gsmtc::SessionManager");
    // Capacity 16 (was 1): a burst of media events (e.g. a track change firing several
    // SessionUpdateEvents) can't briefly block the gsmtc listener task on a full channel.
    let (tx_gsmtc, mut rx_gsmtc) = mpsc::channel(16);

    tauri::Builder::default()
        // Single-instance MUST be the first plugin (its callback fires synchronously on a second
        // launch, before windows exist). A second launch focuses the running app by emitting
        // open_studio (the primary overlay opens the studio), then that process exits.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Emitter;
            let _ = app.emit("open_studio", ());
        }))
        // "Launch at login" support. The Settings toggle enables/disables it via the granted
        // autostart:* commands (overlay.json capability); registering it here just makes them work.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
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
                // Don't persist/restore the "main" window's geometry: it is ALWAYS re-filled to
                // the primary monitor at startup (overlay.ts `fillPrimaryMonitor`), so restoring
                // stale saved geometry is pointless and risks a startup flash at the wrong spot.
                // A denylisted window is skipped entirely (no restore AND no save). "studio" still
                // persists (remembering a normal window's size/pos is the point), and dynamic
                // "overlay-N" windows re-assert exact geometry in their created handler.
                .with_denylist(&["main"])
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState {
            sessions: Default::default(),
        })
        .manage(clickthrough::InteractiveRects::default())
        .manage(ha::HaState::default())
        .manage(mqtt::MqttState::default())
        .manage(sensors::ActiveSensors::default())
        .invoke_handler(tauri::generate_handler![
            get_initial_sessions,
            command::load_layout,
            command::save_layout,
            command::load_controls,
            command::save_controls,
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
            sensors::set_active_sensors,
            media::media_control,
            media::media_capabilities,
            log::get_logs,
            ha::ha_connect,
            ha::ha_disconnect,
            ha::list_ha_entities,
            ha::ha_registry_snapshot,
            ha::ha_call_service,
            ha::save_ha_config,
            ha::ha_config_status,
            ha::ha_test_connection,
            mqtt::save_mqtt_config,
            mqtt::mqtt_config_status,
            mqtt::mqtt_connect,
            mqtt::mqtt_disconnect,
            mqtt::mqtt_catalog
        ])
        .setup(|app| {
            // Wire structured logging to the app so records also stream to the webview (`log` event).
            log::init(app.handle().clone());

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
                log::error("startup", "failed to start layout watcher")
                    .field("error", err)
                    .emit();
            }

            // Control remaps (controls.json): live-reload on external edits / cross-window saves.
            if let Err(err) = command::watch_controls(app.handle().clone()) {
                log::error("startup", "failed to start controls watcher")
                    .field("error", err)
                    .emit();
            }

            // Themes (Phase 7c): seed example themes on first run + watch the folder.
            command::seed_themes(&app.handle().clone());
            if let Err(err) = command::watch_themes(app.handle().clone()) {
                log::error("startup", "failed to start themes watcher")
                    .field("error", err)
                    .emit();
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
                // Left-click (primary button release) opens the designer; right-click still shows
                // the menu above. Match on the button-up edge so a single click fires once.
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let _ = tray.app_handle().emit("open_studio", ());
                    }
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
                log::error("startup", "failed to register global shortcut")
                    .field("error", err)
                    .emit();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
