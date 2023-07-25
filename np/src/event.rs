use serde::Serialize;
use tauri::Manager;

use crate::{
    listener::{ManagerEventWrapper, SessionUpdateEventWrapper},
    state::SessionRecord,
};

pub fn emit_to_bridge<R: tauri::Runtime>(
    manager: &impl Manager<R>,
    delta: (&str, Option<SessionRecord>),
) {
    match delta {
        (event_type, Some(record)) => {
            let _ = manager.emit_all(event_type, record);
        }
        (event_type, None) => {
            // FIXME: Might not be true in all cases
            println!("Skipped emitting event {event_type} as there is no attached SessionRecord");
        }
    };
}

#[derive(Clone, Debug, Serialize)]
pub enum NpSessionEvent {
    /// session ID, event
    /// ManagerEvent actually already contains session_id but we still keep session ID to be consistent
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
    pub fn from_session_update_event(event: SessionUpdateEventWrapper, session_id: usize) -> Self {
        NpSessionEvent::Update(session_id, event)
    }
}
