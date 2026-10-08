use std::fs::{self, File};
use std::io::Write;
use epic_rust_server_launcher::{
    parse_appmanifest, parse_library_folders, parse_steamcmd_progress,
    validate_installation, DiscoverySource, LauncherError, ServerConfig,
    ServerProcessManager, SteamCmdManager, SteamCmdStage,
};

#[test]
fn test_parse_appmanifest_complete() {
    let sample_acf = r#"
"AppState"
{
	"appid"		"258550"
	"Universe"		"1"
	"name"		"Rust Dedicated Server"
	"installdir"		"rustds"
	"buildid"		"14298132"
	"LastUpdated"		"1715000000"
	"UserConfig"
	{
		"BetaKey"		"staging"
	}
}
"#;

    let info = parse_appmanifest(sample_acf).expect("Should parse valid ACF");
    assert_eq!(info.app_id, 258550);
    assert_eq!(info.name, "Rust Dedicated Server");
    assert_eq!(info.build_id, "14298132");
    assert_eq!(info.install_dir, "rustds");
    assert_eq!(info.branch, "staging");
}

#[test]
fn test_parse_appmanifest_public_fallback() {
    let sample_acf = r#"
"AppState"
{
	"appid"		"258550"
	"name"		"Rust Dedicated Server"
	"buildid"		"99988811"
}
"#;

    let info = parse_appmanifest(sample_acf).expect("Should parse valid ACF");
    assert_eq!(info.build_id, "99988811");
    assert_eq!(info.branch, "public");
}

#[test]
fn test_parse_library_folders_vdf() {
    let sample_vdf = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"contentid"		"123"
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"label"		"Games"
	}
}
"#;

    let paths = parse_library_folders(sample_vdf);
    assert_eq!(paths.len(), 2);
    assert_eq!(paths[0].to_str().unwrap(), r"C:\Program Files (x86)\Steam");
    assert_eq!(paths[1].to_str().unwrap(), r"D:\SteamLibrary");
}

#[test]
fn test_steamcmd_progress_parsing() {
    // 1. Downloading
    let dl_line = "Update state (0x5) downloading, progress: 45.23 (12345678 / 27318290)";
    let prog1 = parse_steamcmd_progress(dl_line).expect("Should parse download progress");
    assert_eq!(prog1.stage, SteamCmdStage::Downloading);
    assert!((prog1.percent - 45.23).abs() < 0.001);
    assert_eq!(prog1.current_bytes, 12345678);
    assert_eq!(prog1.total_bytes, 27318290);

    // 2. Validating
    let val_line = "Update state (0x11) validating, progress: 80.12 (21854912 / 27318290)";
    let prog2 = parse_steamcmd_progress(val_line).expect("Should parse validating progress");
    assert_eq!(prog2.stage, SteamCmdStage::Validating);
    assert!((prog2.percent - 80.12).abs() < 0.001);

    // 3. Success / Complete
    let success_line = "Success! App '258550' fully installed.";
    let prog3 = parse_steamcmd_progress(success_line).expect("Should parse complete state");
    assert_eq!(prog3.stage, SteamCmdStage::Complete);
    assert_eq!(prog3.percent, 100.0);

    // 4. Failed
    let fail_line = "ERROR! Failed to install app '258550' (Disk full)";
    let prog4 = parse_steamcmd_progress(fail_line).expect("Should parse failure state");
    assert_eq!(prog4.stage, SteamCmdStage::Failed);
}

#[test]
fn test_validation_workflow_and_errors() {
    let temp_dir = std::env::temp_dir().join(format!("epic_rust_test_val_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    // 1. Missing executable
    let res1 = validate_installation(&temp_dir, DiscoverySource::Configured);
    match res1 {
        Err(LauncherError::MissingExecutable { .. }) => {}
        _ => panic!("Expected MissingExecutable error, got: {:?}", res1),
    }

    // 2. Add RustDedicated.exe but missing Managed directory
    let exe_path = temp_dir.join("RustDedicated.exe");
    File::create(&exe_path).unwrap();
    let res2 = validate_installation(&temp_dir, DiscoverySource::Configured);
    match res2 {
        Err(LauncherError::InvalidInstallation { reason, .. }) => {
            assert!(reason.contains("Managed"));
        }
        _ => panic!("Expected InvalidInstallation for Managed dir, got: {:?}", res2),
    }

    // 3. Add Managed directory but missing Assembly-CSharp.dll
    let managed_dir = temp_dir.join("RustDedicated_Data").join("Managed");
    fs::create_dir_all(&managed_dir).unwrap();
    let res3 = validate_installation(&temp_dir, DiscoverySource::Configured);
    match res3 {
        Err(LauncherError::MissingAssembly { .. }) => {}
        _ => panic!("Expected MissingAssembly error, got: {:?}", res3),
    }

    // 4. Add Assembly-CSharp.dll and appmanifest
    let assembly_path = managed_dir.join("Assembly-CSharp.dll");
    let mut f_dll = File::create(&assembly_path).unwrap();
    f_dll.write_all(b"DUMMY_DLL_BYTES").unwrap();

    let steamapps_dir = temp_dir.join("steamapps");
    fs::create_dir_all(&steamapps_dir).unwrap();
    let manifest_path = steamapps_dir.join("appmanifest_258550.acf");
    let acf_content = r#"
"AppState"
{
	"appid"		"258550"
	"buildid"		"1500200"
	"UserConfig"
	{
		"BetaKey"		"release"
	}
}
"#;
    let mut f_acf = File::create(&manifest_path).unwrap();
    f_acf.write_all(acf_content.as_bytes()).unwrap();

    // 5. Complete validation should succeed
    let res4 = validate_installation(&temp_dir, DiscoverySource::Configured)
        .expect("Complete installation must validate successfully");

    assert!(res4.is_valid);
    assert_eq!(res4.build_id.as_deref(), Some("1500200"));
    assert_eq!(res4.branch.as_deref(), Some("release"));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_steamcmd_manager_detection() {
    let temp_dir = std::env::temp_dir().join(format!("epic_rust_test_scm_{}", std::process::id()));
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let mgr = SteamCmdManager::new(&temp_dir);
    assert!(!mgr.is_installed());

    // Create dummy steamcmd.exe
    let exe = temp_dir.join("steamcmd.exe");
    File::create(&exe).unwrap();
    assert!(mgr.is_installed());

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_server_config_steamcmd_integration() {
    let mut config = ServerConfig::default();
    config.install_path = std::path::PathBuf::from(r"C:\servers\my_rust_server");

    // Default fallback to sibling steamcmd dir
    assert_eq!(
        config.resolved_steamcmd_dir(),
        std::path::PathBuf::from(r"C:\servers\steamcmd")
    );

    // Explicit override
    config.steamcmd_path = Some(std::path::PathBuf::from(r"D:\tools\steamcmd"));
    assert_eq!(
        config.resolved_steamcmd_dir(),
        std::path::PathBuf::from(r"D:\tools\steamcmd")
    );
}

#[tokio::test]
async fn test_process_manager_blocks_invalid_installation() {
    let mut manager = ServerProcessManager::new().expect("Manager init");
    let mut config = ServerConfig::default();
    config.install_path = std::path::PathBuf::from(r"C:\non_existent_folder_xyz_123");

    let res = manager.start(&config).await;
    assert!(res.is_err());
    assert!(!manager.state().is_running());
}
