import React, { useState, useEffect } from 'react';
import { Shield, UserPlus, Trash2, Copy, Check, UserCheck, AlertCircle, RefreshCw, Terminal, Sparkles } from 'lucide-react';
import { AdminUser, ServerStatus, SteamStatus } from '../types/server';
import { api } from '../services/api';

interface ServerAdminsManagerProps {
  status: ServerStatus;
  serverIdentity: string;
}

export const ServerAdminsManager: React.FC<ServerAdminsManagerProps> = ({
  status,
  serverIdentity,
}) => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [currentSteam, setCurrentSteam] = useState<SteamStatus | null>(null);
  const [steamId, setSteamId] = useState('');
  const [role, setRole] = useState<'owner' | 'moderator'>('owner');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reconnectCopied, setReconnectCopied] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const fetchAdmins = async () => {
    try {
      const list = await api.getServerAdmins();
      setAdmins(list);
    } catch (e: any) {
      console.warn('Failed to load server admins:', e);
    }
  };

  const fetchSteamUser = async () => {
    try {
      const s = await api.getSteamStatus();
      if (s && s.is_available) {
        setCurrentSteam(s);
      }
    } catch (e: any) {
      console.warn('Failed to detect steam status:', e);
    }
  };

  useEffect(() => {
    fetchAdmins();
    fetchSteamUser();
  }, [serverIdentity]);

  const grantAdminForUser = async (targetId: string, targetRole: 'owner' | 'moderator', targetName: string) => {
    const cleanId = targetId.trim();
    if (!/^\d{17}$/.test(cleanId)) {
      setInputError('SteamID64 must be exactly 17 digits (e.g. 76561198012345678).');
      return;
    }
    setInputError(null);
    setIsSubmitting(true);
    try {
      const updated = await api.addServerAdmin(
        cleanId,
        targetRole,
        targetName.trim() || (targetRole === 'owner' ? 'Server Owner' : 'Moderator'),
        targetRole === 'owner' ? 'Server Owner' : 'Moderator'
      );
      setAdmins(updated);
      setSteamId('');
      setName('');
      const liveMsg = status === 'running' ? ' and synced to live server via RCON' : '';
      setFeedback(
        `Granted ${targetRole.toUpperCase()} admin rights to ${targetName || cleanId} (${cleanId})${liveMsg}! Type 'reconnect' in F1 console to activate in-game.`
      );
      setTimeout(() => setFeedback(null), 8000);
    } catch (e: any) {
      setInputError(e.message || String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    await grantAdminForUser(steamId, role, name);
  };

  const handleRemove = async (targetId: string) => {
    try {
      const updated = await api.removeServerAdmin(targetId);
      setAdmins(updated);
      const liveMsg = status === 'running' ? ' & revoked live via RCON' : '';
      setFeedback(`Admin rights revoked for SteamID ${targetId}${liveMsg}.`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (e: any) {
      setFeedback(`Failed to remove: ${e.message || e}`);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleCopyReconnect = () => {
    navigator.clipboard.writeText('reconnect');
    setReconnectCopied(true);
    setTimeout(() => setReconnectCopied(false), 2000);
  };

  const isCurrentUserAdmin = currentSteam?.steam_id
    ? admins.some((a) => a.steam_id === currentSteam.steam_id)
    : false;

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between border-b border-dark-border pb-3">
        <div className="flex items-center space-x-2">
          <Shield className="w-4 h-4 text-rust-500" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase font-mono tracking-wider">
            Server Owners & Admins (SteamID64)
          </h3>
        </div>
        {status === 'running' && (
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Instant In-Game Grant Active</span>
          </span>
        )}
      </div>

      {/* CRITICAL IN-GAME ACTIVATION NOTICE */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-2 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <Terminal className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-amber-200 block font-mono">
                How Rust Admin Powers Activate In-Game:
              </span>
              <p className="text-slate-300 leading-relaxed font-sans text-[11.5px]">
                Facepunch Rust server authenticates admin AuthLevel only when a player connects. If you are already connected inside the game when admin is granted, you <strong>must reconnect</strong> for console commands (noclip, godmode, item spawn menu) to unlock.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyReconnect}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-mono shrink-0 transition-all shadow-sm"
            title="Copy 'reconnect' to clipboard"
          >
            {reconnectCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>F1 &gt; reconnect</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* DETECTED STEAM USER 1-CLICK SELF-GRANT */}
      {currentSteam?.steam_id && (
        <div className="bg-gradient-to-r from-rust-950/40 via-dark-bg to-dark-bg border border-rust-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            {currentSteam.avatar ? (
              <img
                src={currentSteam.avatar}
                alt={currentSteam.persona_name || 'Steam'}
                className="w-10 h-10 rounded-full border border-rust-500/40 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-rust-500/20 border border-rust-500/40 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-rust-400" />
              </div>
            )}
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-100 font-mono">
                  {currentSteam.persona_name || 'Steam Account'}
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono border border-slate-700">
                  Detected Steam
                </span>
                {isCurrentUserAdmin && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono border border-emerald-500/30 flex items-center space-x-1">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Admin Active</span>
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 font-mono block">
                {currentSteam.steam_id}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end">
            {!isCurrentUserAdmin ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  grantAdminForUser(
                    currentSteam.steam_id!,
                    'owner',
                    currentSteam.persona_name || 'Server Owner'
                  )
                }
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono font-medium shadow-md shadow-rust-600/30 transition-all disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Grant Myself Owner Admin</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  grantAdminForUser(
                    currentSteam.steam_id!,
                    'owner',
                    currentSteam.persona_name || 'Server Owner'
                  )
                }
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-card hover:bg-slate-800 text-slate-300 text-xs font-mono border border-dark-border transition-all"
                title="Re-sync admin permission"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                <span>Re-Sync Owner Admin</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grant Admin Form */}
      <form onSubmit={handleAddAdmin} className="bg-dark-bg/80 border border-dark-border rounded-xl p-4 space-y-3">
        <div className="text-xs font-mono text-slate-300 font-semibold mb-1">
          Add / Grant Another Player Admin:
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              SteamID64 (17 digits) <span className="text-rust-400">*</span>
            </label>
            <input
              type="text"
              placeholder="76561198000000000"
              value={steamId}
              onChange={(e) => {
                setSteamId(e.target.value);
                setInputError(null);
              }}
              className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rust-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Permission Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
            >
              <option value="owner">Owner (Auth Level 2 - Full Admin)</option>
              <option value="moderator">Moderator (Auth Level 1)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Player Name / Tag</label>
            <input
              type="text"
              placeholder="e.g. PlayerName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rust-500"
            />
          </div>
        </div>

        {inputError && (
          <div className="flex items-center space-x-1.5 text-xs text-rose-400 font-mono">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{inputError}</span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isSubmitting || !steamId.trim()}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono font-medium shadow-md shadow-rust-600/20 disabled:opacity-40 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Granting Power...' : 'Grant Admin Power'}</span>
          </button>
        </div>
      </form>

      {/* Success Notification */}
      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-300 flex items-center space-x-2 animate-fade-in">
          <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Admins Table */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-400 uppercase font-mono tracking-wider block">
          Current Server Admins ({admins.length})
        </span>

        {admins.length > 0 ? (
          <div className="border border-dark-border rounded-xl overflow-hidden bg-dark-bg/50">
            <div className="divide-y divide-dark-border">
              {admins.map((adm) => (
                <div
                  key={adm.steam_id}
                  className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors text-xs font-mono"
                >
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        adm.role === 'owner'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {adm.role}
                    </span>
                    <span className="font-semibold text-slate-200">{adm.name}</span>
                    <span className="text-slate-500 text-[11px]">{adm.steam_id}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleCopyId(adm.steam_id)}
                      title="Copy SteamID64"
                      className="p-1.5 rounded hover:bg-dark-elevated text-slate-400 hover:text-white transition-colors"
                    >
                      {copiedId === adm.steam_id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(adm.steam_id)}
                      title="Revoke Admin Rights"
                      className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-slate-500 font-mono text-xs border border-dashed border-dark-border rounded-xl">
            No server owners or moderators configured yet in users.cfg.
          </div>
        )}
      </div>
    </div>
  );
};
