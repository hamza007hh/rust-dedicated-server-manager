import React, { useState, useEffect } from 'react';
import { Server, Plus, ChevronDown, Check, Trash2, AlertCircle } from 'lucide-react';
import { ProfilesData, ServerStatus, ServerConfig } from '../types/server';
import { api } from '../services/api';
import { Modal } from './Modal';
import { CreateServerWizard } from './CreateServerWizard';

interface ServerProfileSwitcherProps {
  status: ServerStatus;
  currentConfig: ServerConfig;
  onProfileSwitched: (newConfig: ServerConfig) => void;
}

export const ServerProfileSwitcher: React.FC<ServerProfileSwitcherProps> = ({
  status,
  currentConfig,
  onProfileSwitched,
}) => {
  const [profilesData, setProfilesData] = useState<ProfilesData>({
    active_profile_id: 'default',
    profiles: [],
  });
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isServerRunning = status !== 'stopped';

  const loadProfiles = async () => {
    try {
      const data = await api.getServerProfiles();
      setProfilesData(data);
    } catch (e) {
      console.warn('Failed to load server profiles:', e);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const activeProfile =
    profilesData.profiles.find((p) => p.id === profilesData.active_profile_id) ||
    profilesData.profiles[0];

  const handleSelectProfile = async (id: string) => {
    if (isServerRunning) {
      setActionError('Cannot switch server profiles while a server is running. Stop the server first.');
      return;
    }
    setActionError(null);
    setIsOpen(false);

    try {
      const res = await api.selectServerProfile(id);
      setProfilesData(res);
      const switched = res.profiles.find((p) => p.id === res.active_profile_id);
      if (switched) {
        onProfileSwitched(switched.config);
      }
    } catch (e: any) {
      setActionError(e.message || String(e));
    }
  };

  const confirmDelete = async () => {
    if (!targetDeleteId) return;
    try {
      const res = await api.deleteServerProfile(targetDeleteId);
      setProfilesData(res);
      setIsDeleteOpen(false);
      setTargetDeleteId(null);
      const switched = res.profiles.find((p) => p.id === res.active_profile_id);
      if (switched) {
        onProfileSwitched(switched.config);
      }
    } catch (e: any) {
      setActionError(e.message || String(e));
    }
  };

  return (
    <div className="relative">
      {/* Switcher Trigger Button in Header */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setActionError(null);
        }}
        className="flex items-center space-x-2.5 px-3 py-1.5 rounded-xl bg-dark-card hover:bg-dark-elevated border border-dark-border text-left transition-all group"
      >
        <div className="w-6 h-6 rounded-lg bg-rust-600/15 border border-rust-500/30 flex items-center justify-center text-rust-500 shrink-0">
          <Server className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[10px] text-slate-400 font-mono leading-none">SERVER INSTANCE</span>
          <span className="text-xs font-bold text-slate-100 group-hover:text-rust-400 font-mono transition-colors truncate max-w-[140px]">
            {activeProfile?.name || currentConfig.hostname || 'Main Server'}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-transform" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 bg-dark-card border border-dark-border rounded-xl shadow-2xl z-50 p-2 space-y-1 font-mono text-xs animate-fade-in">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-dark-border/50 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
            <span>Your Servers ({profilesData.profiles.length})</span>
            {isServerRunning && <span className="text-amber-400 lowercase text-[9px]">(stop to switch)</span>}
          </div>

          {actionError && (
            <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded text-[11px] text-rose-300 flex items-start space-x-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto space-y-0.5 py-1">
            {profilesData.profiles.map((prof) => {
              const isSelected = prof.id === profilesData.active_profile_id;
              return (
                <div
                  key={prof.id}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-rust-600/15 border border-rust-500/30 text-white'
                      : 'hover:bg-dark-bg text-slate-300'
                  }`}
                  onClick={() => handleSelectProfile(prof.id)}
                >
                  <div className="flex items-center space-x-2 truncate">
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-rust-500 shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5" />
                    )}
                    <div className="flex flex-col truncate">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-xs truncate">{prof.name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase border ${
                            prof.config.mod_framework === 'carbon'
                              ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                              : prof.config.mod_framework === 'oxide'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-slate-700/50 text-slate-300 border-slate-600'
                          }`}
                        >
                          {prof.config.mod_framework || 'vanilla'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Port: {prof.config.port} • {prof.config.identity}
                      </span>
                    </div>
                  </div>

                  {profilesData.profiles.length > 1 && !isServerRunning && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetDeleteId(prof.id);
                        setIsDeleteOpen(true);
                      }}
                      title="Delete Server Profile"
                      className="p-1 hover:text-rose-400 text-slate-500 rounded transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create Server Button */}
          <div className="pt-1 border-t border-dark-border/50">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsCreateOpen(true);
              }}
              className="flex items-center justify-center space-x-1.5 w-full py-2 rounded-lg bg-dark-bg hover:bg-dark-elevated border border-dark-border text-slate-200 hover:text-rust-400 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-rust-500" />
              <span>Create New Server</span>
            </button>
          </div>
        </div>
      )}

      {/* Create New Server Wizard */}
      <CreateServerWizard
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        suggestedPort={
          profilesData.profiles.length > 0
            ? Math.max(...profilesData.profiles.map((p) => p.config.port || 28015)) + 10
            : 28015
        }
        onServerCreated={(createdConfig, newProfilesData) => {
          setProfilesData(newProfilesData);
          onProfileSwitched(createdConfig);
          setIsCreateOpen(false);
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Server Profile?"
        description="Are you sure you want to delete this server profile configuration? This cannot be undone."
        confirmText="Yes, Delete Server"
        isDestructive={true}
      />
    </div>
  );
};
