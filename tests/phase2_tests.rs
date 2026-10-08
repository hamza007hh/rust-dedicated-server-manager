use epic_rust_server_launcher::*;
use std::fs;

#[test]
fn test_query_port_calculation() {
    let mut config = ServerConfig::default();
    config.port = 28015;
    assert_eq!(config.resolved_query_port(), 28017);

    config.port = 28020;
    assert_eq!(config.resolved_query_port(), 28022);
}

#[test]
fn test_server_cfg_generation_and_merging() {
    let temp_dir = std::env::temp_dir().join("epic_rust_test_cfg");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let mut config = ServerConfig::default();
    config.install_path = temp_dir.clone();
    config.identity = "test_identity".into();
    config.hostname = "Unit Test Server".into();
    config.max_players = 75;

    // 1. Initial generation
    let cfg_path = sync_server_cfg(&config).expect("Initial sync failed");
    assert!(cfg_path.is_file());
    let content = fs::read_to_string(&cfg_path).unwrap();
    assert!(content.contains("server.hostname \"Unit Test Server\""));
    assert!(content.contains("server.maxplayers 75"));
    assert!(content.contains("server.queryport 28017"));

    // 2. Add custom hand-edited line
    let mut modified = content;
    modified.push_str("\ncustom.convar 1234\n");
    fs::write(&cfg_path, modified).unwrap();

    // 3. Second sync: update max_players, ensure custom.convar is preserved
    config.max_players = 100;
    sync_server_cfg(&config).expect("Second sync failed");
    let updated = fs::read_to_string(&cfg_path).unwrap();
    assert!(updated.contains("server.maxplayers 100"));
    assert!(updated.contains("custom.convar 1234"));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_lan_ip_detection() {
    let lan = detect_lan_ip();
    assert!(lan.is_ok());
    let ip = lan.unwrap();
    assert!(!ip.is_empty());
}

#[test]
fn test_log_buffer_retention() {
    let log_mgr = LogManager::new(5);
    for i in 0..10 {
        log_mgr.append(LogSource::Stdout, format!("Line {}", i));
    }
    let logs = log_mgr.get_recent_logs();
    assert_eq!(logs.len(), 5);
    assert_eq!(logs[0].message, "Line 5");
    assert_eq!(logs[4].message, "Line 9");
}

#[test]
fn test_rcon_packet_serialization() {
    let packet = RconPacket {
        identifier: 1001,
        message: "status".into(),
        name: "TestRunner".into(),
        packet_type: "Generic".into(),
    };
    let json = serde_json::to_string(&packet).unwrap();
    assert!(json.contains("\"Identifier\":1001"));
    assert!(json.contains("\"Message\":\"status\""));
    assert!(json.contains("\"Type\":\"Generic\""));
}
