import React, { useState, useEffect } from 'react';
import {
  Users,
  Gamepad2,
  Send,
  Check,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  CheckCheck,
  Search,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import {
  ServerConfig,
  ServerStatus,
  ServerTelemetry,
  NetInfo,
  SteamStatus,
  SteamFriend,
  InviteAllResult,
} from '../types/server';
import { api } from '../services/api';

interface SteamFriendsPanelProps {
  status: ServerStatus;
  config: ServerConfig;
  telemetry: ServerTelemetry;
  netInfo: NetInfo | null;
}

export const SteamFriendsPanel: React.FC<SteamFriendsPanelProps> = ({
  status,
  config,
  telemetry,
  netInfo,
}) => {
  const [steamStatus, setSteamStatus] = useState<SteamStatus | null>(null);
  const [friends, setFriends] = useState<SteamFriend[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPublicAddress, setShowPublicAddress] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Per-friend invite status: 'idle' | 'sending' | 'success' | 'error'
  const [invitingFriendId, setInvitingFriendId] = useState<string | null>(null);
  const [inviteSuccessMap, setInviteSuccessMap] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Invite All state
  const [isInvitingAll, setIsInvitingAll] = useState(false);
  const [inviteAllSummary, setInviteAllSummary] = useState<InviteAllResult | null>(null);

  const isServerOnline = status === 'running' || status === 'rcon_unavailable';

  const loadSteamData = async (showLoadingIndicator = true) => {
    if (showLoadingIndicator) setIsRefreshing(true);
    setActionError(null);
    try {
      const sStatus = await api.getSteamStatus();
      setSteamStatus(sStatus);

      if (sStatus.is_available && sStatus.is_logged_on) {
        const friendList = await api.getSteamFriends();
        setFriends(friendList);
      } else {
        setFriends([]);
      }
    } catch (e: any) {
      console.warn('Steam load error:', e);
      setSteamStatus({
        is_available: false,
        is_logged_on: false,
        error_message: e.message || String(e),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSteamData(false);
  }, []);

  const getPublicAddress = () => {
    const ip = netInfo?.public_ip;
    if (!ip || ip === '127.0.0.1' || ip === 'Offline') {
      return null;
    }
    return `${ip}:${config.port}`;
  };

  const handleCopyAddress = () => {
    const addr = getPublicAddress();
    if (addr) {
      navigator.clipboard.writeText(`client.connect ${addr}`);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleInviteSingle = async (friend: SteamFriend) => {
    if (!isServerOnline) return;
    setActionError(null);
    setActionSuccess(null);
    setInvitingFriendId(friend.steam_id);

    try {
      const res = await api.inviteSteamFriend(friend.steam_id);
      if (res.success) {
        setInviteSuccessMap((prev) => ({ ...prev, [friend.steam_id]: true }));
        setActionSuccess(`Invitation sent to ${friend.name}!`);
        setTimeout(() => {
          setInviteSuccessMap((prev) => ({ ...prev, [friend.steam_id]: false }));
        }, 3000);
      } else {
        setActionError(res.message || 'Invitation failed');
      }
    } catch (e: any) {
      setActionError(e.message || String(e));
    } finally {
      setInvitingFriendId(null);
    }
  };

  const handleInviteAllOnline = async () => {
    if (!isServerOnline) return;
    setActionError(null);
    setActionSuccess(null);
    setIsInvitingAll(true);
    setInviteAllSummary(null);

    try {
      const res = await api.inviteAllOnlineSteamFriends();
      setInviteAllSummary(res);
      if (res.succeeded > 0) {
        setActionSuccess(`Successfully sent ${res.succeeded} invitations (${res.failed} failed).`);
      } else if (res.total_online === 0) {
        setActionError('No online Steam friends to invite.');
      } else {
        setActionError(`Failed to send invitations: ${res.failed} attempts failed.`);
      }
    } catch (e: any) {
      setActionError(e.message || String(e));
    } finally {
      setIsInvitingAll(false);
    }
  };

  const getServerStateHelpText = () => {
    if (status === 'stopped') return 'Start your server before inviting friends.';
    if (status === 'starting') return 'Server is starting...';
    if (status === 'stopping') return 'Server is stopping...';
    return null;
  };

  const onlineFriends = friends.filter((f) => f.online);
  const filteredFriends = friends.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.current_game && f.current_game.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const publicAddress = getPublicAddress();

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-5 shadow-sm">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-dark-border gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#1b2838] border border-[#2a475e] flex items-center justify-center text-[#66c0f4] shadow-md shrink-0">
            {/* Steam Logo SVG */}
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.524-4.524 4.524h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.395 3.396-1.635 0-3.016-1.173-3.332-2.72L.586 15.08C2.062 20.245 6.786 24 12.373 24 18.794 24 24 18.794 24 12.373 24 5.539 18.794 0 11.979 0zM7.558 16.969c-.439.439-1.15.439-1.589 0-.439-.439-.439-1.15 0-1.589.439-.439 1.15-.439 1.589 0 .439.439.439 1.15 0 1.589zm8.381-8.059c0-1.655 1.346-3.001 3.001-3.001 1.656 0 3.001 1.346 3.001 3.001s-1.345 3.001-3.001 3.001c-1.655 0-3.001-1.346-3.001-3.001z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-100 tracking-wide font-mono">
                STEAM FRIENDS & INVITES
              </h3>
              {steamStatus?.is_available && steamStatus?.is_logged_on ? (
                <span className="flex items-center space-x-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>CONNECTED</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  STEAM OFFLINE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              {steamStatus?.is_available && steamStatus?.is_logged_on ? (
                <span>
                  Logged in as <span className="text-slate-200 font-semibold">{steamStatus.persona_name}</span> •{' '}
                  <span className="text-emerald-400">{onlineFriends.length} online</span> friends
                </span>
              ) : (
                <span>Official Steamworks integration for instant 1-click Rust invitations</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => loadSteamData(true)}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-lg bg-dark-bg hover:bg-dark-elevated border border-dark-border text-slate-300 hover:text-slate-100 text-xs font-mono transition-all flex items-center space-x-1.5 disabled:opacity-50"
            title="Refresh Steam friends"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rust-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Server Status Warning / Helper Banner */}
      {!isServerOnline && (
        <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/30 flex items-center space-x-3 text-xs text-amber-300 font-sans">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{getServerStateHelpText()}</span>
        </div>
      )}

      {/* Steam Unavailable Notice */}
      {steamStatus && (!steamStatus.is_available || !steamStatus.is_logged_on) && (
        <div className="p-4 rounded-xl bg-dark-bg/80 border border-dark-border space-y-3">
          <div className="flex items-start space-x-3 text-xs text-slate-300">
            <AlertCircle className="w-4 h-4 text-rust-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-200">
                {steamStatus.error_message || 'Steam is not running. Start Steam to use Friends and Invites.'}
              </p>
              <p className="text-slate-400 mt-1">
                Launch the official Steam desktop client, log in, and click <strong className="text-slate-200">Refresh</strong>. Your friends don't need our launcher installed—they only need Steam and Rust.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadSteamData(true)}
            disabled={isRefreshing}
            className="px-3.5 py-1.5 rounded-lg bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono font-semibold transition-colors flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Retry Steam Connection</span>
          </button>
        </div>
      )}

      {/* Server Invite Control Card */}
      {steamStatus?.is_available && steamStatus?.is_logged_on && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl bg-dark-bg/60 border border-dark-border/80 text-xs">
          {/* Server Identity & Online State */}
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">HOSTED SERVER</span>
            <div className="font-bold text-slate-100 truncate text-sm">{config.hostname || 'Rust Dedicated Server'}</div>
            <div className="flex items-center space-x-2 pt-0.5">
              <span
                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                  isServerOnline
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isServerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                <span>{isServerOnline ? 'ONLINE' : 'STOPPED'}</span>
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {telemetry.players} / {config.max_players} Players
              </span>
            </div>
          </div>

          {/* Public Connection Target */}
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">CONNECTION TARGET</span>
            {publicAddress ? (
              <div className="flex items-center space-x-2">
                <span className="font-mono text-rust-400 font-bold bg-dark-elevated px-2 py-1 rounded border border-dark-border">
                  {showPublicAddress ? publicAddress : `${publicAddress.split(':')[0].replace(/./g, '•')}:${config.port}`}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPublicAddress(!showPublicAddress)}
                  className="p-1 rounded hover:bg-dark-elevated text-slate-400 hover:text-slate-200 transition-colors"
                  title={showPublicAddress ? 'Hide public IP' : 'Show public IP'}
                >
                  {showPublicAddress ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="p-1 rounded hover:bg-dark-elevated text-slate-400 hover:text-slate-200 transition-colors"
                  title="Copy client.connect string"
                >
                  {copiedAddress ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <div className="text-amber-400 flex items-center space-x-1.5 py-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px]">Unable to determine public IP</span>
              </div>
            )}
            <p className="text-[10px] text-slate-400 leading-tight">
              Sent in the official Steam invite. Friends join directly via Steam.
            </p>
          </div>

          {/* Invite All Action */}
          <div className="flex flex-col justify-center space-y-2">
            <button
              type="button"
              onClick={handleInviteAllOnline}
              disabled={!isServerOnline || onlineFriends.length === 0 || isInvitingAll || !publicAddress}
              className="w-full py-2 px-3 rounded-lg bg-rust-600 hover:bg-rust-500 disabled:bg-dark-elevated disabled:text-slate-400 text-white font-mono text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-md shadow-rust-600/20 disabled:shadow-none"
            >
              {isInvitingAll ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Inviting Friends...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Invite All Online Friends ({onlineFriends.length})</span>
                </>
              )}
            </button>
            <span className="text-[10px] text-slate-400 text-center font-mono">
              Sends individual game invites via Steamworks
            </span>
          </div>
        </div>
      )}

      {/* Action Notifications */}
      {actionError && (
        <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs space-y-1">
          <div className="flex items-center space-x-2 font-semibold">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          {inviteAllSummary && (
            <div className="font-mono text-[11px] text-emerald-400/80 pl-6">
              Total Online: {inviteAllSummary.total_online} • Succeeded: {inviteAllSummary.succeeded} • Failed: {inviteAllSummary.failed}
            </div>
          )}
        </div>
      )}

      {/* Friends Search & Filter */}
      {steamStatus?.is_available && steamStatus?.is_logged_on && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search friends by name or game..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-slate-200 placeholder-slate-400 text-xs focus:outline-none focus:border-rust-500 font-sans"
              />
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Showing <span className="text-slate-200">{filteredFriends.length}</span> of {friends.length} friends
            </div>
          </div>

          {/* Friends List Container */}
          <div className="divide-y divide-dark-border/50 border border-dark-border rounded-xl bg-dark-bg/40 max-h-80 overflow-y-auto">
            {filteredFriends.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-1 text-xs">
                <Users className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                <p>No Steam friends match your search.</p>
              </div>
            ) : (
              filteredFriends.map((friend) => {
                const isInvited = inviteSuccessMap[friend.steam_id];
                const isThisInviting = invitingFriendId === friend.steam_id;
                const isPlayingRust = friend.current_game_app_id === 252490;

                return (
                  <div
                    key={friend.steam_id}
                    className="p-3 flex items-center justify-between hover:bg-dark-elevated/40 transition-colors gap-3"
                  >
                    {/* Left: Avatar & Info */}
                    <div className="flex items-center space-x-3 min-w-0">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        {friend.avatar ? (
                          <img
                            src={friend.avatar}
                            alt={friend.name}
                            className="w-9 h-9 rounded-lg object-cover border border-dark-border"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-dark-elevated border border-dark-border flex items-center justify-center text-slate-300 font-mono font-bold text-xs">
                            {friend.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {/* Online Indicator Badge */}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-card ${
                            friend.online
                              ? isPlayingRust
                                ? 'bg-rust-500 ring-1 ring-rust-400'
                                : 'bg-emerald-500'
                              : 'bg-slate-500'
                          }`}
                        />
                      </div>

                      {/* Name & Status */}
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-100 text-xs truncate max-w-[180px] sm:max-w-[240px]">
                            {friend.name}
                          </span>
                          {isPlayingRust && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rust-600/20 text-rust-400 border border-rust-500/30 font-bold shrink-0">
                              RUST
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-sans flex items-center space-x-1.5 mt-0.5">
                          {friend.online ? (
                            friend.current_game ? (
                              <span className="text-emerald-400 flex items-center space-x-1 truncate max-w-[200px]">
                                <Gamepad2 className="w-3 h-3 shrink-0" />
                                <span>Playing {friend.current_game}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300">Online</span>
                            )
                          ) : (
                            <span className="text-slate-400">Offline</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Invite Button */}
                    <div className="shrink-0">
                      {friend.online ? (
                        <button
                          type="button"
                          onClick={() => handleInviteSingle(friend)}
                          disabled={!isServerOnline || isThisInviting || isInvited || !publicAddress}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center space-x-1.5 ${
                            isInvited
                              ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300'
                              : !isServerOnline
                              ? 'bg-dark-elevated border border-dark-border text-slate-400 cursor-not-allowed'
                              : 'bg-rust-600 hover:bg-rust-500 text-white shadow-sm shadow-rust-600/20 active:scale-95'
                          }`}
                          title={
                            !isServerOnline
                              ? 'Start your server before inviting friends'
                              : !publicAddress
                              ? 'Unable to determine public IP'
                              : `Invite ${friend.name} to this server`
                          }
                        >
                          {isThisInviting ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-white" />
                              <span>Inviting...</span>
                            </>
                          ) : isInvited ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Invited!</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3" />
                              <span>Invite</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-[11px] font-mono text-slate-400 px-2.5 py-1">
                          Offline
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
