use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, mpsc, watch};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{error, info, warn};
use crate::error::{LauncherError, Result};
use crate::log::{LogManager, LogSource};
use crate::status::{ServerState, ServerStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RconPacket {
    #[serde(rename = "Identifier")]
    pub identifier: i32,
    #[serde(rename = "Message")]
    pub message: String,
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Type", default = "default_packet_type")]
    pub packet_type: String,
}

fn default_packet_type() -> String {
    "Generic".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ServerTelemetry {
    pub hostname: String,
    pub max_players: u32,
    pub players: u32,
    pub queued_players: u32,
    pub joining_players: u32,
    pub entity_count: u32,
    pub framerate: f32,
    pub uptime: u64,
    pub memory: f32,
    #[serde(default)]
    pub cpu: f32,
}

pub struct RconController {
    command_tx: mpsc::Sender<String>,
    telemetry_rx: watch::Receiver<ServerTelemetry>,
    message_tx: broadcast::Sender<RconPacket>,
    is_connected: Arc<AtomicBool>,
    shutdown_trigger: mpsc::Sender<()>,
}

impl RconController {
    pub fn is_connected(&self) -> bool {
        self.is_connected.load(Ordering::SeqCst)
    }

    pub async fn send_command(&self, command: impl Into<String>) -> Result<()> {
        self.command_tx.send(command.into()).await
            .map_err(|e| LauncherError::RconError(format!("Failed to enqueue RCON command: {}", e)))
    }

    pub fn subscribe_messages(&self) -> broadcast::Receiver<RconPacket> {
        self.message_tx.subscribe()
    }

    pub fn subscribe_telemetry(&self) -> watch::Receiver<ServerTelemetry> {
        self.telemetry_rx.clone()
    }

    pub async fn shutdown(&self) {
        let _ = self.shutdown_trigger.send(()).await;
    }

    /// Spawns the RCON client connection with a 60-second retry loop (every 1 second)
    pub fn spawn(
        rcon_port: u16,
        password: String,
        state: ServerState,
        log_manager: LogManager,
    ) -> Self {
        let (cmd_tx, mut cmd_rx) = mpsc::channel::<String>(64);
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        let (msg_tx, _) = broadcast::channel::<RconPacket>(256);
        let (telem_tx, telem_rx) = watch::channel::<ServerTelemetry>(ServerTelemetry::default());
        let is_connected = Arc::new(AtomicBool::new(false));

        let is_conn_clone = is_connected.clone();
        let msg_tx_clone = msg_tx.clone();
        let state_clone = state.clone();
        let log_mgr_clone = log_manager.clone();

        tokio::spawn(async move {
            // NOTE: Rust's Fleck WebSocket server does not URL-decode the HTTP request path.
            // Facepunch.Rcon compares `socket.ConnectionInfo.Path == "/" + Password`.
            // Any percent-encoding (e.g. converting '!' to '%21') will fail authentication and cause IP bans.
            let ws_url = format!("ws://127.0.0.1:{}/{}", rcon_port, password);

            info!("Starting RCON connection watcher on ws://127.0.0.1:{}/******", rcon_port);
            let mut retries = 0;
            let max_retries = 60;
            let mut ws_stream = None;

            // 1. Connection retry loop (1s interval, up to 60s)
            while retries < max_retries {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        info!("RCON connector received shutdown signal before connection.");
                        return;
                    }
                    res = connect_async(&ws_url) => {
                        match res {
                            Ok((stream, _)) => {
                                info!("RCON successfully connected on port {}", rcon_port);
                                state_clone.set_status(ServerStatus::Running);
                                log_mgr_clone.append(
                                    LogSource::System,
                                    format!("RCON connection established on port {}", rcon_port),
                                );
                                ws_stream = Some(stream);
                                break;
                            }
                            Err(_) => {
                                retries += 1;
                                tokio::time::sleep(Duration::from_secs(1)).await;
                            }
                        }
                    }
                }
            }

            let stream = match ws_stream {
                Some(s) => s,
                None => {
                    warn!("RCON connection timed out after {} seconds.", max_retries);
                    if state_clone.is_running() {
                        state_clone.set_status(ServerStatus::RconUnavailable);
                        log_mgr_clone.append(
                            LogSource::System,
                            "RCON connection timed out; server process is alive with RCON unavailable.",
                        );
                    }
                    return;
                }
            };

            is_conn_clone.store(true, Ordering::SeqCst);
            let (mut ws_write, mut ws_read) = stream.split();
            let mut packet_counter = 1000;
            let mut telemetry_ticker = tokio::time::interval(Duration::from_secs(5));

            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        info!("RCON controller received shutdown signal.");
                        let _ = ws_write.send(Message::Close(None)).await;
                        break;
                    }

                    // Telemetry polling ticker (every 5 seconds)
                    _ = telemetry_ticker.tick() => {
                        packet_counter += 1;
                        let info_pkt = RconPacket {
                            identifier: packet_counter,
                            message: "serverinfo".into(),
                            name: "EpicRustLauncher".into(),
                            packet_type: "Generic".into(),
                        };
                        if let Ok(json) = serde_json::to_string(&info_pkt) {
                            let _ = ws_write.send(Message::Text(json)).await;
                        }
                    }

                    // Outgoing commands
                    Some(cmd) = cmd_rx.recv() => {
                        packet_counter += 1;
                        let pkt = RconPacket {
                            identifier: packet_counter,
                            message: cmd,
                            name: "EpicRustLauncher".into(),
                            packet_type: "Generic".into(),
                        };
                        if let Ok(json) = serde_json::to_string(&pkt) {
                            if let Err(e) = ws_write.send(Message::Text(json)).await {
                                error!("Failed to send RCON packet: {}", e);
                                break;
                            }
                        }
                    }

                    // Incoming RCON packets
                    Some(msg_res) = ws_read.next() => {
                        match msg_res {
                            Ok(Message::Text(text)) => {
                                if let Ok(pkt) = serde_json::from_str::<RconPacket>(&text) {
                                    if !pkt.message.trim().is_empty() {
                                        log_mgr_clone.append(LogSource::Rcon, &pkt.message);
                                    }
                                    // Parse telemetry response if message is JSON payload
                                    if let Ok(telem) = serde_json::from_str::<ServerTelemetry>(&pkt.message) {
                                        let _ = telem_tx.send(telem);
                                    }
                                    let _ = msg_tx_clone.send(pkt);
                                }
                            }
                            Ok(Message::Close(_)) => {
                                info!("RCON WebSocket stream closed by remote server.");
                                break;
                            }
                            Err(e) => {
                                warn!("RCON read error: {}", e);
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }

            is_conn_clone.store(false, Ordering::SeqCst);
            if state_clone.get_status() == ServerStatus::Running {
                state_clone.set_status(ServerStatus::RconUnavailable);
                log_mgr_clone.append(
                    LogSource::System,
                    "RCON connection lost; server process is alive with RCON unavailable.",
                );
            }
            info!("RCON loop exited.");
        });

        Self {
            command_tx: cmd_tx,
            telemetry_rx: telem_rx,
            message_tx: msg_tx,
            is_connected,
            shutdown_trigger: shutdown_tx,
        }
    }
}
