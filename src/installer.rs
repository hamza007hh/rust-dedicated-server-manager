use std::path::Path;
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::config::ServerConfig;
use crate::discovery::{validate_installation, DiscoverySource, ValidatedInstallation};
use crate::error::Result;
use crate::steamcmd::{SteamCmdManager, SteamCmdProgress, SteamCmdStage};

pub struct ServerInstaller {
    steamcmd_manager: SteamCmdManager,
    progress_tx: broadcast::Sender<SteamCmdProgress>,
}

impl ServerInstaller {
    pub fn new(steamcmd_dir: impl AsRef<Path>) -> Self {
        let (tx, _) = broadcast::channel(256);
        Self {
            steamcmd_manager: SteamCmdManager::new(steamcmd_dir),
            progress_tx: tx,
        }
    }

    pub fn from_config(config: &ServerConfig) -> Self {
        Self::new(config.resolved_steamcmd_dir())
    }

    pub fn subscribe_progress(&self) -> broadcast::Receiver<SteamCmdProgress> {
        self.progress_tx.subscribe()
    }

    /// Complete automated workflow: Ensures SteamCMD is present, executes download/update, and validates files.
    pub async fn install_or_update(&self, config: &ServerConfig) -> Result<ValidatedInstallation> {
        info!("Starting server install/update workflow for {}", config.install_path.display());

        let _ = self.progress_tx.send(SteamCmdProgress {
            stage: SteamCmdStage::Initializing,
            percent: 0.0,
            current_bytes: 0,
            total_bytes: 0,
            raw_message: "Preparing SteamCMD environment...".into(),
        });

        // 1. Ensure SteamCMD is installed
        let _ = self.steamcmd_manager.ensure_installed(Some(&self.progress_tx)).await?;

        // 2. Execute SteamCMD install or update
        self.steamcmd_manager.install_or_update(
            &config.install_path,
            config.branch.as_deref(),
            config.branch_password.as_deref(),
            config.validate_on_update,
            Some(self.progress_tx.clone()),
        ).await?;

        // 3. Post-install validation
        let _ = self.progress_tx.send(SteamCmdProgress {
            stage: SteamCmdStage::Validating,
            percent: 95.0,
            current_bytes: 0,
            total_bytes: 0,
            raw_message: "Validating installed server files...".into(),
        });

        match validate_installation(&config.install_path, DiscoverySource::Configured) {
            Ok(validated) => {
                info!(
                    "Server install/update verified successfully. Build ID: {:?}, Branch: {:?}",
                    validated.build_id, validated.branch
                );
                let _ = self.progress_tx.send(SteamCmdProgress {
                    stage: SteamCmdStage::Complete,
                    percent: 100.0,
                    current_bytes: 0,
                    total_bytes: 0,
                    raw_message: "Server files validated and ready to launch.".into(),
                });
                Ok(validated)
            }
            Err(e) => {
                warn!("Post-install validation failed: {}", e);
                let _ = self.progress_tx.send(SteamCmdProgress {
                    stage: SteamCmdStage::Failed,
                    percent: 0.0,
                    current_bytes: 0,
                    total_bytes: 0,
                    raw_message: format!("Validation error: {}", e),
                });
                Err(e)
            }
        }
    }
}
