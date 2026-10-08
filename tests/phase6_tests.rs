use epic_rust_server_launcher::{
    ServerConfig, ServerProcessManager, ServerState, ServerStatus,
};
use std::fs;

#[test]
fn test_config_persistence_and_validation() {
    let temp_dir = std::env::temp_dir().join(format!("epic_test_cfg_{}", std::process::id()));
    fs::create_dir_all(&temp_dir).unwrap();
    let cfg_file = temp_dir.join("launcher_config.json");

    let mut cfg = ServerConfig::default();
    cfg.hostname = "Persisted Rust Dedicated".into();
    cfg.port = 28020;
    cfg.rcon_port = 28021;
    cfg.max_players = 100;

    // Validate passes
    assert!(cfg.validate().is_ok());

    // Save
    assert!(cfg.save_to_file(&cfg_file).is_ok());
    assert!(cfg_file.is_file());

    // Load
    let loaded = ServerConfig::load_or_default(&cfg_file);
    assert_eq!(loaded.hostname, "Persisted Rust Dedicated");
    assert_eq!(loaded.port, 28020);
    assert_eq!(loaded.rcon_port, 28021);
    assert_eq!(loaded.max_players, 100);

    // Validation failures
    let mut invalid_cfg = cfg.clone();
    invalid_cfg.identity = "   ".into();
    assert!(invalid_cfg.validate().is_err());

    let mut invalid_pw = cfg.clone();
    invalid_pw.rcon_password = "".into();
    assert!(invalid_pw.validate().is_err());

    let mut invalid_size = cfg.clone();
    invalid_size.is_procedural = true;
    invalid_size.worldsize = 8000;
    assert!(invalid_size.validate().is_err());

    let _ = fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_server_state_broadcast_stream() {
    let state = ServerState::new();
    let mut rx = state.subscribe();

    assert_eq!(state.get_status(), ServerStatus::Stopped);
    assert!(!state.is_running());

    state.set_status(ServerStatus::Starting);
    let s1 = rx.recv().await.unwrap();
    assert_eq!(s1, ServerStatus::Starting);
    assert!(state.is_running());

    state.set_status(ServerStatus::Running);
    let s2 = rx.recv().await.unwrap();
    assert_eq!(s2, ServerStatus::Running);
    assert!(state.is_running());

    state.set_status(ServerStatus::Stopping);
    let s3 = rx.recv().await.unwrap();
    assert_eq!(s3, ServerStatus::Stopping);

    state.set_status(ServerStatus::Stopped);
    let s4 = rx.recv().await.unwrap();
    assert_eq!(s4, ServerStatus::Stopped);
    assert!(!state.is_running());
}

#[tokio::test]
async fn test_runtime_metrics_when_stopped() {
    let proc_mgr = ServerProcessManager::new().expect("JobGuard created");
    assert_eq!(proc_mgr.uptime_seconds(), 0);
    assert!(proc_mgr.pid().is_none());

    let (mem, cpu) = proc_mgr.get_resource_metrics().await;
    assert_eq!(mem, 0.0);
    assert_eq!(cpu, 0.0);
}
