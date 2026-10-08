import React, { useState, useEffect, useCallback } from 'react';
import { HardDrive, Plus, RotateCcw, Trash2, AlertTriangle, CheckCircle, RefreshCw, Calendar, FileText, Database } from 'lucide-react';
import { ServerConfig, ServerStatus, SaveBackupInfo, ActiveSaveInfo, WipeResult } from '../types/server';
import { Modal } from '../components/Modal';
import { api } from '../services/api';

interface SavesPageProps {
  config: ServerConfig;
  status: ServerStatus;
  backups: SaveBackupInfo[];
  onRefreshBackups: () => Promise<void>;
  onCreateBackup: (tag?: string) => Promise<string>;
  onRestoreSave: (backupPath: string) => Promise<void>;
  onWipeProcedural: () => Promise<WipeResult>;
  onDeleteBackup?: (backupPath: string) => Promise<void>;
}

export const SavesPage: React.FC<SavesPageProps> = ({
  config,
  status,
  backups,
  onRefreshBackups,
  onCreateBackup,
  onRestoreSave,
  onWipeProcedural,
  onDeleteBackup,
}) => {
  const isServerRunning = status !== 'stopped';

  const [tag, setTag] = useState('');
  const [activeSaves, setActiveSaves] = useState<ActiveSaveInfo[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<SaveBackupInfo | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);

  const [selectedBackupForDelete, setSelectedBackupForDelete] = useState<SaveBackupInfo | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const refreshActiveSaves = useCallback(async () => {
    setIsLoadingActive(true);
    try {
      const list = await api.listActiveSaves();
      setActiveSaves(list);
    } catch (e: any) {
      console.warn('Failed to list active saves:', e);
    } finally {
      setIsLoadingActive(false);
    }
  }, []);

  useEffect(() => {
    refreshActiveSaves();
  }, [refreshActiveSaves]);

  const handleRefreshAll = async () => {
    await Promise.all([onRefreshBackups(), refreshActiveSaves()]);
  };

  const handleCreateBackup = async () => {
    setIsCreating(true);
    setMsg(null);
    try {
      await onCreateBackup(tag.trim() || undefined);
      setTag('');
      setMsg({ text: 'World backup snapshot created successfully.', type: 'success' });
      await handleRefreshAll();
    } catch (e: any) {
      setMsg({ text: e?.message || 'Failed to create backup', type: 'error' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedBackupForRestore) return;
    setIsRestoreModalOpen(false);
    if (isServerRunning) {
      setMsg({ text: 'Server must be stopped before restoring a save snapshot.', type: 'error' });
      return;
    }
    setMsg(null);
    try {
      await onRestoreSave(selectedBackupForRestore.backup_path);
      setMsg({
        text: `World restored successfully from snapshot "${selectedBackupForRestore.name}".`,
        type: 'success',
      });
      await handleRefreshAll();
    } catch (e: any) {
      setMsg({ text: e?.message || 'Failed to restore backup snapshot', type: 'error' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedBackupForDelete) return;
    const toDelete = selectedBackupForDelete;
    setIsDeleteModalOpen(false);
    setMsg(null);
    try {
      if (onDeleteBackup) {
        await onDeleteBackup(toDelete.backup_path);
      } else {
        await api.deleteBackup(toDelete.backup_path);
        await onRefreshBackups();
      }
      setMsg({ text: `Backup snapshot "${toDelete.name}" deleted successfully.`, type: 'success' });
    } catch (e: any) {
      setMsg({ text: e?.message || 'Failed to delete backup snapshot', type: 'error' });
    }
  };

  const handleConfirmWipe = async () => {
    setIsWipeModalOpen(false);
    if (isServerRunning) {
      setMsg({ text: 'Server must be stopped before wiping procedural world saves.', type: 'error' });
      return;
    }
    setMsg(null);
    try {
      const res = await onWipeProcedural();
      setMsg({
        text: `Procedural map wiped (${res.deleted_files.length} save files removed, blueprints preserved).`,
        type: 'success',
      });
      await handleRefreshAll();
    } catch (e: any) {
      setMsg({ text: e?.message || 'Failed to wipe world', type: 'error' });
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
            <HardDrive className="w-5 h-5 text-rust-500" />
            <span>Saves & Backup Management</span>
          </h2>
          <p className="text-xs text-slate-400">
            Manage active server world saves, timestamped snapshots, disaster recovery, and procedural wipes.
          </p>
        </div>

        <button
          onClick={handleRefreshAll}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border hover:border-slate-700 text-xs text-slate-300 font-mono transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingActive ? 'animate-spin text-rust-500' : ''}`} />
          <span>Refresh All</span>
        </button>
      </div>

      {isServerRunning && (
        <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Server is active. Save restoration and procedural wipes require the server to be stopped.</span>
        </div>
      )}

      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center space-x-2 font-mono ${
            msg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Active Saves in Identity Directory */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-slate-200 font-mono flex items-center space-x-2">
            <Database className="w-4 h-4 text-rust-500" />
            <span>Active Server Save Files</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            Identity: <span className="text-rust-400 font-bold">{config.identity}</span>
          </span>
        </div>

        <div className="space-y-2">
          {activeSaves.map((save) => (
            <div
              key={save.file_name}
              className="flex items-center justify-between p-3 rounded-lg bg-dark-bg/60 border border-dark-border/60 hover:border-dark-border transition-colors font-mono text-xs"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className={`p-2 rounded ${
                    save.is_blueprint ? 'bg-indigo-500/10 text-indigo-400' : 'bg-dark-elevated text-rust-500'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-200 truncate">{save.file_name}</span>
                    {save.is_blueprint && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                        Player Blueprints
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center space-x-3 mt-0.5">
                    <span>{formatBytes(save.size_bytes)}</span>
                    <span>•</span>
                    <span>Modified: {new Date(save.modified_millis).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {activeSaves.length === 0 && !isLoadingActive && (
            <p className="text-xs text-slate-500 italic py-6 text-center font-mono">
              No active save files detected in server identity directory.
            </p>
          )}
        </div>
      </div>

      {/* Create Backup Snapshot */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 font-mono">Create Instant Snapshot</h3>
        <p className="text-xs text-slate-400">
          Copies all active world save files (.sav, .map, .db) into a timestamped directory inside{' '}
          <code className="text-rust-400">.crucible-saves</code>.
        </p>

        <div className="flex items-center space-x-3 pt-2">
          <input
            type="text"
            placeholder="Optional tag (e.g. pre_wipe, daily_01, event_start)..."
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rust-500"
          />
          <button
            onClick={handleCreateBackup}
            disabled={isCreating}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white font-medium text-xs font-mono shadow-lg shadow-rust-600/20 disabled:opacity-50 transition-all"
          >
            {isCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>Create Snapshot</span>
          </button>
        </div>
      </div>

      {/* Available Backups List */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-slate-200 font-mono">Available Backups (.crucible-saves)</h3>
          <span className="text-xs font-mono text-slate-400">{backups.length} snapshots</span>
        </div>

        <div className="space-y-2">
          {backups.map((b) => (
            <div
              key={b.backup_path}
              className="flex items-center justify-between p-3.5 rounded-lg bg-dark-bg/60 border border-dark-border/60 hover:border-dark-border transition-colors font-mono"
            >
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded bg-dark-elevated text-rust-500">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{b.name}</h4>
                  <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(b.created_at_millis).toLocaleString()}</span>
                    </span>
                    <span>{b.file_count} files</span>
                    <span>{formatBytes(b.total_bytes)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setSelectedBackupForRestore(b);
                    setIsRestoreModalOpen(true);
                  }}
                  disabled={isServerRunning}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-elevated hover:bg-dark-border border border-dark-border text-xs text-slate-300 disabled:opacity-40 transition-colors"
                  title={isServerRunning ? 'Stop server to restore' : 'Restore this backup'}
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rust-500" />
                  <span>Restore</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedBackupForDelete(b);
                    setIsDeleteModalOpen(true);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs text-rose-300 transition-colors"
                  title="Delete this backup snapshot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))}

          {backups.length === 0 && (
            <p className="text-xs text-slate-500 italic py-8 text-center font-mono">
              No backups found in .crucible-saves for identity '{config.identity}'.
            </p>
          )}
        </div>
      </div>

      {/* Procedural Map Wipe Section */}
      <div className="bg-dark-card border border-rose-500/20 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-rose-400 flex items-center space-x-2 font-mono">
            <AlertTriangle className="w-4 h-4" />
            <span>Procedural World Wipe</span>
          </h3>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            Blueprints Safe
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed font-sans">
          Deletes active procedural world files (<code className="text-rust-400">proceduralmap.*.sav</code>).
          Crucible automatically creates a pre-wipe snapshot inside <code className="text-rust-400">.crucible-saves</code> and preserves player blueprints (<code className="text-rust-400">player.blueprints.*.db</code>).
        </p>

        <div className="pt-2 flex justify-end">
          <button
            onClick={() => setIsWipeModalOpen(true)}
            disabled={isServerRunning}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium font-mono shadow-lg shadow-rose-600/20 disabled:opacity-40 transition-all"
          >
            Wipe World Saves
          </button>
        </div>
      </div>

      {/* Confirmation Modals */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        onConfirm={handleConfirmRestore}
        title="Confirm Save Snapshot Restoration"
        description={`Are you sure you want to restore "${selectedBackupForRestore?.name}"? A safety backup will be taken before active save files are overwritten.`}
        confirmText="Yes, Restore Save"
        isDestructive={true}
      />

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Confirm Backup Snapshot Deletion"
        description={`Permanently delete backup snapshot "${selectedBackupForDelete?.name}" (${selectedBackupForDelete?.file_count} files, ${formatBytes(selectedBackupForDelete?.total_bytes || 0)}) from .crucible-saves? This action cannot be undone.`}
        confirmText="Yes, Delete Snapshot"
        isDestructive={true}
      />

      <Modal
        isOpen={isWipeModalOpen}
        onClose={() => setIsWipeModalOpen(false)}
        onConfirm={handleConfirmWipe}
        title="Confirm Procedural Map Wipe"
        description="Are you sure you want to wipe active procedural world saves? All procedural map files will be safely archived to .crucible-saves before deletion. Player blueprints (player.blueprints.*.db) will remain intact."
        confirmText="Yes, Wipe World"
        isDestructive={true}
      />
      </div>
    </div>
  );
};
