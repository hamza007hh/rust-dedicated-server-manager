use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tokio::process::Command;
use tracing::info;

use crate::error::{LauncherError, Result};

pub const OXIDE_RUST_DOWNLOAD_URL: &str =
    "https://github.com/OxideMod/Oxide.Rust/releases/latest/download/Oxide.Rust.zip";

pub const CARBON_WINDOWS_DOWNLOAD_URL: &str =
    "https://github.com/CarbonCommunity/Carbon/releases/latest/download/Carbon.Windows.Release.zip";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModFramework {
    Vanilla,
    Oxide,
    Carbon,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameworkStatus {
    pub active_framework: ModFramework,
    pub is_oxide_installed: bool,
    pub is_carbon_installed: bool,
    pub oxide_version: Option<String>,
    pub carbon_version: Option<String>,
}

fn silent_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    cmd
}

pub struct ModManager;

impl ModManager {
    /// Detects whether Oxide, Carbon, or pure Vanilla is present in the installation.
    pub fn detect_framework(install_path: &Path) -> FrameworkStatus {
        let managed_dir = install_path.join("RustDedicated_Data").join("Managed");

        let oxide_core = managed_dir.join("Oxide.Core.dll");
        let oxide_rust = managed_dir.join("Oxide.Rust.dll");
        let oxide_folder = install_path.join("oxide");
        let is_oxide = oxide_core.is_file() || oxide_rust.is_file() || oxide_folder.is_dir();

        let carbon_folder = install_path.join("carbon");
        let doorstop_ini = install_path.join("doorstop_config.ini");
        let carbon_core = managed_dir.join("Carbon.Core.dll");
        let is_carbon = carbon_folder.is_dir() || doorstop_ini.is_file() || carbon_core.is_file();

        let active_framework = if is_carbon {
            ModFramework::Carbon
        } else if is_oxide {
            ModFramework::Oxide
        } else {
            ModFramework::Vanilla
        };

        let oxide_ver = if is_oxide {
            let ver_file = install_path.join("oxide").join(".version");
            fs::read_to_string(&ver_file).ok().map(|s| s.trim().to_string()).or_else(|| Some("2.0.6275".into()))
        } else {
            None
        };

        let carbon_ver = if is_carbon {
            let ver_file = install_path.join("carbon").join(".version");
            fs::read_to_string(&ver_file).ok().map(|s| s.trim().to_string()).or_else(|| Some("1.1.0".into()))
        } else {
            None
        };

        FrameworkStatus {
            active_framework,
            is_oxide_installed: is_oxide,
            is_carbon_installed: is_carbon,
            oxide_version: oxide_ver,
            carbon_version: carbon_ver,
        }
    }

    /// Downloads and installs the latest Oxide.Rust release into RustDedicated_Data/Managed.
    pub async fn install_oxide(install_path: &Path) -> Result<()> {
        let managed_dir = install_path.join("RustDedicated_Data").join("Managed");
        if !managed_dir.is_dir() {
            return Err(LauncherError::ModFrameworkError(format!(
                "Managed directory not found at {}. Install Rust Dedicated Server first.",
                managed_dir.display()
            )));
        }

        info!("Downloading latest Oxide.Rust from {}...", OXIDE_RUST_DOWNLOAD_URL);

        let temp_dir = std::env::temp_dir().join(format!("epic_oxide_{}", std::process::id()));
        fs::create_dir_all(&temp_dir)?;
        let zip_path = temp_dir.join("Oxide.Rust.zip");

        Self::download_archive(OXIDE_RUST_DOWNLOAD_URL, &zip_path).await?;

        info!("Extracting Oxide.Rust into {}...", install_path.display());
        Self::extract_archive(&zip_path, install_path).await?;

        // Ensure plugins directories exist
        let oxide_plugins = install_path.join("oxide").join("plugins");
        let oxide_disabled = install_path.join("oxide").join("plugins.disabled");
        fs::create_dir_all(&oxide_plugins)?;
        fs::create_dir_all(&oxide_disabled)?;

        let _ = fs::remove_dir_all(&temp_dir);

        let status = Self::detect_framework(install_path);
        if !status.is_oxide_installed {
            return Err(LauncherError::ModFrameworkError(
                "Oxide installation completed but core DLLs were not detected.".into(),
            ));
        }

        info!("Oxide.Rust successfully installed and active.");
        Ok(())
    }

    /// Downloads and installs the latest Carbon release into the server root.
    pub async fn install_carbon(install_path: &Path) -> Result<()> {
        if !install_path.join("RustDedicated.exe").is_file() {
            return Err(LauncherError::ModFrameworkError(format!(
                "RustDedicated.exe not found at {}. Install Rust Dedicated Server first.",
                install_path.display()
            )));
        }

        info!("Downloading latest Carbon from {}...", CARBON_WINDOWS_DOWNLOAD_URL);

        let temp_dir = std::env::temp_dir().join(format!("epic_carbon_{}", std::process::id()));
        fs::create_dir_all(&temp_dir)?;
        let zip_path = temp_dir.join("Carbon.Windows.Release.zip");

        Self::download_archive(CARBON_WINDOWS_DOWNLOAD_URL, &zip_path).await?;

        info!("Extracting Carbon into {}...", install_path.display());
        Self::extract_archive(&zip_path, install_path).await?;

        // Ensure plugins directories exist
        let carbon_plugins = install_path.join("carbon").join("plugins");
        let carbon_disabled = install_path.join("carbon").join("plugins.disabled");
        fs::create_dir_all(&carbon_plugins)?;
        fs::create_dir_all(&carbon_disabled)?;

        let _ = fs::remove_dir_all(&temp_dir);

        let status = Self::detect_framework(install_path);
        if !status.is_carbon_installed {
            return Err(LauncherError::ModFrameworkError(
                "Carbon installation completed but Carbon files were not detected.".into(),
            ));
        }

        info!("Carbon successfully installed and active.");
        Ok(())
    }

    async fn download_archive(url: &str, dest_zip: &Path) -> Result<()> {
        let curl_res = silent_command("curl.exe")
            .arg("-L")
            .arg("-s")
            .arg("-o")
            .arg(dest_zip)
            .arg(url)
            .status()
            .await;

        let ok = match curl_res {
            Ok(s) => s.success() && dest_zip.is_file(),
            Err(_) => false,
        };

        if !ok {
            let ps_cmd = format!(
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('{}', '{}')",
                url,
                dest_zip.display()
            );
            let ps_res = silent_command("powershell.exe")
                .arg("-NoProfile")
                .arg("-Command")
                .arg(&ps_cmd)
                .status()
                .await;

            if ps_res.map_or(true, |s| !s.success()) || !dest_zip.is_file() {
                return Err(LauncherError::ModFrameworkError(format!(
                    "Failed to download archive from {}",
                    url
                )));
            }
        }
        Ok(())
    }

    async fn extract_archive(zip_path: &Path, target_dir: &Path) -> Result<()> {
        let tar_res = silent_command("tar.exe")
            .arg("-xf")
            .arg(zip_path)
            .arg("-C")
            .arg(target_dir)
            .status()
            .await;

        let ok = match tar_res {
            Ok(s) => s.success(),
            Err(_) => false,
        };

        if !ok {
            let ps_cmd = format!(
                "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                zip_path.display(),
                target_dir.display()
            );
            let ps_res = silent_command("powershell.exe")
                .arg("-NoProfile")
                .arg("-Command")
                .arg(&ps_cmd)
                .status()
                .await;

            if ps_res.map_or(true, |s| !s.success()) {
                return Err(LauncherError::ModFrameworkError(format!(
                    "Failed to extract {} into {}",
                    zip_path.display(),
                    target_dir.display()
                )));
            }
        }
        Ok(())
    }
}
