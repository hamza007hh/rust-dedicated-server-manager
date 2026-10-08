use epic_rust_server_launcher::{
    calculate_next_restart_millis, MapManager, ModFramework,
    PluginManager, ServerConfig, ServerProcessManager,
};
use std::fs;

#[test]
fn test_active_saves_listing_and_backup_delete() {
    let temp_dir = std::env::temp_dir().join(format!("epic_test_p7_saves_{}", std::process::id()));
    let save_dir = temp_dir.join("server").join("test_ident");
    let backups_dir = temp_dir.join(".crucible-saves").join("test_ident");
    fs::create_dir_all(&save_dir).unwrap();
    fs::create_dir_all(&backups_dir).unwrap();

    let mut config = ServerConfig::default();
    config.install_path = temp_dir.clone();
    config.identity = "test_ident".into();

    // Create a mock active procedural save and blueprint db
    let proc_sav = save_dir.join("proceduralmap.3000.1234.sav");
    let bp_db = save_dir.join("player.blueprints.5.db");
    fs::write(&proc_sav, b"MAP_DATA").unwrap();
    fs::write(&bp_db, b"BLUEPRINT_DATA").unwrap();

    let active_saves = MapManager::list_active_saves(&config).unwrap();
    assert_eq!(active_saves.len(), 2);
    assert!(active_saves.iter().any(|s| s.is_procedural && s.file_name.contains("proceduralmap")));
    assert!(active_saves.iter().any(|s| s.is_blueprint && s.file_name.contains("blueprints")));

    let map_info = MapManager::get_map_info(&config).unwrap();
    assert!(map_info.active_save.is_some());

    // Create a mock backup and delete it
    let backup_entry = backups_dir.join("manual_123456789");
    fs::create_dir_all(&backup_entry).unwrap();
    fs::write(backup_entry.join("save.sav"), b"DATA").unwrap();

    assert!(MapManager::delete_backup(&config, &backup_entry).is_ok());
    assert!(!backup_entry.exists());

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_plugin_deletion() {
    let temp_dir = std::env::temp_dir().join(format!("epic_test_p7_plugins_{}", std::process::id()));
    let plugins_dir = temp_dir.join("oxide").join("plugins");
    fs::create_dir_all(&plugins_dir).unwrap();

    let plugin_file = plugins_dir.join("TestMod.cs");
    fs::write(&plugin_file, b"// test plugin").unwrap();

    assert!(PluginManager::delete_plugin(&temp_dir, ModFramework::Oxide, "TestMod").is_ok());
    assert!(!plugin_file.exists());

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_scheduler_calculation() {
    let next_ms = calculate_next_restart_millis("04:00");
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    assert!(next_ms > now_ms);
    // Diff should be at most 24 hours (86,400,000 ms)
    assert!(next_ms - now_ms <= 86_400_000);
}

#[tokio::test]
async fn test_crash_status_and_protection() {
    let proc_mgr = ServerProcessManager::new().unwrap();
    let initial_status = proc_mgr.get_crash_status().await;
    assert_eq!(initial_status.crash_count, 0);
    assert!(!initial_status.is_in_crash_loop);
    assert!(initial_status.auto_restart_active);

    proc_mgr.set_auto_restart(false);
    let updated = proc_mgr.get_crash_status().await;
    assert!(!updated.auto_restart_active);

    proc_mgr.reset_crash_count();
    let reset = proc_mgr.get_crash_status().await;
    assert_eq!(reset.crash_count, 0);
}
