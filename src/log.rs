use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogSource {
    Stdout,
    Stderr,
    Rcon,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp_millis: u64,
    pub source: LogSource,
    pub message: String,
}

#[derive(Clone)]
pub struct LogManager {
    buffer: Arc<Mutex<VecDeque<LogEntry>>>,
    sender: broadcast::Sender<LogEntry>,
    max_capacity: usize,
}

impl LogManager {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(512);
        Self {
            buffer: Arc::new(Mutex::new(VecDeque::with_capacity(capacity))),
            sender: tx,
            max_capacity: capacity,
        }
    }

    pub fn append(&self, source: LogSource, message: impl Into<String>) {
        let entry = LogEntry {
            timestamp_millis: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            source,
            message: message.into(),
        };

        {
            let mut buf = self.buffer.lock().unwrap();
            if buf.len() >= self.max_capacity {
                buf.pop_front();
            }
            buf.push_back(entry.clone());
        }

        let _ = self.sender.send(entry);
    }

    pub fn get_recent_logs(&self) -> Vec<LogEntry> {
        let buf = self.buffer.lock().unwrap();
        buf.iter().cloned().collect()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<LogEntry> {
        self.sender.subscribe()
    }
}

impl Default for LogManager {
    fn default() -> Self {
        Self::new(1000)
    }
}
