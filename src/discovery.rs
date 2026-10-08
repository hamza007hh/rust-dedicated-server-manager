use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{debug, info};

use crate::error::{LauncherError, Result};

pub const COMMON_CANDIDATE_PATHS: &[&str] = &[
    r"C:\rustserver",
    r"C:\steamcmd\steamapps\common\rustds",
    r"C:\rustds",
    r"C:\Rust\Server",
    r"D:\rustserver",
    r"D:\rustds",
    r"D:\Rust\Server",
    r"E:\rustserver",
    r"E:\rustds",
];

pub const COMMON_STEAM_PATHS: &[&str] = &[
    r"C:\Program Files (x86)\Steam",
    r"C:\Program Files\Steam",
    r"D:\Steam",
    r"D:\SteamLibrary",
    r"E:\Steam",
    r"E:\SteamLibrary",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiscoverySource {
    Configured,
    CommonCandidate,
    SteamLibrary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppManifestInfo {
    pub app_id: u32,
    pub name: String,
    pub build_id: String,
    pub install_dir: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatedInstallation {
    pub root: PathBuf,
    pub executable: PathBuf,
    pub managed_dir: PathBuf,
    pub assembly_csharp: PathBuf,
    pub build_id: Option<String>,
    pub branch: Option<String>,
    pub is_valid: bool,
    pub source: DiscoverySource,
}

pub type DiscoveredInstallation = ValidatedInstallation;

/// Validates that a directory contains a complete and functional Rust Dedicated Server installation.
pub fn validate_installation(path: impl AsRef<Path>, source: DiscoverySource) -> Result<ValidatedInstallation> {
    let root = path.as_ref().to_path_buf();
    let exe = root.join("RustDedicated.exe");
    let managed = root.join("RustDedicated_Data").join("Managed");
    let assembly = managed.join("Assembly-CSharp.dll");

    // 1. Check RustDedicated.exe
    if !exe.is_file() {
        return Err(LauncherError::MissingExecutable { path: exe });
    }

    // 2. Check Managed Directory
    if !managed.is_dir() {
        return Err(LauncherError::InvalidInstallation {
            path: root.clone(),
            reason: "Missing or invalid RustDedicated_Data/Managed directory".into(),
        });
    }

    // 3. Check Assembly-CSharp.dll
    if !assembly.is_file() {
        return Err(LauncherError::MissingAssembly { path: assembly });
    }

    // 4. Locate and parse appmanifest_258550.acf if present
    let (build_id, branch) = match find_and_parse_manifest(&root) {
        Ok(info) => (Some(info.build_id), Some(info.branch)),
        Err(e) => {
            debug!("Manifest info not found or unreadable for {}: {}", root.display(), e);
            (None, None)
        }
    };

    Ok(ValidatedInstallation {
        root,
        executable: exe,
        managed_dir: managed,
        assembly_csharp: assembly,
        build_id,
        branch,
        is_valid: true,
        source,
    })
}

/// Backwards-compatible discovery function from Phase 1.
pub fn discover_installation(path: impl AsRef<Path>) -> Result<ValidatedInstallation> {
    validate_installation(path, DiscoverySource::Configured)
}

/// Discovers all available Rust Dedicated Server installations from configured, common, and Steam library paths.
pub fn discover_all_installations(configured_path: Option<&Path>) -> Vec<ValidatedInstallation> {
    let mut found = Vec::new();
    let mut visited: HashSet<PathBuf> = HashSet::new();

    // 1. Check configured path
    if let Some(cp) = configured_path {
        let normalized = normalize_path(cp);
        if visited.insert(normalized.clone()) {
            if let Ok(inst) = validate_installation(cp, DiscoverySource::Configured) {
                info!("Found valid configured RustDedicated installation at {}", cp.display());
                found.push(inst);
            }
        }
    }

    // 2. Check common candidate paths
    for cand_str in COMMON_CANDIDATE_PATHS {
        let p = PathBuf::from(cand_str);
        let normalized = normalize_path(&p);
        if visited.insert(normalized) {
            if let Ok(inst) = validate_installation(&p, DiscoverySource::CommonCandidate) {
                info!("Discovered RustDedicated installation at common candidate path: {}", p.display());
                found.push(inst);
            }
        }
    }

    // 3. Check Steam installation & library folders
    let mut steam_roots = Vec::new();
    if let Ok(env_path) = std::env::var("STEAM_PATH") {
        steam_roots.push(PathBuf::from(env_path));
    }
    for default_steam in COMMON_STEAM_PATHS {
        steam_roots.push(PathBuf::from(default_steam));
    }

    for steam_dir in steam_roots {
        if !steam_dir.is_dir() {
            continue;
        }

        // Direct common checks within Steam root
        let steam_common = steam_dir.join("steamapps").join("common");
        check_steam_common_candidates(&steam_common, &mut visited, &mut found);

        // Read libraryfolders.vdf
        let vdf_file = steam_dir.join("steamapps").join("libraryfolders.vdf");
        if vdf_file.is_file() {
            if let Ok(vdf_content) = fs::read_to_string(&vdf_file) {
                let library_paths = parse_library_folders(&vdf_content);
                for lib in library_paths {
                    let lib_common = lib.join("steamapps").join("common");
                    check_steam_common_candidates(&lib_common, &mut visited, &mut found);
                }
            }
        }
    }

    found
}

fn check_steam_common_candidates(
    common_dir: &Path,
    visited: &mut HashSet<PathBuf>,
    found: &mut Vec<ValidatedInstallation>,
) {
    if !common_dir.is_dir() {
        return;
    }

    let subdirs = &[
        "rust_dedicated",
        "rustds",
        "Rust dedicated server",
        "Rust Dedicated Server",
        "RustDedicated",
        "RustServer",
        "Rust",
    ];
    for sub in subdirs {
        let candidate = common_dir.join(sub);
        let normalized = normalize_path(&candidate);
        if visited.insert(normalized) {
            if let Ok(inst) = validate_installation(&candidate, DiscoverySource::SteamLibrary) {
                info!("Discovered RustDedicated installation in Steam library: {}", candidate.display());
                found.push(inst);
            }
        }
    }
}

/// Locates and parses appmanifest_258550.acf in common adjacent directories.
pub fn find_and_parse_manifest(root: &Path) -> Result<AppManifestInfo> {
    let candidate_manifests = [
        root.join("steamapps").join("appmanifest_258550.acf"),
        root.parent().map(|p| p.join("appmanifest_258550.acf")).unwrap_or_default(),
        root.join("appmanifest_258550.acf"),
    ];

    for manifest_path in &candidate_manifests {
        if manifest_path.is_file() {
            let content = fs::read_to_string(manifest_path)?;
            if let Some(info) = parse_appmanifest(&content) {
                return Ok(info);
            }
        }
    }

    Err(LauncherError::AppManifestError {
        path: root.join("steamapps").join("appmanifest_258550.acf"),
        reason: "appmanifest_258550.acf not found or invalid KeyValues".into(),
    })
}

/// Parses Valve KeyValues ACF file for appmanifest_258550.
pub fn parse_appmanifest(content: &str) -> Option<AppManifestInfo> {
    let mut app_id = 0;
    let mut name = String::new();
    let mut build_id = String::new();
    let mut install_dir = String::new();
    let mut branch = "public".to_string();

    let mut in_user_config = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        if trimmed == "\"UserConfig\"" {
            in_user_config = true;
            continue;
        }

        if let Some((k, v)) = extract_kv(trimmed) {
            match k.as_str() {
                "appid" => app_id = v.parse().unwrap_or(0),
                "name" => name = v,
                "buildid" => build_id = v,
                "installdir" => install_dir = v,
                "BetaKey" if in_user_config => branch = v,
                _ => {}
            }
        }
    }

    if build_id.is_empty() {
        None
    } else {
        Some(AppManifestInfo {
            app_id,
            name,
            build_id,
            install_dir,
            branch,
        })
    }
}

/// Parses Steam libraryfolders.vdf extracting all configured library directory paths.
pub fn parse_library_folders(content: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some((k, v)) = extract_kv(trimmed) {
            if k == "path" {
                let clean_path = v.replace(r"\\", r"\");
                paths.push(PathBuf::from(clean_path));
            }
        }
    }
    paths
}

fn extract_kv(line: &str) -> Option<(String, String)> {
    let mut quotes = Vec::new();
    let mut in_quote = false;
    let mut start = 0;
    let chars: Vec<char> = line.chars().collect();

    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '"' {
            if in_quote {
                let s: String = chars[start..i].iter().collect();
                quotes.push(s);
                in_quote = false;
            } else {
                start = i + 1;
                in_quote = true;
            }
        }
        i += 1;
    }

    if quotes.len() >= 2 {
        Some((quotes[0].clone(), quotes[1].clone()))
    } else {
        None
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}
