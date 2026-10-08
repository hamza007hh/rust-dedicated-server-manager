use serde::{Deserialize, Serialize};
use std::net::{TcpListener, UdpSocket};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use crate::config::ServerConfig;
use crate::error::{LauncherError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetInfo {
    pub lan_ip: String,
    pub public_ip: String,
    pub game_port: u16,
    pub query_port: u16,
    pub rcon_port: u16,
    pub connect_local: String,
    pub connect_lan: String,
}

/// Verifies whether a given port is available for both TCP and UDP binding.
pub fn is_port_available(port: u16) -> bool {
    let addr = format!("0.0.0.0:{}", port);
    let tcp_ok = TcpListener::bind(&addr).is_ok();
    let udp_ok = UdpSocket::bind(&addr).is_ok();
    tcp_ok && udp_ok
}

/// Pre-flight check ensuring game port, query port (game + 2), and RCON port are free.
pub fn check_server_ports(game_port: u16, query_port: u16, rcon_port: u16) -> Result<()> {
    if !is_port_available(game_port) {
        return Err(LauncherError::PortInUse { port: game_port, description: "Game Port" });
    }
    if !is_port_available(query_port) {
        return Err(LauncherError::PortInUse { port: query_port, description: "Query Port (Game Port + 2)" });
    }
    if !is_port_available(rcon_port) {
        return Err(LauncherError::PortInUse { port: rcon_port, description: "RCON Port" });
    }
    Ok(())
}

/// Detects the local LAN IPv4 address using the documented UDP connect routing lookup.
/// Does NOT send any actual network packet.
pub fn detect_lan_ip() -> Result<String> {
    let socket = UdpSocket::bind("0.0.0.0:0")
        .map_err(|e| LauncherError::NetworkError(format!("Failed to bind local UDP socket: {}", e)))?;
    socket.connect("8.8.8.8:80")
        .map_err(|e| LauncherError::NetworkError(format!("Routing lookup failed: {}", e)))?;
    let local_addr = socket.local_addr()
        .map_err(|e| LauncherError::NetworkError(format!("Failed to read local socket address: {}", e)))?;
    Ok(local_addr.ip().to_string())
}

/// Asynchronously resolves the public WAN IP via api.ipify.org using pure Tokio TCP.
pub async fn detect_public_ip() -> Result<String> {
    let request_task = async {
        let mut stream = TcpStream::connect("api.ipify.org:80").await
            .map_err(|e| LauncherError::NetworkError(format!("Cannot connect to api.ipify.org: {}", e)))?;
        let request = b"GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n";
        stream.write_all(request).await
            .map_err(|e| LauncherError::NetworkError(format!("Failed to send HTTP GET: {}", e)))?;

        let mut response = Vec::new();
        stream.read_to_end(&mut response).await
            .map_err(|e| LauncherError::NetworkError(format!("Failed to read HTTP response: {}", e)))?;

        let resp_str = String::from_utf8_lossy(&response);
        if let Some(body_start) = resp_str.find("\r\n\r\n") {
            let ip = resp_str[body_start + 4..].trim().to_string();
            if !ip.is_empty() {
                return Ok(ip);
            }
        }
        Err(LauncherError::NetworkError("Empty body from api.ipify.org".into()))
    };

    match tokio::time::timeout(Duration::from_secs(3), request_task).await {
        Ok(res) => res,
        Err(_) => Ok("127.0.0.1".to_string()), // Offline fallback
    }
}

/// Validates whether an IPv4 string represents a reachable public WAN IP address.
/// Rejects loopback (127.x.x.x), unspecified (0.0.0.0), and private LAN addresses.
pub fn is_valid_public_ip(ip_str: &str) -> bool {
    let clean = ip_str.trim();
    if let Ok(ip) = clean.parse::<std::net::Ipv4Addr>() {
        if ip.is_loopback() || ip.is_unspecified() {
            return false;
        }
        let oct = ip.octets();
        if oct[0] == 10 {
            return false;
        }
        if oct[0] == 172 && (16..=31).contains(&oct[1]) {
            return false;
        }
        if oct[0] == 192 && oct[1] == 168 {
            return false;
        }
        if oct[0] == 169 && oct[1] == 254 {
            return false;
        }
        true
    } else {
        false
    }
}

/// Computes complete network information adhering to Crucible specifications.
pub async fn get_net_info(config: &ServerConfig) -> Result<NetInfo> {
    let lan_ip = detect_lan_ip().unwrap_or_else(|_| "127.0.0.1".into());
    let public_ip = detect_public_ip().await.unwrap_or_else(|_| "127.0.0.1".into());
    let query_port = config.resolved_query_port();

    Ok(NetInfo {
        connect_local: format!("client.connect 127.0.0.1:{}", config.port),
        connect_lan: format!("client.connect {}:{}", lan_ip, config.port),
        lan_ip,
        public_ip,
        game_port: config.port,
        query_port,
        rcon_port: config.rcon_port,
    })
}
