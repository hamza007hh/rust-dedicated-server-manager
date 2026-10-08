export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'rcon_unavailable' | 'error';

export interface ServerRules {
  bradley_apc: boolean;
  timed_events: boolean;
  cargo_ship: boolean;
  radiation: boolean;
  scientists_npcs: boolean;
  structural_stability: boolean;
  halloween_event: boolean;
  christmas_event: boolean;
  no_animals: boolean;
  passive_scientists: boolean;
  lock_time_16_8: boolean;
  lock_clear_weather: boolean;
  spawn_loot_on_start: boolean;
  no_building_upkeep: boolean;
  no_decay: boolean;
  instant_craft: boolean;
  relaxed_anti_cheat: boolean;
  creative_mode: boolean;
  free_build: boolean;
  free_placement: boolean;
  free_repair: boolean;
  unlimited_io: boolean;
  instant_placement: boolean;
  always_on_entities: boolean;
  skip_ai_navmesh: boolean;
}

export interface ServerConfig {
  identity: string;
  hostname: string;
  description: string;
  header_image?: string | null;
  url?: string | null;
  port: number;
  query_port?: number | null;
  rcon_port: number;
  rcon_password: string;
  max_players: number;
  tickrate: number;
  pve: boolean;
  gamemode: string;
  mod_framework: 'vanilla' | 'carbon' | 'oxide';
  is_procedural: boolean;
  seed: number;
  worldsize: number;
  level_url?: string | null;
  install_path: string;
  log_file?: string | null;
  custom_args: string;
  steamcmd_path?: string | null;
  branch?: string | null;
  branch_password?: string | null;
  validate_on_update: boolean;
  server_rules?: ServerRules;
}

export type ModFrameworkType = 'vanilla' | 'carbon' | 'oxide';

export interface ServerCreateProgress {
  step: string;
  message: string;
  percent: number;
  framework: string;
}

export interface ServerProfile {
  id: string;
  name: string;
  created_at_millis: number;
  config: ServerConfig;
}

export interface ProfilesData {
  active_profile_id: string;
  profiles: ServerProfile[];
}

export interface AdminUser {
  steam_id: string;
  role: 'owner' | 'moderator' | string;
  name: string;
  notes: string;
}

export interface ServerTelemetry {
  hostname: string;
  max_players: number;
  players: number;
  queued_players: number;
  joining_players: number;
  entity_count: number;
  framerate: number;
  uptime: number;
  memory: number;
  cpu: number;
}

export interface NetInfo {
  lan_ip: string;
  public_ip: string;
  game_port: number;
  query_port: number;
  rcon_port: number;
  connect_local: string;
  connect_lan: string;
}

export type LogSource = 'Stdout' | 'Stderr' | 'Rcon' | 'System';

export interface LogEntry {
  timestamp_millis: number;
  source: LogSource;
  message: string;
}

export interface RconPacket {
  Identifier: number;
  Message: string;
  Name: string;
  Type: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ActiveSaveInfo {
  file_name: string;
  path: string;
  size_bytes: number;
  modified_millis: number;
  is_procedural: boolean;
  is_blueprint: boolean;
}

export interface CurrentMapInfo {
  is_procedural: boolean;
  seed: number;
  worldsize: number;
  level_url?: string | null;
  active_save?: ActiveSaveInfo | null;
}

export interface RealRustMapInfo {
  seed: number;
  worldsize: number;
  image_url?: string | null;
  thumbnail_url?: string | null;
  total_monuments?: number | null;
  monuments: string[];
  rustmaps_url: string;
  is_real: boolean;
}

export interface SaveBackupInfo {
  backup_path: string;
  name: string;
  created_at_millis: number;
  file_count: number;
  total_bytes: number;
}

export interface WipeResult {
  deleted_files: string[];
  backup_path?: string | null;
  blueprints_preserved: string[];
}

export type ModFramework = 'Vanilla' | 'Oxide' | 'Carbon';

export interface FrameworkStatus {
  active_framework: ModFramework;
  is_oxide_installed: boolean;
  is_carbon_installed: boolean;
  oxide_version?: string | null;
  carbon_version?: string | null;
}

export interface PluginItem {
  name: string;
  filename: string;
  is_enabled: boolean;
  path: string;
  file_size: number;
}

export interface UmodPluginItem {
  name: string;
  slug: string;
  author?: string | null;
  description?: string | null;
  downloads?: number | null;
  url?: string | null;
  download_url?: string | null;
  icon_url?: string | null;
}

export interface SteamCmdProgress {
  stage: 'Initializing' | 'CheckingUpdates' | 'Downloading' | 'Validating' | 'Complete' | 'Failed';
  percent: number;
  current_bytes: number;
  total_bytes: number;
  raw_message: string;
}

export interface SteamCmdServerStatus {
  is_steamcmd_installed: boolean;
  steamcmd_path: string;
  is_rust_installed: boolean;
  rust_install_path: string;
  build_id?: string | null;
  branch?: string | null;
  is_valid: boolean;
}

export interface SchedulerConfig {
  enabled: boolean;
  restart_time: string;
  interval_hours: number;
  warn_15m: boolean;
  warn_5m: boolean;
  warn_1m: boolean;
}

export interface SchedulerStatus {
  enabled: boolean;
  restart_time: string;
  next_restart_timestamp_millis?: number | null;
  seconds_until_restart?: number | null;
  last_warning_sent?: string | null;
}

export interface CrashStatus {
  crash_count: number;
  last_crash_timestamp_millis?: number | null;
  auto_restart_active: boolean;
  is_in_crash_loop: boolean;
  last_exit_code?: number | null;
}

export interface DiscoveredInstallation {
  root: string;
  executable: string;
  build_id?: string | null;
  branch?: string | null;
  is_valid: boolean;
  source: 'Configured' | 'CommonCandidate' | 'SteamLibrary';
}

export type ValidatedInstallation = DiscoveredInstallation;

export interface SteamStatus {
  is_available: boolean;
  is_logged_on: boolean;
  steam_id?: string | null;
  persona_name?: string | null;
  avatar?: string | null;
  error_message?: string | null;
}

export interface SteamFriend {
  steam_id: string;
  name: string;
  avatar?: string | null;
  online: boolean;
  persona_state: string;
  current_game?: string | null;
  current_game_app_id?: number | null;
  can_invite: boolean;
}

export interface InviteResult {
  steam_id: string;
  friend_name: string;
  success: boolean;
  message: string;
  connect_string: string;
}

export interface InviteAllResult {
  total_online: number;
  succeeded: number;
  failed: number;
  results: InviteResult[];
}

export interface LauncherPreferences {
  launch_on_startup: boolean;
  minimize_to_tray: boolean;
  close_to_tray: boolean;
  auto_update_apps: boolean;
}

export interface StorageUsageInfo {
  install_size_mb: number;
  backups_size_mb: number;
}

