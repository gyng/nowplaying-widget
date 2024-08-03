use std::{collections::HashMap, time::SystemTime};

use serde::Serialize;

use crate::{event::NpSessionEvent, ManagerEventWrapper, SessionUpdateEventWrapper};

#[derive(Debug, Clone, Serialize)]
pub struct SessionRecord {
    pub session_id: usize,
    pub source: Option<String>,
    pub timestamp_created: Option<SystemTime>,
    pub timestamp_updated: Option<SystemTime>,
    pub last_media_update: Option<SessionUpdateEventWrapper>,
    pub last_model_update: Option<SessionUpdateEventWrapper>,
}

pub fn updater(
    sessions: &mut HashMap<usize, SessionRecord>,
    event: NpSessionEvent,
) -> (&str, Option<SessionRecord>) {
    match event {
        NpSessionEvent::Create(
            _session_id_dupe,
            ManagerEventWrapper::SessionCreated { session_id, source },
        ) => {
            let new_record = SessionRecord {
                session_id,
                source: Some(source),
                timestamp_created: Some(SystemTime::now()),
                timestamp_updated: None,
                last_media_update: None,
                last_model_update: None,
            };
            let _ = (*sessions).insert(session_id, new_record.clone());
            ("session_create", Some(new_record))
        }
        NpSessionEvent::Create(_session_id_dupe, ev) => {
            eprintln!(
                "Got a ManagerEvent::SessionRemoved or CurrentSessionChanged for MpSessionEvent::Create {:?}", ev
            );
            ("session_create", None)
        }
        NpSessionEvent::Update(session_id, ev) => {
            let maybe_existing = (*sessions).get(&session_id);
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
                        record_mut.last_model_update = Some(ev);
                    }
                    SessionUpdateEventWrapper::Media(_, _) => {
                        record_mut.last_media_update = Some(ev);
                    }
                }

                record_mut
            } else {
                let updated_ev: SessionUpdateEventWrapper = ev;
                SessionRecord {
                    session_id,
                    source: None,
                    timestamp_created: Some(SystemTime::now()),
                    timestamp_updated: Some(SystemTime::now()),
                    last_media_update: match updated_ev {
                        SessionUpdateEventWrapper::Model(_) => None,
                        // FIXME: awful clone here
                        SessionUpdateEventWrapper::Media(_, _) => Some(updated_ev.clone()),
                    },
                    last_model_update: match updated_ev {
                        SessionUpdateEventWrapper::Model(_) => Some(updated_ev),
                        SessionUpdateEventWrapper::Media(_, _) => None,
                    },
                }
            };

            let _ = (*sessions).insert(session_id, updated_record.clone());
            ("session_update", Some(updated_record))
        }
        NpSessionEvent::Delete(session_id, _ev) => {
            let maybe_deleted_record = (*sessions).remove(&session_id);

            if let Some(deleted_record) = maybe_deleted_record {
                ("session_delete", Some(deleted_record))
            } else {
                ("session_delete", None)
            }
        }
        NpSessionEvent::Unsupported(session_id, label) => {
            println!("Unsupported event {label}, session_id={:?}", session_id);
            ("unsupported", None)
        }
    }
}
