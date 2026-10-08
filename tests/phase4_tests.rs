use std::fs::{self, File};
use std::io::Write;
use epic_rust_server_launcher::{
    LauncherError, MapManager, ModFramework, ModManager, PluginManager,
    ServerConfig, ServerState, ServerStatus,
};

#[test]
fn test_map_manager_requires_stopped_server() {
    let mut config = ServerConfig::default();
    let state = ServerState::new();
    state.set_status(ServerStatus::Running);

    // Attempting to change map while running must fail
    let res = MapManager::change_to_procedural(&mut config, &state, 1234, 3500);
    assert!(matches!(res, Err(LauncherError::ServerMustBeStopped(_))));

    let res2 = MapManager::change_to_custom_url(&mut config, &state, "https://example.com/map.map");
    assert!(matches!(res2, Err(LauncherError::ServerMustBeStopped(_))));
}

#[test]
fn test_map_manager_procedural_and_custom_toggle() {
    let temp_dir = std::env::temp_dir().join(format!("epic_map_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let mut config = ServerConfig::default();
    config.install_path = temp_dir.clone();
    let state = ServerState::new(); // Stopped

    // 1. Change to Procedural
    MapManager::change_to_procedural(&mut config, &state, 8888, 4000)
        .expect("Change to procedural should succeed");
    assert!(config.is_procedural);
    assert_eq!(config.seed, 8888);
    assert_eq!(config.worldsize, 4000);
    assert!(config.level_url.is_none());

    // 2. Reject invalid worldsize
    let err = MapManager::change_to_procedural(&mut config, &state, 8888, 7000);
    assert!(matches!(err, Err(LauncherError::MapError(_))));

    // 3. Change to Custom Map URL
    MapManager::change_to_custom_url(&mut config, &state, "https://maps.rust.org/custom.map")
        .expect("Change to custom URL should succeed");
    assert!(!config.is_procedural);
    assert_eq!(config.level_url.as_deref(), Some("https://maps.rust.org/custom.map"));

    // 4. Reject invalid URL
    let err2 = MapManager::change_to_custom_url(&mut config, &state, "not_a_valid_url");
    assert!(matches!(err2, Err(LauncherError::MapError(_))));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_procedural_wipe_preserves_blueprints() {
    let temp_dir = std::env::temp_dir().join(format!("epic_wipe_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);

    let mut config = ServerConfig::default();
    config.install_path = temp_dir.clone();
    config.identity = "wipe_identity".into();

    let save_dir = temp_dir.join("server").join("wipe_identity");
    fs::create_dir_all(&save_dir).unwrap();

    // Create procedural map save
    let proc_sav = save_dir.join("proceduralmap.3000.1337.240.sav");
    File::create(&proc_sav).unwrap().write_all(b"PROCEDURAL_WORLD_DATA").unwrap();

    // Create blueprints database (MUST BE PRESERVED)
    let bp_file = save_dir.join("player.blueprints.5.db");
    File::create(&bp_file).unwrap().write_all(b"BLUEPRINT_PERSISTENT_DATA").unwrap();

    let state = ServerState::new(); // Stopped

    let wipe_res = MapManager::wipe_procedural_map(&config, &state)
        .expect("Procedural wipe should succeed");

    // Procedural save must be deleted
    assert!(!proc_sav.exists());
    assert_eq!(wipe_res.deleted_files.len(), 1);

    // Blueprint file MUST still exist!
    assert!(bp_file.exists());
    assert_eq!(wipe_res.blueprints_preserved.len(), 1);

    // Pre-wipe backup must have been created
    assert!(wipe_res.backup_path.is_some());
    assert!(wipe_res.backup_path.unwrap().is_dir());

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_save_backup_and_restore_workflow() {
    let temp_dir = std::env::temp_dir().join(format!("epic_save_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);

    let mut config = ServerConfig::default();
    config.install_path = temp_dir.clone();
    config.identity = "test_server".into();

    let save_dir = temp_dir.join("server").join("test_server");
    fs::create_dir_all(&save_dir).unwrap();

    let active_sav = save_dir.join("proceduralmap.3000.1.sav");
    File::create(&active_sav).unwrap().write_all(b"SAVED_GAME_STATE_1").unwrap();

    let state = ServerState::new();

    // 1. Create Backup
    let backup_dir = MapManager::backup_save_directory(&config, "manual_backup")
        .expect("Backup must succeed");
    assert!(backup_dir.is_dir());
    assert!(backup_dir.join("proceduralmap.3000.1.sav").is_file());

    // 2. List Backups
    let backups = MapManager::list_backups(&config).expect("List backups should succeed");
    assert_eq!(backups.len(), 1);
    assert_eq!(backups[0].file_count, 1);

    // 3. Modify active save and restore
    File::create(&active_sav).unwrap().write_all(b"CORRUPTED_GAME_STATE").unwrap();
    MapManager::restore_save(&config, &state, &backup_dir).expect("Restore must succeed");

    let restored_content = fs::read(&active_sav).unwrap();
    assert_eq!(restored_content, b"SAVED_GAME_STATE_1");

    // 4. Test security validation against path traversal
    let bad_path = temp_dir.join("server");
    let err = MapManager::restore_save(&config, &state, &bad_path);
    assert!(matches!(err, Err(LauncherError::SaveError(_))));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_mod_framework_detection() {
    let temp_dir = std::env::temp_dir().join(format!("epic_mods_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    // 1. Vanilla
    let status_vanilla = ModManager::detect_framework(&temp_dir);
    assert_eq!(status_vanilla.active_framework, ModFramework::Vanilla);

    // 2. Oxide
    let managed = temp_dir.join("RustDedicated_Data").join("Managed");
    fs::create_dir_all(&managed).unwrap();
    File::create(managed.join("Oxide.Core.dll")).unwrap();
    let status_oxide = ModManager::detect_framework(&temp_dir);
    assert_eq!(status_oxide.active_framework, ModFramework::Oxide);

    // 3. Carbon
    fs::create_dir_all(temp_dir.join("carbon")).unwrap();
    let status_carbon = ModManager::detect_framework(&temp_dir);
    assert_eq!(status_carbon.active_framework, ModFramework::Carbon);

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_plugin_enable_disable_lifecycle() {
    let temp_dir = std::env::temp_dir().join(format!("epic_plugin_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let plugins_dir = temp_dir.join("oxide").join("plugins");
    fs::create_dir_all(&plugins_dir).unwrap();

    let test_plugin = plugins_dir.join("BetterChat.cs");
    File::create(&test_plugin).unwrap().write_all(b"// Oxide Plugin").unwrap();

    // 1. List plugins: 1 enabled
    let list1 = PluginManager::list_plugins(&temp_dir, ModFramework::Oxide).unwrap();
    assert_eq!(list1.len(), 1);
    assert_eq!(list1[0].name, "BetterChat");
    assert!(list1[0].is_enabled);

    // 2. Disable plugin
    PluginManager::disable_plugin(&temp_dir, ModFramework::Oxide, "BetterChat")
        .expect("Disable should succeed");
    assert!(!test_plugin.exists());
    let disabled_path = temp_dir.join("oxide").join("plugins.disabled").join("BetterChat.cs");
    assert!(disabled_path.is_file());

    let list2 = PluginManager::list_plugins(&temp_dir, ModFramework::Oxide).unwrap();
    assert_eq!(list2.len(), 1);
    assert!(!list2[0].is_enabled);

    // 3. Re-enable plugin
    PluginManager::enable_plugin(&temp_dir, ModFramework::Oxide, "BetterChat")
        .expect("Enable should succeed");
    assert!(test_plugin.is_file());
    assert!(!disabled_path.exists());

    // 4. Reject path traversal
    let bad_res = PluginManager::enable_plugin(&temp_dir, ModFramework::Oxide, "../../malicious");
    assert!(matches!(bad_res, Err(LauncherError::PluginError(_))));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_plugin_name_validation() {
    assert_eq!(PluginManager::validate_plugin_name("Kits.cs").unwrap(), "Kits");
    assert_eq!(PluginManager::validate_plugin_name("No_Escape-1").unwrap(), "No_Escape-1");
    assert!(PluginManager::validate_plugin_name("").is_err());
    assert!(PluginManager::validate_plugin_name("../Escape").is_err());
    assert!(PluginManager::validate_plugin_name("Bad/Slash").is_err());
    assert!(PluginManager::validate_plugin_name("Bad\\Backslash").is_err());
}

#[test]
fn test_mod_framework_in_server_config() {
    let mut cfg = ServerConfig::default();
    assert_eq!(cfg.mod_framework, "vanilla");
    assert!(cfg.validate().is_ok());

    cfg.mod_framework = "carbon".to_string();
    assert!(cfg.validate().is_ok());

    cfg.mod_framework = "oxide".to_string();
    assert!(cfg.validate().is_ok());

    cfg.mod_framework = "invalid_framework".to_string();
    assert!(cfg.validate().is_err());
}

#[test]
fn test_infer_mod_framework_on_legacy_config() {
    let temp_dir = std::env::temp_dir().join(format!("epic_legacy_cfg_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    // 1. Legacy JSON without mod_framework on vanilla folder
    let legacy_json = r#"{
        "identity": "legacy_server",
        "hostname": "Old Server",
        "description": "Legacy",
        "port": 28015,
        "rcon_port": 28016,
        "rcon_password": "pass",
        "max_players": 50,
        "tickrate": 30,
        "pve": false,
        "gamemode": "vanilla",
        "is_procedural": true,
        "seed": 1337,
        "worldsize": 3000,
        "install_path": ""
    }"#;

    let mut cfg_vanilla: ServerConfig = serde_json::from_str(legacy_json).unwrap();
    cfg_vanilla.install_path = temp_dir.clone();
    cfg_vanilla.ensure_mod_framework_inferred();
    assert_eq!(cfg_vanilla.mod_framework, "vanilla");

    // 2. Legacy JSON on Oxide folder
    let managed = temp_dir.join("RustDedicated_Data").join("Managed");
    fs::create_dir_all(&managed).unwrap();
    File::create(managed.join("Oxide.Core.dll")).unwrap();

    let mut cfg_oxide: ServerConfig = serde_json::from_str(legacy_json).unwrap();
    cfg_oxide.install_path = temp_dir.clone();
    cfg_oxide.ensure_mod_framework_inferred();
    assert_eq!(cfg_oxide.mod_framework, "oxide");

    // 3. Explicit framework must NOT be overwritten
    let explicit_json = r#"{
        "identity": "explicit_server",
        "hostname": "Explicit Server",
        "description": "Explicit",
        "port": 28015,
        "rcon_port": 28016,
        "rcon_password": "pass",
        "max_players": 50,
        "tickrate": 30,
        "pve": false,
        "gamemode": "vanilla",
        "mod_framework": "vanilla",
        "is_procedural": true,
        "seed": 1337,
        "worldsize": 3000,
        "install_path": ""
    }"#;
    let mut cfg_explicit: ServerConfig = serde_json::from_str(explicit_json).unwrap();
    cfg_explicit.install_path = temp_dir.clone(); // even though oxide dll exists
    cfg_explicit.ensure_mod_framework_inferred();
    assert_eq!(cfg_explicit.mod_framework, "vanilla"); // preserved!

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_server_creation_validation() {
    let mut cfg = ServerConfig::default();
    cfg.identity = "valid-identity_123".to_string();
    cfg.hostname = "Valid Server".to_string();
    cfg.port = 28015;
    cfg.rcon_port = 28016;
    cfg.rcon_password = "secure_password".to_string();
    cfg.mod_framework = "vanilla".to_string();
    assert!(cfg.validate().is_ok());

    // Conflict port
    cfg.rcon_port = 28015;
    assert!(cfg.validate().is_err());
    cfg.rcon_port = 28016;

    // Empty identity
    cfg.identity = "".to_string();
    assert!(cfg.validate().is_err());

    // Invalid characters in identity
    cfg.identity = "invalid/identity".to_string();
    assert!(cfg.validate().is_err());
    cfg.identity = "valid_identity".to_string();

    // Empty hostname
    cfg.hostname = "   ".to_string();
    assert!(cfg.validate().is_err());
    cfg.hostname = "Valid Host".to_string();

    // Invalid map URL when not procedural
    cfg.is_procedural = false;
    cfg.level_url = Some("ftp://invalid-url".to_string());
    assert!(cfg.validate().is_err());
    cfg.level_url = Some("https://example.com/map.map".to_string());
    assert!(cfg.validate().is_ok());
}

#[test]
fn test_profile_registration_with_mod_framework() {
    use epic_rust_server_launcher::profiles::ProfileManager;
    let backup = fs::read_to_string(ProfileManager::PROFILES_FILE).ok();

    // Register vanilla profile
    let mut cfg_vanilla = ServerConfig::default();
    cfg_vanilla.identity = "test-server-vanilla".to_string();
    cfg_vanilla.mod_framework = "vanilla".to_string();
    cfg_vanilla.port = 28015;
    cfg_vanilla.rcon_port = 28016;
    let res = ProfileManager::register_server_profile("Test Vanilla Server", cfg_vanilla, false);
    assert!(res.is_ok());
    let (data1, prof1) = res.unwrap();
    assert_eq!(prof1.config.mod_framework, "vanilla");
    assert!(data1.profiles.iter().any(|p| p.id == prof1.id && p.config.identity == "test-server-vanilla"));

    // Register carbon profile
    let mut cfg_carbon = ServerConfig::default();
    cfg_carbon.identity = "test-server-carbon".to_string();
    cfg_carbon.mod_framework = "carbon".to_string();
    cfg_carbon.port = 28025;
    cfg_carbon.rcon_port = 28026;
    let res2 = ProfileManager::register_server_profile("Test Carbon Server", cfg_carbon, true);
    assert!(res2.is_ok());
    let (data2, prof2) = res2.unwrap();
    assert_eq!(prof2.config.mod_framework, "carbon");
    assert_eq!(data2.active_profile_id, prof2.id);

    let saved = ProfileManager::load_or_init();
    let carbon_prof = saved.profiles.iter().find(|p| p.id == prof2.id).unwrap();
    assert_eq!(carbon_prof.config.mod_framework, "carbon");
    assert_eq!(carbon_prof.config.port, 28025);

    // Restore original profiles file
    if let Some(original) = backup {
        let _ = fs::write(ProfileManager::PROFILES_FILE, original);
    } else {
        let _ = fs::remove_file(ProfileManager::PROFILES_FILE);
    }
}

