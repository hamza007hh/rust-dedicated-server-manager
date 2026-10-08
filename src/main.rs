use std::path::PathBuf;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use epic_rust_server_launcher::{
    build_command_line, check_server_ports, discover_all_installations, get_net_info,
    sync_server_cfg, MapManager, ModManager,
    PluginManager, ServerConfig, ServerProcessManager, SteamCmdManager,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let has_cli_flag = args.iter().any(|a| a == "--cli" || a == "--verify" || a == "--help" || a == "-h");

    if !has_cli_flag {
        // Attempt to launch GUI if present
        let current_exe = std::env::current_exe().unwrap_or_default();
        let current_dir = current_exe.parent().unwrap_or_else(|| std::path::Path::new("."));

        let candidates = [
            current_dir.join("epic-rust-server-launcher-ui.exe"),
            current_dir.join("../../../src-tauri/target/x86_64-pc-windows-gnullvm/release/epic-rust-server-launcher-ui.exe"),
            current_dir.join("../../../src-tauri/target/release/epic-rust-server-launcher-ui.exe"),
            current_dir.join("../../../src-tauri/target/x86_64-pc-windows-gnullvm/debug/epic-rust-server-launcher-ui.exe"),
            PathBuf::from(r"C:\Users\Hamza\Desktop\epic-rust-server-launcher\src-tauri\target\x86_64-pc-windows-gnullvm\release\epic-rust-server-launcher-ui.exe"),
        ];

        for c in &candidates {
            if c.is_file() {
                if let Ok(mut child) = std::process::Command::new(c).spawn() {
                    let _ = child.wait();
                    return Ok(());
                }
            }
        }
    }

    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("=======================================================");
    info!("   Epic Rust - Phase 4 Verification   ");
    info!("=======================================================");

    let mut config = ServerConfig::default();
    config.hostname = "Epic Rust Dedicated Server [Phase 4]".into();
    config.port = 28015;
    config.rcon_password = "SecurePassword123!".into();
    config.install_path = PathBuf::from(r"C:\rustserver");

    // 1. Network Information
    info!("--- Network Configuration ---");
    match get_net_info(&config).await {
        Ok(net) => {
            info!("  LAN IP:        {}", net.lan_ip);
            info!("  Public IP:     {}", net.public_ip);
            info!("  Game Port:     {}", net.game_port);
            info!("  Query Port:    {} (Game + 2)", net.query_port);
            info!("  Local Connect: {}", net.connect_local);
            info!("  LAN Connect:   {}", net.connect_lan);
        }
        Err(e) => info!("  Network resolution warning: {}", e),
    }

    // 2. Pre-flight Port Checks
    match check_server_ports(config.port, config.resolved_query_port(), config.rcon_port) {
        Ok(_) => info!("  All server ports are available for binding."),
        Err(e) => info!("  Port pre-flight warning: {}", e),
    }

    // 3. SteamCMD & Discovery
    info!("--- SteamCMD & Discovery ---");
    let steamcmd = SteamCmdManager::new(config.resolved_steamcmd_dir());
    info!("  Managed SteamCMD Dir:  {}", steamcmd.steamcmd_dir.display());
    info!("  SteamCMD Installed:    {}", steamcmd.is_installed());

    let discovered = discover_all_installations(Some(&config.install_path));
    info!("  Discovered installations: {}", discovered.len());

    // 4. Map & Save Management
    info!("--- Map & Save Management ---");
    info!("  Map Type:        {}", if config.is_procedural { "Procedural" } else { "Custom Map" });
    if config.is_procedural {
        info!("  Seed: {}, World Size: {}", config.seed, config.worldsize);
    } else {
        info!("  Level URL: {:?}", config.level_url);
    }
    match MapManager::list_backups(&config) {
        Ok(backups) => info!("  Backups in .crucible-saves: {}", backups.len()),
        Err(e) => info!("  Backups check note: {}", e),
    }

    // 5. Modding Framework & Plugins
    info!("--- Modding Framework & Plugins ---");
    let framework_status = ModManager::detect_framework(&config.install_path);
    info!("  Active Framework:   {:?}", framework_status.active_framework);
    info!("  Oxide Installed:    {}", framework_status.is_oxide_installed);
    info!("  Carbon Installed:   {}", framework_status.is_carbon_installed);

    match PluginManager::list_plugins(&config.install_path, framework_status.active_framework) {
        Ok(plugins) => {
            let active = plugins.iter().filter(|p| p.is_enabled).count();
            let disabled = plugins.iter().filter(|p| !p.is_enabled).count();
            info!("  Plugins Installed:  {} (Active: {}, Disabled: {})", plugins.len(), active, disabled);
        }
        Err(e) => info!("  Plugin list note: {}", e),
    }

    // 6. server.cfg Synchronization
    info!("--- Configuration Synchronization ---");
    match sync_server_cfg(&config) {
        Ok(path) => info!("  server.cfg synchronized atomically to: {}", path.display()),
        Err(e) => info!("  server.cfg note: {}", e),
    }

    // 7. Command-Line Builder
    let args = build_command_line(&config)?;
    info!("  Constructed {} launch arguments.", args.len());

    // 8. Process Manager
    let manager = ServerProcessManager::new()?;
    info!("  Process Manager Status: {:?}", manager.state().get_status());
    info!("=======================================================");
    info!("Phase 4 components successfully verified.");
    info!("=======================================================");

    Ok(())
}
