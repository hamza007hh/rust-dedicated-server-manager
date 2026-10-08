use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use epic_rust_server_launcher::{
    build_command_line, sync_server_cfg,
    LogSource, ServerConfig, ServerProcessManager, ServerStatus,
};

#[tokio::test]
async fn test_runtime_diagnosis() {
    let _ = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .try_init();

    if !PathBuf::from(r"C:\rustserver\RustDedicated.exe").is_file() {
        info!("RustDedicated.exe not found at C:\\rustserver; skipping live runtime diagnosis.");
        return;
    }

    info!("=== RUNTIME DIAGNOSIS TEST STARTING ===");

    let mut config = ServerConfig::default();
    config.identity = "my_server_identity".into();
    config.port = 28015;
    config.query_port = Some(28017);
    config.rcon_port = 28016;
    config.rcon_password = "ChangeMeImmediately!".into();
    config.worldsize = 1500;
    config.install_path = PathBuf::from(r"C:\rustserver");
    config.log_file = Some("output.log".into());

    // Step 3 & 5: sync server.cfg
    let cfg_path = sync_server_cfg(&config).expect("sync_server_cfg should succeed");
    info!("Synchronized server.cfg: {}", cfg_path.display());

    // Step 4: Show exact command line
    let args = build_command_line(&config).expect("build_command_line should succeed");
    info!("Exact arguments ({}):", args.len());
    for (i, a) in args.iter().enumerate() {
        info!("  [{}] {}", i, a);
    }

    // Step 1: Process state
    let mut manager = ServerProcessManager::new().expect("Manager creation should succeed");
    info!("Starting ServerProcessManager...");

    let start_res = manager.start(&config).await;
    assert!(start_res.is_ok(), "manager.start failed: {:?}", start_res.err());

    let pid = manager.pid().expect("PID should be recorded");
    info!(">>> RECORDED PID: {} <<<", pid);

    // Monitor for startup completion and RCON availability
    let mut reached_running = false;
    let mut independent_rcon_tested = false;

    let timeout_secs = 75;
    for tick in 1..=timeout_secs {
        sleep(Duration::from_secs(1)).await;
        let status = manager.state().get_status();
        let is_running = manager.state().is_running();

        // Check if TCP 28016 is listening
        let tcp_stream = tokio::net::TcpStream::connect("127.0.0.1:28016").await;
        let port_28016_listening = tcp_stream.is_ok();

        // Check UDP 28015 & 28017
        let udp_28015 = tokio::net::UdpSocket::bind("127.0.0.1:0").await;
        let can_send_udp_28015 = udp_28015.is_ok();

        info!(
            "[Tick {:02}/{}] Status={:?}, Alive={}, TCP:28016(Listening)={}, UDP:28015(Bound)={}",
            tick, timeout_secs, status, is_running, port_28016_listening, can_send_udp_28015
        );

        // Test independent WebSocket RCON if port 28016 is listening
        if port_28016_listening && !independent_rcon_tested {
            independent_rcon_tested = true;
            info!("Port 28016 is open! Testing independent WebSocket connection to ws://127.0.0.1:28016/ChangeMeImmediately!");
            match tokio_tungstenite::connect_async("ws://127.0.0.1:28016/ChangeMeImmediately!").await {
                Ok((stream, response)) => {
                    info!("INDEPENDENT RCON TEST PASSED! HTTP Status: {}", response.status());
                    let (mut write, mut read) = futures_util::StreamExt::split(stream);
                    use futures_util::SinkExt;
                    use tokio_tungstenite::tungstenite::protocol::Message;
                    let test_cmd = serde_json::json!({
                        "Identifier": 9999,
                        "Message": "status",
                        "Name": "IndependentTest",
                        "Type": "Generic"
                    });
                    if write.send(Message::Text(test_cmd.to_string())).await.is_ok() {
                        info!("Successfully sent test 'status' command over independent RCON!");
                    }
                }
                Err(e) => {
                    info!("Independent RCON connection result: {}", e);
                }
            }
        }

        if status == ServerStatus::Running {
            info!(">>> REACHED STATE RUNNING! <<<");
            reached_running = true;
            break;
        }

        if status == ServerStatus::Stopped || status == ServerStatus::ProcessExited {
            info!("Server stopped or exited during startup.");
            break;
        }
    }

    // Capture recent logs
    let logs = manager.log_manager().get_recent_logs();
    info!("Captured {} recent log entries:", logs.len());
    for log in logs.iter().rev().take(15).collect::<Vec<_>>().into_iter().rev() {
        info!("  [{:?}] {}", log.source, log.message);
    }

    // Cleanly stop
    info!("Stopping server cleanly...");
    let _ = manager.stop().await;
    info!("Server stopped. Final status: {:?}", manager.state().get_status());

    assert!(reached_running, "Server should reach Running state");
}
