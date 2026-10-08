import React, { useState, useEffect, useCallback } from 'react';
import { Map, Dices, AlertTriangle, CheckCircle, RefreshCw, Globe, Layers } from 'lucide-react';
import { ServerConfig, ServerStatus, WipeResult, CurrentMapInfo } from '../types/server';
import { Modal } from '../components/Modal';
import { MapPreview } from '../components/MapPreview';
import { api } from '../services/api';

interface MapsPageProps {
  config: ServerConfig;
  status: ServerStatus;
  onChangeProcedural: (seed: number, worldsize: number) => Promise<void>;
  onChangeCustom: (url: string) => Promise<void>;
  onWipeProcedural: () => Promise<WipeResult>;
}

export const MapsPage: React.FC<MapsPageProps> = ({
  config,
  status,
  onChangeProcedural,
  onChangeCustom,
  onWipeProcedural,
}) => {
  const isServerRunning = status !== 'stopped';

  const [mapType, setMapType] = useState<'procedural' | 'custom'>(
    config.is_procedural ? 'procedural' : 'custom'
  );
  const [seed, setSeed] = useState<number>(config.seed);
  const [worldsize, setWorldsize] = useState<number>(config.worldsize);
  const [customUrl, setCustomUrl] = useState<string>(config.level_url || '');

  const [mapInfo, setMapInfo] = useState<CurrentMapInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isWiping, setIsWiping] = useState<boolean>(false);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState<boolean>(false);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const fetchMapInfo = useCallback(async () => {
    setIsLoadingInfo(true);
    try {
      const info = await api.getMapInfo();
      setMapInfo(info);
      setSeed(info.seed);
      setWorldsize(info.worldsize);
      if (info.level_url) {
        setCustomUrl(info.level_url);
      }
      setMapType(info.is_procedural ? 'procedural' : 'custom');
    } catch (e: any) {
      console.warn('Failed to load map info:', e);
    } finally {
      setIsLoadingInfo(false);
    }
  }, []);

  useEffect(() => {
    fetchMapInfo();
  }, [fetchMapInfo, config]);

  const handleRandomizeSeed = () => {
    if (isServerRunning) return;
    const randomSeed = Math.floor(Math.random() * 2147483647);
    setSeed(randomSeed);
    setValidationErrors([]);
  };

  const validate = (): string[] => {
    const errors: string[] = [];
    if (mapType === 'procedural') {
      if (isNaN(seed) || seed < 0 || seed > 2147483647) {
        errors.push('Seed must be a positive integer between 0 and 2,147,483,647.');
      }
      if (isNaN(worldsize) || worldsize < 1000 || worldsize > 6000) {
        errors.push('World size must be between 1,000 and 6,000 meters.');
      }
    } else {
      if (!customUrl.trim()) {
        errors.push('Custom map URL cannot be empty.');
      } else if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://')) {
        errors.push('Custom map URL must begin with http:// or https://');
      }
    }
    return errors;
  };

  const handleApplyMap = async () => {
    if (isServerRunning) {
      setErrorMsg('Cannot change map while the server is active. Please stop the server first.');
      return;
    }

    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) {
      setErrorMsg('Please fix the validation errors before applying.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsApplying(true);

    try {
      if (mapType === 'procedural') {
        await onChangeProcedural(seed, worldsize);
        setSuccessMsg(`Procedural map configured successfully (Seed: ${seed}, Size: ${worldsize}m).`);
      } else {
        await onChangeCustom(customUrl.trim());
        setSuccessMsg('Custom map URL configured successfully.');
      }
      await fetchMapInfo();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update map configuration.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleConfirmWipe = async () => {
    setIsWipeModalOpen(false);
    if (isServerRunning) {
      setErrorMsg('Cannot wipe world while the server is running. Stop the server first.');
      return;
    }

    setIsWiping(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await onWipeProcedural();
      setSuccessMsg(
        `Procedural map wiped (${res.deleted_files.length} save files removed, blueprints preserved).`
      );
      await fetchMapInfo();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to wipe procedural map.');
    } finally {
      setIsWiping(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="w-full h-full overflow-y-auto px-8 pt-9 pb-16">
      <div className="max-w-5xl mx-auto space-y-6 text-neutral-100">
        {/* Page Header */}
      <div className="flex items-center justify-between pb-4 border-b border-dark-border">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Map className="w-5 h-5 text-rust-500" />
            <span>Map Management</span>
          </h2>
          <p className="text-xs text-slate-400">
            Configure procedural generation, custom map URLs, or trigger a clean map wipe.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchMapInfo}
            disabled={isLoadingInfo}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border hover:border-slate-700 text-xs text-slate-300 font-mono transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInfo ? 'animate-spin text-rust-500' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Lock banner if server is running */}
      {isServerRunning && (
        <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <span className="font-bold">Server is currently {status}: </span>
            <span>Map modifications and wipes are locked to prevent save corruption. Stop the server before applying map changes.</span>
          </div>
        </div>
      )}

      {/* Messages */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2 font-mono animate-in fade-in duration-150">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 font-mono animate-in fade-in duration-150">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 space-y-1 font-mono">
          <div className="font-bold flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Input Validation Errors:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 pl-2 text-slate-300">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Current Map Info Card */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-slate-200 font-mono flex items-center space-x-2">
            <Globe className="w-4 h-4 text-rust-500" />
            <span>Current Active Map State</span>
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-dark-elevated text-slate-300 border border-dark-border">
            Identity: {config.identity}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
          <div className="p-3 rounded-lg bg-dark-bg/60 border border-dark-border/70">
            <span className="text-slate-400 block text-[11px] mb-1">Active Type</span>
            <span className="text-slate-100 font-bold text-sm">
              {mapInfo ? (mapInfo.is_procedural ? 'Procedural Map' : 'Custom Level URL') : 'Loading...'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-dark-bg/60 border border-dark-border/70">
            <span className="text-slate-400 block text-[11px] mb-1">Seed / Size</span>
            <span className="text-slate-100 font-bold text-sm">
              {mapInfo ? (mapInfo.is_procedural ? `${mapInfo.seed} (${mapInfo.worldsize}m)` : 'Custom Map') : '...'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-dark-bg/60 border border-dark-border/70">
            <span className="text-slate-400 block text-[11px] mb-1">Active Save File</span>
            {mapInfo?.active_save ? (
              <div>
                <span className="text-emerald-400 font-bold text-xs truncate block" title={mapInfo.active_save.file_name}>
                  {mapInfo.active_save.file_name}
                </span>
                <span className="text-[10px] text-slate-500">
                  {formatBytes(mapInfo.active_save.size_bytes)} • {new Date(mapInfo.active_save.modified_millis).toLocaleTimeString()}
                </span>
              </div>
            ) : (
              <span className="text-slate-500 italic text-xs">No active .sav detected</span>
            )}
          </div>
        </div>
      </div>

      {/* Map Mode Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => {
            if (!isServerRunning) setMapType('procedural');
          }}
          disabled={isServerRunning}
          className={`p-4 rounded-xl border text-left transition-all ${
            mapType === 'procedural'
              ? 'bg-rust-600/10 border-rust-500 text-white shadow-md'
              : 'bg-dark-card border-dark-border text-slate-400 hover:border-slate-700'
          } ${isServerRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center space-x-2 font-bold text-sm mb-1 text-slate-200">
            <Layers className="w-4 h-4 text-rust-500" />
            <span>Procedural Map</span>
          </div>
          <p className="text-xs text-slate-400">Standard algorithmically generated island with configurable seed and world size.</p>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!isServerRunning) setMapType('custom');
          }}
          disabled={isServerRunning}
          className={`p-4 rounded-xl border text-left transition-all ${
            mapType === 'custom'
              ? 'bg-rust-600/10 border-rust-500 text-white shadow-md'
              : 'bg-dark-card border-dark-border text-slate-400 hover:border-slate-700'
          } ${isServerRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center space-x-2 font-bold text-sm mb-1 text-slate-200">
            <Globe className="w-4 h-4 text-rust-500" />
            <span>Custom Map URL</span>
          </div>
          <p className="text-xs text-slate-400">Host or download a custom .map file (e.g. RustEdit, custom community islands).</p>
        </button>
      </div>

      {/* Map Parameters Card */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
        {mapType === 'procedural' ? (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 font-mono">Procedural Parameters</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  World Seed (0 - 2,147,483,647)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    min="0"
                    max="2147483647"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                    disabled={isServerRunning || isApplying}
                    className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleRandomizeSeed}
                    disabled={isServerRunning || isApplying}
                    className="px-3 py-2 rounded-lg bg-dark-elevated hover:bg-dark-border border border-dark-border text-slate-300 disabled:opacity-40 transition-colors"
                    title="Generate Random Seed"
                  >
                    <Dices className="w-4 h-4 text-rust-500" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  World Size (1,000m - 6,000m)
                </label>
                <input
                  type="number"
                  step="50"
                  min="1000"
                  max="6000"
                  value={worldsize}
                  onChange={(e) => setWorldsize(parseInt(e.target.value) || 3000)}
                  disabled={isServerRunning || isApplying}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500 disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 font-mono">Custom Map Download URL</h3>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Level URL (.map file HTTP/HTTPS link)
              </label>
              <input
                type="text"
                placeholder="https://example.com/maps/my_custom_island.map"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={isServerRunning || isApplying}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500 disabled:opacity-50"
              />
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-dark-border flex justify-end">
          <button
            type="button"
            onClick={handleApplyMap}
            disabled={isServerRunning || isApplying}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white font-medium text-xs font-mono shadow-lg shadow-rust-600/20 disabled:opacity-40 transition-all"
          >
            {isApplying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Map className="w-3.5 h-3.5" />}
            <span>{isApplying ? 'Applying Map...' : 'Apply Map Configuration'}</span>
          </button>
        </div>
      </div>

      {/* Map Preview & Topology */}
      <MapPreview
        seed={seed}
        worldsize={worldsize}
        isProcedural={mapType === 'procedural'}
        levelUrl={customUrl}
      />

      {/* Procedural Map Wipe Section */}
      <div className="bg-dark-card border border-rose-500/20 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-rose-400 flex items-center space-x-2 font-mono">
            <AlertTriangle className="w-4 h-4" />
            <span>Procedural Map Wipe</span>
          </h3>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Blueprints Strictly Preserved
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Wiping the map safely archives active world saves into <code className="text-rust-400">.crucible-saves</code> and removes only active <code className="text-rust-400">proceduralmap.*.sav</code> files.
          Player blueprint databases (<code className="text-rust-400">player.blueprints.*.db</code>) are completely preserved.
        </p>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setIsWipeModalOpen(true)}
            disabled={isServerRunning || isWiping}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium font-mono shadow-lg shadow-rose-600/20 disabled:opacity-40 transition-all"
          >
            {isWiping ? 'Wiping World...' : 'Wipe Procedural World'}
          </button>
        </div>
      </div>

      <Modal
        isOpen={isWipeModalOpen}
        onClose={() => setIsWipeModalOpen(false)}
        onConfirm={handleConfirmWipe}
        title="Confirm Procedural Map Wipe"
        description="Are you sure you want to wipe the active procedural world? Active procedural saves will be deleted and backed up to .crucible-saves before removal. Player blueprints (player.blueprints.*.db) will remain completely safe."
        confirmText="Yes, Wipe World"
        isDestructive={true}
      />
      </div>
    </div>
  );
};
