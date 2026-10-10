use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::config::ServerConfig;
use crate::error::{LauncherError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerProfile {
    pub id: String,
    pub name: String,
    pub created_at_millis: u64,
    pub config: ServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfilesData {
    pub active_profile_id: String,
    pub profiles: Vec<ServerProfile>,
}

impl Default for ProfilesData {
    fn default() -> Self {
        Self {
            active_profile_id: String::new(),
            profiles: Vec::new(),
        }
    }
}

pub struct ProfileManager;

impl ProfileManager {
    pub const PROFILES_FILE: &'static str = "launcher_profiles.json";

    pub fn load_or_init() -> ProfilesData {
        if let Ok(content) = fs::read_to_string(Self::PROFILES_FILE) {
            if let Ok(mut data) = serde_json::from_str::<ProfilesData>(&content) {
                for prof in &mut data.profiles {
                    prof.config.ensure_mod_framework_inferred();
                }
                return data;
            }
        }

        let initial = ProfilesData::default();
        let _ = Self::save(&initial);
        initial
    }

    pub fn save(data: &ProfilesData) -> Result<()> {
        let json = serde_json::to_string_pretty(data)?;
        fs::write(Self::PROFILES_FILE, json)?;
        Ok(())
    }

    pub fn register_server_profile(
        name: &str,
        mut config: ServerConfig,
        set_active: bool,
    ) -> Result<(ProfilesData, ServerProfile)> {
        let mut data = Self::load_or_init();
        let clean_name = name.trim();
        if clean_name.is_empty() {
            return Err(LauncherError::ArgumentError("Server profile name cannot be empty".into()));
        }

        config.ensure_mod_framework_inferred();

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let id = format!("srv_{}", now);
        let new_profile = ServerProfile {
            id: id.clone(),
            name: clean_name.to_string(),
            created_at_millis: now,
            config: config.clone(),
        };

        if set_active || data.active_profile_id.is_empty() {
            data.active_profile_id = id;
            let _ = config.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);
        }

        data.profiles.push(new_profile.clone());
        Self::save(&data)?;

        Ok((data, new_profile))
    }

    pub fn create_profile(
        name: &str,
        copy_from: Option<&ServerConfig>,
    ) -> Result<(ProfilesData, ServerProfile)> {
        let mut data = Self::load_or_init();
        let clean_name = name.trim();
        if clean_name.is_empty() {
            return Err(LauncherError::ArgumentError("Server profile name cannot be empty".into()));
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let id = format!("srv_{}", now);
        let mut new_cfg = if let Some(base) = copy_from {
            base.clone()
        } else {
            ServerConfig::default()
        };

        // Assign clean unique identity & separated ports
        new_cfg.identity = format!("server_{}", data.profiles.len() + 1);
        new_cfg.hostname = clean_name.to_string();

        let max_port = data.profiles.iter().map(|p| p.config.port).max().unwrap_or(28015);
        new_cfg.port = max_port + 10;
        new_cfg.rcon_port = new_cfg.port + 1;
        new_cfg.query_port = Some(new_cfg.port + 2);

        let new_profile = ServerProfile {
            id: id.clone(),
            name: clean_name.to_string(),
            created_at_millis: now,
            config: new_cfg.clone(),
        };

        if data.active_profile_id.is_empty() {
            data.active_profile_id = id.clone();
            let _ = new_cfg.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);
        }

        data.profiles.push(new_profile.clone());
        Self::save(&data)?;

        Ok((data, new_profile))
    }

    pub fn delete_profile(id: &str) -> Result<ProfilesData> {
        let mut data = Self::load_or_init();
        let pos = data.profiles.iter().position(|p| p.id == id).ok_or_else(|| {
            LauncherError::ArgumentError(format!("Profile {} not found", id))
        })?;

        data.profiles.remove(pos);

        if data.profiles.is_empty() {
            data.active_profile_id = String::new();
        } else if data.active_profile_id == id {
            data.active_profile_id = data.profiles[0].id.clone();
        }

        Self::save(&data)?;
        Ok(data)
    }

    pub fn rename_profile(id: &str, new_name: &str) -> Result<ProfilesData> {
        let clean_name = new_name.trim();
        if clean_name.is_empty() {
            return Err(LauncherError::ArgumentError("Server profile name cannot be empty".into()));
        }

        let mut data = Self::load_or_init();
        let prof = data.profiles.iter_mut().find(|p| p.id == id).ok_or_else(|| {
            LauncherError::ArgumentError(format!("Profile {} not found", id))
        })?;

        prof.name = clean_name.to_string();
        Self::save(&data)?;
        Ok(data)
    }

    pub fn switch_active(id: &str) -> Result<(ProfilesData, ServerConfig)> {
        let mut data = Self::load_or_init();
        let profile = data.profiles.iter().find(|p| p.id == id).cloned().ok_or_else(|| {
            LauncherError::ArgumentError(format!("Profile {} not found", id))
        })?;

        data.active_profile_id = id.to_string();
        Self::save(&data)?;

        // Also sync launcher_config.json
        let _ = profile.config.save_to_file(ServerConfig::DEFAULT_CONFIG_FILE);

        Ok((data, profile.config))
    }

    pub fn update_active_config(config: &ServerConfig) -> Result<ProfilesData> {
        let mut data = Self::load_or_init();
        if let Some(prof) = data.profiles.iter_mut().find(|p| p.id == data.active_profile_id) {
            prof.config = config.clone();
            if !config.hostname.trim().is_empty() {
                prof.name = config.hostname.clone();
            }
        }
        Self::save(&data)?;
        Ok(data)
    }
}
