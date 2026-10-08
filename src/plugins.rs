use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tokio::process::Command;
use tracing::info;

use crate::error::{LauncherError, Result};
use crate::mods::ModFramework;

pub const UMOD_SEARCH_API: &str = "https://umod.org/plugins/search.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginItem {
    pub name: String,
    pub filename: String,
    pub is_enabled: bool,
    pub path: PathBuf,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UmodPluginItem {
    pub name: String,
    pub slug: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub downloads: Option<u64>,
    pub url: Option<String>,
    pub download_url: Option<String>,
    pub icon_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UmodSearchResponse {
    pub data: Option<Vec<UmodSearchEntry>>,
}

#[derive(Debug, Deserialize)]
struct UmodSearchEntry {
    pub title: Option<String>,
    pub name: Option<String>,
    pub slug: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub downloads: Option<u64>,
    pub url: Option<String>,
    pub download_url: Option<String>,
    pub icon_url: Option<String>,
}

fn silent_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    cmd
}

pub struct PluginManager;

impl PluginManager {
    /// Gets the root plugins folder for the given framework (oxide or carbon).
    pub fn get_framework_dir(install_path: &Path, framework: ModFramework) -> PathBuf {
        match framework {
            ModFramework::Carbon => install_path.join("carbon"),
            _ => install_path.join("oxide"),
        }
    }

    /// Lists all installed plugins (both active and disabled) in the server installation.
    pub fn list_plugins(install_path: &Path, framework: ModFramework) -> Result<Vec<PluginItem>> {
        let base = Self::get_framework_dir(install_path, framework);
        let active_dir = base.join("plugins");
        let disabled_dir = base.join("plugins.disabled");

        let mut plugins = Vec::new();

        // 1. Scan active plugins
        if active_dir.is_dir() {
            for entry in fs::read_dir(&active_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "cs") {
                    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let name = filename.strip_suffix(".cs").unwrap_or(&filename).to_string();
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    plugins.push(PluginItem {
                        name,
                        filename,
                        is_enabled: true,
                        path,
                        file_size: size,
                    });
                }
            }
        }

        // 2. Scan disabled plugins
        if disabled_dir.is_dir() {
            for entry in fs::read_dir(&disabled_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "cs") {
                    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let name = filename.strip_suffix(".cs").unwrap_or(&filename).to_string();
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    plugins.push(PluginItem {
                        name,
                        filename,
                        is_enabled: false,
                        path,
                        file_size: size,
                    });
                }
            }
        }

        plugins.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(plugins)
    }

    /// Enables a plugin by moving it atomically from plugins.disabled/<name>.cs to plugins/<name>.cs.
    pub fn enable_plugin(install_path: &Path, framework: ModFramework, plugin_name: &str) -> Result<PathBuf> {
        let clean_name = Self::validate_plugin_name(plugin_name)?;
        let filename = format!("{}.cs", clean_name);

        let base = Self::get_framework_dir(install_path, framework);
        let active_dir = base.join("plugins");
        let disabled_dir = base.join("plugins.disabled");

        fs::create_dir_all(&active_dir)?;
        fs::create_dir_all(&disabled_dir)?;

        let src = disabled_dir.join(&filename);
        let dest = active_dir.join(&filename);

        if dest.is_file() {
            info!("Plugin {} is already enabled.", clean_name);
            return Ok(dest);
        }

        if !src.is_file() {
            return Err(LauncherError::PluginError(format!(
                "Disabled plugin '{}' not found at {}",
                clean_name,
                src.display()
            )));
        }

        fs::rename(&src, &dest)?;
        info!("Enabled plugin {} (moved to {})", clean_name, dest.display());
        Ok(dest)
    }

    /// Disables a plugin by moving it atomically from plugins/<name>.cs to plugins.disabled/<name>.cs.
    pub fn disable_plugin(install_path: &Path, framework: ModFramework, plugin_name: &str) -> Result<PathBuf> {
        let clean_name = Self::validate_plugin_name(plugin_name)?;
        let filename = format!("{}.cs", clean_name);

        let base = Self::get_framework_dir(install_path, framework);
        let active_dir = base.join("plugins");
        let disabled_dir = base.join("plugins.disabled");

        fs::create_dir_all(&active_dir)?;
        fs::create_dir_all(&disabled_dir)?;

        let src = active_dir.join(&filename);
        let dest = disabled_dir.join(&filename);

        if dest.is_file() {
            info!("Plugin {} is already disabled.", clean_name);
            return Ok(dest);
        }

        if !src.is_file() {
            return Err(LauncherError::PluginError(format!(
                "Active plugin '{}' not found at {}",
                clean_name,
                src.display()
            )));
        }

        fs::rename(&src, &dest)?;
        info!("Disabled plugin {} (moved to {})", clean_name, dest.display());
        Ok(dest)
    }

    /// Validates plugin name to prevent path traversal and enforce valid filename conventions.
    pub fn validate_plugin_name(raw: &str) -> Result<String> {
        let trimmed = raw.trim();
        let stripped = trimmed.strip_suffix(".cs").unwrap_or(trimmed);

        if stripped.is_empty() {
            return Err(LauncherError::PluginError("Plugin name cannot be empty".into()));
        }

        if stripped.contains('/') || stripped.contains('\\') || stripped.contains("..") || stripped.contains(':') {
            return Err(LauncherError::PluginError(format!(
                "Invalid plugin name '{}': path traversal characters are forbidden",
                raw
            )));
        }

        let is_valid = stripped.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-');
        if !is_valid {
            return Err(LauncherError::PluginError(format!(
                "Invalid plugin name '{}': must contain only alphanumeric characters, underscores, and hyphens",
                raw
            )));
        }

        Ok(stripped.to_string())
    }

    /// Searches uMod plugins via the documented uMod JSON API.
    pub async fn search_umod(query: &str, page: u32) -> Result<Vec<UmodPluginItem>> {
        let url = format!("{}?query={}&page={}", UMOD_SEARCH_API, urlencoding::encode(query), page);
        info!("Searching uMod plugins at {}", url);

        let output = silent_command("curl.exe")
            .arg("-s")
            .arg("-L")
            .arg(&url)
            .output()
            .await;

        let json_str = match output {
            Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
            _ => {
                // Fallback to powershell
                let ps_cmd = format!(
                    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadString('{}')",
                    url
                );
                let ps_res = silent_command("powershell.exe")
                    .arg("-NoProfile")
                    .arg("-Command")
                    .arg(&ps_cmd)
                    .output()
                    .await;

                match ps_res {
                    Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
                    _ => return Err(LauncherError::PluginError("Failed to reach uMod search API".into())),
                }
            }
        };

        let parsed: UmodSearchResponse = serde_json::from_str(&json_str)
            .unwrap_or(UmodSearchResponse { data: None });

        let mut results = Vec::new();
        if let Some(entries) = parsed.data {
            for entry in entries {
                let name = entry.name.or(entry.title).unwrap_or_default();
                let slug = entry.slug.unwrap_or_else(|| name.to_lowercase().replace(' ', "-"));
                let download_url = entry.download_url.or_else(|| Some(format!("https://umod.org/plugins/{}.cs", slug)));

                results.push(UmodPluginItem {
                    name,
                    slug,
                    author: entry.author,
                    description: entry.description,
                    downloads: entry.downloads,
                    url: entry.url,
                    download_url,
                    icon_url: entry.icon_url,
                });
            }
        }

        Ok(results)
    }

    /// Downloads a uMod plugin .cs file directly into the target plugins directory.
    pub async fn download_umod_plugin(slug: &str, target_dir: &Path) -> Result<PathBuf> {
        let clean_slug = Self::validate_plugin_name(slug)?;
        fs::create_dir_all(target_dir)?;

        let dest = target_dir.join(format!("{}.cs", clean_slug));
        let download_url = format!("https://umod.org/plugins/{}.cs", clean_slug);
        info!("Downloading uMod plugin from {} into {}", download_url, dest.display());

        let output = silent_command("curl.exe")
            .arg("-s")
            .arg("-L")
            .arg("-o")
            .arg(&dest)
            .arg(&download_url)
            .status()
            .await;

        let ok = match output {
            Ok(s) => s.success() && dest.is_file(),
            Err(_) => false,
        };

        if !ok {
            let ps_cmd = format!(
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('{}', '{}')",
                download_url,
                dest.display()
            );
            let ps_res = silent_command("powershell.exe")
                .arg("-NoProfile")
                .arg("-Command")
                .arg(&ps_cmd)
                .status()
                .await;

            if ps_res.map_or(true, |s| !s.success()) || !dest.is_file() {
                return Err(LauncherError::PluginError(format!(
                    "Failed to download uMod plugin '{}'",
                    clean_slug
                )));
            }
        }

        // Verify content is not an error HTML page or empty
        if let Ok(content) = fs::read_to_string(&dest) {
            if content.trim().is_empty() {
                let _ = fs::remove_file(&dest);
                return Err(LauncherError::PluginError("Downloaded plugin was empty.".into()));
            }
            if content.contains("<html") || content.contains("Too Many Requests") {
                let _ = fs::remove_file(&dest);
                return Err(LauncherError::PluginError(
                    "uMod returned a web page instead of the plugin (rate-limiting / Too Many Requests).".into(),
                ));
            }
        }

        info!("Plugin {} downloaded successfully to {}", clean_slug, dest.display());
        Ok(dest)
    }

    /// Deletes a plugin (.cs file) from active or disabled directories.
    pub fn delete_plugin(install_path: &Path, framework: ModFramework, plugin_name: &str) -> Result<()> {
        let clean_name = Self::validate_plugin_name(plugin_name)?;
        let filename = format!("{}.cs", clean_name);
        let base = Self::get_framework_dir(install_path, framework);
        let active = base.join("plugins").join(&filename);
        let disabled = base.join("plugins.disabled").join(&filename);

        if active.is_file() {
            fs::remove_file(active)?;
            info!("Deleted active plugin {}", filename);
        } else if disabled.is_file() {
            fs::remove_file(disabled)?;
            info!("Deleted disabled plugin {}", filename);
        } else {
            return Err(LauncherError::PluginError(format!("Plugin '{}' not found", plugin_name)));
        }
        Ok(())
    }
}
