use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ServerStatus {
    Stopped = 0,
    Starting = 1,
    Running = 2,
    Stopping = 3,
    RconUnavailable = 4,
    ProcessExited = 5,
}

impl From<u8> for ServerStatus {
    fn from(val: u8) -> Self {
        match val {
            1 => ServerStatus::Starting,
            2 => ServerStatus::Running,
            3 => ServerStatus::Stopping,
            4 => ServerStatus::RconUnavailable,
            5 => ServerStatus::ProcessExited,
            _ => ServerStatus::Stopped,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ServerState {
    status: Arc<AtomicU8>,
    sender: broadcast::Sender<ServerStatus>,
}

impl Default for ServerState {
    fn default() -> Self {
        let (tx, _) = broadcast::channel(64);
        Self {
            status: Arc::new(AtomicU8::new(ServerStatus::Stopped as u8)),
            sender: tx,
        }
    }
}

impl ServerState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_status(&self) -> ServerStatus {
        ServerStatus::from(self.status.load(Ordering::SeqCst))
    }

    pub fn set_status(&self, new_status: ServerStatus) {
        self.status.store(new_status as u8, Ordering::SeqCst);
        let _ = self.sender.send(new_status);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ServerStatus> {
        self.sender.subscribe()
    }

    pub fn is_running(&self) -> bool {
        matches!(self.get_status(), ServerStatus::Starting | ServerStatus::Running | ServerStatus::RconUnavailable)
    }
}
