use std::fmt;

use gsmtc::{Image, ManagerEvent, SessionModel, SessionUpdateEvent};
use serde::Serialize;
use tokio::sync::mpsc;

use crate::event::NpSessionEvent;

pub async fn session_listener_windows_gsmtc(
    mut manager_rx: mpsc::UnboundedReceiver<ManagerEvent>,
    tx: mpsc::Sender<NpSessionEvent>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    while let Some(evt) = manager_rx.recv().await {
        match evt {
            ManagerEvent::SessionCreated {
                session_id,
                mut rx,
                source,
            } => {
                // `rx` is killing our .into() when destructured so manually create the struct here
                let evt_wrapper: ManagerEventWrapper = ManagerEventWrapper::SessionCreated {
                    session_id,
                    source: source.clone(),
                };

                println!("Created session: {{id={session_id}, {:?}}}", evt_wrapper);

                let res_create = tx.send(evt_wrapper.into()).await;
                println!(
                    "send create session event x={session_id} res={:?}",
                    res_create.is_ok()
                );

                let tx_child = tx.clone();
                tokio::spawn(async move {
                    println!("session spawned {{x={session_id}}}");
                    while let Some(evt_update) = rx.recv().await {
                        println!("rx received!");
                        let evt_update_wrapper: SessionUpdateEventWrapper = evt_update.into();

                        let res_session_update = tx_child
                            .send(NpSessionEvent::from_session_update_event(
                                evt_update_wrapper,
                                session_id,
                            ))
                            .await;

                        println!(
                            "session event x={session_id} res={}",
                            res_session_update.is_ok()
                        );
                    }
                });
            }
            ManagerEvent::SessionRemoved { session_id } => {
                let evt_wrapper: ManagerEventWrapper =
                    ManagerEventWrapper::SessionRemoved { session_id };

                let res_session_update = tx.send(evt_wrapper.into()).await;

                println!(
                    "removed session event x={session_id} res={}",
                    res_session_update.is_ok()
                );
            }
            ManagerEvent::CurrentSessionChanged {
                session_id: Some(id),
            } => {
                // TODO: reset frontend
                println!("Current session: {id}")
            }
            ManagerEvent::CurrentSessionChanged { session_id: None } => {
                // TODO: clear frontend
                println!("No more current session");
            }
        }
    }

    Ok(())
}

#[derive(Clone, Serialize)]
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

impl fmt::Debug for ImageWrapper {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "ImageWrapper {{ content_type: {}, data: u8[{}] }}",
            self.content_type,
            self.data.len()
        )
    }
}

// Serde's remote doesn't seem to work on enum fields? Image in Media wants to be Serialize, but that won't work
#[derive(Clone, Debug, Serialize)]
pub enum SessionUpdateEventWrapper {
    Model(SessionModel),
    Media(SessionModel, Option<ImageWrapper>),
}

impl From<gsmtc::SessionUpdateEvent> for SessionUpdateEventWrapper {
    fn from(value: gsmtc::SessionUpdateEvent) -> Self {
        match value {
            SessionUpdateEvent::Model(model) => SessionUpdateEventWrapper::Model(model),
            SessionUpdateEvent::Media(model, image) => {
                SessionUpdateEventWrapper::Media(model, image.map(|i| i.into()))
            }
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub enum ManagerEventWrapper {
    SessionCreated { session_id: usize, source: String },
    SessionRemoved { session_id: usize },
    CurrentSessionChanged { session_id: Option<usize> },
}

impl From<ManagerEvent> for ManagerEventWrapper {
    fn from(value: ManagerEvent) -> Self {
        match value {
            gsmtc::ManagerEvent::SessionCreated {
                session_id,
                rx: _,
                source,
            } => Self::SessionCreated { session_id, source },
            gsmtc::ManagerEvent::SessionRemoved { session_id } => {
                Self::SessionRemoved { session_id }
            }
            gsmtc::ManagerEvent::CurrentSessionChanged { session_id } => {
                Self::CurrentSessionChanged { session_id }
            }
        }
    }
}
