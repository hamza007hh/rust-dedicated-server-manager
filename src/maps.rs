use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

use crate::config::{sync_server_cfg, ServerConfig};
use crate::error::{LauncherError, Result};
use crate::status::ServerState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WipeResult {
    pub deleted_files: Vec<PathBuf>,
    pub backup_path: Option<PathBuf>,
    pub blueprints_preserved: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveBackupInfo {
    pub backup_path: PathBuf,
    pub name: String,
    pub created_at_millis: u64,
    pub file_count: usize,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSaveInfo {
    pub file_name: String,
    pub path: PathBuf,
    pub size_bytes: u64,
    pub modified_millis: u64,
    pub is_procedural: bool,
    pub is_blueprint: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentMapInfo {
    pub is_procedural: bool,
    pub seed: u32,
    pub worldsize: u32,
    pub level_url: Option<String>,
    pub active_save: Option<ActiveSaveInfo>,
}

pub struct MapManager;

impl MapManager {
    /// Changes server map to Procedural Map with specified seed and worldsize.
    /// Requires the server to be stopped. Preserves current identity.
    pub fn change_to_procedural(
        config: &mut ServerConfig,
        state: &ServerState,
        seed: u32,
        worldsize: u32,
    ) -> Result<()> {
        if state.is_running() {
            return Err(LauncherError::ServerMustBeStopped("changing its map"));
        }

        if worldsize < 1000 || worldsize > 6000 {
            return Err(LauncherError::MapError(format!(
                "Invalid worldsize {}: must be between 1000 and 6000",
                worldsize
            )));
        }

        config.is_procedural = true;
        config.seed = seed;
        config.worldsize = worldsize;
        config.level_url = None;

        let cfg_path = sync_server_cfg(config)?;
        info!(
            "Server map changed to Procedural (Seed: {}, Size: {}). Synchronized cfg: {}",
            seed, worldsize, cfg_path.display()
        );
        Ok(())
    }

    /// Changes server map to a custom map URL.
    /// Requires the server to be stopped. Preserves current identity.
    pub fn change_to_custom_url(
        config: &mut ServerConfig,
        state: &ServerState,
        level_url: impl Into<String>,
    ) -> Result<()> {
        if state.is_running() {
            return Err(LauncherError::ServerMustBeStopped("changing its map"));
        }

        let url = level_url.into();
        let trimmed = url.trim();
        if trimmed.is_empty() || (!trimmed.starts_with("http://") && !trimmed.starts_with("https://") && !trimmed.starts_with("file:///")) {
            return Err(LauncherError::MapError(
                "Invalid map level_url: must be a valid http, https, or file URI".into(),
            ));
        }

        config.is_procedural = false;
        config.level_url = Some(trimmed.to_string());

        let cfg_path = sync_server_cfg(config)?;
        info!(
            "Server map changed to custom URL: {}. Synchronized cfg: {}",
            trimmed, cfg_path.display()
        );
        Ok(())
    }

    /// Performs a clean procedural map wipe:
    /// - Requires the server to be stopped
    /// - Backs up existing proceduralmap.*.sav files into .crucible-saves first
    /// - Deletes only proceduralmap.*.sav files
    /// - Preserves player.blueprints.*.db files
    pub fn wipe_procedural_map(config: &ServerConfig, state: &ServerState) -> Result<WipeResult> {
        if state.is_running() {
            return Err(LauncherError::ServerMustBeStopped("deleting its world"));
        }

        let save_dir = config.install_path.join("server").join(&config.identity);
        if !save_dir.is_dir() {
            return Ok(WipeResult {
                deleted_files: Vec::new(),
                backup_path: None,
                blueprints_preserved: Vec::new(),
            });
        }

        let mut sav_files = Vec::new();
        let mut bp_files = Vec::new();

        for entry in fs::read_dir(&save_dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = path.file_name().unwrap_or_default().to_string_lossy();
            if file_name.starts_with("proceduralmap.") && file_name.ends_with(".sav") {
                sav_files.push(path);
            } else if file_name.contains("blueprints") && file_name.ends_with(".db") {
                bp_files.push(path);
            }
        }

        if sav_files.is_empty() {
            info!("No proceduralmap.*.sav files found in {}. Nothing to wipe.", save_dir.display());
            return Ok(WipeResult {
                deleted_files: Vec::new(),
                backup_path: None,
                blueprints_preserved: bp_files,
            });
        }

        // 1. Pre-wipe backup into .crucible-saves
        let backup_dir = Self::backup_save_directory(config, "pre_wipe")?;
        info!("Backed up {} procedural save files to {}", sav_files.len(), backup_dir.display());

        // 2. Delete procedural saves
        let mut deleted = Vec::new();
        for sav in sav_files {
            match fs::remove_file(&sav) {
                Ok(_) => {
                    info!("Deleted procedural save: {}", sav.display());
                    deleted.push(sav);
                }
                Err(e) => {
                    warn!("Failed to delete save {}: {}", sav.display(), e);
                }
            }
        }

        Ok(WipeResult {
            deleted_files: deleted,
            backup_path: Some(backup_dir),
            blueprints_preserved: bp_files,
        })
    }

    /// Creates a timestamped backup of the current server world in .crucible-saves
    pub fn backup_save_directory(config: &ServerConfig, tag: &str) -> Result<PathBuf> {
        let save_dir = config.install_path.join("server").join(&config.identity);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);

        let backup_root = config.install_path
            .join(".crucible-saves")
            .join(&config.identity);
        let target_dir = backup_root.join(format!("{}_{}", tag, timestamp));
        fs::create_dir_all(&target_dir)?;

        if save_dir.is_dir() {
            for entry in fs::read_dir(&save_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() {
                    let file_name = path.file_name().unwrap_or_default();
                    let dest = target_dir.join(file_name);
                    fs::copy(&path, &dest)?;
                }
            }
        }

        info!("Created timestamped save backup at {}", target_dir.display());
        Ok(target_dir)
    }

    /// Lists all backups found in .crucible-saves for this server identity.
    pub fn list_backups(config: &ServerConfig) -> Result<Vec<SaveBackupInfo>> {
        let backup_root = config.install_path
            .join(".crucible-saves")
            .join(&config.identity);
        if !backup_root.is_dir() {
            return Ok(Vec::new());
        }

        let mut list = Vec::new();
        for entry in fs::read_dir(&backup_root)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let mut count = 0;
                let mut total_bytes = 0;

                if let Ok(files) = fs::read_dir(&path) {
                    for f in files.flatten() {
                        if let Ok(meta) = f.metadata() {
                            if meta.is_file() {
                                count += 1;
                                total_bytes += meta.len();
                            }
                        }
                    }
                }

                let created_millis = entry.metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                list.push(SaveBackupInfo {
                    backup_path: path,
                    name,
                    created_at_millis: created_millis,
                    file_count: count,
                    total_bytes,
                });
            }
        }

        list.sort_by(|a, b| b.created_at_millis.cmp(&a.created_at_millis));
        Ok(list)
    }

    /// Restores a selected save from .crucible-saves into the active server identity.
    /// Requires the server to be stopped. Validates path to prevent arbitrary overwrites.
    pub fn restore_save(config: &ServerConfig, state: &ServerState, backup_path: &Path) -> Result<()> {
        if state.is_running() {
            return Err(LauncherError::ServerMustBeStopped("restoring a save"));
        }

        if !backup_path.is_dir() {
            return Err(LauncherError::SaveError(format!(
                "Backup path does not exist or is not a directory: {}",
                backup_path.display()
            )));
        }

        // Validate that backup_path is strictly within .crucible-saves
        let allowed_root = config.install_path.join(".crucible-saves");
        let canonical_backup = fs::canonicalize(backup_path)
            .map_err(|e| LauncherError::SaveError(format!("Cannot resolve backup path: {}", e)))?;
        let canonical_root = fs::canonicalize(&allowed_root)
            .map_err(|e| LauncherError::SaveError(format!("Cannot resolve .crucible-saves root: {}", e)))?;

        if !canonical_backup.starts_with(&canonical_root) {
            return Err(LauncherError::SaveError(
                "Security validation failed: backup directory must be inside .crucible-saves".into(),
            ));
        }

        // Pre-apply safety backup of current world
        let pre_apply = Self::backup_save_directory(config, "pre_restore")?;
        info!("Saved pre-restore backup to {}", pre_apply.display());

        let dest_dir = config.install_path.join("server").join(&config.identity);
        fs::create_dir_all(&dest_dir)?;

        for entry in fs::read_dir(backup_path)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                let file_name = path.file_name().unwrap_or_default();
                let dest = dest_dir.join(file_name);
                fs::copy(&path, &dest)?;
            }
        }

        info!("Successfully restored save from {} to {}", backup_path.display(), dest_dir.display());
        Ok(())
    }

    /// Lists active save files in server/<identity>/
    pub fn list_active_saves(config: &ServerConfig) -> Result<Vec<ActiveSaveInfo>> {
        let save_dir = config.install_path.join("server").join(&config.identity);
        if !save_dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut list = Vec::new();
        for entry in fs::read_dir(&save_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let meta = entry.metadata()?;
                let is_proc = name.starts_with("proceduralmap.") && name.ends_with(".sav");
                let is_bp = name.contains("blueprints") && name.ends_with(".db");
                let mod_time = meta.modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                list.push(ActiveSaveInfo {
                    file_name: name,
                    path,
                    size_bytes: meta.len(),
                    modified_millis: mod_time,
                    is_procedural: is_proc,
                    is_blueprint: is_bp,
                });
            }
        }
        list.sort_by(|a, b| b.modified_millis.cmp(&a.modified_millis));
        Ok(list)
    }

    /// Deletes a specific backup directory within .crucible-saves safely.
    pub fn delete_backup(config: &ServerConfig, backup_path: &Path) -> Result<()> {
        if !backup_path.is_dir() {
            return Err(LauncherError::SaveError(format!(
                "Backup path does not exist or is not a directory: {}",
                backup_path.display()
            )));
        }

        let allowed_root = config.install_path.join(".crucible-saves");
        let canonical_backup = fs::canonicalize(backup_path)
            .map_err(|e| LauncherError::SaveError(format!("Cannot resolve backup path: {}", e)))?;
        let canonical_root = fs::canonicalize(&allowed_root)
            .map_err(|e| LauncherError::SaveError(format!("Cannot resolve .crucible-saves root: {}", e)))?;

        if !canonical_backup.starts_with(&canonical_root) {
            return Err(LauncherError::SaveError(
                "Access denied: Target backup path is outside designated .crucible-saves directory".into(),
            ));
        }

        fs::remove_dir_all(&canonical_backup)?;
        info!("Deleted backup directory: {}", canonical_backup.display());
        Ok(())
    }

    /// Retrieves current map details and active save file info.
    pub fn get_map_info(config: &ServerConfig) -> Result<CurrentMapInfo> {
        let active_saves = Self::list_active_saves(config)?;
        let active_proc_save = active_saves.into_iter().find(|s| s.is_procedural);

        Ok(CurrentMapInfo {
            is_procedural: config.is_procedural,
            seed: config.seed,
            worldsize: config.worldsize,
            level_url: config.level_url.clone(),
            active_save: active_proc_save,
        })
    }
}
