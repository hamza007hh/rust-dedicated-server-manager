#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::path::PathBuf;
use tokio::sync::Mutex;
use tauri::{Emitter, Manager, State};

use epic_rust_server_launcher::{
    calculate_next_restart_millis, discover_all_installations,
    discovery::{validate_installation, DiscoverySource, ValidatedInstallation},
    get_net_info as fetch_net_info, sync_server_cfg, ActiveSaveInfo,
    CrashStatus, CurrentMapInfo, DiscoveredInstallation, FrameworkStatus,
    LogEntry, LogSource, MapManager, ModManager, ModFramework, NetInfo, PluginItem,
    PluginManager, SaveBackupInfo, SchedulerConfig, SchedulerStatus,
    ServerConfig, ServerInstaller, ServerProcessManager, ServerStatus,
    ServerTelemetry, UmodPluginItem, WipeResult,
    AdminManager, AdminUser, ProfileManager, ProfilesData, ServerRules,
    format_full_launch_arguments,
    SteamManager, SteamStatus, SteamFriend, InviteResult, InviteAllResult,
    detect_public_ip, is_valid_public_ip,
};

#[derive(Debug, Clone, serde::Serialize)]
pub struct SteamCmdServerStatus {
    pub is_steamcmd_installed: bool,
    pub steamcmd_path: String,
    pub is_rust_installed: bool,
    pub rust_install_path: String,
    pub build_id: Option<String>,
    pub branch: Option<String>,
    pub is_valid: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ServerCreateProgress {
    pub step: String,
    pub message: String,
    pub percent: f32,
    pub framework: String,
}

pub struct AppState {
    pub config: Arc<Mutex<ServerConfig>>,
    pub process_manager: Arc<Mutex<ServerProcessManager>>,
    pub scheduler_config: Arc<Mutex<SchedulerConfig>>,
    pub last_warning_sent: Arc<Mutex<Option<String>>>,
    pub steam_manager: Arc<Mutex<SteamManager>>,
}

// ----------------- Server Lifecycle & Telemetry -----------------

#[tauri::command]
async fn get_server_status(state: State<'_, AppState>) -> Result<String, String> {
    let mgr = state.process_manager.lock().await;
    let s = match mgr.state().get_status() {
        ServerStatus::Stopped => "stopped",
        ServerStatus::Starting => "starting",
        ServerStatus::Running => "running",
        ServerStatus::Stopping => "stopping",
        ServerStatus::RconUnavailable => "rcon_unavailable",
        ServerStatus::ProcessExited => "error",
    };
    Ok(s.to_string())
}

#[tauri::command]
async fn start_server(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.process_manager.lock().await;
    let cfg = state.config.lock().await;

    cfg.validate().map_err(|e| format!("Configuration invalid: {}", e))?;

    // Validate installation existence and integrity before attempting to start
    match validate_installation(&cfg.install_path, DiscoverySource::Configured) {
        Ok(v) => {
            if !v.is_valid {
                let err_msg = format!("Rust Dedicated Server at '{}' is invalid or incomplete.", cfg.install_path.display());
                let _ = app.emit("error-occurred", serde_json::json!({
                    "code": "MISSING_INSTALLATION",
                    "message": err_msg.clone()
                }));
                return Err(err_msg);
            }
        }
        Err(e) => {
            let err_msg = format!("Cannot start server: {}. Please configure a valid installation path in Settings.", e);
            let _ = app.emit("error-occurred", serde_json::json!({
                "code": "MISSING_INSTALLATION",
                "message": err_msg.clone()
            }));
            return Err(err_msg);
        }
    }

    if mgr.state().is_running() {
        return Err("Server is already running or starting.".to_string());
    }

    match mgr.start(&cfg).await {
        Ok(_) => {
            let _ = app.emit("server-state-changed", "starting");

            if let Some(rcon) = mgr.rcon() {
                let mut msg_rx = rcon.subscribe_messages();
                let app_handle = app.clone();
                tokio::spawn(async move {
                    while let Ok(pkt) = msg_rx.recv().await {
                        let _ = app_handle.emit("rcon-message-received", &pkt);
                    }
                });
            }
            Ok(())
        }
        Err(e) => {
            let err_msg = e.to_string();
            let _ = app.emit("error-occurred", serde_json::json!({
                "code": "START_FAILED",
                "message": err_msg.clone()
            }));
            Err(err_msg)
        }
    }
}

#[tauri::command]
async fn stop_server(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.process_manager.lock().await;
    if !mgr.state().is_running() {
        return Err("No server is currently running.".to_string());
    }

    let _ = app.emit("server-state-changed", "stopping");

    match mgr.stop().await {
        Ok(_) => {
            let _ = app.emit("server-state-changed", "stopped");
            Ok(())
        }
        Err(e) => {
            let err_msg = e.to_string();
            let _ = app.emit("error-occurred", serde_json::json!({
                "code": "STOP_FAILED",
                "message": err_msg.clone()
            }));
            Err(err_msg)
        }
    }
}

#[tauri::command]
async fn restart_server(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.process_manager.lock().await;
    let cfg = state.config.lock().await;

    cfg.validate().map_err(|e| format!("Configuration invalid: {}", e))?;

    let _ = app.emit("server-state-changed", "stopping");
    if mgr.state().is_running() {
        let _ = mgr.stop().await;
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    }

    match mgr.start(&cfg).await {
        Ok(_) => {
            let _ = app.emit("server-state-changed", "starting");
            if let Some(rcon) = mgr.rcon() {
                let mut msg_rx = rcon.subscribe_messages();
                let app_handle = app.clone();
                tokio::spawn(async move {
                    while let Ok(pkt) = msg_rx.recv().await {
                        let _ = app_handle.emit("rcon-message-received", &pkt);
                    }
                });
            }
            Ok(())
        }
        Err(e) => {
            let err_msg = e.to_string();
            let _ = app.emit("error-occurred", serde_json::json!({
                "code": "RESTART_FAILED",
                "message": err_msg.clone()
            }));
            Err(err_msg)
        }
    }
}

#[tauri::command]
async fn get_telemetry(state: State<'_, AppState>) -> Result<ServerTelemetry, String> {
    let mgr = state.process_manager.lock().await;
    let cfg = state.config.lock().await;

    let is_running = mgr.state().is_running();
    let uptime = mgr.uptime_seconds();
    let (mem_mb, cpu_pct) = mgr.get_resource_metrics().await;

    let mut telem = if let Some(rcon) = mgr.rcon() {
        let telem_rx = rcon.subscribe_telemetry();
        let current = telem_rx.borrow().clone();
        current
    } else {
        ServerTelemetry {
            hostname: cfg.hostname.clone(),
            max_players: cfg.max_players,
            ..Default::default()
        }
    };

    if is_running {
        if uptime > 0 {
            telem.uptime = uptime;
        }
        if mem_mb > 0.0 {
            telem.memory = mem_mb;
        }
        telem.cpu = cpu_pct;
    } else {
        telem.players = 0;
        telem.queued_players = 0;
        telem.joining_players = 0;
        telem.framerate = 0.0;
        telem.uptime = 0;
        telem.memory = 0.0;
        telem.cpu = 0.0;
    }

    Ok(telem)
}

#[tauri::command]
async fn get_net_info(state: State<'_, AppState>) -> Result<NetInfo, String> {
    let cfg = state.config.lock().await;
    fetch_net_info(&cfg).await.map_err(|e| e.to_string())
}

// ----------------- Configuration -----------------

#[tauri::command]
async fn get_server_config(state: State<'_, AppState>) -> Result<ServerConfig, String> {
    let cfg = state.config.lock().await;
    Ok(cfg.clone())
}

#[tauri::command]
async fn save_server_config(state: State<'_, AppState>, config: ServerConfig) -> Result<(), String> {
    config.validate().map_err(|e| e.to_string())?;
    config.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE).map_err(|e| e.to_string())?;
    let _ = ProfileManager::update_active_config(&config);
    {
        let mut cfg = state.config.lock().await;
        *cfg = config.clone();
    }
    if let Err(e) = sync_server_cfg(&config) {
        tracing::warn!("Warning: Failed to sync server.cfg (non-fatal): {}", e);
    }
    Ok(())
}

// ----------------- Multiple Server Profiles -----------------

#[tauri::command]
async fn get_server_profiles() -> Result<ProfilesData, String> {
    Ok(ProfileManager::load_or_init())
}

#[tauri::command]
async fn create_server_profile(
    state: State<'_, AppState>,
    name: String,
    copy_from_active: bool,
) -> Result<ProfilesData, String> {
    let base_cfg = if copy_from_active {
        let c = state.config.lock().await;
        Some(c.clone())
    } else {
        None
    };

    let (data, _new_profile) = ProfileManager::create_profile(&name, base_cfg.as_ref())
        .map_err(|e| e.to_string())?;

    Ok(data)
}

#[tauri::command]
async fn create_server(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    config: ServerConfig,
) -> Result<ProfilesData, String> {
    let mgr = state.process_manager.lock().await;
    if mgr.state().is_running() {
        return Err("Cannot create and activate a new server profile while a server is currently running. Please stop the running server first.".to_string());
    }
    drop(mgr);

    let mut cfg = config.clone();
    cfg.ensure_mod_framework_inferred();
    cfg.validate().map_err(|e| format!("Validation error: {}", e))?;

    let emit_prog = |step: &str, msg: &str, pct: f32| {
        let p = ServerCreateProgress {
            step: step.to_string(),
            message: msg.to_string(),
            percent: pct,
            framework: cfg.mod_framework.clone(),
        };
        let _ = app.emit("server:create:progress", &p);
        let _ = app.emit("server-create-progress", &p);
    };

    // Step 1: Preparing server
    emit_prog("preparing", "Preparing server directories...", 10.0);
    if let Err(e) = std::fs::create_dir_all(&cfg.install_path) {
        let err_msg = format!("Failed to create install directory: {}", e);
        let _ = app.emit("server:create:error", serde_json::json!({ "error": err_msg }));
        let _ = app.emit("server-create-error", serde_json::json!({ "error": err_msg }));
        return Err(err_msg);
    }

    // Step 2: Install or validate Rust Dedicated Server
    let is_already_valid = validate_installation(&cfg.install_path, DiscoverySource::Configured)
        .map(|v| v.is_valid)
        .unwrap_or(false);

    if !is_already_valid {
        emit_prog("installing_rust", "Installing Rust Dedicated Server via SteamCMD...", 25.0);
        let installer = ServerInstaller::from_config(&cfg);
        let mut prog_rx = installer.subscribe_progress();
        let app_handle = app.clone();
        tokio::spawn(async move {
            while let Ok(prog) = prog_rx.recv().await {
                let _ = app_handle.emit("steamcmd-progress", &prog);
            }
        });

        if let Err(e) = installer.install_or_update(&cfg).await {
            let err_msg = format!("SteamCMD installation failed: {}", e);
            let _ = app.emit("server:create:error", serde_json::json!({ "error": err_msg }));
            let _ = app.emit("server-create-error", serde_json::json!({ "error": err_msg }));
            return Err(err_msg);
        }
    }

    // Step 3: Validating Rust
    emit_prog("validating_rust", "Validating Rust Dedicated Server...", 55.0);
    match validate_installation(&cfg.install_path, DiscoverySource::Configured) {
        Ok(v) if v.is_valid => {}
        Ok(_) => {
            let err_msg = format!("RustDedicated.exe not found or incomplete in {}", cfg.install_path.display());
            let _ = app.emit("server:create:error", serde_json::json!({ "error": err_msg }));
            let _ = app.emit("server-create-error", serde_json::json!({ "error": err_msg }));
            return Err(err_msg);
        }
        Err(e) => {
            let err_msg = format!("Failed to validate Rust Dedicated Server: {}", e);
            let _ = app.emit("server:create:error", serde_json::json!({ "error": err_msg }));
            let _ = app.emit("server-create-error", serde_json::json!({ "error": err_msg }));
            return Err(err_msg);
        }
    }

    // Step 4: Installing Framework if selected
    match cfg.mod_framework.as_str() {
        "carbon" => {
            emit_prog("installing_carbon", "Installing Carbon modding framework...", 75.0);
            if let Err(e) = ModManager::install_carbon(&cfg.install_path).await {
                let err_msg = format!("Carbon framework installation failed: {}", e);
                let _ = app.emit("server:create:error", serde_json::json!({ "error": err_msg }));
                let _ = app.emit("server-create-error", serde_json::json!({ "error": err_msg }));
                return Err(err_msg);
            }
        }
        "oxide" => {
            emit_prog("installing_oxide", "Installing Oxide (uMod) framework...", 75.0);
            if let Err(e) = ModManager::install_oxide(&cfg.install_path).await {
                let err_msg = format!("Oxide framework installation failed: {}", e);
                let _ = app.emit("server:create:error", serde_json::json!({ "error": err_msg }));
                let _ = app.emit("server-create-error", serde_json::json!({ "error": err_msg }));
                return Err(err_msg);
            }
        }
        _ => {
            // Vanilla: no framework installation needed
        }
    }

    // Step 5: Generating configuration and server.cfg
    emit_prog("generating_config", "Generating server.cfg and configuration...", 90.0);
    if let Err(e) = sync_server_cfg(&cfg) {
        let err_msg = format!("Failed to generate server.cfg: {}", e);
        let _ = app.emit("server:create:error", serde_json::json!({ "error": err_msg }));
        let _ = app.emit("server-create-error", serde_json::json!({ "error": err_msg }));
        return Err(err_msg);
    }

    // Step 6: Finalizing server and registering profile
    emit_prog("finalizing", "Finalizing server configuration...", 98.0);
    let (profiles_data, _new_profile) = match ProfileManager::register_server_profile(&cfg.hostname, cfg.clone(), true) {
        Ok(res) => res,
        Err(e) => {
            let err_msg = format!("Failed to register server profile: {}", e);
            let _ = app.emit("server:create:error", serde_json::json!({ "error": err_msg }));
            let _ = app.emit("server-create-error", serde_json::json!({ "error": err_msg }));
            return Err(err_msg);
        }
    };

    // Update in-memory state
    let mut active_cfg = state.config.lock().await;
    *active_cfg = cfg.clone();

    emit_prog("complete", "Server created successfully!", 100.0);
    let _ = app.emit("server:create:complete", serde_json::json!({ "config": cfg }));
    let _ = app.emit("server-create-complete", serde_json::json!({ "config": cfg }));

    Ok(profiles_data)
}

#[tauri::command]
async fn change_mod_framework(
    state: State<'_, AppState>,
    target_framework: String,
) -> Result<ServerConfig, String> {
    let mgr = state.process_manager.lock().await;
    if mgr.state().is_running() {
        return Err("Cannot change mod framework while the server is running. Please stop the server first.".to_string());
    }
    drop(mgr);

    let target = target_framework.trim().to_lowercase();
    if target != "vanilla" && target != "carbon" && target != "oxide" {
        return Err(format!("Invalid target framework '{}'. Must be 'vanilla', 'carbon', or 'oxide'.", target_framework));
    }

    let mut cfg = state.config.lock().await;
    if cfg.mod_framework == target {
        return Ok(cfg.clone());
    }

    // Execute appropriate installation
    match target.as_str() {
        "carbon" => {
            ModManager::install_carbon(&cfg.install_path).await
                .map_err(|e| format!("Carbon installation failed: {}", e))?;
        }
        "oxide" => {
            ModManager::install_oxide(&cfg.install_path).await
                .map_err(|e| format!("Oxide installation failed: {}", e))?;
        }
        "vanilla" => {
            // Validate that base server exists
            validate_installation(&cfg.install_path, DiscoverySource::Configured)
                .map_err(|e| format!("Validation error: {}", e))?;
        }
        _ => unreachable!(),
    }

    cfg.mod_framework = target;
    cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE).map_err(|e| e.to_string())?;
    let _ = ProfileManager::update_active_config(&cfg);
    let _ = sync_server_cfg(&cfg);

    Ok(cfg.clone())
}

#[tauri::command]
async fn select_server_profile(
    state: State<'_, AppState>,
    id: String,
) -> Result<ProfilesData, String> {
    let mgr = state.process_manager.lock().await;
    if mgr.state().is_running() {
        return Err("Cannot switch server profiles while a server is currently running. Please stop the server first.".to_string());
    }
    drop(mgr);

    let (data, new_cfg) = ProfileManager::switch_active(&id).map_err(|e| e.to_string())?;
    let _ = sync_server_cfg(&new_cfg);

    let mut cfg = state.config.lock().await;
    *cfg = new_cfg;

    Ok(data)
}

#[tauri::command]
async fn delete_server_profile(
    state: State<'_, AppState>,
    id: String,
) -> Result<ProfilesData, String> {
    let data_check = ProfileManager::load_or_init();
    if data_check.active_profile_id == id {
        let mgr = state.process_manager.lock().await;
        if mgr.state().is_running() {
            return Err("Cannot delete active server profile while it is running. Stop the server first.".to_string());
        }
    }

    let data = ProfileManager::delete_profile(&id).map_err(|e| e.to_string())?;

    if let Some(active) = data.profiles.iter().find(|p| p.id == data.active_profile_id) {
        let mut cfg = state.config.lock().await;
        *cfg = active.config.clone();
        let _ = cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);
        let _ = sync_server_cfg(&cfg);
    } else {
        let mut cfg = state.config.lock().await;
        *cfg = ServerConfig::default();
        let _ = cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);
    }

    Ok(data)
}

#[tauri::command]
async fn rename_server_profile(
    id: String,
    new_name: String,
) -> Result<ProfilesData, String> {
    ProfileManager::rename_profile(&id, &new_name).map_err(|e| e.to_string())
}

// ----------------- SteamID64 Server Admins -----------------

#[tauri::command]
async fn get_server_admins(state: State<'_, AppState>) -> Result<Vec<AdminUser>, String> {
    let mut cfg = state.config.lock().await;
    if cfg.admins.is_empty() {
        let loaded = AdminManager::load_admins(&cfg.install_path, &cfg.identity);
        if !loaded.is_empty() {
            cfg.admins = loaded.clone();
            let _ = cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);
        }
        Ok(loaded)
    } else {
        Ok(cfg.admins.clone())
    }
}

#[tauri::command]
async fn add_server_admin(
    state: State<'_, AppState>,
    steam_id: String,
    role: String,
    name: String,
    notes: String,
) -> Result<Vec<AdminUser>, String> {
    let clean_id = steam_id.trim().trim_matches('"').trim().to_string();
    let clean_name = if name.trim().is_empty() { "Server Owner".to_string() } else { name.trim().to_string() };
    let clean_notes = notes.trim().to_string();

    let mut cfg = state.config.lock().await;
    let list = AdminManager::add_admin(
        &cfg.install_path,
        &cfg.identity,
        &clean_id,
        &role,
        &clean_name,
        &clean_notes,
    ).map_err(|e| e.to_string())?;

    cfg.admins = list.clone();
    let _ = cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);

    let mgr = state.process_manager.lock().await;
    if let Some(rcon) = mgr.rcon() {
        if rcon.is_connected() {
            let cmd_name = if role.to_lowercase() == "owner" { "ownerid" } else { "moderatorid" };
            let rcon_cmd = format!("{} {} \"{}\"", cmd_name, clean_id, clean_name);
            let _ = rcon.send_command(&rcon_cmd).await;
            mgr.log_manager().append(LogSource::Rcon, format!("> {}", rcon_cmd));

            let _ = rcon.send_command("server.writecfg").await;
            mgr.log_manager().append(LogSource::Rcon, "> server.writecfg".to_string());

            let _ = rcon.send_command("server.readcfg").await;
            mgr.log_manager().append(LogSource::Rcon, "> server.readcfg".to_string());

            let broadcast = format!("say [ADMIN] Granted {} access to {} ({}). Type 'reconnect' in F1 console to activate!", role.to_uppercase(), clean_name, clean_id);
            let _ = rcon.send_command(&broadcast).await;

            mgr.log_manager().append(
                LogSource::System,
                format!("Granted {} to SteamID {} via RCON. In-game reconnect required.", role, clean_id),
            );
        }
    }

    Ok(list)
}

#[tauri::command]
async fn remove_server_admin(
    state: State<'_, AppState>,
    steam_id: String,
) -> Result<Vec<AdminUser>, String> {
    let clean_id = steam_id.trim().trim_matches('"').trim().to_string();
    let mut cfg = state.config.lock().await;
    let list = AdminManager::remove_admin(&cfg.install_path, &cfg.identity, &clean_id)
        .map_err(|e| e.to_string())?;

    cfg.admins = list.clone();
    let _ = cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);

    let mgr = state.process_manager.lock().await;
    if let Some(rcon) = mgr.rcon() {
        if rcon.is_connected() {
            let _ = rcon.send_command(&format!("removeowner {}", clean_id)).await;
            let _ = rcon.send_command(&format!("removemoderator {}", clean_id)).await;
            let _ = rcon.send_command("server.writecfg").await;
            let _ = rcon.send_command("server.readcfg").await;
            mgr.log_manager().append(LogSource::System, format!("Revoked admin for SteamID {} via RCON", clean_id));
        }
    }

    Ok(list)
}

// ----------------- Quick Weather & Server Actions -----------------

#[tauri::command]
async fn quick_weather_or_action(
    state: State<'_, AppState>,
    action: String,
) -> Result<String, String> {
    let mgr = state.process_manager.lock().await;
    if let Some(rcon) = mgr.rcon() {
        if !rcon.is_connected() {
            return Err("Server RCON connection is not active. Server must be running to execute quick commands.".to_string());
        }

        let (cmds, desc): (Vec<&str>, &str) = match action.as_str() {
            "noon" => (vec!["env.time 12"], "Time set to Noon (12:00)"),
            "sunrise" => (vec!["env.time 6.5"], "Time set to Sunrise (06:30)"),
            "sunset" => (vec!["env.time 18.5"], "Time set to Sunset (18:30)"),
            "night" => (vec!["env.time 0"], "Time set to Midnight (00:00)"),
            "clear" => (
                vec!["weather.clouds 0", "weather.rain 0", "weather.fog 0", "weather.wind 0", "weather.storm 0"],
                "Weather cleared",
            ),
            "rain" => (vec!["weather.rain 1", "weather.clouds 0.8"], "Rain enabled"),
            "fog" => (vec!["weather.fog 1"], "Dense fog enabled"),
            "storm" => (
                vec!["weather.storm 1", "weather.rain 1", "weather.clouds 1", "weather.wind 1"],
                "Storm event activated",
            ),
            "airdrop" => (vec!["supply.call"], "Cargo plane airdrop called"),
            "heli" => (vec!["heli.call"], "Patrol helicopter called"),
            "save" => (vec!["server.save"], "World save committed"),
            "heal_all" => (vec!["healall"], "Heal all dispatched"),
            "reload_plugins" => {
                let cfg = state.config.lock().await;
                let fstatus = ModManager::detect_framework(&cfg.install_path);
                match fstatus.active_framework {
                    ModFramework::Carbon => (vec!["carbon.reload *"], "Carbon plugins reloaded"),
                    ModFramework::Oxide => (vec!["oxide.reload *"], "Oxide plugins reloaded"),
                    ModFramework::Vanilla => (vec!["oxide.reload *", "carbon.reload *"], "Plugin reload dispatched"),
                }
            }
            other => return Err(format!("Unknown quick action: {}", other)),
        };

        for cmd in cmds {
            let _ = rcon.send_command(cmd).await;
            mgr.log_manager().append(LogSource::Rcon, format!("> {}", cmd));
        }

        Ok(desc.to_string())
    } else {
        Err("Server is not currently running. Cannot execute quick command.".to_string())
    }
}

// ----------------- Live Server Rules Convars -----------------

#[tauri::command]
async fn update_server_rules(
    state: State<'_, AppState>,
    rules: ServerRules,
) -> Result<(), String> {
    let mut cfg = state.config.lock().await;
    let old_rules = cfg.server_rules.clone();
    cfg.server_rules = rules.clone();

    let _ = cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);
    let _ = ProfileManager::update_active_config(&cfg);
    let _ = sync_server_cfg(&cfg);

    let mgr = state.process_manager.lock().await;
    if let Some(rcon) = mgr.rcon() {
        if rcon.is_connected() {
            let mut commands = Vec::new();

            if old_rules.bradley_apc != rules.bradley_apc {
                commands.push(format!("bradley.enabled {}", rules.bradley_apc));
            }
            if old_rules.timed_events != rules.timed_events {
                commands.push(format!("server.events {}", rules.timed_events));
            }
            if old_rules.cargo_ship != rules.cargo_ship {
                commands.push(format!("cargoship.event_enabled {}", rules.cargo_ship));
            }
            if old_rules.radiation != rules.radiation {
                commands.push(format!("server.radiation {}", rules.radiation));
            }
            if old_rules.scientists_npcs != rules.scientists_npcs {
                commands.push(format!("ai.think {}", rules.scientists_npcs));
            }
            if old_rules.structural_stability != rules.structural_stability {
                commands.push(format!("server.stability {}", rules.structural_stability));
            }
            if old_rules.halloween_event != rules.halloween_event {
                commands.push(format!("halloween.enabled {}", rules.halloween_event));
            }
            if old_rules.christmas_event != rules.christmas_event {
                commands.push(format!("xmas.enabled {}", rules.christmas_event));
            }
            if old_rules.no_animals != rules.no_animals {
                commands.push(format!("ai.npc_enable {}", !rules.no_animals));
            }
            if old_rules.passive_scientists != rules.passive_scientists {
                commands.push(format!("ai.ignoreplayers {}", rules.passive_scientists));
            }
            if old_rules.lock_time_16_8 != rules.lock_time_16_8 {
                if rules.lock_time_16_8 {
                    commands.push("env.progresstime false".to_string());
                    commands.push("env.time 16.8".to_string());
                } else {
                    commands.push("env.progresstime true".to_string());
                }
            }
            if old_rules.lock_clear_weather != rules.lock_clear_weather && rules.lock_clear_weather {
                commands.push("weather.clouds 0".to_string());
                commands.push("weather.rain 0".to_string());
                commands.push("weather.fog 0".to_string());
                commands.push("weather.wind 0".to_string());
                commands.push("weather.storm 0".to_string());
            }
            if old_rules.no_building_upkeep != rules.no_building_upkeep {
                commands.push(format!("decay.upkeep {}", !rules.no_building_upkeep));
            }
            if old_rules.no_decay != rules.no_decay {
                let scale = if rules.no_decay { "0" } else { "1" };
                commands.push(format!("decay.scale {}", scale));
            }
            if old_rules.spawn_loot_on_start != rules.spawn_loot_on_start && rules.spawn_loot_on_start {
                commands.push("spawn.respawn_populations".to_string());
            }
            if old_rules.instant_craft != rules.instant_craft {
                commands.push(format!("crafting.instant {}", rules.instant_craft));
            }
            if old_rules.creative_mode != rules.creative_mode {
                commands.push(format!("creative.allusers {}", rules.creative_mode));
            }
            if old_rules.free_build != rules.free_build {
                commands.push(format!("creative.freebuild {}", rules.free_build));
            }
            if old_rules.free_placement != rules.free_placement {
                commands.push(format!("creative.freeplacement {}", rules.free_placement));
            }
            if old_rules.free_repair != rules.free_repair {
                commands.push(format!("creative.freerepair {}", rules.free_repair));
            }
            if old_rules.unlimited_io != rules.unlimited_io {
                commands.push(format!("creative.unlimitedio {}", rules.unlimited_io));
            }
            if old_rules.always_on_entities != rules.always_on_entities {
                commands.push(format!("creative.alwaysonenabled {}", rules.always_on_entities));
            }

            for cmd in &commands {
                let _ = rcon.send_command(cmd).await;
                mgr.log_manager().append(LogSource::Rcon, format!("> {}", cmd));
            }

            if !commands.is_empty() {
                let _ = rcon.send_command("server.writecfg").await;
                mgr.log_manager().append(LogSource::Rcon, "> server.writecfg".to_string());
            }
        }
    }

    Ok(())
}

// ----------------- server.cfg (Advanced) -----------------

#[tauri::command]
async fn get_raw_server_cfg(state: State<'_, AppState>) -> Result<String, String> {
    let cfg = state.config.lock().await;
    let cfg_file = cfg.install_path.join("server").join(&cfg.identity).join("cfg").join("server.cfg");
    if cfg_file.is_file() {
        std::fs::read_to_string(&cfg_file).map_err(|e| e.to_string())
    } else {
        let path = sync_server_cfg(&cfg).map_err(|e| e.to_string())?;
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn save_raw_server_cfg(state: State<'_, AppState>, content: String) -> Result<(), String> {
    let cfg = state.config.lock().await;
    let cfg_dir = cfg.install_path.join("server").join(&cfg.identity).join("cfg");
    let _ = std::fs::create_dir_all(&cfg_dir);
    let cfg_file = cfg_dir.join("server.cfg");
    std::fs::write(&cfg_file, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn reset_server_cfg_defaults(state: State<'_, AppState>) -> Result<String, String> {
    let cfg = state.config.lock().await;
    let path = sync_server_cfg(&cfg).map_err(|e| e.to_string())?;
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_cfg_folder(state: State<'_, AppState>) -> Result<(), String> {
    let cfg = state.config.lock().await;
    let cfg_dir = cfg.install_path.join("server").join(&cfg.identity).join("cfg");
    let _ = std::fs::create_dir_all(&cfg_dir);
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(cfg_dir.to_string_lossy().to_string())
            .spawn();
    }
    Ok(())
}

#[tauri::command]
async fn open_install_folder(state: State<'_, AppState>) -> Result<(), String> {
    let cfg = state.config.lock().await;
    let path = &cfg.install_path;
    let _ = std::fs::create_dir_all(path);
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(path.to_string_lossy().to_string())
            .spawn();
    }
    Ok(())
}

#[tauri::command]
async fn open_support_log(state: State<'_, AppState>) -> Result<(), String> {
    let cfg = state.config.lock().await;
    let log_file_name = cfg.log_file.as_deref().unwrap_or("output.log");
    let log_path = cfg.install_path.join(log_file_name);
    #[cfg(windows)]
    {
        if log_path.exists() {
            let _ = std::process::Command::new("notepad.exe")
                .arg(log_path.to_string_lossy().to_string())
                .spawn();
        } else {
            let _ = std::process::Command::new("explorer.exe")
                .arg(cfg.install_path.to_string_lossy().to_string())
                .spawn();
        }
    }
    Ok(())
}

fn calc_directory_size(path: &std::path::Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_dir() {
                    total += calc_directory_size(&entry.path());
                } else {
                    total += meta.len();
                }
            }
        }
    }
    total
}

#[derive(serde::Serialize, Clone, Debug)]
struct StorageUsageInfo {
    install_size_mb: f64,
    backups_size_mb: f64,
}

#[tauri::command]
async fn get_storage_usage(state: State<'_, AppState>) -> Result<StorageUsageInfo, String> {
    let cfg = state.config.lock().await;
    let install_bytes = calc_directory_size(&cfg.install_path);
    let backups_dir = cfg.install_path.join("backups");
    let backups_bytes = if backups_dir.exists() {
        calc_directory_size(&backups_dir)
    } else {
        0
    };

    Ok(StorageUsageInfo {
        install_size_mb: (install_bytes as f64) / (1024.0 * 1024.0),
        backups_size_mb: (backups_bytes as f64) / (1024.0 * 1024.0),
    })
}

#[tauri::command]
async fn clean_temp_files(state: State<'_, AppState>) -> Result<f64, String> {
    let cfg = state.config.lock().await;
    let mut freed_bytes: u64 = 0;

    let temp_dirs = [
        cfg.install_path.join("steamapps").join("temp"),
        cfg.install_path.join("steamapps").join("downloading"),
    ];
    for d in &temp_dirs {
        if d.is_dir() {
            freed_bytes += calc_directory_size(d);
            let _ = std::fs::remove_dir_all(d);
            let _ = std::fs::create_dir_all(d);
        }
    }

    // Clean any temporary gen files in server identity
    let cfg_dir = cfg.install_path.join("server").join(&cfg.identity).join("cfg");
    if cfg_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&cfg_dir) {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.ends_with(".gen") || name.ends_with(".tmp") {
                        if let Ok(meta) = entry.metadata() {
                            freed_bytes += meta.len();
                        }
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    let freed_mb = (freed_bytes as f64) / (1024.0 * 1024.0);
    Ok(freed_mb)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct LauncherPreferences {
    launch_on_startup: bool,
    minimize_to_tray: bool,
    close_to_tray: bool,
    auto_update_apps: bool,
}

impl Default for LauncherPreferences {
    fn default() -> Self {
        Self {
            launch_on_startup: false,
            minimize_to_tray: false,
            close_to_tray: false,
            auto_update_apps: true,
        }
    }
}

#[tauri::command]
async fn get_launcher_preferences() -> Result<LauncherPreferences, String> {
    let mut prefs = LauncherPreferences::default();
    if let Ok(content) = std::fs::read_to_string("launcher_preferences.json") {
        if let Ok(p) = serde_json::from_str::<LauncherPreferences>(&content) {
            prefs = p;
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "/v", "EpicRust"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            if output.status.success() {
                prefs.launch_on_startup = true;
            }
        }
    }

    Ok(prefs)
}

#[tauri::command]
async fn save_launcher_preferences(prefs: LauncherPreferences) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&prefs).map_err(|e| e.to_string())?;
    let _ = std::fs::write("launcher_preferences.json", json);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if prefs.launch_on_startup {
            if let Ok(exe_path) = std::env::current_exe() {
                let exe_str = exe_path.to_string_lossy().to_string();
                let _ = std::process::Command::new("reg")
                    .args([
                        "add",
                        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                        "/v",
                        "EpicRust",
                        "/t",
                        "REG_SZ",
                        "/d",
                        &format!("\"{}\"", exe_str),
                        "/f",
                    ])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }
        } else {
            let _ = std::process::Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "EpicRust",
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
    }

    Ok(())
}

// ----------------- Launch arguments (Advanced) -----------------

#[tauri::command]
async fn get_formatted_launch_args(state: State<'_, AppState>) -> Result<String, String> {
    let cfg = state.config.lock().await;
    Ok(format_full_launch_arguments(&cfg))
}

#[tauri::command]
async fn save_custom_launch_args(state: State<'_, AppState>, custom_args: String) -> Result<(), String> {
    let mut cfg = state.config.lock().await;
    cfg.custom_args = custom_args;
    cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE).map_err(|e| e.to_string())?;
    let _ = ProfileManager::update_active_config(&cfg);
    Ok(())
}

// ----------------- Console & Logs -----------------

#[tauri::command]
async fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    let mgr = state.process_manager.lock().await;
    Ok(mgr.log_manager().get_recent_logs())
}

#[tauri::command]
async fn send_rcon_command(state: State<'_, AppState>, command: String) -> Result<String, String> {
    let mgr = state.process_manager.lock().await;
    if let Some(rcon) = mgr.rcon() {
        if !rcon.is_connected() {
            return Err("RCON connection is not active yet.".to_string());
        }
        rcon.send_command(&command).await.map_err(|e| e.to_string())?;
        mgr.log_manager().append(LogSource::Rcon, format!("> {}", command));
        Ok(format!("Dispatched: {}", command))
    } else {
        Err("Server is not currently running. Cannot send RCON command.".to_string())
    }
}

// ----------------- Maps & Saves -----------------

#[tauri::command]
async fn get_map_info(state: State<'_, AppState>) -> Result<CurrentMapInfo, String> {
    let cfg = state.config.lock().await;
    MapManager::get_map_info(&cfg).map_err(|e| e.to_string())
}

#[tauri::command]
async fn change_map_procedural(state: State<'_, AppState>, seed: u32, worldsize: u32) -> Result<(), String> {
    let mgr = state.process_manager.lock().await;
    let mut cfg = state.config.lock().await;
    MapManager::change_to_procedural(&mut cfg, mgr.state(), seed, worldsize)
        .map_err(|e| e.to_string())?;
    let _ = cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);
    Ok(())
}

#[tauri::command]
async fn change_map_custom(state: State<'_, AppState>, level_url: String) -> Result<(), String> {
    let mgr = state.process_manager.lock().await;
    let mut cfg = state.config.lock().await;
    MapManager::change_to_custom_url(&mut cfg, mgr.state(), level_url)
        .map_err(|e| e.to_string())?;
    let _ = cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);
    Ok(())
}

#[tauri::command]
async fn wipe_procedural_map(state: State<'_, AppState>) -> Result<WipeResult, String> {
    let mgr = state.process_manager.lock().await;
    let cfg = state.config.lock().await;
    MapManager::wipe_procedural_map(&cfg, mgr.state())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_active_saves(state: State<'_, AppState>) -> Result<Vec<ActiveSaveInfo>, String> {
    let cfg = state.config.lock().await;
    MapManager::list_active_saves(&cfg).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_backups(state: State<'_, AppState>) -> Result<Vec<SaveBackupInfo>, String> {
    let cfg = state.config.lock().await;
    MapManager::list_backups(&cfg).map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_backup(state: State<'_, AppState>, tag: Option<String>) -> Result<String, String> {
    let cfg = state.config.lock().await;
    let tag_name = tag.unwrap_or_else(|| "manual".to_string());
    let path = MapManager::backup_save_directory(&cfg, &tag_name)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn restore_save(state: State<'_, AppState>, backup_path: String) -> Result<(), String> {
    let mgr = state.process_manager.lock().await;
    let cfg = state.config.lock().await;
    MapManager::restore_save(&cfg, mgr.state(), std::path::Path::new(&backup_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_backup(state: State<'_, AppState>, backup_path: String) -> Result<(), String> {
    let cfg = state.config.lock().await;
    MapManager::delete_backup(&cfg, std::path::Path::new(&backup_path)).map_err(|e| e.to_string())
}

// ----------------- Mods & Plugins -----------------

#[tauri::command]
async fn get_framework_status(state: State<'_, AppState>) -> Result<FrameworkStatus, String> {
    let cfg = state.config.lock().await;
    Ok(ModManager::detect_framework(&cfg.install_path))
}

#[tauri::command]
async fn install_oxide(state: State<'_, AppState>) -> Result<(), String> {
    let cfg = state.config.lock().await;
    ModManager::install_oxide(&cfg.install_path).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_carbon(state: State<'_, AppState>) -> Result<(), String> {
    let cfg = state.config.lock().await;
    ModManager::install_carbon(&cfg.install_path).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_plugins(state: State<'_, AppState>) -> Result<Vec<PluginItem>, String> {
    let cfg = state.config.lock().await;
    let fstatus = ModManager::detect_framework(&cfg.install_path);
    PluginManager::list_plugins(&cfg.install_path, fstatus.active_framework)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn toggle_plugin(state: State<'_, AppState>, name: String, enable: bool) -> Result<(), String> {
    let cfg = state.config.lock().await;
    let fstatus = ModManager::detect_framework(&cfg.install_path);
    if enable {
        PluginManager::enable_plugin(&cfg.install_path, fstatus.active_framework, &name)
            .map_err(|e| e.to_string())?;
    } else {
        PluginManager::disable_plugin(&cfg.install_path, fstatus.active_framework, &name)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn delete_plugin(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let cfg = state.config.lock().await;
    let fstatus = ModManager::detect_framework(&cfg.install_path);
    PluginManager::delete_plugin(&cfg.install_path, fstatus.active_framework, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_umod(query: String, page: Option<u32>) -> Result<Vec<UmodPluginItem>, String> {
    PluginManager::search_umod(&query, page.unwrap_or(1)).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_umod_plugin(state: State<'_, AppState>, slug: String) -> Result<String, String> {
    let cfg = state.config.lock().await;
    let fstatus = ModManager::detect_framework(&cfg.install_path);
    let target_dir = PluginManager::get_framework_dir(&cfg.install_path, fstatus.active_framework).join("plugins");
    let path = PluginManager::download_umod_plugin(&slug, &target_dir).await
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// ----------------- SteamCMD & Installation -----------------

#[tauri::command]
async fn get_steamcmd_server_status(state: State<'_, AppState>) -> Result<SteamCmdServerStatus, String> {
    let cfg = state.config.lock().await;
    let steamcmd_dir = cfg.resolved_steamcmd_dir();
    let steamcmd_exe = steamcmd_dir.join("steamcmd.exe");
    let is_steamcmd = steamcmd_exe.is_file();

    let (is_rust, build_id, branch, is_valid) = match validate_installation(&cfg.install_path, DiscoverySource::Configured) {
        Ok(v) => (true, v.build_id, v.branch, v.is_valid),
        Err(_) => (false, None, None, false),
    };

    Ok(SteamCmdServerStatus {
        is_steamcmd_installed: is_steamcmd,
        steamcmd_path: steamcmd_exe.to_string_lossy().to_string(),
        is_rust_installed: is_rust,
        rust_install_path: cfg.install_path.to_string_lossy().to_string(),
        build_id,
        branch,
        is_valid,
    })
}

#[tauri::command]
async fn run_steamcmd_install_or_update(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<ValidatedInstallation, String> {
    let cfg = state.config.lock().await.clone();
    let installer = ServerInstaller::from_config(&cfg);
    let mut progress_rx = installer.subscribe_progress();
    let app_handle = app.clone();

    tokio::spawn(async move {
        while let Ok(prog) = progress_rx.recv().await {
            let _ = app_handle.emit("steamcmd-progress", &prog);
        }
    });

    installer.install_or_update(&cfg).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn validate_rust_server(
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<ValidatedInstallation, String> {
    let cfg = state.config.lock().await;
    let target = path.map(PathBuf::from).unwrap_or_else(|| cfg.install_path.clone());
    validate_installation(&target, DiscoverySource::Configured).map_err(|e| e.to_string())
}

#[tauri::command]
async fn browse_directory() -> Result<Option<String>, String> {
    let handle = rfd::AsyncFileDialog::new()
        .set_title("Select Rust Dedicated Server Directory")
        .pick_folder()
        .await;

    Ok(handle.map(|h| h.path().to_string_lossy().to_string()))
}

// ----------------- Scheduler & Crash Handling -----------------

#[tauri::command]
async fn get_scheduler_status(state: State<'_, AppState>) -> Result<SchedulerStatus, String> {
    let sched = state.scheduler_config.lock().await;
    let last_warn = state.last_warning_sent.lock().await;

    let (next_ts, secs_until) = if sched.enabled {
        let ts = calculate_next_restart_millis(&sched.restart_time);
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let remaining = ts.saturating_sub(now_ms) / 1000;
        (Some(ts), Some(remaining))
    } else {
        (None, None)
    };

    Ok(SchedulerStatus {
        enabled: sched.enabled,
        restart_time: sched.restart_time.clone(),
        next_restart_timestamp_millis: next_ts,
        seconds_until_restart: secs_until,
        last_warning_sent: last_warn.clone(),
    })
}

#[tauri::command]
async fn save_scheduler_config(state: State<'_, AppState>, config: SchedulerConfig) -> Result<(), String> {
    let mut sched = state.scheduler_config.lock().await;
    *sched = config;
    let mut last_warn = state.last_warning_sent.lock().await;
    *last_warn = None;
    Ok(())
}

#[tauri::command]
async fn get_crash_status(state: State<'_, AppState>) -> Result<CrashStatus, String> {
    let mgr = state.process_manager.lock().await;
    Ok(mgr.get_crash_status().await)
}

#[tauri::command]
async fn reset_crash_count(state: State<'_, AppState>) -> Result<(), String> {
    let mgr = state.process_manager.lock().await;
    mgr.reset_crash_count();
    Ok(())
}

#[tauri::command]
async fn set_auto_restart(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    let mgr = state.process_manager.lock().await;
    mgr.set_auto_restart(enabled);
    Ok(())
}

// ----------------- Discovery -----------------

#[tauri::command]
async fn discover_installations(state: State<'_, AppState>) -> Result<Vec<DiscoveredInstallation>, String> {
    let cfg = state.config.lock().await;
    Ok(discover_all_installations(Some(&cfg.install_path)))
}

// ----------------- Steam Friends & Server Invites -----------------

#[tauri::command]
async fn steam_get_status(state: State<'_, AppState>) -> Result<SteamStatus, String> {
    let mut steam = state.steam_manager.lock().await;
    Ok(steam.get_status())
}

#[tauri::command]
async fn steam_get_friends(state: State<'_, AppState>) -> Result<Vec<SteamFriend>, String> {
    let mut steam = state.steam_manager.lock().await;
    steam.get_friends().map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_launch_client() -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("cmd.exe")
            .creation_flags(0x08000000)
            .args(["/c", "start", "", "steam://open/main"])
            .spawn();
    }
    Ok(())
}

#[tauri::command]
async fn steam_open_chat(steam_id: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("cmd.exe")
            .creation_flags(0x08000000)
            .args(["/c", "start", "", &format!("steam://friends/message/{}", steam_id)])
            .spawn();
    }
    Ok(())
}

#[tauri::command]
async fn steam_invite_friend(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    steam_id: String,
) -> Result<InviteResult, String> {
    let cfg = state.config.lock().await.clone();

    let raw_public_ip = detect_public_ip().await.unwrap_or_else(|_| "127.0.0.1".into());
    let ip = if is_valid_public_ip(&raw_public_ip) {
        raw_public_ip
    } else {
        "127.0.0.1".to_string()
    };

    let connect_string = format!("client.connect {}:{}", ip, cfg.port);

    let mut steam = state.steam_manager.lock().await;
    let res = steam.invite_friend(&steam_id, &connect_string).map_err(|e| e.to_string())?;

    let _ = app.emit("steam:invite-result", &res);
    Ok(res)
}

#[tauri::command]
async fn steam_invite_all_online(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<InviteAllResult, String> {
    let mgr = state.process_manager.lock().await;
    match mgr.state().get_status() {
        ServerStatus::Stopped => return Err("Start your server before inviting friends.".into()),
        ServerStatus::Starting => return Err("Server is starting...".into()),
        ServerStatus::Stopping => return Err("Server is stopping...".into()),
        ServerStatus::Running | ServerStatus::RconUnavailable => {}
        _ => return Err("Server must be online to send invites.".into()),
    }

    let cfg = state.config.lock().await.clone();
    drop(mgr);

    let raw_public_ip = detect_public_ip().await.unwrap_or_else(|_| "127.0.0.1".into());
    if !is_valid_public_ip(&raw_public_ip) {
        return Err("Unable to determine your public IP.".into());
    }

    let connect_string = format!("client.connect {}:{}", raw_public_ip, cfg.port);

    let mut steam = state.steam_manager.lock().await;
    let res = steam.invite_all_online(&connect_string).map_err(|e| e.to_string())?;

    let _ = app.emit("steam:invite-all-result", &res);
    Ok(res)
}

#[tauri::command]
async fn steam_set_rich_presence(state: State<'_, AppState>) -> Result<bool, String> {
    let mgr = state.process_manager.lock().await;
    let is_running = mgr.state().is_running();
    let players = if let Some(rcon) = mgr.rcon() {
        rcon.subscribe_telemetry().borrow().players
    } else {
        0
    };
    drop(mgr);

    let cfg = state.config.lock().await.clone();
    let raw_public_ip = detect_public_ip().await.unwrap_or_else(|_| "127.0.0.1".into());

    let steam = state.steam_manager.lock().await;
    if is_running && is_valid_public_ip(&raw_public_ip) {
        let connect_string = format!("client.connect {}:{}", raw_public_ip, cfg.port);
        Ok(steam.set_rich_presence(&connect_string, &cfg.hostname, players, cfg.max_players))
    } else {
        steam.clear_rich_presence();
        Ok(false)
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct RealRustMapInfo {
    pub seed: i64,
    pub worldsize: i32,
    pub image_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub total_monuments: Option<u32>,
    pub monuments: Vec<String>,
    pub rustmaps_url: String,
    pub is_real: bool,
}

#[tauri::command]
async fn fetch_real_rust_map(seed: i64, worldsize: i32) -> Result<RealRustMapInfo, String> {
    let rustmaps_url = format!("https://rustmaps.com/map/{}_{}", worldsize, seed);

    #[cfg(windows)]
    let mut cmd = {
        let mut c = tokio::process::Command::new("curl.exe");
        c.creation_flags(0x08000000);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = tokio::process::Command::new("curl");

    let output = cmd
        .args(["-s", "--max-time", "6", &rustmaps_url])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let html = String::from_utf8_lossy(&out.stdout);

            if let Some(pos) = html.find("window.pageData = ") {
                let rest = &html[pos + 18..];
                if let Some(end_pos) = rest.find(";</script>") {
                    let json_str = &rest[..end_pos];
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                        let data = &val["data"];
                        let img_url = data["imageUrl"].as_str().map(|s| s.to_string());
                        let thumb_url = data["thumbnailUrl"].as_str().map(|s| s.to_string());
                        let total_monuments = data["totalMonuments"].as_u64().map(|v| v as u32);
                        let mut monument_names = Vec::new();
                        if let Some(arr) = data["monuments"].as_array() {
                            for m in arr {
                                if let Some(m_type) = m["type"].as_str() {
                                    if !monument_names.contains(&m_type.to_string()) {
                                        monument_names.push(m_type.to_string());
                                    }
                                }
                            }
                        }

                        if img_url.is_some() || thumb_url.is_some() {
                            return Ok(RealRustMapInfo {
                                seed,
                                worldsize,
                                image_url: img_url.or_else(|| thumb_url.clone()),
                                thumbnail_url: thumb_url,
                                total_monuments,
                                monuments: monument_names,
                                rustmaps_url,
                                is_real: true,
                            });
                        }
                    }
                }
            }

            if let Some(og_pos) = html.find("property=\"og:image\" content=\"") {
                let rest = &html[og_pos + 29..];
                if let Some(quote_pos) = rest.find('\"') {
                    let img = &rest[..quote_pos];
                    if img.starts_with("http") && !img.contains("favicon") {
                        return Ok(RealRustMapInfo {
                            seed,
                            worldsize,
                            image_url: Some(img.to_string()),
                            thumbnail_url: Some(img.to_string()),
                            total_monuments: None,
                            monuments: Vec::new(),
                            rustmaps_url,
                            is_real: true,
                        });
                    }
                }
            }
        }
    }

    Ok(RealRustMapInfo {
        seed,
        worldsize,
        image_url: None,
        thumbnail_url: None,
        total_monuments: None,
        monuments: Vec::new(),
        rustmaps_url,
        is_real: false,
    })
}

#[tauri::command]
fn app_window_minimize(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(content) = std::fs::read_to_string("launcher_preferences.json") {
            if let Ok(prefs) = serde_json::from_str::<LauncherPreferences>(&content) {
                if prefs.minimize_to_tray {
                    let _ = win.hide();
                    return;
                }
            }
        }
        let _ = win.minimize();
    }
}

#[tauri::command]
fn app_window_toggle_maximize(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(is_max) = win.is_maximized() {
            if is_max {
                let _ = win.unmaximize();
            } else {
                let _ = win.maximize();
            }
        } else {
            let _ = win.maximize();
        }
    }
}

#[tauri::command]
fn app_window_close(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(content) = std::fs::read_to_string("launcher_preferences.json") {
            if let Ok(prefs) = serde_json::from_str::<LauncherPreferences>(&content) {
                if prefs.close_to_tray {
                    let _ = win.hide();
                    return;
                }
            }
        }
        let _ = win.close();
    }
    app.exit(0);
}

#[tauri::command]
fn app_window_start_dragging(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.start_dragging();
    }
}

#[cfg(windows)]
static mut GLOBAL_MUTEX_HANDLE: windows_sys::Win32::Foundation::HANDLE = std::ptr::null_mut();

fn log_diag(stage: &str, details: &str) {
    let pid = std::process::id();
    let msg = format!("[DIAG][PID:{}] {} - {}", pid, stage, details);
    eprintln!("{}", msg);

    let log_path = std::env::temp_dir().join("epic_launcher_startup_diagnostics.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        use std::io::Write;
        let _ = writeln!(file, "{}", msg);
        let _ = file.flush();
    }
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("{}", info);
        log_diag("FATAL_PANIC", &msg);
    }));

    log_diag("STARTUP_BEGIN", "Executable starting");

    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Threading::CreateMutexW;
        use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError, SetLastError};
        use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE};

        if std::env::var("DISABLE_SINGLE_INSTANCE").is_ok() {
            log_diag("SINGLE_INSTANCE_BEGIN", "Skipping check (DISABLE_SINGLE_INSTANCE set)");
            log_diag("SINGLE_INSTANCE_RESULT", "Single-instance bypassed");
        } else {
            log_diag("SINGLE_INSTANCE_BEGIN", "Checking Local\\EpicRustServerLauncher_SingleInstance_Mutex");
            let mut mutex_name: Vec<u16> = "Local\\EpicRustServerLauncher_SingleInstance_Mutex".encode_utf16().collect();
            mutex_name.push(0);

            SetLastError(0);
            let handle = CreateMutexW(std::ptr::null(), 1, mutex_name.as_ptr());
            let err = GetLastError();

            if !handle.is_null() && err == ERROR_ALREADY_EXISTS {
                let mut window_name: Vec<u16> = "Epic Rust".encode_utf16().collect();
                window_name.push(0);
                let hwnd = FindWindowW(std::ptr::null(), window_name.as_ptr());
                if hwnd != std::ptr::null_mut() {
                    log_diag("SINGLE_INSTANCE_RESULT", "Existing visible window found. Bringing forward and exiting.");
                    ShowWindow(hwnd, SW_RESTORE);
                    SetForegroundWindow(hwnd);
                    return;
                } else {
                    log_diag("SINGLE_INSTANCE_RESULT", "Existing mutex detected but no visible window found. Allowing launch to continue.");
                }
            } else if handle.is_null() {
                log_diag("SINGLE_INSTANCE_RESULT", &format!("CreateMutexW returned null (code: {}). Continuing.", err));
            } else {
                GLOBAL_MUTEX_HANDLE = handle;
                log_diag("SINGLE_INSTANCE_RESULT", "First instance confirmed. Mutex acquired.");
            }
        }

        if std::env::var("DISABLE_WEBVIEW2_CLEANUP").is_ok() {
            log_diag("WEBVIEW2_CLEANUP_BEGIN", "Skipping cleanup (DISABLE_WEBVIEW2_CLEANUP set)");
            log_diag("WEBVIEW2_CLEANUP_RESULT", "Cleanup bypassed");
        } else {
            log_diag("WEBVIEW2_CLEANUP_BEGIN", "Inspecting EBWebView locks");
            let mut report = Vec::new();
            if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                let webview_dir = std::path::PathBuf::from(local_app_data)
                    .join("com.epic.rustserverlauncher")
                    .join("EBWebView");
                for name in &["SingletonLock", "SingletonCookie", "SingletonSocket"] {
                    let file_path = webview_dir.join(name);
                    if file_path.exists() {
                        match std::fs::remove_file(&file_path) {
                            Ok(_) => report.push(format!("Removed {}", name)),
                            Err(e) => report.push(format!("Could not remove {} ({})", name, e)),
                        }
                    }
                }
            }
            let summary = if report.is_empty() { "No stale lock files found".to_string() } else { report.join(", ") };
            log_diag("WEBVIEW2_CLEANUP_RESULT", &summary);
        }
    }

    log_diag("TAURI_BUILDER_BEGIN", "Initializing ServerConfig, ProcessManager, and Tauri Builder");

    log_diag("CONFIG_BEGIN", "Loading server config");
    let initial_config = ServerConfig::load_or_default(ServerConfig::DEFAULT_CONFIG_FILE);
    log_diag("CONFIG_DONE", "Loaded server config");

    log_diag("PROCESS_MGR_BEGIN", "Initializing ServerProcessManager");
    let process_manager = match ServerProcessManager::new() {
        Ok(m) => m,
        Err(e) => {
            log_diag("PROCESS_MGR_ERROR", &format!("Failed: {}", e));
            eprintln!("Failed to initialize ServerProcessManager: {}", e);
            panic!("Process manager initialization error: {}", e);
        }
    };
    log_diag("PROCESS_MGR_DONE", "Initialized ServerProcessManager");

    let shared_proc = Arc::new(Mutex::new(process_manager));
    let shared_cfg = Arc::new(Mutex::new(initial_config));
    let shared_sched = Arc::new(Mutex::new(SchedulerConfig::default()));
    let shared_warn = Arc::new(Mutex::new(None));

    log_diag("STEAM_MGR_BEGIN", "Initializing SteamManager");
    let shared_steam = Arc::new(Mutex::new(SteamManager::new()));
    log_diag("STEAM_MGR_DONE", "Initialized SteamManager");

    let app_state = AppState {
        config: shared_cfg.clone(),
        process_manager: shared_proc.clone(),
        scheduler_config: shared_sched.clone(),
        last_warning_sent: shared_warn.clone(),
        steam_manager: shared_steam.clone(),
    };

    let proc_for_setup = shared_proc.clone();
    let sched_for_setup = shared_sched.clone();
    let warn_for_setup = shared_warn.clone();
    let cfg_for_setup = shared_cfg.clone();
    let steam_for_setup = shared_steam.clone();

    let builder = tauri::Builder::default()
        .manage(app_state)
        .setup(move |app| {
            log_diag("TAURI_SETUP_BEGIN", "Setup closure invoked");
            let handle = app.handle().clone();

            // Background task: Stream real-time logs via "log-received"
            let proc_logs = proc_for_setup.clone();
            let handle_logs = handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut log_rx = {
                    let mgr = proc_logs.lock().await;
                    mgr.log_manager().subscribe()
                };
                while let Ok(entry) = log_rx.recv().await {
                    let _ = handle_logs.emit("log-received", &entry);
                }
            });

            // Background task: Stream server state transitions via "server-state-changed" and manage Rich Presence
            let proc_state = proc_for_setup.clone();
            let handle_state = handle.clone();
            let steam_state = steam_for_setup.clone();
            let cfg_state = cfg_for_setup.clone();
            tauri::async_runtime::spawn(async move {
                let mut state_rx = {
                    let mgr = proc_state.lock().await;
                    mgr.state().subscribe()
                };
                while let Ok(new_status) = state_rx.recv().await {
                    let s = match new_status {
                        ServerStatus::Stopped => {
                            let steam = steam_state.lock().await;
                            steam.clear_rich_presence();
                            "stopped"
                        }
                        ServerStatus::Starting => "starting",
                        ServerStatus::Running => {
                            let cfg = cfg_state.lock().await.clone();
                            let raw_public_ip = detect_public_ip().await.unwrap_or_else(|_| "127.0.0.1".into());
                            if is_valid_public_ip(&raw_public_ip) {
                                let connect_str = format!("client.connect {}:{}", raw_public_ip, cfg.port);
                                let steam = steam_state.lock().await;
                                steam.set_rich_presence(&connect_str, &cfg.hostname, 0, cfg.max_players);
                            }
                            "running"
                        }
                        ServerStatus::Stopping => "stopping",
                        ServerStatus::RconUnavailable => "rcon_unavailable",
                        ServerStatus::ProcessExited => {
                            let steam = steam_state.lock().await;
                            steam.clear_rich_presence();
                            "error"
                        }
                    };
                    let _ = handle_state.emit("server-state-changed", s);
                }
            });

            // Background task: Emit real-time telemetry every 1500ms
            let proc_telem = proc_for_setup.clone();
            let handle_telem = handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_millis(1500));
                loop {
                    interval.tick().await;
                    let mgr = proc_telem.lock().await;
                    if mgr.state().is_running() {
                        let uptime = mgr.uptime_seconds();
                        let (mem_mb, cpu_pct) = mgr.get_resource_metrics().await;
                        let mut telem = if let Some(rcon) = mgr.rcon() {
                            let telem_rx = rcon.subscribe_telemetry();
                            let current = telem_rx.borrow().clone();
                            current
                        } else {
                            ServerTelemetry::default()
                        };
                        telem.uptime = uptime;
                        if mem_mb > 0.0 {
                            telem.memory = mem_mb;
                        }
                        telem.cpu = cpu_pct;
                        let _ = handle_telem.emit("telemetry-updated", &telem);
                    }
                }
            });

            // Background task: Automated Restart Scheduler Loop
            let proc_sched = proc_for_setup.clone();
            let sched_conf = sched_for_setup.clone();
            let warn_tracker = warn_for_setup.clone();
            let cfg_sched = cfg_for_setup.clone();
            let handle_sched = handle.clone();

            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
                loop {
                    interval.tick().await;
                    let sched = sched_conf.lock().await.clone();
                    if !sched.enabled {
                        continue;
                    }

                    let target_ms = calculate_next_restart_millis(&sched.restart_time);
                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    let seconds_left = target_ms.saturating_sub(now_ms) / 1000;

                    let mut mgr = proc_sched.lock().await;
                    if !mgr.state().is_running() {
                        continue;
                    }

                    let mut last_warn = warn_tracker.lock().await;

                    // 15 Minutes Warning (900 seconds)
                    if seconds_left <= 900 && seconds_left > 300 && sched.warn_15m {
                        if last_warn.as_deref() != Some("15m") {
                            if let Some(rcon) = mgr.rcon() {
                                let _ = rcon.send_command("say [SERVER RESTART] Server scheduled restart in 15 minutes.").await;
                                let _ = rcon.send_command("restart 900").await;
                            }
                            *last_warn = Some("15m".into());
                            let _ = handle_sched.emit("scheduler-warning", "15m");
                        }
                    }
                    // 5 Minutes Warning (300 seconds)
                    else if seconds_left <= 300 && seconds_left > 60 && sched.warn_5m {
                        if last_warn.as_deref() != Some("5m") {
                            if let Some(rcon) = mgr.rcon() {
                                let _ = rcon.send_command("say [SERVER RESTART] Server will restart in 5 minutes! Save your inventory.").await;
                            }
                            *last_warn = Some("5m".into());
                            let _ = handle_sched.emit("scheduler-warning", "5m");
                        }
                    }
                    // 1 Minute Warning (60 seconds)
                    else if seconds_left <= 60 && seconds_left > 2 && sched.warn_1m {
                        if last_warn.as_deref() != Some("1m") {
                            if let Some(rcon) = mgr.rcon() {
                                let _ = rcon.send_command("say [SERVER RESTART] Server restarting in 60 seconds!").await;
                            }
                            *last_warn = Some("1m".into());
                            let _ = handle_sched.emit("scheduler-warning", "1m");
                        }
                    }
                    // Scheduled Execution Trigger (<= 2 seconds)
                    else if seconds_left <= 2 {
                        if last_warn.as_deref() != Some("executed") {
                            *last_warn = Some("executed".into());
                            let cfg = cfg_sched.lock().await.clone();
                            let _ = mgr.stop().await;
                            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
                            let _ = mgr.start(&cfg).await;
                        }
                    }
                }
            });

            // Setup System Tray
            use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
            use tauri::menu::{Menu, MenuItem};

            if let Ok(show_i) = MenuItem::with_id(app, "show", "Open Epic Rust", true, None::<&str>) {
                if let Ok(quit_i) = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>) {
                    if let Ok(tray_menu) = Menu::with_items(app, &[&show_i, &quit_i]) {
                        let mut tray_b = TrayIconBuilder::new()
                            .tooltip("Epic Rust")
                            .menu(&tray_menu)
                            .on_menu_event(|app, event| {
                                match event.id.as_ref() {
                                    "show" => {
                                        if let Some(win) = app.get_webview_window("main") {
                                            let _ = win.show();
                                            let _ = win.unminimize();
                                            let _ = win.set_focus();
                                        }
                                    }
                                    "quit" => {
                                        app.exit(0);
                                    }
                                    _ => {}
                                }
                            })
                            .on_tray_icon_event(|tray, event| {
                                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                                    let app = tray.app_handle();
                                    if let Some(win) = app.get_webview_window("main") {
                                        let is_visible = win.is_visible().unwrap_or(false);
                                        if is_visible {
                                            let _ = win.hide();
                                        } else {
                                            let _ = win.show();
                                            let _ = win.unminimize();
                                            let _ = win.set_focus();
                                        }
                                    }
                                }
                            });

                        if let Some(icon) = app.default_window_icon() {
                            tray_b = tray_b.icon(icon.clone());
                        }

                        let _ = tray_b.build(app);
                    }
                }
            }

            match app.get_webview_window("main") {
                Some(win) => {
                    let win_clone = win.clone();
                    win.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            if let Ok(content) = std::fs::read_to_string("launcher_preferences.json") {
                                if let Ok(prefs) = serde_json::from_str::<LauncherPreferences>(&content) {
                                    if prefs.close_to_tray {
                                        api.prevent_close();
                                        let _ = win_clone.hide();
                                    }
                                }
                            }
                        }
                    });

                    if let Some(icon) = app.default_window_icon() {
                        let _ = win.set_icon(icon.clone());
                    }

                    log_diag("WINDOW_SHOW_BEGIN", "Found main webview window. Calling show() and set_focus()");
                    let show_res = win.show();
                    let focus_res = win.set_focus();
                    log_diag("WINDOW_SHOW_RESULT", &format!("show: {:?}, focus: {:?}", show_res, focus_res));
                }
                None => {
                    log_diag("WINDOW_SHOW_ERROR", "Could not find 'main' webview window in setup closure");
                }
            }

            log_diag("TAURI_SETUP_COMPLETE", "Setup closure completed successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            start_server,
            stop_server,
            restart_server,
            get_telemetry,
            get_net_info,
            get_server_config,
            save_server_config,
            get_logs,
            send_rcon_command,
            get_map_info,
            change_map_procedural,
            change_map_custom,
            wipe_procedural_map,
            list_active_saves,
            list_backups,
            create_backup,
            restore_save,
            delete_backup,
            get_framework_status,
            install_oxide,
            install_carbon,
            list_plugins,
            toggle_plugin,
            delete_plugin,
            search_umod,
            install_umod_plugin,
            get_steamcmd_server_status,
            run_steamcmd_install_or_update,
            validate_rust_server,
            browse_directory,
            get_scheduler_status,
            save_scheduler_config,
            get_crash_status,
            reset_crash_count,
            set_auto_restart,
            discover_installations,
            get_server_profiles,
            create_server_profile,
            create_server,
            change_mod_framework,
            select_server_profile,
            delete_server_profile,
            rename_server_profile,
            get_server_admins,
            add_server_admin,
            remove_server_admin,
            quick_weather_or_action,
            update_server_rules,
            get_raw_server_cfg,
            save_raw_server_cfg,
            reset_server_cfg_defaults,
            open_cfg_folder,
            open_install_folder,
            open_support_log,
            get_storage_usage,
            clean_temp_files,
            get_launcher_preferences,
            save_launcher_preferences,
            get_formatted_launch_args,
            save_custom_launch_args,
            steam_get_status,
            steam_get_friends,
            steam_launch_client,
            steam_open_chat,
            steam_invite_friend,
            steam_invite_all_online,
            steam_set_rich_presence,
            fetch_real_rust_map,
            app_window_minimize,
            app_window_toggle_maximize,
            app_window_close,
            app_window_start_dragging
        ]);
    log_diag("TAURI_RUN_BEGIN", "Executing builder.run(...)");
    let result = builder.run(tauri::generate_context!());
    match result {
        Ok(_) => log_diag("TAURI_EXIT", "Application terminated normally (exit code 0)"),
        Err(e) => {
            log_diag("TAURI_ERROR", &format!("Tauri run returned error: {}", e));
            eprintln!("error while running tauri application: {}", e);
        }
    }
}
