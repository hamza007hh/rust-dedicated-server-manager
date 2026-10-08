use crate::config::ServerConfig;
use crate::error::{LauncherError, Result};

/// Builds the complete command-line argument vector for RustDedicated.exe
/// conforming to the reverse-engineered CrucibleServer specification.
pub fn build_command_line(cfg: &ServerConfig) -> Result<Vec<String>> {
    cfg.validate()?;

    let mut args = vec![
        // Hardcoded base switches
        "-batchmode".to_string(),
        "-nographics".to_string(),
        "-noconsole".to_string(),
        
        // Identity & Core Network Convars
        "+server.identity".to_string(),
        cfg.identity.clone(),
        "+server.ip".to_string(),
        "0.0.0.0".to_string(),
        "+rcon.web".to_string(),
        "1".to_string(),
    ];

    // Optional log file switch
    if let Some(log) = &cfg.log_file {
        args.push("-logfile".to_string());
        args.push(log.clone());
    }

    // Ports
    args.push("+server.port".to_string());
    args.push(cfg.port.to_string());
    args.push("+server.queryport".to_string());
    args.push(cfg.resolved_query_port().to_string());

    // RCON
    args.push("+rcon.port".to_string());
    args.push(cfg.rcon_port.to_string());
    args.push("+rcon.password".to_string());
    args.push(cfg.rcon_password.clone());

    // Server Gamemode & Gameplay
    args.push("+server.gamemode".to_string());
    args.push(cfg.gamemode.clone());

    // Map selection
    if cfg.is_procedural {
        args.push("+server.level".to_string());
        args.push("Procedural Map".to_string());
        args.push("+server.seed".to_string());
        args.push(cfg.seed.to_string());
        args.push("+server.worldsize".to_string());
        args.push(cfg.worldsize.to_string());
    } else if let Some(url) = &cfg.level_url {
        args.push("+server.levelurl".to_string());
        args.push(url.clone());
    }

    // Rules switches
    if cfg.server_rules.skip_ai_navmesh {
        args.push("-nav_disable".to_string());
        args.push("true".to_string());
    }
    if cfg.server_rules.relaxed_anti_cheat {
        args.push("-insecure".to_string());
        args.push("+server.eac".to_string());
        args.push("0".to_string());
        args.push("+server.secure".to_string());
        args.push("0".to_string());
    }

    // Parse and append custom user arguments
    if !cfg.custom_args.trim().is_empty() {
        let custom = parse_custom_arguments(&cfg.custom_args)?;
        args.extend(custom);
    }

    Ok(args)
}

/// Generates the display text for the Launch arguments (advanced) editor
pub fn format_full_launch_arguments(cfg: &ServerConfig) -> String {
    let mut s = String::new();
    s.push_str("// The command line this server starts with.\n");
    s.push_str("// Everything above the divider comes from the settings, rebuilt at every start.\n");
    s.push_str("-batchmode\n");
    s.push_str("-nographics\n");
    s.push_str("-noconsole\n");
    s.push_str(&format!("+server.identity {}\n", cfg.identity));
    s.push_str("+server.ip 0.0.0.0\n");
    s.push_str(&format!("+server.port {}\n", cfg.port));
    s.push_str(&format!("+server.queryport {}\n", cfg.resolved_query_port()));
    s.push_str(&format!("+rcon.port {}\n", cfg.rcon_port));
    s.push_str("+rcon.web 1\n");
    s.push_str(&format!("+rcon.password {}\n", cfg.rcon_password));
    s.push_str(&format!("+server.gamemode {}\n", cfg.gamemode));
    if let Some(log) = &cfg.log_file {
        s.push_str(&format!("-logfile {}\n", log));
    }
    if cfg.server_rules.skip_ai_navmesh {
        s.push_str("-nav_disable true\n");
    }
    s.push_str("\n// ---- your own arguments, one per line (e.g. -useNewNavmesh) ----\n");
    if !cfg.custom_args.trim().is_empty() {
        let user_lines = if let Some(idx) = cfg.custom_args.find("// ---- your own arguments") {
            let after = &cfg.custom_args[idx..];
            if let Some(line_end) = after.find('\n') {
                after[line_end + 1..].trim()
            } else {
                ""
            }
        } else {
            cfg.custom_args.trim()
        };
        if !user_lines.is_empty() {
            s.push_str(user_lines);
            s.push('\n');
        }
    }
    s
}

/// Parses and validates custom user-defined arguments line-by-line
pub fn parse_custom_arguments(raw: &str) -> Result<Vec<String>> {
    // Strip managed content above divider if present
    let content = match raw.find("// ---- your own arguments") {
        Some(idx) => &raw[idx..],
        None => raw,
    };

    let mut out = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('#') {
            continue;
        }

        // Check for unbalanced quotes
        if trimmed.matches('"').count() % 2 != 0 {
            return Err(LauncherError::ArgumentError(format!(
                "Unbalanced quote (\") in line: {}",
                trimmed
            )));
        }

        // Disallow semicolons unless quoted
        if trimmed.contains(';') {
            return Err(LauncherError::ArgumentError(
                "One argument per line. Move semicolon onto its own line, or quote it if it belongs to the value".to_string(),
            ));
        }

        // Validate prefix (- or +)
        if !trimmed.starts_with('-') && !trimmed.starts_with('+') {
            return Err(LauncherError::ArgumentError(format!(
                "\"{}\" is not an argument. Switches start with - and convars with +, e.g. -useNewNavmesh",
                trimmed
            )));
        }

        let parts = tokenize_line(trimmed);
        if parts.is_empty() {
            continue;
        }

        // If it's a convar (+), require a parameter value
        if parts[0].starts_with('+') && parts.len() < 2 {
            return Err(LauncherError::ArgumentError(format!(
                "{} is a convar and needs a value, e.g. {} true",
                parts[0], parts[0]
            )));
        }

        out.extend(parts);
    }

    Ok(out)
}

fn tokenize_line(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in line.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    tokens.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}
