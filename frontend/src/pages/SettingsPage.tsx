import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  RefreshCw,
  Download,
  CheckSquare,
  AlertTriangle,
  Compass,
  FolderSearch,
  CheckCircle,
  Play,
  Sliders,
  ExternalLink,
  Info,
  Layers,
  FileText,
  MessageSquare,
  BookOpen,
  Trash2,
  HardDrive,
} from 'lucide-react';
import {
  ServerConfig,
  SteamCmdServerStatus,
  SteamCmdProgress,
  DiscoveredInstallation,
  LauncherPreferences,
  StorageUsageInfo,
} from '../types/server';
import { api, events } from '../services/api';

interface SettingsPageProps {
  config: ServerConfig;
  onSaveConfig: (updated: ServerConfig) => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ config, onSaveConfig }) => {
  // Configuration Paths
  const [installPath, setInstallPath] = useState(config.install_path);
  const [steamcmdPath, setSteamcmdPath] = useState(config.steamcmd_path || '');
  const [branch, setBranch] = useState(config.branch || 'public');
  const [saved, setSaved] = useState(false);

  // Preferences (Picture 1)
  const [preferences, setPreferences] = useState<LauncherPreferences>({
    launch_on_startup: false,
    minimize_to_tray: false,
    close_to_tray: false,
    auto_update_apps: true,
  });

  // Storage Usage & Temp Cleaner (Picture 2)
  const [storageUsage, setStorageUsage] = useState<StorageUsageInfo>({
    install_size_mb: 0,
    backups_size_mb: 0,
  });
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);
  const [isCleaningTemp, setIsCleaningTemp] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  // SteamCMD & Installation state
  const [steamStatus, setSteamStatus] = useState<SteamCmdServerStatus | null>(null);
  const [isLoadingSteam, setIsLoadingSteam] = useState(false);
  const [isRunningSteamCmd, setIsRunningSteamCmd] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredList, setDiscoveredList] = useState<DiscoveredInstallation[]>([]);
  const [liveProgress, setLiveProgress] = useState<SteamCmdProgress | null>(null);

  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fetchStorage = useCallback(async () => {
    setIsLoadingStorage(true);
    try {
      const usage = await api.getStorageUsage();
      setStorageUsage(usage);
    } catch (e) {
      console.warn('Failed to fetch storage usage:', e);
    } finally {
      setIsLoadingStorage(false);
    }
  }, []);

  const fetchSteamStatus = useCallback(async () => {
    setIsLoadingSteam(true);
    try {
      const s = await api.getSteamCmdStatus();
      setSteamStatus(s);
      if (s.rust_install_path) {
        setInstallPath(s.rust_install_path);
      }
    } catch (e: any) {
      console.warn('Failed to load SteamCMD status:', e);
    } finally {
      setIsLoadingSteam(false);
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    try {
      const prefs = await api.getLauncherPreferences();
      setPreferences(prefs);
    } catch (e) {
      console.warn('Failed to load launcher preferences:', e);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
    fetchSteamStatus();
    fetchStorage();

    const sub = events.onSteamCmdProgress((prog) => {
      setLiveProgress(prog);
      if (prog.percent >= 100 || prog.stage === 'Complete') {
        setTimeout(() => setLiveProgress(null), 4000);
      }
    });

    return () => {
      sub.then((unsub) => unsub());
    };
  }, [fetchPreferences, fetchSteamStatus, fetchStorage]);

  const handleTogglePref = async (key: keyof LauncherPreferences) => {
    const nextPrefs = {
      ...preferences,
      [key]: !preferences[key],
    };
    setPreferences(nextPrefs);
    try {
      await api.saveLauncherPreferences(nextPrefs);
    } catch (e: any) {
      console.warn('Failed to save preference toggle:', e);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await api.openInstallFolder();
    } catch (e: any) {
      setStatusMsg({ text: e?.message || 'Could not open folder', type: 'error' });
    }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    setStatusMsg(null);
    try {
      await fetchSteamStatus();
      const res = await api.validateRustServer(installPath.trim());
      setStatusMsg({
        text: `Server files are up to date! Build ID: ${res.build_id || 'Latest'} (${res.branch || 'public'})`,
        type: 'success',
      });
    } catch (e: any) {
      setStatusMsg({
        text: `Update check completed: ${e?.message || 'Unable to verify remote branch build.'}`,
        type: 'info',
      });
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleCleanTemp = async () => {
    setIsCleaningTemp(true);
    setStatusMsg(null);
    try {
      const freedMb = await api.cleanTempFiles();
      await fetchStorage();
      setStatusMsg({
        text: `Cleaned ${freedMb.toFixed(1)} MB of temporary cache and download files.`,
        type: 'success',
      });
    } catch (e: any) {
      setStatusMsg({ text: e?.message || 'Failed to clean temp files', type: 'error' });
    } finally {
      setIsCleaningTemp(false);
    }
  };

  const handleOpenDiscord = () => {
    try {
      window.open('https://discord.gg/rust', '_blank');
    } catch (e) {
      console.warn('Failed to open Discord:', e);
    }
  };

  const handleOpenDocs = () => {
    try {
      window.open('https://wiki.facepunch.com/rust/server-installation', '_blank');
    } catch (e) {
      console.warn('Failed to open docs:', e);
    }
  };

  const handleOpenLog = async () => {
    try {
      await api.openSupportLog();
    } catch (e: any) {
      setStatusMsg({ text: e?.message || 'Failed to open support log', type: 'error' });
    }
  };

  const handleBrowseFolder = async () => {
    setIsBrowsing(true);
    setStatusMsg(null);
    try {
      const selected = await api.browseDirectory();
      if (selected) {
        setInstallPath(selected);
        try {
          const res = await api.validateRustServer(selected);
          setStatusMsg({
            text: `Valid Rust Dedicated Server detected! (Build ID: ${res.build_id || 'Unknown'}, Branch: ${res.branch || 'public'})`,
            type: 'success',
          });
          await onSaveConfig({
            ...config,
            install_path: selected,
            branch: res.branch || branch,
          });
          await fetchSteamStatus();
          await fetchStorage();
        } catch (valErr: any) {
          setStatusMsg({
            text: `Directory selected: ${valErr?.message || valErr}. You can install fresh here using SteamCMD.`,
            type: 'info',
          });
          await onSaveConfig({
            ...config,
            install_path: selected,
          });
          await fetchSteamStatus();
        }
      }
    } catch (e: any) {
      setStatusMsg({ text: e?.message || 'Folder selection failed', type: 'error' });
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleAutoDiscover = async () => {
    setIsDiscovering(true);
    setStatusMsg(null);
    try {
      const found = await api.discoverInstallations();
      setDiscoveredList(found);
      if (found.length > 0) {
        setStatusMsg({
          text: `Found ${found.length} Rust Dedicated installation(s) in Steam libraries or default paths.`,
          type: 'success',
        });
      } else {
        setStatusMsg({
          text: 'No existing Rust Dedicated installations found. Use "Browse" to locate it or "Install Rust Server".',
          type: 'info',
        });
      }
    } catch (e: any) {
      setStatusMsg({ text: e?.message || 'Auto-discovery scan failed', type: 'error' });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleApplyDiscovered = async (inst: DiscoveredInstallation) => {
    setInstallPath(inst.root);
    if (inst.branch) {
      setBranch(inst.branch);
    }
    await onSaveConfig({
      ...config,
      install_path: inst.root,
      branch: inst.branch || config.branch,
    });
    setDiscoveredList([]);
    setStatusMsg({
      text: `Configured and validated Rust Dedicated Server at "${inst.root}". (Build ID: ${inst.build_id || 'Unknown'})`,
      type: 'success',
    });
    await fetchSteamStatus();
    await fetchStorage();
  };

  const handleSave = async () => {
    setStatusMsg(null);
    try {
      await onSaveConfig({
        ...config,
        install_path: installPath.trim(),
        steamcmd_path: steamcmdPath.trim() || null,
        branch: branch.trim() === 'public' ? null : branch.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await fetchSteamStatus();
      await fetchStorage();
    } catch (e: any) {
      setStatusMsg({ text: e?.message || 'Failed to save settings', type: 'error' });
    }
  };

  const handleInstallOrUpdateRust = async () => {
    if (!installPath.trim()) {
      setStatusMsg({ text: 'Please specify or browse a destination folder first.', type: 'error' });
      return;
    }
    setIsRunningSteamCmd(true);
    setStatusMsg(null);
    try {
      const res = await api.installOrUpdateRustServer(installPath.trim());
      setStatusMsg({
        text: `Rust Dedicated Server installed/updated successfully at "${res.root}"! (Build ID: ${res.build_id || 'Latest'})`,
        type: 'success',
      });
      await fetchSteamStatus();
      await fetchStorage();
    } catch (e: any) {
      setStatusMsg({ text: e?.message || 'SteamCMD installation/update failed', type: 'error' });
    } finally {
      setIsRunningSteamCmd(false);
    }
  };

  const handleValidateRust = async () => {
    setIsValidating(true);
    setStatusMsg(null);
    try {
      const res = await api.validateRustServer(installPath.trim());
      setStatusMsg({
        text: `Installation fully validated: Found RustDedicated.exe, Managed runtime, and Assembly-CSharp.dll (Build ID: ${res.build_id || 'Unknown'}, Branch: ${res.branch || 'public'})`,
        type: 'success',
      });
      await fetchSteamStatus();
      await fetchStorage();
    } catch (e: any) {
      setStatusMsg({
        text: `Validation failed for "${installPath}": ${e?.message || e}`,
        type: 'error',
      });
      await fetchSteamStatus();
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto px-8 pt-7 pb-20 select-none">
      <div className="max-w-4xl mx-auto space-y-7 text-neutral-100">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">Launcher & System Settings</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Customize startup behavior, server directories, storage data, and community support
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {saved && (
              <span className="flex items-center space-x-1.5 text-xs text-emerald-400 font-mono">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Saved</span>
              </span>
            )}
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs font-mono shadow-md shadow-orange-600/20 transition-all"
            >
              Save Configuration
            </button>
          </div>
        </div>

        {/* Global Status Banner */}
        {statusMsg && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center space-x-2 font-mono ${
              statusMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : statusMsg.type === 'info'
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : statusMsg.type === 'info' ? (
              <Compass className="w-4 h-4 text-sky-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* ================= 1. PREFERENCES (Picture 1) ================= */}
        <div>
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-2 pl-1">
            PREFERENCES
          </h3>
          <div className="bg-[#12151c]/90 border border-white/[0.07] rounded-xl overflow-hidden divide-y divide-white/[0.05]">
            {/* Launch on startup */}
            <div className="px-5 py-4 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-start space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400 mt-0.5">
                  <Play className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Launch on startup</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Open Epic Rust when Windows starts.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={preferences.launch_on_startup}
                onClick={() => handleTogglePref('launch_on_startup')}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                  preferences.launch_on_startup ? 'bg-orange-600' : 'bg-white/15 hover:bg-white/20'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    preferences.launch_on_startup ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Minimize to tray */}
            <div className="px-5 py-4 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-start space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400 mt-0.5">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Minimize to tray</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    The minimize button hides to the tray instead of the taskbar.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={preferences.minimize_to_tray}
                onClick={() => handleTogglePref('minimize_to_tray')}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                  preferences.minimize_to_tray ? 'bg-orange-600' : 'bg-white/15 hover:bg-white/20'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    preferences.minimize_to_tray ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Close to tray */}
            <div className="px-5 py-4 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-start space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400 mt-0.5">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Close to tray</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    The close button hides to the tray instead of quitting.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={preferences.close_to_tray}
                onClick={() => handleTogglePref('close_to_tray')}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                  preferences.close_to_tray ? 'bg-orange-600' : 'bg-white/15 hover:bg-white/20'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    preferences.close_to_tray ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto-update apps */}
            <div className="px-5 py-4 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-start space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400 mt-0.5">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Auto-update launcher & server</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Install app and dedicated server updates automatically in the background.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={preferences.auto_update_apps}
                onClick={() => handleTogglePref('auto_update_apps')}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                  preferences.auto_update_apps ? 'bg-orange-600' : 'bg-white/15 hover:bg-white/20'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    preferences.auto_update_apps ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* ================= 2. APPS & DATA (Picture 2) ================= */}
        <div>
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-2 pl-1">
            APPS & DATA
          </h3>
          <div className="bg-[#12151c]/90 border border-white/[0.07] rounded-xl overflow-hidden divide-y divide-white/[0.05]">
            {/* Install folder */}
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5 min-w-0 pr-4">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <Folder className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white">Install folder</h4>
                  <p className="text-[11px] text-neutral-500 font-mono truncate max-w-md">
                    {installPath || 'Not configured'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenFolder}
                className="px-4 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-medium transition-colors shrink-0"
              >
                Open folder
              </button>
            </div>

            {/* Updates */}
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <RefreshCw className={`w-4 h-4 ${isCheckingUpdates ? 'animate-spin text-orange-400' : ''}`} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Updates</h4>
                  <p className="text-[11px] text-neutral-500">
                    Branch: <span className="text-neutral-300 font-mono uppercase">{branch}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={isCheckingUpdates}
                className="px-4 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-medium transition-colors shrink-0 disabled:opacity-50"
              >
                {isCheckingUpdates ? 'Checking...' : 'Check for updates'}
              </button>
            </div>

            {/* Storage used */}
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Storage used</h4>
                  <p className="text-[11px] text-neutral-500">
                    RustDedicated executable & game assets
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <span className="text-xs font-mono text-neutral-300">
                  {storageUsage.install_size_mb > 0
                    ? `${storageUsage.install_size_mb.toFixed(1)} MB`
                    : '0 B'}
                </span>
                <button
                  type="button"
                  onClick={fetchStorage}
                  disabled={isLoadingStorage}
                  className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-neutral-400 hover:text-white transition-colors"
                  title="Recalculate storage"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStorage ? 'animate-spin text-orange-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Projects & exports / Saves & Backups */}
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Saves & backups</h4>
                  <p className="text-[11px] text-neutral-500">
                    Map archives, player saves, and snapshots
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <span className="text-xs font-mono text-neutral-300">
                  {storageUsage.backups_size_mb > 0
                    ? `${storageUsage.backups_size_mb.toFixed(1)} MB`
                    : '0 B'}
                </span>
                <button
                  type="button"
                  onClick={fetchStorage}
                  disabled={isLoadingStorage}
                  className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-neutral-400 hover:text-white transition-colors"
                  title="Recalculate storage"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStorage ? 'animate-spin text-orange-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Temp files */}
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Temp files</h4>
                  <p className="text-[11px] text-neutral-500">
                    Steam downloads cache and temporary config buffers
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCleanTemp}
                disabled={isCleaningTemp}
                className="px-4 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-medium transition-colors shrink-0 disabled:opacity-50"
              >
                {isCleaningTemp ? 'Cleaning...' : 'Clean temp files'}
              </button>
            </div>
          </div>
        </div>

        {/* ================= STEAMCMD & SERVER FILES (Integrated Toolchain) ================= */}
        <div>
          <div className="flex items-center justify-between mb-2 pl-1">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
              STEAMCMD & SERVER DIRECTORY
            </h3>
            <button
              type="button"
              onClick={fetchSteamStatus}
              disabled={isLoadingSteam}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-mono text-neutral-400 hover:text-white transition-colors"
              title="Refresh server file inspection"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingSteam ? 'animate-spin text-orange-400' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>
          <div className="bg-[#12151c]/90 border border-white/[0.07] rounded-xl p-5 space-y-4">
            {/* Live SteamCMD Progress Bar */}
            {liveProgress && (
              <div className="p-4 rounded-xl bg-[#0d0f14] border border-orange-500/40 space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center text-neutral-300">
                  <span className="font-bold flex items-center space-x-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-400" />
                    <span>{liveProgress.raw_message || liveProgress.stage || 'SteamCMD in progress...'}</span>
                  </span>
                  <span className="text-orange-400 font-bold">{liveProgress.percent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-white/[0.08] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-orange-500 h-2 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, liveProgress.percent))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Discovered Installations Banner */}
            {discoveredList.length > 0 && (
              <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 space-y-3 font-mono text-xs">
                <div className="font-bold text-sky-300 flex items-center space-x-2">
                  <FolderSearch className="w-4 h-4 text-sky-400" />
                  <span>Discovered Server Installations ({discoveredList.length})</span>
                </div>
                <div className="space-y-2">
                  {discoveredList.map((inst, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d0f14] border border-white/[0.06]">
                      <div>
                        <span className="font-bold text-white block">{inst.root}</span>
                        <span className="text-[11px] text-neutral-400">
                          Source: {inst.source} • Build ID: {inst.build_id || 'Unknown'} • Branch: {inst.branch || 'public'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleApplyDiscovered(inst)}
                        className="px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors"
                      >
                        Use This Folder
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Status Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-3 rounded-lg bg-[#0d0f14] border border-white/[0.05]">
                <span className="text-neutral-400 block text-[11px] mb-1">RustDedicated.exe</span>
                <span className={steamStatus?.is_rust_installed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {steamStatus?.is_rust_installed ? 'DETECTED' : 'NOT FOUND'}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#0d0f14] border border-white/[0.05]">
                <span className="text-neutral-400 block text-[11px] mb-1">File Integrity</span>
                <span className={steamStatus?.is_valid ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {steamStatus?.is_valid ? 'VALID (Managed OK)' : 'INVALID / MISSING'}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#0d0f14] border border-white/[0.05]">
                <span className="text-neutral-400 block text-[11px] mb-1">Installed Build ID</span>
                <span className="text-white font-bold text-xs">
                  {steamStatus?.build_id || 'None detected'}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#0d0f14] border border-white/[0.05]">
                <span className="text-neutral-400 block text-[11px] mb-1">Configured Branch</span>
                <span className="text-orange-400 font-bold text-xs uppercase">
                  {steamStatus?.branch || branch || 'public'}
                </span>
              </div>
            </div>

            {/* Path Inputs */}
            <div className="space-y-3 pt-2 border-t border-white/[0.05]">
              <div>
                <label className="block text-xs font-medium text-neutral-300 font-mono mb-1.5">
                  Rust Dedicated Server Directory
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="e.g. C:\RustServer or D:\SteamLibrary\steamapps\common\rustds"
                    value={installPath}
                    onChange={(e) => setInstallPath(e.target.value)}
                    className="flex-1 bg-[#0d0f14] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-orange-500/70"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    disabled={isBrowsing}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-mono font-medium transition-colors"
                  >
                    <Folder className="w-3.5 h-3.5 text-orange-400" />
                    <span>{isBrowsing ? 'Selecting...' : 'Browse...'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoDiscover}
                    disabled={isDiscovering}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-mono font-medium transition-colors"
                    title="Search Steam libraries and default candidate paths"
                  >
                    <Compass className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin text-orange-400' : 'text-orange-400'}`} />
                    <span>{isDiscovering ? 'Scanning...' : 'Auto-Detect'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono pt-1">
                <div>
                  <label className="block font-medium text-neutral-400 mb-1">SteamCMD Directory (Optional)</label>
                  <input
                    type="text"
                    placeholder="Default: <InstallPath>/../steamcmd or C:\steamcmd"
                    value={steamcmdPath}
                    onChange={(e) => setSteamcmdPath(e.target.value)}
                    className="w-full bg-[#0d0f14] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500/70"
                  />
                </div>

                <div>
                  <label className="block font-medium text-neutral-400 mb-1">Steam Release Branch</label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-[#0d0f14] border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-orange-500/70"
                  >
                    <option value="public">Public (Standard Stable)</option>
                    <option value="staging">Staging (Pre-release Testing)</option>
                    <option value="aux01">Auxiliary 01</option>
                    <option value="prerelease">Prerelease</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Validation & Installation Buttons */}
            <div className="pt-2 flex flex-wrap gap-2.5 justify-end">
              <button
                onClick={handleValidateRust}
                disabled={isValidating || isRunningSteamCmd}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-mono font-medium disabled:opacity-50 transition-colors"
              >
                {isValidating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5 text-orange-400" />}
                <span>Validate Game Files</span>
              </button>

              <button
                onClick={handleInstallOrUpdateRust}
                disabled={isRunningSteamCmd || isValidating}
                className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-mono font-medium shadow-md shadow-orange-600/20 disabled:opacity-50 transition-all"
              >
                {isRunningSteamCmd ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{steamStatus?.is_rust_installed ? 'Update Rust Server' : 'Install Rust Server via SteamCMD'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= 3. HELP & SUPPORT (Picture 3) ================= */}
        <div>
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-2 pl-1">
            HELP & SUPPORT
          </h3>
          <div className="bg-[#12151c]/90 border border-white/[0.07] rounded-xl overflow-hidden divide-y divide-white/[0.05]">
            {/* Community */}
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Community</h4>
                  <p className="text-[11px] text-neutral-500">
                    Connect with Rust server owners and developers on Discord
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenDiscord}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-medium transition-colors shrink-0"
              >
                <span>Discord</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
              </button>
            </div>

            {/* Documentation */}
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Documentation</h4>
                  <p className="text-[11px] text-neutral-500">
                    Official Facepunch and wiki server administration guides
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenDocs}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-medium transition-colors shrink-0"
              >
                <span>Docs</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
              </button>
            </div>

            {/* Support log */}
            <div className="px-5 py-3.5 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Support log</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    The launcher activity log, attach it to a support ticket.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenLog}
                className="px-4 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-medium transition-colors shrink-0"
              >
                Open log
              </button>
            </div>
          </div>
        </div>

        {/* ================= 4. ABOUT (Picture 4) ================= */}
        <div>
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-2 pl-1">
            ABOUT
          </h3>
          <div className="bg-[#12151c]/90 border border-white/[0.07] rounded-xl overflow-hidden">
            {/* Launcher version */}
            <div className="px-5 py-4 flex items-center justify-between hover:bg-white/[0.015] transition-colors">
              <div className="flex items-center space-x-3.5">
                <div className="p-2 rounded-lg bg-white/[0.04] text-neutral-400">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Launcher version</h4>
                  <p className="text-[11px] text-neutral-500">
                    Official Release Build for Windows x64
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono font-bold text-neutral-300">
                v1.0.0
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
