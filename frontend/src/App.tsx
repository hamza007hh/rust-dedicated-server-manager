import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ChangelogModal } from './components/ChangelogModal';
import { DonateModal } from './components/DonateModal';
import { SteamFriendsDock } from './components/SteamFriendsDock';
import { CreateServerWizard } from './components/CreateServerWizard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { ConsolePage } from './pages/ConsolePage';
import { ServerPage } from './pages/ServerPage';
import { MapsPage } from './pages/MapsPage';
import { SavesPage } from './pages/SavesPage';
import { PluginsPage } from './pages/PluginsPage';
import { SchedulerPage } from './pages/SchedulerPage';
import { SettingsPage } from './pages/SettingsPage';
import { api, events } from './services/api';
import {
  ServerConfig,
  ServerStatus,
  ServerTelemetry,
  SteamCmdServerStatus,
  NetInfo,
  LogEntry,
  SaveBackupInfo,
  FrameworkStatus,
  PluginItem,
  WipeResult,
  ProfilesData,
  SteamStatus,
} from './types/server';

const DEFAULT_CONFIG: ServerConfig = {
  identity: 'epic_server',
  hostname: 'Epic Rust Dedicated Server',
  description: 'High performance Rust server powered by Epic Launcher',
  header_image: null,
  url: null,
  port: 28015,
  query_port: 28017,
  rcon_port: 28016,
  rcon_password: 'ChangeMeImmediately!',
  max_players: 50,
  tickrate: 30,
  pve: false,
  gamemode: 'vanilla',
  mod_framework: 'vanilla',
  is_procedural: true,
  seed: 1337,
  worldsize: 3000,
  level_url: null,
  install_path: 'C:\\rustserver',
  log_file: 'output.log',
  custom_args: '',
  steamcmd_path: null,
  branch: null,
  branch_password: null,
  validate_on_update: true,
};

const DEFAULT_TELEMETRY: ServerTelemetry = {
  hostname: 'Epic Rust Dedicated Server',
  max_players: 50,
  players: 0,
  queued_players: 0,
  joining_players: 0,
  entity_count: 0,
  framerate: 0.0,
  uptime: 0,
  memory: 0.0,
  cpu: 0.0,
};

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('page');
      return p || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [status, setStatus] = useState<ServerStatus>('stopped');
  const [config, setConfig] = useState<ServerConfig>(DEFAULT_CONFIG);
  const [telemetry, setTelemetry] = useState<ServerTelemetry>(DEFAULT_TELEMETRY);
  const [netInfo, setNetInfo] = useState<NetInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [backups, setBackups] = useState<SaveBackupInfo[]>([]);
  const [frameworkStatus, setFrameworkStatus] = useState<FrameworkStatus>({
    active_framework: 'Vanilla',
    is_oxide_installed: false,
    is_carbon_installed: false,
  });
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [steamStatus, setSteamStatus] = useState<SteamCmdServerStatus | null>(null);
  const [profilesData, setProfilesData] = useState<ProfilesData>({
    active_profile_id: '',
    profiles: [],
  });
  const [steamStatusSummary, setSteamStatusSummary] = useState<SteamStatus | null>(null);
  const [isCreateWizardOpen, setIsCreateWizardOpen] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const unlistenFns = useRef<(() => void)[]>([]);

  const hasCreatedServer = profilesData.profiles.length > 0;

  const showError = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Initial load
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [
          loadedConfig,
          loadedStatus,
          loadedNet,
          loadedTelemetry,
          loadedLogs,
          loadedSteam,
          loadedProfiles,
          loadedBackups,
          loadedPlugins,
          loadedSteamStatus,
        ] = await Promise.all([
          api.getConfig().catch(() => DEFAULT_CONFIG),
          api.getStatus().catch(() => 'stopped' as ServerStatus),
          api.getNetInfo().catch(() => null),
          api.getTelemetry().catch(() => DEFAULT_TELEMETRY),
          api.getLogs().catch(() => []),
          api.getSteamCmdStatus().catch(() => null),
          api.getServerProfiles().catch(() => ({ active_profile_id: '', profiles: [] })),
          api.listBackups().catch(() => []),
          api.listPlugins().catch(() => []),
          api.getSteamStatus().catch(() => null),
        ]);

        setConfig(loadedConfig);
        setStatus(loadedStatus);
        setNetInfo(loadedNet);
        setTelemetry(loadedTelemetry);
        setLogs(loadedLogs);
        if (loadedSteam) setSteamStatus(loadedSteam);
        if (loadedProfiles) setProfilesData(loadedProfiles);
        if (loadedBackups) setBackups(loadedBackups);
        if (loadedPlugins) setPlugins(loadedPlugins);
        if (loadedSteamStatus) setSteamStatusSummary(loadedSteamStatus);
      } catch (err: any) {
        console.error('Failed to load initial server state:', err);
      }
    };
    loadInitial();
  }, []);

  // Event bus subscriptions
  useEffect(() => {
    let mounted = true;

    const setupListeners = async () => {
      const u1 = await events.onServerStateChanged((newStatus) => {
        if (!mounted) return;
        setStatus(newStatus);
        if (newStatus === 'running') {
          api.getNetInfo().then(setNetInfo).catch(() => {});
        }
      });
      unlistenFns.current.push(u1);

      const u2 = await events.onLogReceived((entry) => {
        if (!mounted) return;
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > 1000 ? next.slice(next.length - 1000) : next;
        });
      });
      unlistenFns.current.push(u2);

      const u3 = await events.onRconMessage((pkt) => {
        if (!mounted) return;
        const entry: LogEntry = {
          timestamp_millis: Date.now(),
          source: 'Rcon',
          message: `[${pkt.Name || 'RCON'}] ${pkt.Message}`,
        };
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > 1000 ? next.slice(next.length - 1000) : next;
        });
      });
      unlistenFns.current.push(u3);

      const u4 = await events.onTelemetryUpdated((telem) => {
        if (!mounted) return;
        setTelemetry(telem);
      });
      unlistenFns.current.push(u4);

      const u5 = await events.onErrorOccurred((err) => {
        if (!mounted) return;
        showError(`[${err.code}] ${err.message}`);
      });
      unlistenFns.current.push(u5);

      const u6 = await events.onSchedulerWarning((tag) => {
        if (!mounted) return;
        showError(`Restart Countdown Alert: ${tag.toUpperCase()}`);
      });
      unlistenFns.current.push(u6);
    };

    setupListeners();

    return () => {
      mounted = false;
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
    };
  }, []);

  // Heartbeat fallback polling (5s interval)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [currentStatus, currentTelem] = await Promise.all([
          api.getStatus().catch(() => status),
          api.getTelemetry().catch(() => telemetry),
        ]);
        setStatus(currentStatus);
        setTelemetry(currentTelem);

        if (currentStatus === 'running' && !netInfo) {
          api.getNetInfo().then(setNetInfo).catch(() => {});
        }
      } catch (e) {
        // silent
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [status, telemetry, netInfo]);

  // Server lifecycle handlers
  const handleStart = async () => {
    if (steamStatus && (!steamStatus.is_rust_installed || !steamStatus.is_valid)) {
      showError(`Cannot start: RustDedicated.exe not found at '${config.install_path}'. Choose a folder or install server first.`);
      return;
    }
    setIsActionLoading(true);
    try {
      await api.startServer();
      setStatus('starting');
      showSuccess('Server start sequence initiated.');
      const updatedNet = await api.getNetInfo().catch(() => null);
      if (updatedNet) setNetInfo(updatedNet);
    } catch (err: any) {
      showError(err?.message || 'Failed to start server');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStop = async () => {
    setIsActionLoading(true);
    try {
      await api.stopServer();
      setStatus('stopping');
      showSuccess('Server shutdown initiated.');
    } catch (err: any) {
      showError(err?.message || 'Failed to stop server');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRestart = async () => {
    setIsActionLoading(true);
    try {
      await api.restartServer();
      setStatus('starting');
      showSuccess('Server restart sequence initiated.');
    } catch (err: any) {
      showError(err?.message || 'Failed to restart server');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Config & Profile handlers
  const handleSaveConfig = async (updated: ServerConfig) => {
    await api.saveConfig(updated);
    setConfig(updated);
    const [updatedProfiles, updatedSteam] = await Promise.all([
      api.getServerProfiles().catch(() => null),
      api.getSteamCmdStatus().catch(() => null),
    ]);
    if (updatedProfiles) setProfilesData(updatedProfiles);
    if (updatedSteam) setSteamStatus(updatedSteam);
    showSuccess('Configuration synchronized & saved.');
  };

  const handleSelectProfile = async (id: string) => {
    if (status !== 'stopped') {
      showError('Cannot switch server profiles while a server is running. Stop the server first.');
      return;
    }
    try {
      const res = await api.selectServerProfile(id);
      setProfilesData(res);
      const switched = res.profiles.find((p) => p.id === res.active_profile_id);
      if (switched) {
        setConfig(switched.config);
        showSuccess(`Switched to server: ${switched.name}`);
      }
    } catch (e: any) {
      showError(e?.message || 'Failed to switch profile');
    }
  };

  const handleServerCreated = (createdConfig: ServerConfig, newProfilesData: ProfilesData) => {
    setProfilesData(newProfilesData);
    setConfig(createdConfig);
    setIsCreateWizardOpen(false);
    showSuccess(`Server "${createdConfig.hostname}" successfully configured!`);
  };

  const handleRenameProfile = async (id: string, newName: string) => {
    try {
      const res = await api.renameServerProfile(id, newName);
      setProfilesData(res);
      const updated = res.profiles.find((p) => p.id === id);
      if (updated && id === res.active_profile_id) {
        setConfig(updated.config);
      }
      showSuccess(`Server renamed to "${newName}".`);
    } catch (e: any) {
      showError(e?.message || 'Failed to rename server profile');
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (status !== 'stopped') {
      showError('Cannot delete a server while it is running. Stop the server first.');
      return;
    }
    try {
      const res = await api.deleteServerProfile(id);
      setProfilesData(res);
      const switched = res.profiles.find((p) => p.id === res.active_profile_id);
      if (switched) {
        setConfig(switched.config);
      } else {
        setConfig(DEFAULT_CONFIG);
        setCurrentPage('dashboard');
      }
      showSuccess('Server profile deleted.');
    } catch (e: any) {
      showError(e?.message || 'Failed to delete server profile');
    }
  };

  // Console handlers
  const handleSendCommand = async (command: string): Promise<string> => {
    try {
      const response = await api.sendRconCommand(command);
      return response;
    } catch (err: any) {
      showError(err?.message || 'Failed to dispatch RCON command');
      throw err;
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  // Map & Save handlers
  const handleChangeProcedural = async (seed: number, worldsize: number) => {
    await api.changeMapProcedural(seed, worldsize);
    setConfig((prev) => ({
      ...prev,
      is_procedural: true,
      seed,
      worldsize,
      level_url: null,
    }));
    showSuccess(`Map changed to Procedural (Seed: ${seed}, Size: ${worldsize}m).`);
  };

  const handleChangeCustom = async (url: string) => {
    await api.changeMapCustom(url);
    setConfig((prev) => ({
      ...prev,
      is_procedural: false,
      level_url: url,
    }));
    showSuccess('Map changed to custom level URL.');
  };

  const handleWipeProcedural = async (): Promise<WipeResult> => {
    const res = await api.wipeProceduralMap();
    await handleRefreshBackups();
    showSuccess(`Procedural map wiped (${res.deleted_files.length} files removed, player blueprints preserved).`);
    return res;
  };

  const handleRefreshBackups = useCallback(async () => {
    try {
      const list = await api.listBackups();
      setBackups(list);
    } catch (e) {
      console.warn('Failed to refresh backups:', e);
    }
  }, []);

  const handleCreateBackup = async (tag?: string): Promise<string> => {
    const path = await api.createBackup(tag);
    await handleRefreshBackups();
    showSuccess('Save snapshot backup created successfully.');
    return path;
  };

  const handleRestoreSave = async (backupPath: string) => {
    await api.restoreSave(backupPath);
    showSuccess('Server save restored from backup.');
  };

  // Plugin handlers
  const handleRefreshPlugins = useCallback(async () => {
    try {
      const [fStatus, pList] = await Promise.all([
        api.getFrameworkStatus().catch(() => frameworkStatus),
        api.listPlugins().catch(() => []),
      ]);
      setFrameworkStatus(fStatus);
      setPlugins(pList);
    } catch (e) {
      console.warn('Failed to refresh plugins:', e);
    }
  }, [frameworkStatus]);

  const handleTogglePlugin = async (name: string, enable: boolean) => {
    await api.togglePlugin(name, enable);
    await handleRefreshPlugins();
    showSuccess(`Plugin ${name} ${enable ? 'enabled' : 'disabled'}.`);
  };

  const handleInstallOxide = async () => {
    await api.installOxide();
    await handleRefreshPlugins();
    showSuccess('Oxide.Rust successfully installed.');
  };

  const handleInstallCarbon = async () => {
    await api.installCarbon();
    await handleRefreshPlugins();
    showSuccess('Carbon successfully installed.');
  };

  const handleSearchUmod = async (q: string) => {
    return await api.searchUmod(q);
  };

  const handleInstallUmodPlugin = async (slug: string) => {
    const path = await api.installUmodPlugin(slug);
    await handleRefreshPlugins();
    showSuccess(`uMod plugin ${slug} installed to plugins folder.`);
    return path;
  };

  const handleDeleteBackup = async (backupPath: string) => {
    await api.deleteBackup(backupPath);
    await handleRefreshBackups();
    showSuccess('Backup snapshot permanently deleted.');
  };

  const handleBrowseFolder = async () => {
    try {
      const selected = await api.browseDirectory();
      if (selected) {
        try {
          const res = await api.validateRustServer(selected);
          const updated = {
            ...config,
            install_path: selected,
            branch: res.branch || config.branch,
          };
          await api.saveConfig(updated);
          setConfig(updated);
          showSuccess(`Configured Rust Dedicated Server at: ${selected}`);
        } catch (valErr: any) {
          const updated = { ...config, install_path: selected };
          await api.saveConfig(updated);
          setConfig(updated);
          showError(`Folder set, but not a valid Rust server: ${valErr?.message || valErr}`);
        }
        const s = await api.getSteamCmdStatus().catch(() => null);
        if (s) setSteamStatus(s);
      }
    } catch (e: any) {
      showError(e?.message || 'Folder browse failed');
    }
  };

  const handleAutoDetect = async () => {
    try {
      const [found, steam] = await Promise.all([
        api.discoverInstallations().catch(() => []),
        api.getSteamStatus().catch(() => null),
      ]);

      if (steam) {
        setSteamStatusSummary(steam);
      }

      if (found && found.length > 0) {
        const first = found[0];
        const updated = {
          ...config,
          install_path: first.root,
          branch: first.branch || config.branch,
        };
        await api.saveConfig(updated);
        setConfig(updated);
        const s = await api.getSteamCmdStatus().catch(() => null);
        if (s) setSteamStatus(s);
        showSuccess(`Auto-detected Rust server at: ${first.root}${steam?.persona_name ? ` (Steam: ${steam.persona_name})` : ''}`);
      } else {
        if (steam?.persona_name) {
          showSuccess(`Steam connected as ${steam.persona_name}. No dedicated server found in default paths.`);
        } else {
          showError('No existing Rust server found in Steam libraries or common paths. You can install it in Settings.');
        }
      }
    } catch (e: any) {
      showError(e?.message || 'Auto-detection scan failed');
    }
  };

  const handleDeletePlugin = async (name: string) => {
    await api.deletePlugin(name);
    await handleRefreshPlugins();
    showSuccess(`Plugin "${name}" deleted.`);
  };

  return (
    <div className="flex flex-col h-full w-full fixed inset-0 overflow-hidden bg-[#0a0b0e] text-neutral-100 font-sans">
      {/* Toast Notifications */}
      {errorToast && (
        <div className="fixed top-12 right-5 z-50 bg-rose-600/95 text-white px-4 py-3 rounded-2xl shadow-2xl text-xs font-mono border border-rose-400 flex items-center space-x-2 animate-in fade-in slide-in-from-top-3 duration-200">
          <span>⚠ {errorToast}</span>
        </div>
      )}
      {successToast && (
        <div className="fixed top-12 right-5 z-50 bg-emerald-600/95 text-white px-4 py-3 rounded-2xl shadow-2xl text-xs font-mono border border-emerald-400 flex items-center space-x-2 animate-in fade-in slide-in-from-top-3 duration-200">
          <span>✓ {successToast}</span>
        </div>
      )}

      {/* Top Bar across entire app (Image 4 Style) */}
      <TopBar
        onOpenDonate={() => setShowDonateModal(true)}
        onOpenChangelog={() => setShowChangelogModal(true)}
        onNavigate={setCurrentPage}
      />

      {/* Main App Body */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Left Sidebar (Image 2 & 3 Categorized Style) */}
        <Sidebar
          currentPage={currentPage}
          onSelectPage={setCurrentPage}
          hasCreatedServer={hasCreatedServer}
          onOpenCreateWizard={() => setIsCreateWizardOpen(true)}
          serversCount={profilesData.profiles.length}
          backupsCount={backups.length}
          pluginsCount={plugins.length}
          isRunning={status === 'running' || status === 'rcon_unavailable'}
          steamStatus={steamStatusSummary}
        />

        {/* Middle Workspace Area (Header removed as requested) */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#0c0d12]">
          <main key={currentPage} className="flex-1 overflow-hidden relative animate-page-enter">
          {currentPage === 'dashboard' && (
            <ErrorBoundary fallbackTitle="Dashboard is temporarily unavailable">
              <DashboardPage
                status={status}
                config={config}
                telemetry={telemetry}
                netInfo={netInfo}
                recentLogs={logs}
                steamStatus={steamStatus}
                onNavigate={setCurrentPage}
                onBrowseFolder={handleBrowseFolder}
                onAutoDetect={handleAutoDetect}
                onStartServer={handleStart}
                onStopServer={handleStop}
                onRestartServer={handleRestart}
                isActionLoading={isActionLoading}
                profilesData={profilesData}
                onSelectProfile={handleSelectProfile}
                onOpenCreateWizard={() => setIsCreateWizardOpen(true)}
                hasCreatedServer={hasCreatedServer}
                steamPersonaName={steamStatusSummary?.persona_name}
                onRenameProfile={handleRenameProfile}
                onDeleteProfile={handleDeleteProfile}
              />
            </ErrorBoundary>
          )}

          {currentPage === 'console' && (
            <ConsolePage
              logs={logs}
              status={status}
              onSendCommand={handleSendCommand}
              onClearLogs={handleClearLogs}
            />
          )}

          {(currentPage === 'server' || currentPage === 'server_cfg') && (
            <ServerPage
              config={config}
              status={status}
              onSaveConfig={handleSaveConfig}
            />
          )}

          {currentPage === 'maps' && (
            <MapsPage
              config={config}
              status={status}
              onChangeProcedural={handleChangeProcedural}
              onChangeCustom={handleChangeCustom}
              onWipeProcedural={handleWipeProcedural}
            />
          )}

          {currentPage === 'saves' && (
            <SavesPage
              config={config}
              status={status}
              backups={backups}
              onRefreshBackups={handleRefreshBackups}
              onCreateBackup={handleCreateBackup}
              onRestoreSave={handleRestoreSave}
              onWipeProcedural={handleWipeProcedural}
              onDeleteBackup={handleDeleteBackup}
            />
          )}

          {currentPage === 'plugins' && (
            <PluginsPage
              status={status}
              frameworkStatus={frameworkStatus}
              plugins={plugins}
              modFramework={config.mod_framework}
              onNavigate={setCurrentPage}
              onRefreshPlugins={handleRefreshPlugins}
              onTogglePlugin={handleTogglePlugin}
              onInstallOxide={handleInstallOxide}
              onInstallCarbon={handleInstallCarbon}
              onSearchUmod={handleSearchUmod}
              onInstallUmodPlugin={handleInstallUmodPlugin}
              onDeletePlugin={handleDeletePlugin}
            />
          )}

          {currentPage === 'scheduler' && (
            <SchedulerPage status={status} />
          )}

          {currentPage === 'settings' && (
            <SettingsPage
              config={config}
              onSaveConfig={handleSaveConfig}
            />
          )}
        </main>
      </div>

      {/* Right Tab: Steam Profile & Friends Dock (Image 2 & Image 1 Style) */}
      <SteamFriendsDock
        status={status}
        config={config}
        netInfo={netInfo}
        onInviteSent={(msg) => showSuccess(msg)}
        onInviteError={(msg) => showError(msg)}
        onStatusLoaded={setSteamStatusSummary}
      />
    </div>

    {/* Version & Release Changelog Modal */}
    <ChangelogModal
      isOpen={showChangelogModal}
      onClose={() => setShowChangelogModal(false)}
    />

    {/* Support the Creator Modal */}
    <DonateModal
      isOpen={showDonateModal}
      onClose={() => setShowDonateModal(false)}
    />

    {/* Create Server Wizard Modal */}
    <CreateServerWizard
      isOpen={isCreateWizardOpen}
      onClose={() => setIsCreateWizardOpen(false)}
      suggestedPort={
        profilesData.profiles.length > 0
          ? Math.max(...profilesData.profiles.map((p) => p.config.port || 28015)) + 10
          : 28015
      }
      onServerCreated={handleServerCreated}
    />
    </div>
  );
};
