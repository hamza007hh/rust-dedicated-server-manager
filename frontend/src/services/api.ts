import {
  ServerConfig,
  ServerStatus,
  ServerTelemetry,
  NetInfo,
  LogEntry,
  RconPacket,
  ErrorPayload,
  ActiveSaveInfo,
  CurrentMapInfo,
  RealRustMapInfo,
  SaveBackupInfo,
  WipeResult,
  FrameworkStatus,
  PluginItem,
  UmodPluginItem,
  SteamCmdProgress,
  SteamCmdServerStatus,
  SchedulerConfig,
  SchedulerStatus,
  CrashStatus,
  DiscoveredInstallation,
  ServerRules,
  ProfilesData,
  AdminUser,
  ServerCreateProgress,
  SteamStatus,
  SteamFriend,
  InviteResult,
  InviteAllResult,
  LauncherPreferences,
  StorageUsageInfo,
  AppUpdateInfo,
} from '../types/server';

export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

async function safeInvoke<T>(cmd: string, args?: Record<string, any>, fallback?: T): Promise<T> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    } catch (e: any) {
      console.warn(`Tauri command '${cmd}' failed:`, e);
      if (fallback !== undefined) return fallback;
      throw new Error(typeof e === 'string' ? e : e?.message || `Command ${cmd} failed`);
    }
  }

  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Running in mock mode; command '${cmd}' has no fallback.`);
}

export const api = {
  // Status & Telemetry
  async getStatus(): Promise<ServerStatus> {
    return safeInvoke<ServerStatus>('get_server_status', undefined, 'running');
  },

  async startServer(): Promise<void> {
    return safeInvoke<void>('start_server', undefined, undefined);
  },

  async stopServer(): Promise<void> {
    return safeInvoke<void>('stop_server', undefined, undefined);
  },

  async restartServer(): Promise<void> {
    return safeInvoke<void>('restart_server', undefined, undefined);
  },

  async getTelemetry(): Promise<ServerTelemetry> {
    return safeInvoke<ServerTelemetry>('get_telemetry', undefined, {
      hostname: '⚡ Rustafied 2x Vanilla | Bi-Weekly | Active Admins',
      max_players: 150,
      players: 64,
      queued_players: 3,
      joining_players: 2,
      entity_count: 168420,
      framerate: 258.4,
      uptime: 184500,
      memory: 6450.0,
      cpu: 14.5,
    });
  },

  async getNetInfo(): Promise<NetInfo> {
    return safeInvoke<NetInfo>('get_net_info', undefined, {
      lan_ip: '192.168.1.100',
      public_ip: '142.250.190.46',
      game_port: 28015,
      query_port: 28017,
      rcon_port: 28016,
      connect_local: 'client.connect 127.0.0.1:28015',
      connect_lan: 'client.connect 192.168.1.100:28015',
    });
  },

  // Configuration
  async getConfig(): Promise<ServerConfig> {
    return safeInvoke<ServerConfig>('get_server_config', undefined, {
      identity: 'rust_elite_profile',
      hostname: '⚡ Rustafied 2x Vanilla | Bi-Weekly | Active Admins',
      description: 'High-performance dedicated Rust server with fast procedural generation, Oxide mods, and automated wipe schedules.',
      header_image: null,
      url: 'https://rustmaps.com',
      port: 28015,
      query_port: 28017,
      rcon_port: 28016,
      rcon_password: 'PasswordProtected123',
      max_players: 150,
      tickrate: 30,
      pve: false,
      gamemode: 'vanilla',
      mod_framework: 'oxide',
      is_procedural: true,
      seed: 1337,
      worldsize: 4000,
      level_url: null,
      install_path: 'C:\\RustDedicatedServer',
      log_file: 'output.log',
      custom_args: '+server.tags "monthly,vanilla"',
      steamcmd_path: 'C:\\steamcmd\\steamcmd.exe',
      branch: 'public',
      branch_password: null,
      validate_on_update: true,
    });
  },

  async saveConfig(config: ServerConfig): Promise<void> {
    return safeInvoke<void>('save_server_config', { config });
  },

  // Console & Logs
  async getLogs(): Promise<LogEntry[]> {
    return safeInvoke<LogEntry[]>('get_logs', undefined, [
      { timestamp_millis: Date.now() - 45000, source: 'Stdout', message: 'Generating procedural map (Seed: 1337, Size: 4000m)...' },
      { timestamp_millis: Date.now() - 40000, source: 'Stdout', message: 'Map procedural generation completed in 4.8s. 28 monuments placed.' },
      { timestamp_millis: Date.now() - 35000, source: 'Stdout', message: '[Oxide] Loaded plugin NTeleportation v1.7.9 by LaserHydra' },
      { timestamp_millis: Date.now() - 30000, source: 'Stdout', message: '[Oxide] Loaded plugin GatherManager v2.2.78 by Mughisi' },
      { timestamp_millis: Date.now() - 25000, source: 'Stdout', message: '[Oxide] Loaded plugin Kits v4.0.12 by k1lly0u' },
      { timestamp_millis: Date.now() - 20000, source: 'Stdout', message: 'Server initialized and listening on port 28015 (RCON: 28016)' },
      { timestamp_millis: Date.now() - 15000, source: 'Rcon', message: '[RCON] Admin authenticated from 127.0.0.1' },
      { timestamp_millis: Date.now() - 10000, source: 'Stdout', message: 'Client "ChadThundercock" connected [SteamID: 76561198012345678]' },
      { timestamp_millis: Date.now() - 5000, source: 'Stdout', message: 'Client "BaseBuilder99" connected [SteamID: 76561198087654321]' },
    ]);
  },

  async sendRconCommand(command: string): Promise<string> {
    return safeInvoke<string>('send_rcon_command', { command }, `Command "${command}" executed.`);
  },

  // Maps & Saves
  async getMapInfo(): Promise<CurrentMapInfo> {
    return safeInvoke<CurrentMapInfo>('get_map_info', undefined, {
      is_procedural: true,
      seed: 1337,
      worldsize: 4000,
      level_url: null,
      active_save: null,
    });
  },

  async fetchRealRustMap(seed: number, worldsize: number): Promise<RealRustMapInfo> {
    return safeInvoke<RealRustMapInfo>('fetch_real_rust_map', { seed, worldsize }, {
      seed,
      worldsize,
      image_url: '/rust_map_satellite.png',
      thumbnail_url: '/rust_map_satellite.png',
      total_monuments: 28,
      monuments: [
        'Launch Site',
        'Military Tunnels',
        'Airfield',
        'Outpost',
        'Bandit Camp',
        'Large Oil Rig',
        'Small Oil Rig',
        'Giant Excavator',
        'Water Treatment Plant',
        'Train Yard',
        'Power Plant',
        'Sewer Branch',
        'The Dome',
        'Satellite Dish',
        'Harbor',
        'Lighthouse',
      ],
      rustmaps_url: `https://rustmaps.com/map/${worldsize}_${seed}`,
      is_real: true,
    });
  },

  async changeMapProcedural(seed: number, worldsize: number): Promise<void> {
    return safeInvoke<void>('change_map_procedural', { seed, worldsize });
  },

  async changeMapCustom(level_url: string): Promise<void> {
    return safeInvoke<void>('change_map_custom', { level_url });
  },

  async wipeProceduralMap(): Promise<WipeResult> {
    return safeInvoke<WipeResult>('wipe_procedural_map', undefined, {
      deleted_files: [],
      backup_path: null,
      blueprints_preserved: [],
    });
  },

  async listActiveSaves(): Promise<ActiveSaveInfo[]> {
    return safeInvoke<ActiveSaveInfo[]>('list_active_saves', undefined, []);
  },

  async listBackups(): Promise<SaveBackupInfo[]> {
    return safeInvoke<SaveBackupInfo[]>('list_backups', undefined, []);
  },

  async createBackup(tag?: string): Promise<string> {
    return safeInvoke<string>('create_backup', { tag });
  },

  async restoreSave(backupPath: string): Promise<void> {
    return safeInvoke<void>('restore_save', { backup_path: backupPath });
  },

  async deleteBackup(backupPath: string): Promise<void> {
    return safeInvoke<void>('delete_backup', { backup_path: backupPath });
  },

  // Mods & Plugins
  async getFrameworkStatus(): Promise<FrameworkStatus> {
    return safeInvoke<FrameworkStatus>('get_framework_status', undefined, {
      active_framework: 'Oxide',
      is_oxide_installed: true,
      is_carbon_installed: false,
    });
  },

  async installOxide(): Promise<void> {
    return safeInvoke<void>('install_oxide', undefined);
  },

  async installCarbon(): Promise<void> {
    return safeInvoke<void>('install_carbon', undefined);
  },

  async listPlugins(): Promise<PluginItem[]> {
    return safeInvoke<PluginItem[]>('list_plugins', undefined, [
      { name: 'NTeleportation', filename: 'NTeleportation.cs', is_enabled: true, path: 'oxide/plugins/NTeleportation.cs', file_size: 45200 },
      { name: 'GatherManager', filename: 'GatherManager.cs', is_enabled: true, path: 'oxide/plugins/GatherManager.cs', file_size: 28400 },
      { name: 'Kits', filename: 'Kits.cs', is_enabled: true, path: 'oxide/plugins/Kits.cs', file_size: 52100 },
      { name: 'BetterLoot', filename: 'BetterLoot.cs', is_enabled: true, path: 'oxide/plugins/BetterLoot.cs', file_size: 34000 },
      { name: 'ImageLibrary', filename: 'ImageLibrary.cs', is_enabled: true, path: 'oxide/plugins/ImageLibrary.cs', file_size: 19800 },
    ]);
  },

  async togglePlugin(name: string, enable: boolean): Promise<void> {
    return safeInvoke<void>('toggle_plugin', { name, enable });
  },

  async deletePlugin(name: string): Promise<void> {
    return safeInvoke<void>('delete_plugin', { name });
  },

  async searchUmod(query: string, page = 1): Promise<UmodPluginItem[]> {
    return safeInvoke<UmodPluginItem[]>('search_umod', { query, page }, []);
  },

  async installUmodPlugin(slug: string): Promise<string> {
    return safeInvoke<string>('install_umod_plugin', { slug });
  },

  // SteamCMD
    async browseDirectory(): Promise<string | null> {
    return safeInvoke<string | null>('browse_directory', undefined, null);
  },

  async getSteamCmdStatus(): Promise<SteamCmdServerStatus> {
    return safeInvoke<SteamCmdServerStatus>('get_steamcmd_server_status', undefined, {
      is_steamcmd_installed: true,
      steamcmd_path: 'C:\\steamcmd\\steamcmd.exe',
      is_rust_installed: true,
      rust_install_path: 'C:\\RustDedicatedServer',
      build_id: '13982421',
      branch: 'public',
      is_valid: true,
    });
  },

  async installOrUpdateRustServer(targetPath?: string): Promise<any> {
    return safeInvoke<any>('run_steamcmd_install_or_update', { target_path: targetPath || null });
  },

  async validateRustServer(path?: string): Promise<DiscoveredInstallation> {
    return safeInvoke<DiscoveredInstallation>('validate_rust_server', { path: path || null });
  },

  // Scheduler & Crash Protection
  async getSchedulerStatus(): Promise<SchedulerStatus> {
    return safeInvoke<SchedulerStatus>('get_scheduler_status', undefined, {
      enabled: true,
      restart_time: '04:00',
      next_restart_timestamp_millis: null,
      seconds_until_restart: null,
      last_warning_sent: null,
    });
  },

  async saveSchedulerConfig(config: SchedulerConfig): Promise<void> {
    return safeInvoke<void>('save_scheduler_config', { config });
  },

  async getCrashStatus(): Promise<CrashStatus> {
    return safeInvoke<CrashStatus>('get_crash_status', undefined, {
      crash_count: 0,
      last_crash_timestamp_millis: null,
      auto_restart_active: true,
      is_in_crash_loop: false,
      last_exit_code: null,
    });
  },

  async resetCrashCount(): Promise<void> {
    return safeInvoke<void>('reset_crash_count', undefined);
  },

  async setAutoRestart(enabled: boolean): Promise<void> {
    return safeInvoke<void>('set_auto_restart', { enabled });
  },

  // Discovery
  async discoverInstallations(): Promise<DiscoveredInstallation[]> {
    return safeInvoke<DiscoveredInstallation[]>('discover_installations', undefined, []);
  },

  // Multiple Server Profiles
  async getServerProfiles(): Promise<ProfilesData> {
    return safeInvoke<ProfilesData>('get_server_profiles', undefined, {
      active_profile_id: 'prof-main',
      profiles: [
        {
          id: 'prof-main',
          name: 'Main 2x Vanilla (Active)',
          created_at_millis: Date.now() - 86400000 * 3,
          config: {
            identity: 'rust_elite_profile',
            hostname: '⚡ Rustafied 2x Vanilla | Bi-Weekly | Active Admins',
            description: 'High-performance dedicated Rust server with fast procedural generation, Oxide mods, and automated wipe schedules.',
            header_image: null,
            url: 'https://rustmaps.com',
            port: 28015,
            query_port: 28017,
            rcon_port: 28016,
            rcon_password: 'PasswordProtected123',
            max_players: 150,
            tickrate: 30,
            pve: false,
            gamemode: 'vanilla',
            mod_framework: 'oxide',
            is_procedural: true,
            seed: 1337,
            worldsize: 4000,
            level_url: null,
            install_path: 'C:\\RustDedicatedServer',
            log_file: 'output.log',
            custom_args: '+server.tags "monthly,vanilla"',
            steamcmd_path: 'C:\\steamcmd\\steamcmd.exe',
            branch: 'public',
            branch_password: null,
            validate_on_update: true,
          },
        },
        {
          id: 'prof-5x',
          name: '5x Modded Battlefield',
          created_at_millis: Date.now() - 86400000,
          config: {
            identity: 'rust_modded_5x',
            hostname: '🔥 5x Extreme Loot & Instant Craft',
            description: 'Fast-paced PvP experience with custom kits and instant airdrops.',
            header_image: null,
            url: null,
            port: 28025,
            query_port: 28027,
            rcon_port: 28026,
            rcon_password: 'PasswordProtected123',
            max_players: 100,
            tickrate: 30,
            pve: false,
            gamemode: 'vanilla',
            mod_framework: 'oxide',
            is_procedural: true,
            seed: 133742,
            worldsize: 3500,
            level_url: null,
            install_path: 'C:\\RustDedicatedServer_5x',
            log_file: 'output.log',
            custom_args: '',
            steamcmd_path: 'C:\\steamcmd\\steamcmd.exe',
            branch: 'public',
            branch_password: null,
            validate_on_update: true,
          },
        },
      ],
    });
  },

  async createServerProfile(name: string, copyFromActive: boolean): Promise<ProfilesData> {
    return safeInvoke<ProfilesData>('create_server_profile', {
      name,
      copyFromActive,
    });
  },

  async createServer(config: ServerConfig): Promise<ProfilesData> {
    return safeInvoke<ProfilesData>('create_server', { config });
  },

  async changeModFramework(targetFramework: 'vanilla' | 'carbon' | 'oxide'): Promise<ServerConfig> {
    return safeInvoke<ServerConfig>('change_mod_framework', { targetFramework });
  },

  async selectServerProfile(id: string): Promise<ProfilesData> {
    return safeInvoke<ProfilesData>('select_server_profile', { id });
  },

  async deleteServerProfile(id: string): Promise<ProfilesData> {
    return safeInvoke<ProfilesData>('delete_server_profile', { id });
  },

  async renameServerProfile(id: string, newName: string): Promise<ProfilesData> {
    return safeInvoke<ProfilesData>('rename_server_profile', { id, newName });
  },

  // Server Admins & Owners (SteamID64)
  async getServerAdmins(): Promise<AdminUser[]> {
    return safeInvoke<AdminUser[]>('get_server_admins', undefined, []);
  },

  async addServerAdmin(steamId: string, role: string, name: string, notes: string): Promise<AdminUser[]> {
    return safeInvoke<AdminUser[]>('add_server_admin', {
      steamId,
      role,
      name,
      notes,
    });
  },

  async removeServerAdmin(steamId: string): Promise<AdminUser[]> {
    return safeInvoke<AdminUser[]>('remove_server_admin', { steamId });
  },

  // Quick Weather & Server Actions
  async quickWeatherOrAction(action: string): Promise<string> {
    return safeInvoke<string>('quick_weather_or_action', { action });
  },

  // Live Server Rules
  async updateServerRules(rules: ServerRules): Promise<void> {
    return safeInvoke<void>('update_server_rules', { rules });
  },

  // Advanced server.cfg
  async getRawServerCfg(): Promise<string> {
    return safeInvoke<string>('get_raw_server_cfg', undefined, '');
  },

  async saveRawServerCfg(content: string): Promise<void> {
    return safeInvoke<void>('save_raw_server_cfg', { content });
  },

  async resetServerCfgDefaults(): Promise<string> {
    return safeInvoke<string>('reset_server_cfg_defaults', undefined, '');
  },

  async openCfgFolder(): Promise<void> {
    return safeInvoke<void>('open_cfg_folder', undefined, undefined);
  },

  // Advanced Launch Arguments
  async getFormattedLaunchArgs(): Promise<string> {
    return safeInvoke<string>('get_formatted_launch_args', undefined, '');
  },

  async saveCustomLaunchArgs(customArgs: string): Promise<void> {
    return safeInvoke<void>('save_custom_launch_args', { customArgs });
  },

  // Steam Friends & Server Invites
  async getSteamStatus(): Promise<SteamStatus> {
    return safeInvoke<SteamStatus>('steam_get_status', undefined, {
      is_available: true,
      is_logged_on: true,
      persona_name: 'RustAdmin_Apex',
      steam_id: '76561198012345678',
      error_message: null,
    });
  },

  async getSteamFriends(): Promise<SteamFriend[]> {
    return safeInvoke<SteamFriend[]>('steam_get_friends', undefined, [
      { steam_id: '76561198000000001', name: 'ShadowRaider', online: true, persona_state: 'online', current_game: 'Rust', can_invite: true },
      { steam_id: '76561198000000002', name: 'Akimbo_Chad', online: true, persona_state: 'online', current_game: 'Rust', can_invite: true },
      { steam_id: '76561198000000003', name: 'BaseBuilder99', online: true, persona_state: 'online', current_game: 'Counter-Strike 2', can_invite: true },
      { steam_id: '76561198000000004', name: 'HeliPilot_Ace', online: true, persona_state: 'online', current_game: 'Rust', can_invite: true },
      { steam_id: '76561198000000005', name: 'NakedWithRock', online: false, persona_state: 'away', current_game: null, can_invite: false },
    ]);
  },

  async launchSteamClient(): Promise<void> {
    return safeInvoke<void>('steam_launch_client');
  },

  async openSteamChat(steamId: string): Promise<void> {
    return safeInvoke<void>('steam_open_chat', { steamId });
  },

  async inviteSteamFriend(steamId: string): Promise<InviteResult> {
    return safeInvoke<InviteResult>('steam_invite_friend', { steamId }, {
      steam_id: steamId,
      friend_name: 'Friend',
      success: true,
      message: 'Invitation successfully sent',
      connect_string: 'client.connect localhost:28015',
    });
  },

  async inviteAllOnlineSteamFriends(): Promise<InviteAllResult> {
    return safeInvoke<InviteAllResult>('steam_invite_all_online', undefined, {
      total_online: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    });
  },

  async setSteamRichPresence(): Promise<boolean> {
    return safeInvoke<boolean>('steam_set_rich_presence', undefined, false);
  },

  async windowMinimize(): Promise<void> {
    return safeInvoke<void>('app_window_minimize');
  },

  async windowToggleMaximize(): Promise<void> {
    return safeInvoke<void>('app_window_toggle_maximize');
  },

  async windowClose(): Promise<void> {
    return safeInvoke<void>('app_window_close');
  },

  async windowStartDragging(): Promise<void> {
    return safeInvoke<void>('app_window_start_dragging');
  },

  // Launcher Settings & System Data
  async openInstallFolder(): Promise<void> {
    return safeInvoke<void>('open_install_folder');
  },

  async openSupportLog(): Promise<void> {
    return safeInvoke<void>('open_support_log');
  },

  async getStorageUsage(): Promise<StorageUsageInfo> {
    return safeInvoke<StorageUsageInfo>('get_storage_usage', undefined, {
      install_size_mb: 0,
      backups_size_mb: 0,
    });
  },

  async cleanTempFiles(): Promise<number> {
    return safeInvoke<number>('clean_temp_files', undefined, 0);
  },

  async getLauncherPreferences(): Promise<LauncherPreferences> {
    return safeInvoke<LauncherPreferences>('get_launcher_preferences', undefined, {
      launch_on_startup: false,
      minimize_to_tray: false,
      close_to_tray: false,
      auto_update_apps: true,
    });
  },

  async saveLauncherPreferences(prefs: LauncherPreferences): Promise<void> {
    return safeInvoke<void>('save_launcher_preferences', { prefs });
  },

  async checkAppUpdate(): Promise<AppUpdateInfo> {
    if (isTauri()) {
      return safeInvoke<AppUpdateInfo>('check_app_update');
    }
    try {
      const res = await fetch('https://api.github.com/repos/hamza007hh/Epic-Rust-Launcher/releases/latest', {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) throw new Error('Could not fetch release');
      const data = await res.json();
      const latestTag = (data.tag_name || '1.0.0').trim();
      const currentVer = '1.0.0';
      const cleanLatest = latestTag.replace(/^v/, '');
      const cleanCurrent = currentVer.replace(/^v/, '');
      const isNewer = cleanLatest.localeCompare(cleanCurrent, undefined, { numeric: true, sensitivity: 'base' }) > 0;
      let dlUrl = '';
      if (Array.isArray(data.assets)) {
        const exe = data.assets.find((a: any) => a.name.toLowerCase() === 'epicrust.exe');
        if (exe) dlUrl = exe.browser_download_url;
      }
      return {
        has_update: isNewer,
        current_version: currentVer,
        latest_version: latestTag,
        release_name: data.name || latestTag,
        release_notes: data.body || '',
        published_at: data.published_at || '',
        download_url: dlUrl,
        release_url: data.html_url || 'https://github.com/hamza007hh/Epic-Rust-Launcher/releases/latest',
      };
    } catch {
      return {
        has_update: false,
        current_version: '1.0.0',
        latest_version: '1.0.0',
        release_name: 'Epic Rust v1.0.0',
        release_notes: '',
        published_at: '',
        download_url: '',
        release_url: '',
      };
    }
  },

  async applyAppUpdate(downloadUrl: string): Promise<void> {
    return safeInvoke<void>('apply_app_update', { download_url: downloadUrl });
  },
};

export const events = {
  async onServerStateChanged(cb: (status: ServerStatus) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<ServerStatus>('server-state-changed', (e) => cb(e.payload));
      } catch (e) {
        console.warn('Failed to register onServerStateChanged listener:', e);
      }
    }
    return () => {};
  },

  async onLogReceived(cb: (entry: LogEntry) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<LogEntry>('log-received', (e) => cb(e.payload));
      } catch (e) {
        console.warn('Failed to register onLogReceived listener:', e);
      }
    }
    return () => {};
  },

  async onRconMessage(cb: (pkt: RconPacket) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<RconPacket>('rcon-message-received', (e) => cb(e.payload));
      } catch (e) {
        console.warn('Failed to register onRconMessage listener:', e);
      }
    }
    return () => {};
  },

  async onTelemetryUpdated(cb: (telem: ServerTelemetry) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<ServerTelemetry>('telemetry-updated', (e) => cb(e.payload));
      } catch (e) {
        console.warn('Failed to register onTelemetryUpdated listener:', e);
      }
    }
    return () => {};
  },

  async onSteamCmdProgress(cb: (prog: SteamCmdProgress) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<SteamCmdProgress>('steamcmd-progress', (e) => cb(e.payload));
      } catch (e) {
        console.warn('Failed to register onSteamCmdProgress listener:', e);
      }
    }
    return () => {};
  },

  async onSchedulerWarning(cb: (warningTag: string) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<string>('scheduler-warning', (e) => cb(e.payload));
      } catch (e) {
        console.warn('Failed to register onSchedulerWarning listener:', e);
      }
    }
    return () => {};
  },

  async onErrorOccurred(cb: (error: ErrorPayload) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<ErrorPayload>('error-occurred', (e) => cb(e.payload));
      } catch (e) {
        console.warn('Failed to register onErrorOccurred listener:', e);
      }
    }
    return () => {};
  },

  async onServerCreateProgress(cb: (prog: ServerCreateProgress) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten1 = await listen<ServerCreateProgress>('server:create:progress', (e) => cb(e.payload));
        const unlisten2 = await listen<ServerCreateProgress>('server-create-progress', (e) => cb(e.payload));
        return () => {
          unlisten1();
          unlisten2();
        };
      } catch (e) {
        console.warn('Failed to register onServerCreateProgress listener:', e);
      }
    }
    return () => {};
  },

  async onServerCreateError(cb: (err: any) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten1 = await listen<any>('server:create:error', (e) => cb(e.payload));
        const unlisten2 = await listen<any>('server-create-error', (e) => cb(e.payload));
        return () => {
          unlisten1();
          unlisten2();
        };
      } catch (e) {
        console.warn('Failed to register onServerCreateError listener:', e);
      }
    }
    return () => {};
  },

  async onServerCreateComplete(cb: (data: any) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten1 = await listen<any>('server:create:complete', (e) => cb(e.payload));
        const unlisten2 = await listen<any>('server-create-complete', (e) => cb(e.payload));
        return () => {
          unlisten1();
          unlisten2();
        };
      } catch (e) {
        console.warn('Failed to register onServerCreateComplete listener:', e);
      }
    }
    return () => {};
  },

  async onSteamInviteResult(cb: (res: InviteResult) => void): Promise<() => void> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen<InviteResult>('steam:invite-result', (e) => cb(e.payload));
      } catch (e) {
        console.warn('Failed to register onSteamInviteResult listener:', e);
      }
    }
    return () => {};
  },
};
