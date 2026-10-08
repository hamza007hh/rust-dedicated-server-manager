use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::error::{LauncherError, Result};

pub const RUST_DEDICATED_APP_ID: u32 = 258550;
pub const STEAMCMD_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

fn silent_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    cmd
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SteamCmdStage {
    Initializing,
    CheckingUpdates,
    Downloading,
    Validating,
    Complete,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamCmdProgress {
    pub stage: SteamCmdStage,
    pub percent: f32,
    pub current_bytes: u64,
    pub total_bytes: u64,
    pub raw_message: String,
}

pub struct SteamCmdManager {
    pub steamcmd_dir: PathBuf,
    pub executable: PathBuf,
}

impl SteamCmdManager {
    pub fn new(steamcmd_dir: impl AsRef<Path>) -> Self {
        let dir = steamcmd_dir.as_ref().to_path_buf();
        let exe = dir.join("steamcmd.exe");
        Self {
            steamcmd_dir: dir,
            executable: exe,
        }
    }

    pub fn is_installed(&self) -> bool {
        self.executable.is_file()
    }

    /// Ensures steamcmd.exe exists; if not, automatically downloads and extracts the official Valve archive.
    pub async fn ensure_installed(&self, progress_tx: Option<&broadcast::Sender<SteamCmdProgress>>) -> Result<PathBuf> {
        if self.is_installed() {
            return Ok(self.executable.clone());
        }

        fs::create_dir_all(&self.steamcmd_dir)?;
        let zip_path = self.steamcmd_dir.join("steamcmd.zip");

        if let Some(tx) = progress_tx {
            let _ = tx.send(SteamCmdProgress {
                stage: SteamCmdStage::Initializing,
                percent: 0.0,
                current_bytes: 0,
                total_bytes: 0,
                raw_message: format!("Downloading official SteamCMD from {}...", STEAMCMD_URL),
            });
        }
        info!("SteamCMD missing at {}. Downloading official package...", self.executable.display());

        // 1. Download steamcmd.zip using curl.exe or powershell fallback
        let curl_res = silent_command("curl.exe")
            .arg("-L")
            .arg("-s")
            .arg("-o")
            .arg(&zip_path)
            .arg(STEAMCMD_URL)
            .status()
            .await;

        let download_ok = match curl_res {
            Ok(status) => status.success() && zip_path.is_file(),
            Err(_) => false,
        };

        if !download_ok {
            // Fallback to powershell Invoke-WebRequest
            let ps_cmd = format!(
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('{}', '{}')",
                STEAMCMD_URL,
                zip_path.display()
            );
            let ps_res = silent_command("powershell.exe")
                .arg("-NoProfile")
                .arg("-Command")
                .arg(&ps_cmd)
                .status()
                .await;

            if ps_res.map_or(true, |s| !s.success()) || !zip_path.is_file() {
                return Err(LauncherError::SteamCmdDownloadError(format!(
                    "Failed to download SteamCMD from {}",
                    STEAMCMD_URL
                )));
            }
        }

        if let Some(tx) = progress_tx {
            let _ = tx.send(SteamCmdProgress {
                stage: SteamCmdStage::Initializing,
                percent: 50.0,
                current_bytes: 0,
                total_bytes: 0,
                raw_message: "Extracting SteamCMD archive...".into(),
            });
        }
        info!("Extracting {} into {}...", zip_path.display(), self.steamcmd_dir.display());

        // 2. Extract archive using tar.exe or powershell Expand-Archive
        let tar_res = silent_command("tar.exe")
            .arg("-xf")
            .arg(&zip_path)
            .arg("-C")
            .arg(&self.steamcmd_dir)
            .status()
            .await;

        let extract_ok = match tar_res {
            Ok(status) => status.success() && self.is_installed(),
            Err(_) => false,
        };

        if !extract_ok {
            let ps_extract = format!(
                "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                zip_path.display(),
                self.steamcmd_dir.display()
            );
            let ps_res = silent_command("powershell.exe")
                .arg("-NoProfile")
                .arg("-Command")
                .arg(&ps_extract)
                .status()
                .await;

            if ps_res.map_or(true, |s| !s.success()) || !self.is_installed() {
                return Err(LauncherError::SteamCmdExtractError(format!(
                    "Failed to extract SteamCMD into {}",
                    self.steamcmd_dir.display()
                )));
            }
        }

        // Clean up temporary zip file
        let _ = fs::remove_file(&zip_path);

        if !self.is_installed() {
            return Err(LauncherError::SteamCmdNotFound { path: self.executable.clone() });
        }

        info!("SteamCMD successfully initialized at {}", self.executable.display());
        Ok(self.executable.clone())
    }

    /// Asynchronously runs SteamCMD to install or update Rust Dedicated Server (AppID 258550).
    pub async fn install_or_update(
        &self,
        install_dir: &Path,
        branch: Option<&str>,
        branch_password: Option<&str>,
        validate: bool,
        progress_tx: Option<broadcast::Sender<SteamCmdProgress>>,
    ) -> Result<()> {
        let exe = self.ensure_installed(progress_tx.as_ref()).await?;

        fs::create_dir_all(install_dir)?;

        let mut args: Vec<String> = vec![
            "+force_install_dir".into(),
            install_dir.to_string_lossy().to_string(),
            "+login".into(),
            "anonymous".into(),
            "+app_update".into(),
            RUST_DEDICATED_APP_ID.to_string(),
        ];

        if let Some(b) = branch {
            let trimmed = b.trim();
            if !trimmed.is_empty() && trimmed != "public" {
                args.push("-beta".into());
                args.push(trimmed.to_string());
                if let Some(pw) = branch_password {
                    let pw_trimmed = pw.trim();
                    if !pw_trimmed.is_empty() {
                        args.push("-betapassword".into());
                        args.push(pw_trimmed.to_string());
                    }
                }
            }
        }

        if validate {
            args.push("validate".into());
        }

        args.push("+quit".into());

        info!("Spawning SteamCMD: {} {:?}", exe.display(), args);

        let mut cmd = silent_command(&exe);
        cmd.args(&args)
            .current_dir(&self.steamcmd_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| LauncherError::ProcessSpawnError(e.to_string()))?;

        let mut stdout_reader = BufReader::new(child.stdout.take().unwrap()).lines();
        let mut stderr_reader = BufReader::new(child.stderr.take().unwrap()).lines();

        let mut last_error_msg = String::new();
        let mut update_successful = false;

        loop {
            tokio::select! {
                line_res = stdout_reader.next_line() => {
                    match line_res {
                        Ok(Some(line)) => {
                            if let Some(progress) = parse_steamcmd_progress(&line) {
                                if progress.stage == SteamCmdStage::Complete {
                                    update_successful = true;
                                }
                                if let Some(tx) = &progress_tx {
                                    let _ = tx.send(progress);
                                }
                            }
                            if line.contains("ERROR!") || line.contains("FAILED") {
                                last_error_msg = line.clone();
                                warn!("SteamCMD stderr warning: {}", line);
                            }
                            if line.contains("Success! App '258550'") {
                                update_successful = true;
                            }
                        }
                        Ok(None) => break,
                        Err(e) => {
                            warn!("Error reading SteamCMD stdout: {}", e);
                            break;
                        }
                    }
                }
                line_res = stderr_reader.next_line() => {
                    match line_res {
                        Ok(Some(line)) => {
                            error!("[SteamCMD STDERR] {}", line);
                            last_error_msg = line;
                        }
                        Ok(None) => {},
                        Err(_) => {},
                    }
                }
            }
        }

        let status = child.wait().await
            .map_err(|e| LauncherError::ProcessSpawnError(format!("Failed to wait for SteamCMD: {}", e)))?;

        if !status.success() && !update_successful {
            let code = status.code().unwrap_or(-1);
            return Err(LauncherError::SteamCmdExecutionError(code, last_error_msg));
        }

        if let Some(tx) = &progress_tx {
            let _ = tx.send(SteamCmdProgress {
                stage: SteamCmdStage::Complete,
                percent: 100.0,
                current_bytes: 0,
                total_bytes: 0,
                raw_message: "Rust Dedicated Server installation/update completed.".into(),
            });
        }

        Ok(())
    }
}

/// Parses SteamCMD stdout lines for progress percentage, byte counts, and stage.
pub fn parse_steamcmd_progress(line: &str) -> Option<SteamCmdProgress> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.contains("Success! App '258550' fully installed.") || trimmed.contains("Success! App '258550' already up to date.") {
        return Some(SteamCmdProgress {
            stage: SteamCmdStage::Complete,
            percent: 100.0,
            current_bytes: 0,
            total_bytes: 0,
            raw_message: trimmed.to_string(),
        });
    }

    if trimmed.contains("ERROR! Failed to install app") || trimmed.contains("FAILED") {
        return Some(SteamCmdProgress {
            stage: SteamCmdStage::Failed,
            percent: 0.0,
            current_bytes: 0,
            total_bytes: 0,
            raw_message: trimmed.to_string(),
        });
    }

    // Pattern: "Update state (0x...) ..., progress: XX.XX (curr / total)"
    if let Some(pos) = trimmed.find("progress:") {
        let after_prog = trimmed[pos + 9..].trim();
        let mut parts = after_prog.split_whitespace();
        let pct_str = parts.next()?;
        let percent = pct_str.parse::<f32>().unwrap_or(0.0);

        let stage = if trimmed.contains("validating") {
            SteamCmdStage::Validating
        } else if trimmed.contains("downloading") {
            SteamCmdStage::Downloading
        } else if trimmed.contains("checking for updates") {
            SteamCmdStage::CheckingUpdates
        } else {
            SteamCmdStage::Initializing
        };

        let mut current_bytes = 0;
        let mut total_bytes = 0;
        if let Some(paren_start) = trimmed.rfind('(') {
            if let Some(paren_end) = trimmed.rfind(')') {
                if paren_end > paren_start {
                    let inner = &trimmed[paren_start + 1..paren_end];
                    if let Some((curr, tot)) = inner.split_once('/') {
                        current_bytes = curr.trim().parse::<u64>().unwrap_or(0);
                        total_bytes = tot.trim().parse::<u64>().unwrap_or(0);
                    }
                }
            }
        }

        return Some(SteamCmdProgress {
            stage,
            percent,
            current_bytes,
            total_bytes,
            raw_message: trimmed.to_string(),
        });
    }

    None
}
