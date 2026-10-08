use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use crate::error::{LauncherError, Result};

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ServerRules {
    #[serde(default = "default_true")]
    pub bradley_apc: bool,
    #[serde(default = "default_true")]
    pub timed_events: bool,
    #[serde(default = "default_true")]
    pub cargo_ship: bool,
    #[serde(default = "default_true")]
    pub radiation: bool,
    #[serde(default = "default_true")]
    pub scientists_npcs: bool,
    #[serde(default = "default_true")]
    pub structural_stability: bool,
    #[serde(default)]
    pub halloween_event: bool,
    #[serde(default)]
    pub christmas_event: bool,
    #[serde(default)]
    pub no_animals: bool,
    #[serde(default)]
    pub passive_scientists: bool,
    #[serde(default)]
    pub lock_time_16_8: bool,
    #[serde(default)]
    pub lock_clear_weather: bool,
    #[serde(default)]
    pub spawn_loot_on_start: bool,
    #[serde(default)]
    pub no_building_upkeep: bool,
    #[serde(default)]
    pub no_decay: bool,
    #[serde(default)]
    pub instant_craft: bool,
    #[serde(default)]
    pub relaxed_anti_cheat: bool,
    #[serde(default)]
    pub creative_mode: bool,
    #[serde(default)]
    pub free_build: bool,
    #[serde(default)]
    pub free_placement: bool,
    #[serde(default)]
    pub free_repair: bool,
    #[serde(default)]
    pub unlimited_io: bool,
    #[serde(default)]
    pub instant_placement: bool,
    #[serde(default)]
    pub always_on_entities: bool,
    // Performance
    #[serde(default)]
    pub skip_ai_navmesh: bool,
}

impl Default for ServerRules {
    fn default() -> Self {
        Self {
            bradley_apc: true,
            timed_events: true,
            cargo_ship: true,
            radiation: true,
            scientists_npcs: true,
            structural_stability: true,
            halloween_event: false,
            christmas_event: false,
            no_animals: false,
            passive_scientists: false,
            lock_time_16_8: false,
            lock_clear_weather: false,
            spawn_loot_on_start: false,
            no_building_upkeep: false,
            no_decay: false,
            instant_craft: false,
            relaxed_anti_cheat: false,
            creative_mode: false,
            free_build: false,
            free_placement: false,
            free_repair: false,
            unlimited_io: false,
            instant_placement: false,
            always_on_entities: false,
            skip_ai_navmesh: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub identity: String,
    pub hostname: String,
    pub description: String,
    pub header_image: Option<String>,
    pub url: Option<String>,
    pub port: u16,
    pub query_port: Option<u16>,
    pub rcon_port: u16,
    pub rcon_password: String,
    pub max_players: u32,
    pub tickrate: u8,
    pub pve: bool,
    pub gamemode: String,
    #[serde(default)]
    pub mod_framework: String,
    pub is_procedural: bool,
    pub seed: u32,
    pub worldsize: u32,
    pub level_url: Option<String>,
    pub install_path: PathBuf,
    pub log_file: Option<String>,
    #[serde(default)]
    pub custom_args: String,
    pub steamcmd_path: Option<PathBuf>,
    pub branch: Option<String>,
    pub branch_password: Option<String>,
    #[serde(default)]
    pub validate_on_update: bool,
    #[serde(default)]
    pub server_rules: ServerRules,
    #[serde(default)]
    pub admins: Vec<crate::admins::AdminUser>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            identity: "my_server_identity".into(),
            hostname: "My Rust Dedicated Server".into(),
            description: "Powered by Epic Rust".into(),
            header_image: None,
            url: None,
            port: 28015,
            query_port: None,
            rcon_port: 28016,
            rcon_password: "ChangeMeImmediately!".into(),
            max_players: 50,
            tickrate: 30,
            pve: false,
            gamemode: "vanilla".into(),
            mod_framework: "vanilla".into(),
            is_procedural: true,
            seed: 1337,
            worldsize: 3000,
            level_url: None,
            install_path: PathBuf::from(r"C:\rustserver"),
            log_file: Some("output.log".into()),
            custom_args: String::new(),
            steamcmd_path: None,
            branch: None,
            branch_password: None,
            validate_on_update: true,
            server_rules: ServerRules::default(),
            admins: Vec::new(),
        }
    }
}

impl ServerConfig {
    pub const DEFAULT_CONFIG_FILE: &'static str = "launcher_config.json";

    pub fn load_or_default(path: impl AsRef<std::path::Path>) -> Self {
        let mut cfg = if let Ok(content) = fs::read_to_string(path.as_ref()) {
            if let Ok(c) = serde_json::from_str::<ServerConfig>(&content) {
                c
            } else {
                Self::default()
            }
        } else {
            Self::default()
        };

        // If configured path doesn't contain RustDedicated.exe, auto-discover
        if !cfg.install_path.join("RustDedicated.exe").is_file() {
            let discovered = crate::discovery::discover_all_installations(None);
            if let Some(first) = discovered.first() {
                cfg.install_path = first.root.clone();
                if let Some(b) = &first.branch {
                    cfg.branch = Some(b.clone());
                }
            }
        }

        cfg.ensure_mod_framework_inferred();

        cfg
    }

    /// Infers mod_framework if missing or empty, without overwriting an existing explicit value.
    pub fn ensure_mod_framework_inferred(&mut self) {
        if self.mod_framework.trim().is_empty() {
            let status = crate::mods::ModManager::detect_framework(&self.install_path);
            self.mod_framework = match status.active_framework {
                crate::mods::ModFramework::Carbon => "carbon".to_string(),
                crate::mods::ModFramework::Oxide => "oxide".to_string(),
                crate::mods::ModFramework::Vanilla => "vanilla".to_string(),
            };
        } else {
            self.mod_framework = self.mod_framework.trim().to_lowercase();
        }
    }

    pub fn resolved_mod_framework(&self) -> &str {
        if self.mod_framework.trim().is_empty() {
            "vanilla"
        } else {
            self.mod_framework.as_str()
        }
    }

    pub fn save_to_file(&self, path: impl AsRef<std::path::Path>) -> Result<()> {
        let content = serde_json::to_string_pretty(self)?;
        fs::write(path.as_ref(), content)?;
        Ok(())
    }

    pub fn resolved_query_port(&self) -> u16 {
        self.query_port.unwrap_or(self.port + 2)
    }

    pub fn resolved_steamcmd_dir(&self) -> PathBuf {
        self.steamcmd_path.clone().unwrap_or_else(|| {
            if let Some(parent) = self.install_path.parent() {
                parent.join("steamcmd")
            } else {
                PathBuf::from(r"C:\steamcmd")
            }
        })
    }

    pub fn validate(&self) -> Result<()> {
        if self.identity.trim().is_empty() {
            return Err(LauncherError::ArgumentError("Server identity cannot be empty".into()));
        }
        if self.identity.contains(' ') || !self.identity.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            return Err(LauncherError::ArgumentError(
                "Server identity must only contain alphanumeric characters, underscores, or dashes (no spaces)".into()
            ));
        }
        if self.hostname.trim().is_empty() {
            return Err(LauncherError::ArgumentError("Server name cannot be empty".into()));
        }
        if self.install_path.as_os_str().is_empty() {
            return Err(LauncherError::ArgumentError("Install path cannot be empty".into()));
        }
        if self.port == 0 {
            return Err(LauncherError::ArgumentError("Game port must be greater than 0".into()));
        }
        if self.rcon_port == 0 {
            return Err(LauncherError::ArgumentError("RCON port must be greater than 0".into()));
        }
        if self.port == self.rcon_port {
            return Err(LauncherError::ArgumentError("Game port and RCON port cannot be the same".into()));
        }
        if let Some(qp) = self.query_port {
            if qp == self.port || qp == self.rcon_port {
                return Err(LauncherError::ArgumentError("Query port cannot collide with game port or RCON port".into()));
            }
        }
        if self.rcon_password.trim().is_empty() {
            return Err(LauncherError::ArgumentError("RCON password cannot be empty".into()));
        }
        let fw = self.mod_framework.trim().to_lowercase();
        if !fw.is_empty() && fw != "vanilla" && fw != "carbon" && fw != "oxide" {
            return Err(LauncherError::ArgumentError(
                format!("Invalid mod_framework '{}': allowed values are 'vanilla', 'carbon', or 'oxide'", self.mod_framework)
            ));
        }
        if self.is_procedural && (self.worldsize < 1000 || self.worldsize > 6000) {
            return Err(LauncherError::ArgumentError(
                format!("Invalid worldsize {}: must be between 1000 and 6000", self.worldsize)
            ));
        }
        if !self.is_procedural {
            match &self.level_url {
                None => return Err(LauncherError::ArgumentError("Custom map selected but level_url is missing".into())),
                Some(url) => {
                    let trimmed = url.trim();
                    if trimmed.is_empty() {
                        return Err(LauncherError::ArgumentError("Custom map selected but level_url is empty".into()));
                    }
                    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
                        return Err(LauncherError::ArgumentError("Custom map URL must start with http:// or https://".into()));
                    }
                }
            }
        }
        Ok(())
    }
}

/// Generates or synchronizes server.cfg using non-destructive atomic merging.
pub fn sync_server_cfg(config: &ServerConfig) -> Result<PathBuf> {
    let cfg_dir = config.install_path
        .join("server")
        .join(&config.identity)
        .join("cfg");
    fs::create_dir_all(&cfg_dir)?;

    let target_file = cfg_dir.join("server.cfg");
    let mut custom_lines: Vec<String> = Vec::new();
    let mut existing_keys = BTreeMap::new();

    // 1. Read existing server.cfg if present
    if target_file.exists() {
        let f = File::open(&target_file)?;
        let reader = BufReader::new(f);
        for line_res in reader.lines() {
            let line = line_res?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if trimmed.starts_with("//") || trimmed.starts_with('#') {
                if !trimmed.starts_with("// Crucible Local Server")
                    && !trimmed.starts_with("// the settings you CHANGED")
                    && !trimmed.starts_with("// hand-edited")
                    && !trimmed.starts_with("// writecfg.")
                    && !trimmed.starts_with("// \"Regenerate from settings\"")
                    && !trimmed.starts_with("// ---- Preserved Custom")
                {
                    custom_lines.push(line);
                }
                continue;
            }
            if let Some((k, v)) = parse_cfg_line(trimmed) {
                existing_keys.insert(k, v);
            } else {
                custom_lines.push(line);
            }
        }
    }

    // 2. Build managed convars
    let mut managed: BTreeMap<&str, String> = BTreeMap::new();
    managed.insert("server.ip", "0.0.0.0".to_string());
    managed.insert("server.port", config.port.to_string());
    managed.insert("server.queryport", config.resolved_query_port().to_string());
    managed.insert("server.hostname", format!("\"{}\"", config.hostname));
    managed.insert("server.description", format!("\"{}\"", config.description));
    if let Some(h) = &config.header_image {
        managed.insert("server.headerimage", format!("\"{}\"", h));
    }
    if let Some(u) = &config.url {
        managed.insert("server.url", format!("\"{}\"", u));
    }
    managed.insert("server.maxplayers", config.max_players.to_string());
    managed.insert("server.tickrate", config.tickrate.to_string());
    managed.insert("server.pve", config.pve.to_string());
    managed.insert("server.gamemode", format!("\"{}\"", config.gamemode));
    if config.is_procedural {
        managed.insert("server.level", "\"Procedural Map\"".to_string());
        managed.insert("server.seed", config.seed.to_string());
        managed.insert("server.worldsize", config.worldsize.to_string());
    } else if let Some(url) = &config.level_url {
        managed.insert("server.levelurl", format!("\"{}\"", url));
    }
    managed.insert("rcon.port", config.rcon_port.to_string());
    managed.insert("rcon.password", format!("\"{}\"", config.rcon_password));
    managed.insert("rcon.web", "1".to_string());

    // Live Server Rules convars
    managed.insert("bradley.enabled", config.server_rules.bradley_apc.to_string());
    managed.insert("server.events", config.server_rules.timed_events.to_string());
    managed.insert("cargoship.event_enabled", config.server_rules.cargo_ship.to_string());
    managed.insert("server.radiation", config.server_rules.radiation.to_string());
    managed.insert("ai.think", config.server_rules.scientists_npcs.to_string());
    managed.insert("server.stability", config.server_rules.structural_stability.to_string());
    managed.insert("halloween.enabled", config.server_rules.halloween_event.to_string());
    managed.insert("xmas.enabled", config.server_rules.christmas_event.to_string());
    managed.insert("ai.npc_enable", (!config.server_rules.no_animals).to_string());
    managed.insert("ai.ignoreplayers", config.server_rules.passive_scientists.to_string());

    // Time & Weather
    managed.insert("env.progresstime", (!config.server_rules.lock_time_16_8).to_string());
    if config.server_rules.lock_time_16_8 {
        managed.insert("env.time", "16.8".to_string());
    }
    if config.server_rules.lock_clear_weather {
        managed.insert("weather.clouds", "0".to_string());
        managed.insert("weather.rain", "0".to_string());
        managed.insert("weather.fog", "0".to_string());
        managed.insert("weather.wind", "0".to_string());
        managed.insert("weather.storm", "0".to_string());
    }

    // Decay & Crafting
    managed.insert("decay.upkeep", (!config.server_rules.no_building_upkeep).to_string());
    managed.insert("decay.scale", if config.server_rules.no_decay { "0" } else { "1" }.to_string());
    managed.insert("crafting.instant", config.server_rules.instant_craft.to_string());

    // Creative & Building ConVars (Facepunch native)
    managed.insert("creative.allusers", config.server_rules.creative_mode.to_string());
    managed.insert("creative.freebuild", config.server_rules.free_build.to_string());
    managed.insert("creative.freeplacement", config.server_rules.free_placement.to_string());
    managed.insert("creative.freerepair", config.server_rules.free_repair.to_string());
    managed.insert("creative.unlimitedio", config.server_rules.unlimited_io.to_string());
    managed.insert("creative.alwaysonenabled", config.server_rules.always_on_entities.to_string());

    if config.server_rules.relaxed_anti_cheat {
        managed.insert("server.secure", "false".to_string());
        managed.insert("server.eac", "0".to_string());
    }
    if config.server_rules.skip_ai_navmesh {
        managed.insert("nav_disable", "true".to_string());
    }

    // 3. Write to temporary file atomically (.crucible-cfg.gen)
    let temp_file = cfg_dir.join(".crucible-cfg.gen");
    {
        let mut out = File::create(&temp_file)?;
        writeln!(out, "// Crucible Local Server - server.cfg. Your edits are kept: on start, Crucible only writes")?;
        writeln!(out, "// the settings you CHANGED in the app, and leaves every other line (including ones you")?;
        writeln!(out, "// hand-edited) alone. Loaded after serverauto.cfg, so a line here overrides an in-game")?;
        writeln!(out, "// writecfg. \"Regenerate from settings\" rebuilds the whole file from scratch.\n")?;

        // Write managed keys
        for (k, v) in &managed {
            writeln!(out, "{} {}", k, v)?;
        }

        // Write preserved custom entries not overwritten by managed settings
        let mut custom_written = false;
        for (k, v) in existing_keys {
            if !managed.contains_key(k.as_str()) {
                if !custom_written {
                    writeln!(out, "\n// ---- Preserved Custom Settings ----")?;
                    custom_written = true;
                }
                writeln!(out, "{} {}", k, v)?;
            }
        }

        // Append custom comment blocks
        if !custom_lines.is_empty() {
            writeln!(out, "\n// ---- Preserved Custom Lines ----")?;
            for cl in custom_lines {
                writeln!(out, "{}", cl)?;
            }
        }
    }

    // Atomic replacement with fallback for Windows file locks
    if let Err(_) = fs::rename(&temp_file, &target_file) {
        if let Err(e) = fs::copy(&temp_file, &target_file) {
            let _ = fs::remove_file(&temp_file);
            return Err(e.into());
        }
        let _ = fs::remove_file(&temp_file);
    }
    Ok(target_file)
}

fn parse_cfg_line(line: &str) -> Option<(String, String)> {
    let mut parts = line.splitn(2, |c: char| c.is_whitespace());
    let key = parts.next()?.trim().to_string();
    let val = parts.next()?.trim().to_string();
    if key.is_empty() {
        None
    } else {
        Some((key, val))
    }
}
