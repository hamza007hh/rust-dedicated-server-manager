use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LauncherError {
    #[error("Server is already running; stop it first")]
    AlreadyRunning,

    #[error("No server is currently running")]
    NotRunning,

    #[error("Server must be stopped before {0}")]
    ServerMustBeStopped(&'static str),

    #[error("RustDedicated is not installed at '{path}'; verify installation path")]
    RustDedicatedNotFound { path: PathBuf },

    #[error("RustDedicated.exe not found at '{path}'")]
    MissingExecutable { path: PathBuf },

    #[error("Managed assembly Assembly-CSharp.dll not found at '{path}'")]
    MissingAssembly { path: PathBuf },

    #[error("Invalid Rust Dedicated Server installation at '{path}': {reason}")]
    InvalidInstallation { path: PathBuf, reason: String },

    #[error("Steam appmanifest_258550.acf missing or invalid at '{path}': {reason}")]
    AppManifestError { path: PathBuf, reason: String },

    #[error("SteamCMD binary not found at '{path}'")]
    SteamCmdNotFound { path: PathBuf },

    #[error("Failed to download SteamCMD package: {0}")]
    SteamCmdDownloadError(String),

    #[error("Failed to extract SteamCMD archive: {0}")]
    SteamCmdExtractError(String),

    #[error("SteamCMD process exited with non-zero code {0}: {1}")]
    SteamCmdExecutionError(i32, String),

    #[error("Port {port} ({description}) is already in use by another process")]
    PortInUse { port: u16, description: &'static str },

    #[error("Command-line argument validation error: {0}")]
    ArgumentError(String),

    #[error("Failed to spawn RustDedicated process: {0}")]
    ProcessSpawnError(String),

    #[error("Windows Job Object error: {0}")]
    JobObjectError(String),

    #[error("Network resolution error: {0}")]
    NetworkError(String),

    #[error("RCON communication error: {0}")]
    RconError(String),

    #[error("Map management error: {0}")]
    MapError(String),

    #[error("Save management error: {0}")]
    SaveError(String),

    #[error("Plugin management error: {0}")]
    PluginError(String),

    #[error("Mod framework error: {0}")]
    ModFrameworkError(String),

    #[error("Steam integration error: {0}")]
    SteamError(String),

    #[error("Configuration I/O error: {0}")]
    ConfigIoError(#[from] std::io::Error),

    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, LauncherError>;
