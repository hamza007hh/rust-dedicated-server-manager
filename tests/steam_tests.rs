use epic_rust_server_launcher::{
    is_valid_public_ip, lookup_game_name, rgba_to_bmp_data_url, SteamManager,
};

#[test]
fn test_local_steam_parser() {
    let steam_dir = std::path::PathBuf::from(r"C:\Program Files (x86)\Steam");
    let avatar_file = steam_dir.join("config").join("avatarcache").join("76561198851257261.png");
    println!("Avatar file exists: {}", avatar_file.is_file());

    let userdata_dir = steam_dir.join("userdata");
    if userdata_dir.is_dir() {
        for entry in std::fs::read_dir(userdata_dir).unwrap().flatten() {
            let localconfig = entry.path().join("config").join("localconfig.vdf");
            if localconfig.is_file() {
                println!("Found localconfig: {}", localconfig.display());
                let content = std::fs::read_to_string(localconfig).unwrap();
                let friends = parse_friends_from_vdf(&content);
                println!("Parsed {} friends from localconfig.vdf!", friends.len());
                for f in friends.iter().take(5) {
                    println!("  Friend: {} (ID: {}) -> Avatar: {:?}", f.name, f.steam_id, f.avatar);
                }
            }
        }
    }
}

#[test]
fn test_steam_manager_zero_intrusion() {
    let steam_dir = epic_rust_server_launcher::steam::get_steam_install_dir();
    println!("test steam_dir: {:?}", steam_dir);
    let active_user = epic_rust_server_launcher::steam::get_active_steam_user();
    println!("test active_user: {:?}", active_user);
    if let Some(dir) = &steam_dir {
        let user_info = epic_rust_server_launcher::steam::read_local_steam_user_info(dir, active_user.map(|(_, s)| s));
        println!("test user_info: {:?}", user_info);
    }
    let mut manager = SteamManager::new();
    let status = manager.get_status();
    println!("SteamStatus: {:?}", status);
    assert!(status.is_available);
    assert_eq!(status.persona_name.as_deref(), Some("Omre9a"));
    assert_eq!(status.steam_id.as_deref(), Some("76561198851257261"));
    assert!(status.avatar.is_some());
    assert!(status.avatar.as_ref().unwrap().starts_with("data:image/"));

    let friends = manager.get_friends().expect("Failed to get friends");
    println!("Got {} friends!", friends.len());
    if status.is_logged_on {
        assert!(!friends.is_empty());
    }
    for f in friends.iter().take(5) {
        println!("Friend: {} -> avatar: {:?}", f.name, f.avatar.is_some());
    }
}

#[test]
fn test_steam_registry() {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Registry::{
            RegCloseKey, RegOpenKeyExA, RegQueryValueExA, HKEY_CURRENT_USER, KEY_READ,
        };
        let mut key = std::ptr::null_mut();
        let subkey = b"Software\\Valve\\Steam\\ActiveProcess\0";
        let status = unsafe {
            RegOpenKeyExA(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut key)
        };
        assert_eq!(status, 0);

        let mut user_id: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        let mut val_type: u32 = 0;
        let val_name = b"ActiveUser\0";
        let status = unsafe {
            RegQueryValueExA(
                key,
                val_name.as_ptr(),
                std::ptr::null_mut(),
                &mut val_type,
                &mut user_id as *mut u32 as *mut u8,
                &mut size,
            )
        };
        assert_eq!(status, 0);
        println!("Registry ActiveUser = {}", user_id);
        unsafe { RegCloseKey(key) };
        assert!(user_id == 0 || user_id > 0);

        let mut key2 = std::ptr::null_mut();
        let subkey2 = b"Software\\Valve\\Steam\0";
        let status2 = unsafe {
            RegOpenKeyExA(HKEY_CURRENT_USER, subkey2.as_ptr(), 0, KEY_READ, &mut key2)
        };
        assert_eq!(status2, 0);

        let mut buf = [0u8; 512];
        let mut size = buf.len() as u32;
        let mut val_type: u32 = 0;
        let val_name = b"SteamPath\0";
        let status2 = unsafe {
            RegQueryValueExA(
                key2,
                val_name.as_ptr(),
                std::ptr::null_mut(),
                &mut val_type,
                buf.as_mut_ptr(),
                &mut size,
            )
        };
        assert_eq!(status2, 0);
        let path_str = std::str::from_utf8(&buf[..(size as usize - 1)]).unwrap();
        println!("Registry SteamPath = {}", path_str);
        unsafe { RegCloseKey(key2) };
        assert!(path_str.to_lowercase().contains("steam"));
    }
}

fn parse_friends_from_vdf(content: &str) -> Vec<epic_rust_server_launcher::SteamFriend> {
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
                    let avatar_url = current_avatar.take().map(|h| format!("https://avatars.steamstatic.com/{}_medium.jpg", h));
                    let steam64 = id.parse::<u64>().map(|v| v + 76561197960265728u64).unwrap_or(0);
                    friends.push(epic_rust_server_launcher::SteamFriend {
                        steam_id: steam64.to_string(),
                        name,
                        avatar: avatar_url,
                        online: true,
                        persona_state: "Online".into(),
                        current_game: None,
                        current_game_app_id: None,
                        can_invite: true,
                    });
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

    friends
}

#[test]
fn test_is_valid_public_ip() {
    // Rejections:
    assert!(!is_valid_public_ip("127.0.0.1"));
    assert!(!is_valid_public_ip("127.0.1.1"));
    assert!(!is_valid_public_ip("0.0.0.0"));
    assert!(!is_valid_public_ip("192.168.1.100"));
    assert!(!is_valid_public_ip("10.0.0.1"));
    assert!(!is_valid_public_ip("10.255.255.255"));
    assert!(!is_valid_public_ip("172.16.0.1"));
    assert!(!is_valid_public_ip("172.31.255.255"));
    assert!(!is_valid_public_ip("169.254.10.20"));
    assert!(!is_valid_public_ip("invalid_ip"));
    assert!(!is_valid_public_ip(""));

    // Acceptances (public WAN IPs):
    assert!(is_valid_public_ip("8.8.8.8"));
    assert!(is_valid_public_ip("1.1.1.1"));
    assert!(is_valid_public_ip("196.200.50.12"));
    assert!(is_valid_public_ip("142.250.190.46"));
}

#[test]
fn test_game_name_lookup() {
    assert_eq!(lookup_game_name(252490).unwrap(), "Rust");
    assert_eq!(lookup_game_name(258550).unwrap(), "Rust Dedicated Server");
    assert_eq!(lookup_game_name(730).unwrap(), "Counter-Strike 2");
    assert_eq!(lookup_game_name(570).unwrap(), "Dota 2");
    assert_eq!(lookup_game_name(440).unwrap(), "Team Fortress 2");
    assert_eq!(lookup_game_name(892970).unwrap(), "Valheim");
    assert_eq!(lookup_game_name(1623730).unwrap(), "Palworld");
    assert_eq!(lookup_game_name(999999).unwrap(), "Steam App 999999");
}

#[test]
fn test_rgba_to_bmp_data_url() {
    // 64x64 = 4096 pixels, 4 bytes each = 16384 bytes
    let rgba = vec![255u8; 64 * 64 * 4];
    let data_url = rgba_to_bmp_data_url(&rgba, 64, 64);

    assert!(data_url.starts_with("data:image/bmp;base64,"));
    let base64_part = data_url.strip_prefix("data:image/bmp;base64,").unwrap();
    assert!(!base64_part.is_empty());

    // Too small buffer returns empty string safely
    let too_small = vec![0u8; 100];
    let empty_url = rgba_to_bmp_data_url(&too_small, 64, 64);
    assert_eq!(empty_url, "");
}

#[test]
fn test_connect_string_construction() {
    let public_ip = "196.128.45.67";
    let port = 28015;
    assert!(is_valid_public_ip(public_ip));

    let connect_string = format!("client.connect {}:{}", public_ip, port);
    assert_eq!(connect_string, "client.connect 196.128.45.67:28015");
}
