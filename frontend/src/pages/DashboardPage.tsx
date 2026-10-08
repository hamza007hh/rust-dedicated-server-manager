import React, { useState } from 'react';
import {
  Users,
  Activity,
  Cpu,
  Database,
  Clock,
  Globe,
  Radio,
  Wifi,
  MapPin,
  Flame,
  AlertTriangle,
  Folder,
  Compass,
  Download,
  Play,
  Square,
  RotateCw,
  Plus,
  Copy,
  Check,
  Search,
  ChevronRight,
  MoreVertical,
  Edit2,
  Trash2,
  X,
  ShieldCheck,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { MapPreview } from '../components/MapPreview';
import { RustLogo } from '../components/RustLogo';
import {
  ServerConfig,
  ServerStatus,
  ServerTelemetry,
  NetInfo,
  LogEntry,
  SteamCmdServerStatus,
  ProfilesData,
} from '../types/server';
import heroBannerImg from '../assets/rust_hero.jpg';

interface DashboardPageProps {
  status: ServerStatus;
  config: ServerConfig;
  telemetry: ServerTelemetry;
  netInfo: NetInfo | null;
  recentLogs: LogEntry[];
  steamStatus: SteamCmdServerStatus | null;
  onNavigate: (page: string) => void;
  onBrowseFolder: () => Promise<void>;
  onAutoDetect: () => Promise<void>;
  onStartServer: () => void;
  onStopServer: () => void;
  onRestartServer: () => void;
  isActionLoading: boolean;
  profilesData: ProfilesData;
  onSelectProfile: (id: string) => void;
  onOpenCreateWizard: () => void;
  hasCreatedServer: boolean;
  steamPersonaName?: string | null;
  onRenameProfile: (id: string, newName: string) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  status,
  config,
  telemetry,
  netInfo,
  recentLogs = [],
  steamStatus,
  onNavigate,
  onBrowseFolder,
  onAutoDetect,
  onStartServer,
  onStopServer,
  onRestartServer,
  isActionLoading,
  profilesData,
  onSelectProfile,
  onOpenCreateWizard,
  hasCreatedServer,
  steamPersonaName,
  onRenameProfile,
  onDeleteProfile,
}) => {
  const [copiedConnect, setCopiedConnect] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 3-dots Menu & Modal states
  const [openMenuProfileId, setOpenMenuProfileId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const isRunning = status === 'running' || status === 'rcon_unavailable';
  const isStarting = status === 'starting';
  const isStopping = status === 'stopping';

  const cpuVal = typeof telemetry?.cpu === 'number' && !isNaN(telemetry.cpu) ? telemetry.cpu.toFixed(1) : '0.0';
  const fpsVal = typeof telemetry?.framerate === 'number' && !isNaN(telemetry.framerate) ? telemetry.framerate.toFixed(0) : '0';
  const memVal = typeof telemetry?.memory === 'number' && !isNaN(telemetry.memory) ? telemetry.memory.toFixed(1) : '0.0';
  const entityVal = typeof telemetry?.entity_count === 'number' && !isNaN(telemetry.entity_count) ? telemetry.entity_count.toLocaleString() : '0';

  const formatUptime = (seconds: number | undefined) => {
    if (!seconds || isNaN(seconds) || seconds <= 0) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const [connectTab, setConnectTab] = useState<'local' | 'lan' | 'public'>('local');

  const getDirectConnect = () => {
    const port = config?.port ?? 28015;
    if (connectTab === 'local') {
      return `client.connect 127.0.0.1:${port}`;
    }
    if (connectTab === 'lan') {
      const lan = netInfo?.lan_ip && netInfo.lan_ip !== '127.0.0.1' ? netInfo.lan_ip : '127.0.0.1';
      return `client.connect ${lan}:${port}`;
    }
    const ip = netInfo?.public_ip && netInfo.public_ip !== 'Offline' ? netInfo.public_ip : netInfo?.lan_ip || '127.0.0.1';
    return `client.connect ${ip}:${port}`;
  };

  const copyConnectString = () => {
    navigator.clipboard.writeText(getDirectConnect());
    setCopiedConnect(true);
    setTimeout(() => setCopiedConnect(false), 2000);
  };

  const handleOpenRename = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    setOpenMenuProfileId(null);
    setRenameTarget({ id, name: currentName });
    setRenameInput(currentName);
  };

  const handleOpenDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setOpenMenuProfileId(null);
    setDeleteTarget({ id, name });
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameInput.trim()) return;
    setIsActionSubmitting(true);
    try {
      await onRenameProfile(renameTarget.id, renameInput.trim());
      setRenameTarget(null);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsActionSubmitting(true);
    try {
      await onDeleteProfile(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const safeProfiles = profilesData?.profiles || [];

  return (
    <div
      className="w-full h-full overflow-y-auto px-8 pt-7 pb-16"
      onClick={() => setOpenMenuProfileId(null)}
    >
      <div className="max-w-7xl mx-auto space-y-6 text-neutral-100">
        {/* Top Header: Command Status & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono">
                Command Center
              </h1>
              <span className="text-[10px] font-mono font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded">
                DEDICATED INSTANCE
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 font-sans">
              Active Host: <span className="text-neutral-200 font-semibold">{steamPersonaName || 'Administrator'}</span> • Monitor telemetry, map generation, and server lifecycle
            </p>
          </div>

          {/* Search Bar & Status */}
          <div className="flex items-center space-x-3">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter instances & settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#13161c] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500/50"
              />
            </div>

            <div className="w-8 h-8 rounded-lg bg-[#13161c] border border-white/[0.08] flex items-center justify-center text-neutral-400 shadow-sm" title="System Ready">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
        </div>

        {/* Rust Server Installation Warning Banner */}
        {(!steamStatus?.is_rust_installed || !steamStatus?.is_valid) && (
          <div className="bg-[#171412] border border-amber-500/30 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-amber-200 uppercase tracking-wide font-mono">
                  Rust Dedicated Server Binaries Missing
                </div>
                <p className="text-xs text-neutral-300 mt-0.5 max-w-2xl leading-relaxed">
                  RustDedicated.exe was not detected at <code className="text-amber-300 bg-black/40 px-1.5 py-0.5 rounded border border-white/10 font-mono">{config?.install_path || 'No path configured'}</code>.
                  Pick an existing server directory or install automatically via SteamCMD in Settings.
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2 shrink-0">
              <button
                onClick={onBrowseFolder}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-200 text-xs font-medium transition-colors flex items-center space-x-1.5"
              >
                <Folder className="w-3.5 h-3.5 text-orange-400" />
                <span>Choose Folder</span>
              </button>
              <button
                onClick={onAutoDetect}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-200 text-xs font-medium transition-colors flex items-center space-x-1.5"
              >
                <Compass className="w-3.5 h-3.5 text-orange-400" />
                <span>Auto-Detect</span>
              </button>
              <button
                onClick={() => onNavigate('settings')}
                className="px-3.5 py-1.5 rounded-lg bg-[#ce422b] hover:bg-[#b03420] text-white text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install Server</span>
              </button>
            </div>
          </div>
        )}

        {/* FIRST LAUNCH EMPTY STATE */}
        {!hasCreatedServer ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <div
              onClick={onOpenCreateWizard}
              className="group relative cursor-pointer w-full max-w-lg rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-[#13161c] border border-white/[0.08] hover:border-orange-500/40 transition-all duration-200 shadow-xl"
            >
              <div className="mb-4">
                <RustLogo size="xl" />
              </div>

              <h2 className="text-base font-black text-white uppercase tracking-wider font-mono mb-2 group-hover:text-orange-400 transition-colors">
                CONFIGURE DEDICATED RUST SERVER
              </h2>
              <p className="text-xs text-neutral-400 max-w-sm leading-relaxed mb-5 font-sans">
                Deploy your high-performance Rust server with Vanilla, Oxide, or Carbon mod frameworks, world seeds, ports, and permissions.
              </p>

              <span className="px-5 py-2.5 rounded-lg bg-[#ce422b] hover:bg-[#b03420] text-white text-xs font-bold transition-all shadow-md flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>Create Server Instance</span>
              </span>
            </div>
          </div>
        ) : (
          /* CREATED SERVERS PRESENTATION: Hero Card & Server Instances */
          <>
            {/* Hero Banner: Live Server Spotlight */}
            <div className="relative rounded-2xl overflow-hidden border border-white/[0.07] shadow-xl bg-[#13161c] p-6">
              <div className="absolute inset-0 bg-gradient-to-r from-[#111319] via-[#111319]/95 to-transparent pointer-events-none z-0" />
              <img
                src={heroBannerImg}
                alt="Rust Server Hero"
                className="absolute right-0 top-0 w-1/2 h-full object-cover object-center opacity-10 pointer-events-none"
              />

              <div className="relative z-10 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
                {/* Left Column: Server Identity, Badges, Direct Connect, Actions */}
                <div className="space-y-4 flex-1 min-w-0">
                  {/* Badges Row */}
                  <div className="flex items-center flex-wrap gap-2">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider flex items-center space-x-1.5 ${
                        isRunning
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : isStarting || isStopping
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/15 text-red-400 border border-red-500/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isRunning
                            ? 'bg-emerald-400 animate-pulse'
                            : isStarting || isStopping
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-red-400'
                        }`}
                      />
                      <span>{status.toUpperCase()}</span>
                    </span>

                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-white/[0.05] text-neutral-300 border border-white/[0.08] uppercase tracking-wider">
                      MOD: {(config?.mod_framework || 'Vanilla').toUpperCase()}
                    </span>

                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-white/[0.05] text-neutral-300 border border-white/[0.08]">
                      {config?.pve ? 'PvE' : 'PvP'} • {config?.worldsize ?? 3000}m
                    </span>

                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-white/[0.05] text-neutral-300 border border-white/[0.08]">
                      {telemetry.players || 0}/{config?.max_players || 100} Players
                    </span>
                  </div>

                  {/* Hostname Heading */}
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight leading-tight">
                      {config?.hostname || 'Epic Rust Server'}
                    </h2>
                    <p className="text-xs text-neutral-400 font-normal mt-1 max-w-lg leading-relaxed line-clamp-2">
                      {config?.description || 'High performance Rust dedicated server instance with isolated profile state.'}
                    </p>
                  </div>

                  {/* Direct Connect Command Bar */}
                  <div className="space-y-1.5 pt-1 max-w-xl">
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => setConnectTab('local')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center space-x-1 ${
                          connectTab === 'local'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'text-neutral-400 hover:text-white bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <span>Localhost</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConnectTab('lan')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center space-x-1 ${
                          connectTab === 'lan'
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                            : 'text-neutral-400 hover:text-white bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <Wifi className="w-3 h-3" />
                        <span>LAN</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConnectTab('public')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center space-x-1 ${
                          connectTab === 'public'
                            ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                            : 'text-neutral-400 hover:text-white bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <Globe className="w-3 h-3" />
                        <span>WAN / Public</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="px-3 py-1.5 rounded-lg bg-black/50 border border-white/[0.08] text-xs font-mono text-neutral-300 flex items-center space-x-2 flex-1 overflow-hidden shadow-inner">
                        <span className="text-neutral-500 font-sans shrink-0">Command:</span>
                        <span className="text-orange-400 font-bold truncate">{getDirectConnect()}</span>
                      </div>
                      <button
                        type="button"
                        onClick={copyConnectString}
                        className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white transition-colors shrink-0"
                        title="Copy connect string"
                      >
                        {copiedConnect ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 pt-2">
                    {isRunning ? (
                      <button
                        onClick={onStopServer}
                        disabled={isActionLoading}
                        className="px-5 py-2 rounded-lg bg-[#ce422b] hover:bg-[#b03420] text-white font-semibold text-xs flex items-center space-x-2 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop Server</span>
                      </button>
                    ) : isStarting ? (
                      <button
                        disabled
                        className="px-5 py-2 rounded-lg bg-amber-600/70 text-white font-semibold text-xs flex items-center space-x-2"
                      >
                        <Play className="w-3.5 h-3.5 fill-current animate-pulse" />
                        <span>Starting Server...</span>
                      </button>
                    ) : (
                      <button
                        onClick={onStartServer}
                        disabled={isActionLoading || (!steamStatus?.is_rust_installed || !steamStatus?.is_valid)}
                        className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-2 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Server</span>
                      </button>
                    )}

                    <button
                      onClick={onRestartServer}
                      disabled={!isRunning || isActionLoading}
                      className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white transition-colors disabled:opacity-30"
                      title="Restart Server"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onNavigate('maps')}
                      className="px-3.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium transition-colors flex items-center space-x-1.5"
                    >
                      <Compass className="w-3.5 h-3.5 text-orange-400" />
                      <span>Map Details</span>
                    </button>
                  </div>
                </div>

                {/* Right Column: Real Map Preview Card */}
                <div className="w-full lg:w-72 shrink-0">
                  <MapPreview
                    seed={config?.seed ?? 1337}
                    worldsize={config?.worldsize ?? 3000}
                    isProcedural={true}
                    compact={true}
                  />
                </div>
              </div>
            </div>

            {/* SERVER INSTANCES SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <h3 className="text-xs font-bold text-white tracking-wider uppercase font-mono">
                    Configured Server Instances
                  </h3>
                </div>
                <span className="text-xs text-neutral-500 font-mono">
                  {safeProfiles.length} Profiles
                </span>
              </div>

              {/* Grid of Server Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {safeProfiles.map((prof) => {
                  const isActive = prof.id === profilesData?.active_profile_id;
                  const framework = prof.config?.mod_framework || 'vanilla';
                  const isMenuOpen = openMenuProfileId === prof.id;

                  return (
                    <div
                      key={prof.id}
                      onClick={() => onSelectProfile(prof.id)}
                      className={`relative rounded-xl p-4 cursor-pointer transition-all duration-150 flex flex-col justify-between shadow-sm ${
                        isActive
                          ? 'bg-[#151922] border border-orange-500/50 shadow-orange-950/20'
                          : 'bg-[#13161c] border border-white/[0.06] hover:border-white/[0.12]'
                      }`}
                    >
                      <div className="space-y-2.5">
                        {/* Top Bar */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-white/[0.05] text-neutral-300 border border-white/[0.08]">
                              {framework}
                            </span>

                            {isActive && (
                              <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 px-2 py-0.5 rounded border border-orange-500/30 flex items-center space-x-1 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                <span>ACTIVE</span>
                              </span>
                            )}
                          </div>

                          {/* 3 DOTS MENU */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuProfileId(isMenuOpen ? null : prof.id);
                              }}
                              className="p-1 rounded-md bg-white/[0.04] hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-colors"
                              title="Server Options"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {isMenuOpen && (
                              <div
                                className="absolute right-0 top-7 w-40 rounded-xl bg-[#161922] border border-white/[0.1] shadow-2xl p-1 z-50 animate-in fade-in duration-150"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenRename(e, prof.id, prof.name)}
                                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                                >
                                  <Edit2 className="w-3 h-3 text-orange-400" />
                                  <span>Rename</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => handleOpenDelete(e, prof.id, prof.name)}
                                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-bold text-white truncate">
                            {prof.name}
                          </h4>
                          <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                            Port {prof.config?.port ?? 28015} • Max {prof.config?.max_players ?? 50} Players
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 flex items-center justify-between text-xs font-mono text-neutral-400 border-t border-white/[0.05] mt-3">
                        <span>Map: {prof.config?.worldsize ?? 3000}m</span>
                        <span className="text-orange-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center text-[11px]">
                          Select <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* PLUS CARD */}
                <div
                  onClick={onOpenCreateWizard}
                  className="group relative cursor-pointer rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all border border-dashed border-white/[0.12] hover:border-orange-500/40 bg-[#111319] hover:bg-[#131720] min-h-[130px]"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] group-hover:border-orange-500/40 flex items-center justify-center text-neutral-400 group-hover:text-orange-400 mb-2 transition-colors">
                    <Plus className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-white group-hover:text-orange-400 transition-colors">
                    Add New Server
                  </h4>
                  <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                    Configure another instance
                  </p>
                </div>
              </div>
            </div>

            {/* 4 Telemetry Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="ONLINE PLAYERS"
                value={isRunning ? `${telemetry?.players ?? 0} / ${config?.max_players ?? 50}` : '0 / 0'}
                subtext={
                  isRunning
                    ? `Queued: ${telemetry?.queued_players ?? 0} | Joining: ${telemetry?.joining_players ?? 0}`
                    : 'Server offline'
                }
                icon={Users}
                badge={isRunning ? 'ACTIVE' : 'OFFLINE'}
                badgeColor={isRunning ? 'emerald' : 'amber'}
              />

              <StatCard
                title="CPU UTILIZATION"
                value={isRunning ? `${cpuVal}%` : '0.0%'}
                subtext={isRunning ? `Server Tickrate: ${fpsVal} FPS` : 'Halted'}
                icon={Activity}
                badge="PROCESS"
                badgeColor={isRunning ? 'emerald' : 'amber'}
              />

              <StatCard
                title="RAM WORKING SET"
                value={isRunning ? `${memVal} MB` : '0 MB'}
                subtext={`World Entities: ${entityVal}`}
                icon={Cpu}
                badge="PHYSICAL"
                badgeColor="blue"
              />

              <StatCard
                title="SERVER UPTIME"
                value={isRunning ? formatUptime(telemetry?.uptime) : 'Offline'}
                subtext={isRunning ? 'Process Active' : 'Process Halted'}
                icon={Clock}
                badgeColor={isRunning ? 'emerald' : 'amber'}
              />
            </div>

            {/* Detail Cards: Endpoints, World Identity & Console Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Network Endpoints */}
              <div className="bg-[#13161c] border border-white/[0.07] rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2 font-mono">
                    <Globe className="w-3.5 h-3.5 text-orange-400" />
                    <span>Network Endpoints</span>
                  </h3>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Ready
                  </span>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                    <span className="text-neutral-400 flex items-center space-x-2">
                      <Wifi className="w-3.5 h-3.5 text-neutral-500" />
                      <span>LAN IP</span>
                    </span>
                    <span className="text-neutral-200">{netInfo?.lan_ip || '127.0.0.1'}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                    <span className="text-neutral-400 flex items-center space-x-2">
                      <Globe className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Public IP</span>
                    </span>
                    <span className="text-neutral-200">{netInfo?.public_ip || 'Offline'}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/[0.04]">
                    <span className="text-neutral-400 flex items-center space-x-2">
                      <Radio className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Game Port</span>
                    </span>
                    <span className="text-orange-400 font-bold">{config?.port ?? 28015}</span>
                  </div>
                </div>
              </div>

              {/* World State */}
              <div className="bg-[#13161c] border border-white/[0.07] rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2 font-mono">
                    <MapPin className="w-3.5 h-3.5 text-orange-400" />
                    <span>World Generation</span>
                  </h3>
                  <button
                    onClick={() => onNavigate('maps')}
                    className="text-xs text-orange-400 hover:text-orange-300 font-semibold"
                  >
                    Configure
                  </button>
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.04] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Map Type:</span>
                      <span className="text-neutral-200 font-bold">
                        {config?.is_procedural ? 'Procedural Map' : 'Custom Map'}
                      </span>
                    </div>
                    {config?.is_procedural && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-neutral-400">Seed:</span>
                          <span className="text-orange-400">{config?.seed ?? 1337}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-400">World Size:</span>
                          <span className="text-orange-400">{config?.worldsize ?? 3000}m</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="p-2 rounded-lg bg-black/40 border border-white/[0.04] flex justify-between items-center">
                    <div>
                      <span className="text-neutral-500 block text-[9px] uppercase">Identity Folder</span>
                      <span className="text-neutral-200 font-bold">{config?.identity || 'default'}</span>
                    </div>
                    <button
                      onClick={() => onNavigate('saves')}
                      className="px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-white text-[11px] font-semibold"
                    >
                      Backups
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Console Stream */}
              <div className="bg-[#13161c] border border-white/[0.07] rounded-xl p-4 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] mb-2">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2 font-mono">
                      <Database className="w-3.5 h-3.5 text-orange-400" />
                      <span>Console Stream</span>
                    </h3>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {recentLogs.length} events
                    </span>
                  </div>

                  <div className="space-y-1.5 font-mono text-[11px] overflow-hidden max-h-36">
                    {recentLogs.slice(-4).map((log, i) => (
                      <div key={i} className="truncate">
                        <span
                          className={`mr-2 font-bold ${
                            log?.source === 'Stderr'
                              ? 'text-red-400'
                              : log?.source === 'Rcon'
                              ? 'text-amber-400'
                              : log?.source === 'System'
                              ? 'text-sky-400'
                              : 'text-neutral-400'
                          }`}
                        >
                          [{log?.source || 'Info'}]
                        </span>
                        <span className="text-neutral-300">{log?.message || ''}</span>
                      </div>
                    ))}
                    {recentLogs.length === 0 && (
                      <p className="text-neutral-500 italic py-3 text-center">No terminal logs recorded yet.</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onNavigate('console')}
                  className="w-full mt-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-neutral-200 hover:text-white text-xs font-semibold transition-colors"
                >
                  Open Live Terminal
                </button>
              </div>
            </div>
          </>
        )}

        {/* RENAME SERVER MODAL */}
        {renameTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            onClick={() => setRenameTarget(null)}
          >
            <div
              className="w-full max-w-md bg-[#161922] border border-white/[0.1] rounded-xl p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center space-x-2">
                  <Edit2 className="w-4 h-4 text-orange-400" />
                  <h3 className="text-sm font-bold text-white uppercase font-mono">Rename Server Profile</h3>
                </div>
                <button
                  onClick={() => setRenameTarget(null)}
                  className="p-1 rounded-md text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmRename} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1 uppercase font-mono">
                    Profile Name
                  </label>
                  <input
                    type="text"
                    value={renameInput}
                    onChange={(e) => setRenameInput(e.target.value)}
                    placeholder="Enter server display name..."
                    autoFocus
                    required
                    className="w-full bg-[#111319] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500/50"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRenameTarget(null)}
                    className="px-3.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isActionSubmitting || !renameInput.trim()}
                    className="px-4 py-1.5 rounded-lg bg-[#ce422b] hover:bg-[#b03420] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {isActionSubmitting ? 'Saving...' : 'Save Name'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DELETE SERVER CONFIRMATION MODAL */}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <div
              className="w-full max-w-md bg-[#161922] border border-white/[0.1] rounded-xl p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center space-x-2.5 text-red-400">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase font-mono">Delete Server Profile</h3>
                  <p className="text-[11px] text-neutral-400">This action cannot be undone.</p>
                </div>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                Are you sure you want to delete server profile <span className="font-bold text-white bg-black/40 px-1.5 py-0.5 rounded border border-white/10 font-mono">{deleteTarget.name}</span> from the launcher?
              </p>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isActionSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isActionSubmitting ? 'Deleting...' : 'Delete Server'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
