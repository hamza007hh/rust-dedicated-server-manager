import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle, Eye, EyeOff, RotateCcw, Layers, AlertTriangle } from 'lucide-react';
import { ServerConfig, ServerStatus, ModFrameworkType } from '../types/server';
import { Modal } from '../components/Modal';
import { LiveServerRules } from '../components/LiveServerRules';
import { ServerCfgEditor } from '../components/ServerCfgEditor';
import { LaunchArgsEditor } from '../components/LaunchArgsEditor';
import { ServerAdminsManager } from '../components/ServerAdminsManager';
import { api } from '../services/api';

interface ServerPageProps {
  config: ServerConfig;
  status: ServerStatus;
  onSaveConfig: (updated: ServerConfig) => Promise<void>;
}

export const ServerPage: React.FC<ServerPageProps> = ({
  config,
  status,
  onSaveConfig,
}) => {
  const isRunning = status === 'running' || status === 'starting';

  const [form, setForm] = useState<ServerConfig>({ ...config });
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);

  // Advanced Change Mod Framework state
  const [isChangeFrameworkOpen, setIsChangeFrameworkOpen] = useState(false);
  const [targetFramework, setTargetFramework] = useState<ModFrameworkType>(form.mod_framework || 'vanilla');
  const [frameworkConfirmed, setFrameworkConfirmed] = useState(false);
  const [isSwitchingFramework, setIsSwitchingFramework] = useState(false);
  const [frameworkSwitchError, setFrameworkSwitchError] = useState<string | null>(null);
  const [isCreatingPreBackup, setIsCreatingPreBackup] = useState(false);
  const [preBackupSuccess, setPreBackupSuccess] = useState<string | null>(null);

  // Sync state if external config updates while not dirty
  useEffect(() => {
    setForm({ ...config });
    setTargetFramework(config.mod_framework || 'vanilla');
  }, [config]);

  // Unsaved changes detection
  const isDirty = JSON.stringify(form) !== JSON.stringify(config);

  const validate = (): string[] => {
    const errors: string[] = [];

    if (!form.identity.trim()) {
      errors.push('Server Identity cannot be empty.');
    }
    if (form.identity.includes(' ') || !/^[a-zA-Z0-9_-]+$/.test(form.identity)) {
      errors.push('Server Identity must be alphanumeric without spaces (only letters, numbers, _, -).');
    }
    if (!form.hostname.trim()) {
      errors.push('Server Hostname cannot be empty.');
    }

    // Ports
    if (isNaN(form.port) || form.port < 1024 || form.port > 65535) {
      errors.push('Game Port must be between 1024 and 65535.');
    }
    if (isNaN(form.rcon_port) || form.rcon_port < 1024 || form.rcon_port > 65535) {
      errors.push('RCON Port must be between 1024 and 65535.');
    }
    if (form.port === form.rcon_port) {
      errors.push('Game Port and RCON Port cannot be the same.');
    }
    if (form.query_port && (form.query_port === form.port || form.query_port === form.rcon_port)) {
      errors.push('Query Port cannot collide with Game or RCON Port.');
    }

    if (!form.rcon_password.trim()) {
      errors.push('RCON Password cannot be empty.');
    }

    // Gameplay limits
    if (isNaN(form.max_players) || form.max_players < 1 || form.max_players > 500) {
      errors.push('Max Players must be between 1 and 500.');
    }
    if (isNaN(form.tickrate) || form.tickrate < 10 || form.tickrate > 100) {
      errors.push('Tickrate must be between 10 and 100.');
    }

    return errors;
  };

  const handleChange = <K extends keyof ServerConfig>(field: K, val: ServerConfig[K]) => {
    setForm((prev) => ({ ...prev, [field]: val }));
    setSavedSuccess(false);
    setErrorMsg(null);
  };

  const handleReset = () => {
    if (isDirty) {
      setIsDiscardModalOpen(true);
    } else {
      setForm({ ...config });
      setValidationErrors([]);
      setErrorMsg(null);
    }
  };

  const handleConfirmDiscard = () => {
    setForm({ ...config });
    setValidationErrors([]);
    setErrorMsg(null);
    setIsDiscardModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    setValidationErrors(errors);

    if (errors.length > 0) {
      setErrorMsg('Please resolve all validation errors before saving.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      await onSaveConfig(form);
      setSavedSuccess(true);
      setValidationErrors([]);
      setForm({ ...form });
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmFrameworkChange = async () => {
    if (!frameworkConfirmed || isRunning) return;
    setIsSwitchingFramework(true);
    setFrameworkSwitchError(null);
    try {
      const updatedConfig = await api.changeModFramework(targetFramework);
      setForm(updatedConfig);
      await onSaveConfig(updatedConfig);
      setIsChangeFrameworkOpen(false);
      setSavedSuccess(true);
    } catch (e: any) {
      setFrameworkSwitchError(e?.message || String(e));
    } finally {
      setIsSwitchingFramework(false);
    }
  };

  const handleCreatePreBackup = async () => {
    setIsCreatingPreBackup(true);
    try {
      const backupPath = await api.createBackup('pre_framework_switch');
      setPreBackupSuccess(`Backup created at: ${backupPath}`);
    } catch (e: any) {
      setFrameworkSwitchError(`Backup failed: ${e?.message || e}`);
    } finally {
      setIsCreatingPreBackup(false);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto px-8 pt-9 pb-16">
      <div className="max-w-5xl mx-auto space-y-6 text-neutral-100">
        {/* Page Header */}
      <div className="flex items-center justify-between pb-4 border-b border-dark-border">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Save className="w-5 h-5 text-rust-500" />
            <span>Server Configuration</span>
          </h2>
          <p className="text-xs text-slate-400">
            Configure server identity, network ports, gameplay parameters, and startup arguments.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border hover:border-slate-700 text-xs text-slate-300 font-mono transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white font-medium text-xs font-mono shadow-lg shadow-rust-600/20 disabled:opacity-50 transition-all"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save & Sync server.cfg</span>
          </button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      {isDirty && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between font-mono animate-in fade-in duration-150">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>You have unsaved changes in your server configuration.</span>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold"
          >
            Save Changes
          </button>
        </div>
      )}

      {savedSuccess && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center space-x-2 font-mono">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Configuration saved and atomically synchronized to server.cfg!</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center space-x-2 font-mono">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isRunning && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center space-x-2 font-mono">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Server is active. Configuration updates will be written to server.cfg and take full effect on the next restart.</span>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 space-y-1 font-mono">
          <div className="font-bold flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4" />
            <span>Configuration Errors ({validationErrors.length}):</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 pl-2 text-slate-300">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Identity & Branding */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 uppercase font-mono tracking-wider border-b border-dark-border pb-2">
            1. Identity & Branding
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Server Hostname</label>
              <input
                type="text"
                value={form.hostname}
                onChange={(e) => handleChange('hostname', e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Server Identity (Save Directory)</label>
              <input
                type="text"
                value={form.identity}
                onChange={(e) => handleChange('identity', e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Server Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Header Image URL</label>
              <input
                type="text"
                placeholder="https://example.com/banner.jpg"
                value={form.header_image || ''}
                onChange={(e) => handleChange('header_image', e.target.value || null)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Website URL</label>
              <input
                type="text"
                placeholder="https://example.com"
                value={form.url || ''}
                onChange={(e) => handleChange('url', e.target.value || null)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
          </div>
        </div>

        {/* Mod Framework Display & Advanced Action */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-dark-border pb-2">
            <h3 className="text-sm font-semibold text-slate-200 uppercase font-mono tracking-wider flex items-center space-x-2">
              <Layers className="w-4 h-4 text-rust-500" />
              <span>Modding Framework</span>
            </h3>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-mono uppercase font-bold border ${
                form.mod_framework === 'carbon'
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : form.mod_framework === 'oxide'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Framework: {(form.mod_framework || 'vanilla').toUpperCase()}
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-1">
            <div className="space-y-1">
              <p className="text-xs text-slate-300 font-mono">
                Current Framework: <strong className="text-rust-400 uppercase">{form.mod_framework || 'vanilla'}</strong>
              </p>
              <p className="text-[11px] text-slate-400">
                {form.mod_framework === 'carbon'
                  ? 'Carbon Community modding framework is active. High-performance C# hooks and plugins enabled.'
                  : form.mod_framework === 'oxide'
                  ? 'Oxide.Rust (uMod) framework is active. Standard uMod C# plugin loader enabled.'
                  : 'Official Vanilla server. No modding framework installed. Plugins are unavailable.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setTargetFramework(form.mod_framework || 'vanilla');
                setFrameworkConfirmed(false);
                setFrameworkSwitchError(null);
                setPreBackupSuccess(null);
                setIsChangeFrameworkOpen(true);
              }}
              disabled={isRunning}
              title={isRunning ? 'Server must be stopped to change framework' : 'Change modding framework'}
              className="px-3.5 py-2 rounded-xl bg-dark-bg hover:bg-dark-elevated border border-dark-border text-slate-200 text-xs font-mono font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 flex items-center space-x-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-rust-500" />
              <span>Change Mod Framework...</span>
            </button>
          </div>
          {isRunning && (
            <p className="text-[10px] text-amber-400/80 font-mono">
              Note: Framework modification is locked while the server is running. Stop the server first to switch frameworks.
            </p>
          )}
        </div>

        {/* 2. Network & Ports */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 uppercase font-mono tracking-wider border-b border-dark-border pb-2">
            2. Network & Ports
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Game Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => handleChange('port', parseInt(e.target.value) || 0)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Query Port</label>
              <input
                type="number"
                value={form.query_port || form.port + 2}
                onChange={(e) => handleChange('query_port', parseInt(e.target.value) || null)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">RCON Port</label>
              <input
                type="number"
                value={form.rcon_port}
                onChange={(e) => handleChange('rcon_port', parseInt(e.target.value) || 0)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">RCON Password</label>
              <div className="flex space-x-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.rcon_password}
                  onChange={(e) => handleChange('rcon_password', e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-slate-400 hover:text-slate-200"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Gameplay & World Parameters */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 uppercase font-mono tracking-wider border-b border-dark-border pb-2">
            3. Gameplay & Performance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Max Players</label>
              <input
                type="number"
                min="1"
                max="500"
                value={form.max_players}
                onChange={(e) => handleChange('max_players', parseInt(e.target.value) || 0)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Tickrate</label>
              <input
                type="number"
                min="10"
                max="100"
                value={form.tickrate}
                onChange={(e) => handleChange('tickrate', parseInt(e.target.value) || 0)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Gamemode</label>
              <input
                type="text"
                value={form.gamemode}
                onChange={(e) => handleChange('gamemode', e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center space-x-2 text-xs font-medium text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pve}
                  onChange={(e) => handleChange('pve', e.target.checked)}
                  className="rounded border-dark-border text-rust-600 focus:ring-rust-500 bg-dark-bg"
                />
                <span>Enable PvE Mode</span>
              </label>
            </div>
          </div>
        </div>

        {/* 4. Live Server Rules (Image 1 & 2) */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
          <LiveServerRules
            rules={form.server_rules || {
              bradley_apc: true,
              timed_events: true,
              cargo_ship: true,
              radiation: true,
              scientists_npcs: true,
              structural_stability: true,
              halloween_event: false,
              christmas_event: false,
              no_animals: false,
              passive_scientists: false,
              lock_time_16_8: false,
              lock_clear_weather: false,
              spawn_loot_on_start: false,
              no_building_upkeep: false,
              no_decay: false,
              instant_craft: false,
              relaxed_anti_cheat: false,
              creative_mode: false,
              free_build: false,
              free_placement: false,
              free_repair: false,
              unlimited_io: false,
              instant_placement: false,
              always_on_entities: false,
              skip_ai_navmesh: false,
            }}
            status={status}
            onRulesChanged={(newRules) => handleChange('server_rules', newRules)}
          />
        </div>

        {/* 5. Server Owners & Admins (SteamID64) */}
        <ServerAdminsManager
          status={status}
          serverIdentity={form.identity}
        />

        {/* 6. server.cfg (Advanced Editor - Image 3) */}
        <ServerCfgEditor
          serverIdentity={form.identity}
        />

        {/* 7. Launch arguments (Advanced Editor - Image 4) */}
        <LaunchArgsEditor
          serverIdentity={form.identity}
          onArgsSaved={(args) => handleChange('custom_args', args)}
        />
      </form>

      {/* Advanced Change Mod Framework Modal */}
      {isChangeFrameworkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2.5 border-b border-dark-border pb-3">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-100 font-mono uppercase tracking-wider">
                Change Mod Framework (Advanced)
              </h3>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono space-y-2">
              <div className="font-bold flex items-center space-x-1.5">
                <span>⚠ Warning: Modifies Server Files</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
                Changing mod framework replaces core game binaries in <code>RustDedicated_Data/Managed</code> and can affect existing plugins, configuration files, and server stability.
              </p>
            </div>

            {/* Backup suggestion */}
            <div className="p-3 bg-dark-bg border border-dark-border rounded-xl flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-slate-300 font-semibold block">Recommended: Create Backup</span>
                <span className="text-[11px] text-slate-500">Save current server files before switching.</span>
              </div>
              <button
                type="button"
                onClick={handleCreatePreBackup}
                disabled={isCreatingPreBackup}
                className="px-3 py-1.5 rounded-lg bg-dark-card hover:bg-dark-elevated border border-dark-border text-slate-200 text-xs font-mono flex items-center space-x-1"
              >
                {isCreatingPreBackup ? <RefreshCw className="w-3 h-3 animate-spin" /> : <span>Create Backup</span>}
              </button>
            </div>

            {preBackupSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono">
                ✓ {preBackupSuccess}
              </div>
            )}

            {frameworkSwitchError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-mono">
                ⚠ {frameworkSwitchError}
              </div>
            )}

            {/* Framework options */}
            <div className="space-y-2 text-xs font-mono">
              <span className="text-slate-400 block mb-1">Target Framework:</span>
              <div className="grid grid-cols-3 gap-2">
                {(['vanilla', 'carbon', 'oxide'] as ModFrameworkType[]).map((fw) => (
                  <button
                    key={fw}
                    type="button"
                    onClick={() => setTargetFramework(fw)}
                    className={`p-3 rounded-xl border text-center uppercase font-bold transition-all ${
                      targetFramework === fw
                        ? 'bg-rust-600/20 border-rust-500 text-rust-300 shadow-sm'
                        : 'bg-dark-bg border-dark-border text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {fw}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirmation checkbox */}
            <label className="flex items-start space-x-2 pt-2 text-xs font-mono text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={frameworkConfirmed}
                onChange={(e) => setFrameworkConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-dark-border text-rust-600 focus:ring-rust-500 bg-dark-bg"
              />
              <span>I understand that changing mod framework modifies game files and server binaries.</span>
            </label>

            {/* Action buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-dark-border">
              <button
                type="button"
                onClick={() => setIsChangeFrameworkOpen(false)}
                disabled={isSwitchingFramework}
                className="px-4 py-2 rounded-xl bg-dark-bg hover:bg-dark-elevated text-slate-300 border border-dark-border text-xs font-mono"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFrameworkChange}
                disabled={!frameworkConfirmed || isSwitchingFramework || isRunning}
                className="px-5 py-2 rounded-xl bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono font-bold shadow-lg shadow-rust-600/20 disabled:opacity-50 transition-all flex items-center space-x-1.5"
              >
                {isSwitchingFramework && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSwitchingFramework ? 'Switching...' : 'Confirm Framework Switch'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard Confirmation Modal */}
      <Modal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        onConfirm={handleConfirmDiscard}
        title="Discard Unsaved Changes?"
        description="You have unsaved configuration changes. Are you sure you want to discard your changes and reload saved settings?"
        confirmText="Yes, Discard Changes"
        isDestructive={true}
      />
      </div>
    </div>
  );
};
