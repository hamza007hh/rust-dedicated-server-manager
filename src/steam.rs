use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use crate::error::{LauncherError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamStatus {
    pub is_available: bool,
    pub is_logged_on: bool,
    pub steam_id: Option<String>,
    pub persona_name: Option<String>,
    pub avatar: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamFriend {
    pub steam_id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub online: bool,
    pub persona_state: String,
    pub current_game: Option<String>,
    pub current_game_app_id: Option<u32>,
    pub can_invite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteResult {
    pub steam_id: String,
    pub friend_name: String,
    pub success: bool,
    pub message: String,
    pub connect_string: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteAllResult {
    pub total_online: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub results: Vec<InviteResult>,
}

/// Base64 encoding helper.
pub fn simple_base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);

    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARSET[(triple >> 18) & 0x3F] as char);
        result.push(CHARSET[(triple >> 12) & 0x3F] as char);

        if chunk.len() > 1 {
            result.push(CHARSET[(triple >> 6) & 0x3F] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARSET[triple & 0x3F] as char);
        } else {
            result.push('=');
        }
    }

    result
}

/// Converts raw 64x64 RGBA pixel bytes into a base64-encoded 32-bit BMP data URI.
pub fn rgba_to_bmp_data_url(rgba: &[u8], width: u32, height: u32) -> String {
    let pixel_count = (width * height) as usize;
    if rgba.len() < pixel_count * 4 {
        return String::new();
    }

    let file_size = 54 + pixel_count * 4;
    let mut bmp = Vec::with_capacity(file_size);

    // BITMAPFILEHEADER (14 bytes)
    bmp.push(b'B');
    bmp.push(b'M');
    bmp.extend_from_slice(&(file_size as u32).to_le_bytes()); // bfSize
    bmp.extend_from_slice(&0u16.to_le_bytes()); // bfReserved1
    bmp.extend_from_slice(&0u16.to_le_bytes()); // bfReserved2
    bmp.extend_from_slice(&54u32.to_le_bytes()); // bfOffBits

    // BITMAPINFOHEADER (40 bytes)
    bmp.extend_from_slice(&40u32.to_le_bytes()); // biSize
    bmp.extend_from_slice(&(width as i32).to_le_bytes()); // biWidth
    bmp.extend_from_slice(&(-(height as i32)).to_le_bytes()); // biHeight (negative = top-down)
    bmp.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    bmp.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
    bmp.extend_from_slice(&0u32.to_le_bytes()); // biCompression (BI_RGB)
    bmp.extend_from_slice(&((pixel_count * 4) as u32).to_le_bytes()); // biSizeImage
    bmp.extend_from_slice(&2835u32.to_le_bytes()); // biXPelsPerMeter (72 DPI)
    bmp.extend_from_slice(&2835u32.to_le_bytes()); // biYPelsPerMeter
    bmp.extend_from_slice(&0u32.to_le_bytes()); // biClrUsed
    bmp.extend_from_slice(&0u32.to_le_bytes()); // biClrImportant

    // Pixel data: BMP 32-bit uses BGRA order
    for chunk in rgba[..pixel_count * 4].chunks_exact(4) {
        let r = chunk[0];
        let g = chunk[1];
        let b = chunk[2];
        let a = chunk[3];
        bmp.push(b);
        bmp.push(g);
        bmp.push(r);
        bmp.push(a);
    }

    format!("data:image/bmp;base64,{}", simple_base64_encode(&bmp))
}

/// Known Steam AppIDs to game titles dictionary.
pub fn lookup_game_name(app_id: u32) -> Option<String> {
    match app_id {
        252490 => Some("Rust".to_string()),
        258550 => Some("Rust Dedicated Server".to_string()),
        730 => Some("Counter-Strike 2".to_string()),
        570 => Some("Dota 2".to_string()),
        440 => Some("Team Fortress 2".to_string()),
        107410 => Some("Arma 3".to_string()),
        271590 => Some("Grand Theft Auto V".to_string()),
        108600 => Some("Project Zomboid".to_string()),
        892970 => Some("Valheim".to_string()),
        251570 => Some("7 Days to Die".to_string()),
        346110 => Some("ARK: Survival Evolved".to_string()),
        2399830 => Some("ARK: Survival Ascended".to_string()),
        1623730 => Some("Palworld".to_string()),
        1172470 => Some("Apex Legends".to_string()),
        578080 => Some("PUBG: BATTLEGROUNDS".to_string()),
        230410 => Some("Warframe".to_string()),
        413150 => Some("Stardew Valley".to_string()),
        105600 => Some("Terraria".to_string()),
        281990 => Some("Stellaris".to_string()),
        1091500 => Some("Cyberpunk 2077".to_string()),
        1145360 => Some("Hades".to_string()),
        1145350 => Some("Hades II".to_string()),
        2358720 => Some("Black Myth: Wukong".to_string()),
        1245620 => Some("ELDEN RING".to_string()),
        381210 => Some("Dead by Daylight".to_string()),
        550 => Some("Left 4 Dead 2".to_string()),
        480 => Some("Spacewar".to_string()),
        _ => Some(format!("Steam App {}", app_id)),
    }
}

/// Finds Steam installation directory.
pub fn get_steam_install_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExA, RegQueryValueExA, HKEY_CURRENT_USER, KEY_READ,
        };
        let mut key = std::ptr::null_mut();
        let subkey = b"Software\\Valve\\Steam\0";
        if unsafe { RegOpenKeyExA(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut key) } == 0 {
            let mut buf = [0u8; 512];
            let mut size = buf.len() as u32;
            let mut val_type: u32 = 0;
            let val_name = b"SteamPath\0";
            let status = unsafe {
                RegQueryValueExA(
                    key,
                    val_name.as_ptr(),
                    std::ptr::null_mut(),
                    &mut val_type,
                    buf.as_mut_ptr(),
                    &mut size,
                )
            };
            unsafe { RegCloseKey(key) };
            if status == 0 && size > 1 {
                let path_bytes = &buf[..(size as usize - 1)];
                if let Ok(path_str) = std::str::from_utf8(path_bytes) {
                    let path = PathBuf::from(path_str.trim_matches('\0'));
                    if path.is_dir() {
                        return Some(path);
                    }
                }
            }
        }
    }

    for p in &[
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
        r"D:\Steam",
        r"E:\Steam",
    ] {
        let pb = PathBuf::from(p);
        if pb.is_dir() {
            return Some(pb);
        }
    }
    None
}

/// Inspects Windows Registry to get active Steam AccountID and SteamID64 if Steam is logged on.
pub fn get_active_steam_user() -> Option<(u32, u64)> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExA, RegQueryValueExA, HKEY_CURRENT_USER, KEY_READ,
        };
        use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
        use windows_sys::Win32::Foundation::CloseHandle;

        let mut key = std::ptr::null_mut();
        let subkey = b"Software\\Valve\\Steam\\ActiveProcess\0";
        if unsafe { RegOpenKeyExA(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut key) } == 0 {
            let mut user_id: u32 = 0;
            let mut size = std::mem::size_of::<u32>() as u32;
            let mut val_type: u32 = 0;
            let val_name = b"ActiveUser\0";
            let status_user = unsafe {
                RegQueryValueExA(
                    key,
                    val_name.as_ptr(),
                    std::ptr::null_mut(),
                    &mut val_type,
                    &mut user_id as *mut u32 as *mut u8,
                    &mut size,
                )
            };

            let mut pid: u32 = 0;
            let mut pid_size = std::mem::size_of::<u32>() as u32;
            let mut pid_type: u32 = 0;
            let pid_name = b"pid\0";
            let status_pid = unsafe {
                RegQueryValueExA(
                    key,
                    pid_name.as_ptr(),
                    std::ptr::null_mut(),
                    &mut pid_type,
                    &mut pid as *mut u32 as *mut u8,
                    &mut pid_size,
                )
            };

            unsafe { RegCloseKey(key) };

            if status_user == 0 && user_id > 0 && status_pid == 0 && pid > 0 {
                // Confirm the process is actually running on this system
                let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
                if !handle.is_null() {
                    unsafe { CloseHandle(handle) };
                    let steam64 = 76561197960265728u64 + (user_id as u64);
                    return Some((user_id, steam64));
                }
            }
        }
    }
    None
}

/// Reads user's cached avatar from disk and converts to base64 data URL.
pub fn read_local_steam_avatar(steam_dir: &Path, steam_id: &str) -> Option<String> {
    let cache_dir = steam_dir.join("config").join("avatarcache");
    let png_path = cache_dir.join(format!("{}.png", steam_id));
    if png_path.is_file() {
        if let Ok(bytes) = std::fs::read(&png_path) {
            return Some(format!("data:image/png;base64,{}", simple_base64_encode(&bytes)));
        }
    }
    let jpg_path = cache_dir.join(format!("{}.jpg", steam_id));
    if jpg_path.is_file() {
        if let Ok(bytes) = std::fs::read(&jpg_path) {
            return Some(format!("data:image/jpeg;base64,{}", simple_base64_encode(&bytes)));
        }
    }
    None
}

/// Reads loginusers.vdf to find (SteamID64, PersonaName).
pub fn read_local_steam_user_info(
    steam_dir: &Path,
    active_steam64: Option<u64>,
) -> Option<(String, String)> {
    let loginusers_path = steam_dir.join("config").join("loginusers.vdf");
    if !loginusers_path.is_file() {
        return None;
    }

    let content = std::fs::read_to_string(&loginusers_path).ok()?;
    let target_id_str = active_steam64.map(|id| id.to_string());

    let mut current_id: Option<String> = None;
    let mut persona: Option<String> = None;
    let mut is_auto_login = false;
    let mut best_id: Option<String> = None;
    let mut best_name: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('"') && trimmed.ends_with('"') {
            let inside = trimmed.trim_matches('"');
            if inside.len() >= 16 && inside.chars().all(|c| c.is_ascii_digit()) {
                current_id = Some(inside.to_string());
                persona = None;
                is_auto_login = false;
                continue;
            }
        }

        if trimmed.contains("\"PersonaName\"") {
            if let Some(val) = trimmed.split("\"PersonaName\"").nth(1) {
                persona = Some(val.trim().trim_matches('"').to_string());
            }
        }
        if trimmed.contains("\"AutoLogin\"") {
            if trimmed.contains("\"1\"") {
                is_auto_login = true;
            }
        }

        if let (Some(cur_id), Some(cur_name)) = (&current_id, &persona) {
            if let Some(target) = &target_id_str {
                if cur_id == target {
                    return Some((cur_id.clone(), cur_name.clone()));
                }
            } else if is_auto_login {
                return Some((cur_id.clone(), cur_name.clone()));
            } else if best_id.is_none() {
                best_id = Some(cur_id.clone());
                best_name = Some(cur_name.clone());
            }
        }
    }

    if let (Some(id), Some(name)) = (best_id, best_name) {
        return Some((id, name));
    }
    None
}

/// Reads all friends from localconfig.vdf
pub fn read_local_steam_friends(
    steam_dir: &Path,
    active_user_32: Option<u32>,
    active_steam_id_64: Option<&str>,
) -> Vec<SteamFriend> {
    let mut candidates = Vec::new();
    if let Some(user32) = active_user_32 {
        candidates.push(
            steam_dir
                .join("userdata")
                .join(user32.to_string())
                .join("config")
                .join("localconfig.vdf"),
        );
    }

    let userdata_dir = steam_dir.join("userdata");
    if userdata_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(userdata_dir) {
            for entry in entries.flatten() {
                let p = entry.path().join("config").join("localconfig.vdf");
                if p.is_file() && !candidates.contains(&p) {
                    candidates.push(p);
                }
            }
        }
    }

    for path in candidates {
        if path.is_file() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let friends = parse_friends_from_vdf(&content, steam_dir, active_steam_id_64);
                if !friends.is_empty() {
                    return friends;
                }
            }
        }
    }

    Vec::new()
}

pub fn parse_friends_from_vdf(
    content: &str,
    steam_dir: &Path,
    active_steam_id_64: Option<&str>,
) -> Vec<SteamFriend> {
    let mut friends = Vec::new();
    let mut in_friends_section = false;
    let mut current_id: Option<String> = None;
    let mut current_name: Option<String> = None;
    let mut current_avatar: Option<String> = None;
    let mut depth = 0;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "\"friends\"" {
            in_friends_section = true;
            continue;
        }

        if !in_friends_section {
            continue;
        }

        if trimmed == "{" {
            depth += 1;
            continue;
        } else if trimmed == "}" {
            depth -= 1;
            if depth == 1 {
                if let (Some(id), Some(name)) = (current_id.take(), current_name.take()) {
                    let steam64 = id.parse::<u64>().map(|v| v + 76561197960265728u64).unwrap_or(0);
                    let steam64_str = steam64.to_string();

                    // Do not list the logged-in user themselves in their friends list
                    if active_steam_id_64 != Some(&steam64_str) {
                        let avatar = read_local_steam_avatar(steam_dir, &steam64_str).or_else(|| {
                            current_avatar
                                .take()
                                .map(|h| format!("https://avatars.steamstatic.com/{}_medium.jpg", h))
                        });

                        friends.push(SteamFriend {
                            steam_id: steam64_str,
                            name,
                            avatar,
                            online: false,
                            persona_state: "Offline".into(),
                            current_game: None,
                            current_game_app_id: None,
                            can_invite: true,
                        });
                    }
                }
            } else if depth == 0 {
                break;
            }
            continue;
        }

        if depth == 1 {
            if trimmed.starts_with('"') && trimmed.ends_with('"') {
                let id_str = trimmed.trim_matches('"');
                if id_str.chars().all(|c| c.is_ascii_digit()) {
                    current_id = Some(id_str.to_string());
                    current_name = None;
                    current_avatar = None;
                }
            }
        } else if depth == 2 {
            if trimmed.starts_with("\"name\"") {
                if let Some(val) = trimmed.split("\"name\"").nth(1) {
                    current_name = Some(val.trim().trim_matches('"').to_string());
                }
            } else if trimmed.starts_with("\"avatar\"") {
                if let Some(val) = trimmed.split("\"avatar\"").nth(1) {
                    current_avatar = Some(val.trim().trim_matches('"').to_string());
                }
            }
        }
    }

    friends.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    friends
}

pub fn enrich_friends_realtime_presence(active_steam_id_64: &str, friends: &mut [SteamFriend]) {
    let url = format!("https://steamcommunity.com/profiles/{}/friends/", active_steam_id_64);

    #[cfg(windows)]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("curl.exe");
        c.creation_flags(0x08000000); // CREATE_NO_WINDOW
        c
    };
    #[cfg(not(windows))]
    let mut cmd = std::process::Command::new("curl");

    let output = match cmd
        .args([
            "-s",
            "--max-time",
            "4",
            "-H",
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            &url,
        ])
        .output()
    {
        Ok(out) if out.status.success() => out.stdout,
        _ => return,
    };

    let html = String::from_utf8_lossy(&output);
    parse_and_apply_friends_presence(&html, friends);
}

pub fn parse_and_apply_friends_presence(html: &str, friends: &mut [SteamFriend]) {
    for block in html.split("class=\"selectable friend_block_v2 persona ") {
        let trimmed = block.trim_start();
        let state = if trimmed.starts_with("in-game") {
            "in-game"
        } else if trimmed.starts_with("online") {
            "online"
        } else if trimmed.starts_with("offline") {
            "offline"
        } else {
            continue;
        };

        let steam_id = if let Some(pos) = block.find("data-steamid=\"") {
            let rest = &block[pos + 14..];
            if let Some(end) = rest.find('\"') {
                &rest[..end]
            } else {
                continue;
            }
        } else {
            continue;
        };

        let mut game_name = None;
        if state == "in-game" {
            if let Some(pos) = block.find("<span class=\"friend_small_text\">") {
                let rest = &block[pos + 32..];
                if let Some(end) = rest.find("</span>") {
                    let raw_game = &rest[..end];
                    let cleaned: String = raw_game
                        .replace("<br>", " ")
                        .replace("<br/>", " ")
                        .replace("<br />", " ")
                        .replace("In-Game", "")
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ");
                    if !cleaned.is_empty() {
                        game_name = Some(cleaned);
                    }
                }
            }
        }

        if let Some(f) = friends.iter_mut().find(|f| f.steam_id == steam_id) {
            match state {
                "in-game" => {
                    f.online = true;
                    f.persona_state = "In-Game".into();
                    f.current_game = game_name.clone();
                }
                "online" => {
                    f.online = true;
                    f.persona_state = "Online".into();
                    f.current_game = None;
                }
                "offline" => {
                    f.online = false;
                    f.persona_state = "Offline".into();
                    f.current_game = None;
                }
                _ => {}
            }
        }
    }
}

pub fn read_local_steam_fallback() -> Option<(String, String)> {
    let steam_dir = get_steam_install_dir()?;
    let active = get_active_steam_user().map(|(_, s)| s);
    read_local_steam_user_info(&steam_dir, active)
}

/// Zero-intrusion Steam Manager:
/// Integrates persona profile, avatar, friends list, and invites
/// WITHOUT calling Steamworks API / Steam DRM hook (so Steam never thinks the launcher is Rust).
pub struct SteamManager {
    last_error: Option<String>,
}

impl SteamManager {
    pub const RUST_APP_ID: u32 = 252490;

    pub fn new() -> Self {
        Self {
            last_error: None,
        }
    }

    /// Validates Steam installation. Never hooks Steamworks API with Rust AppID!
    pub fn try_init(&mut self) -> Result<()> {
        let steam_dir = get_steam_install_dir();
        if steam_dir.is_none() {
            let msg = "Steam is not installed on this system.".to_string();
            self.last_error = Some(msg.clone());
            return Err(LauncherError::SteamError(msg));
        }
        self.last_error = None;
        Ok(())
    }

    pub fn get_status(&mut self) -> SteamStatus {
        let steam_dir = match get_steam_install_dir() {
            Some(d) => d,
            None => {
                return SteamStatus {
                    is_available: false,
                    is_logged_on: false,
                    steam_id: None,
                    persona_name: None,
                    avatar: None,
                    error_message: Some("Steam is not installed on this system.".into()),
                };
            }
        };

        let active_user = get_active_steam_user();
        let is_logged_on = active_user.is_some();
        let active_steam64 = active_user.map(|(_, s64)| s64);

        if let Some((steam_id_str, persona_name)) =
            read_local_steam_user_info(&steam_dir, active_steam64)
        {
            let avatar = read_local_steam_avatar(&steam_dir, &steam_id_str);
            SteamStatus {
                is_available: true,
                is_logged_on,
                steam_id: Some(steam_id_str),
                persona_name: Some(persona_name),
                avatar,
                error_message: if is_logged_on {
                    None
                } else {
                    Some("Steam is currently closed or offline.".into())
                },
            }
        } else {
            SteamStatus {
                is_available: true,
                is_logged_on: false,
                steam_id: None,
                persona_name: None,
                avatar: None,
                error_message: Some("No active Steam login profile found.".into()),
            }
        }
    }

    pub fn get_friends(&mut self) -> Result<Vec<SteamFriend>> {
        let steam_dir = get_steam_install_dir().ok_or_else(|| {
            LauncherError::SteamError("Steam installation not found.".into())
        })?;

        let active_user = match get_active_steam_user() {
            Some(u) => u,
            None => {
                // Steam is closed or not logged on: no active friends
                return Ok(Vec::new());
            }
        };
        let (active_32, active_64_str) = (Some(active_user.0), Some(active_user.1.to_string()));

        let mut friends = read_local_steam_friends(&steam_dir, active_32, active_64_str.as_deref());

        // Enrich with real-time presence from steamcommunity.com if active user is logged in
        if let Some(active_id) = active_64_str.as_deref() {
            enrich_friends_realtime_presence(active_id, &mut friends);
        }

        // Sort friends: In-game first, then Online, then Offline, then alphabetically by name
        friends.sort_by(|a, b| {
            let rank = |f: &SteamFriend| {
                if f.current_game.is_some() {
                    0
                } else if f.online {
                    1
                } else {
                    2
                }
            };
            rank(a)
                .cmp(&rank(b))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(friends)
    }

    pub fn invite_friend(&mut self, steam_id_str: &str, connect_string: &str) -> Result<InviteResult> {
        let friends = self.get_friends().unwrap_or_default();
        let friend_name = friends
            .iter()
            .find(|f| f.steam_id == steam_id_str)
            .map(|f| f.name.clone())
            .unwrap_or_else(|| "Steam Friend".to_string());

        // Open Steam chat directly for this friend using Windows shell execute
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("cmd.exe")
                .creation_flags(0x08000000)
                .args(["/c", "start", "", &format!("steam://friends/message/{}", steam_id_str)])
                .spawn();
        }

        tracing::info!(
            "Opened Steam chat for friend '{}' ({}) with connect string: '{}'",
            friend_name,
            steam_id_str,
            connect_string
        );

        Ok(InviteResult {
            steam_id: steam_id_str.to_string(),
            friend_name: friend_name.clone(),
            success: true,
            message: format!("Opened Steam chat with {}", friend_name),
            connect_string: connect_string.to_string(),
        })
    }

    pub fn invite_all_online(&mut self, connect_string: &str) -> Result<InviteAllResult> {
        let friends = self.get_friends()?;
        let total_online = friends.len();
        let mut results = Vec::new();

        for friend in &friends {
            match self.invite_friend(&friend.steam_id, connect_string) {
                Ok(res) => results.push(res),
                Err(e) => results.push(InviteResult {
                    steam_id: friend.steam_id.clone(),
                    friend_name: friend.name.clone(),
                    success: false,
                    message: format!("Failed: {}", e),
                    connect_string: connect_string.to_string(),
                }),
            }
        }

        let succeeded = results.iter().filter(|r| r.success).count();
        let failed = results.len() - succeeded;

        Ok(InviteAllResult {
            total_online,
            succeeded,
            failed,
            results,
        })
    }

    pub fn set_rich_presence(
        &self,
        _connect_string: &str,
        _server_name: &str,
        _players: u32,
        _max_players: u32,
    ) -> bool {
        // Zero-intrusion mode avoids hooking Steam DRM so Steam never shows Rust as running.
        true
    }

    pub fn clear_rich_presence(&self) {}
}
