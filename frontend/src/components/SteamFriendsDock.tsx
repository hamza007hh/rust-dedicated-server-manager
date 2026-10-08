import React, { useState, useEffect } from 'react';
import {
  Users,
  MessageSquare,
  Send,
  Check,
  RefreshCw,
  Search,
  X,
  Gamepad2,
  WifiOff,
} from 'lucide-react';
import {
  ServerConfig,
  ServerStatus,
  NetInfo,
  SteamStatus,
  SteamFriend,
} from '../types/server';
import { api } from '../services/api';

interface SteamFriendsDockProps {
  status?: ServerStatus;
  config?: ServerConfig;
  netInfo?: NetInfo | null;
  onInviteSent?: (msg: string) => void;
  onInviteError?: (msg: string) => void;
  onStatusLoaded?: (status: SteamStatus) => void;
}

// Deterministic colorful gradient for letter avatars
const getAvatarGradient = (name: string) => {
  const gradients = [
    'from-indigo-600 to-blue-500',
    'from-emerald-600 to-teal-500',
    'from-amber-600 to-orange-500',
    'from-purple-600 to-fuchsia-500',
    'from-rose-600 to-pink-500',
    'from-cyan-600 to-sky-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return gradients[Math.abs(hash) % gradients.length];
};

const SteamIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-10 9.684l5.352 2.215a3.3 3.3 0 0 1 1.884-.593c.125 0 .248.008.37.022l2.67-3.864a3.73 3.73 0 0 1-.076-.744 3.75 3.75 0 1 1 3.75 3.75c-.27 0-.527-.03-.775-.083l-3.82 2.64c.015.127.025.257.025.388 0 1.815-1.472 3.285-3.288 3.285a3.29 3.29 0 0 1-3.28-3.09L.43 13.5A10 10 0 1 0 12 2zm-3.87 13.91a2.19 2.19 0 0 0 2.19-2.188c0-.3-.06-.583-.17-.843l-1.46.606a1.455 1.455 0 0 1-1.956-1.39c0-.065.008-.13.018-.192L5.27 11.3a2.19 2.19 0 0 0 2.86 4.61zm7.62-5.16a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
  </svg>
);

export const SteamFriendsDock: React.FC<SteamFriendsDockProps> = ({
  onInviteSent,
  onInviteError,
  onStatusLoaded,
}) => {
  const [steamStatus, setSteamStatus] = useState<SteamStatus | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [friendAvatarErrors, setFriendAvatarErrors] = useState<Record<string, boolean>>({});
  const [friends, setFriends] = useState<SteamFriend[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'online' | 'offline'>('all');
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [invitedMap, setInvitedMap] = useState<Record<string, boolean>>({});
  const [selectedFriend, setSelectedFriend] = useState<SteamFriend | null>(null);

  const loadSteamData = async (showLoading = true) => {
    if (showLoading) setIsRefreshing(true);
    try {
      const sStatus = await api.getSteamStatus();
      setSteamStatus(sStatus);
      setAvatarError(false);
      onStatusLoaded?.(sStatus);

      // Only load friends if Steam is truly open and logged on
      if (sStatus.is_available && sStatus.is_logged_on) {
        try {
          const friendList = await api.getSteamFriends();
          setFriends(Array.isArray(friendList) ? friendList : []);
        } catch {
          setFriends([]);
        }
      } else {
        setFriends([]);
      }
    } catch (e: any) {
      console.warn('Steam friends load error:', e);
      setSteamStatus({
        is_available: false,
        is_logged_on: false,
        error_message: e.message || String(e),
      });
      setFriends([]);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSteamData(false);
    const interval = setInterval(() => {
      loadSteamData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLaunchSteam = async () => {
    try {
      await api.launchSteamClient();
      setTimeout(() => loadSteamData(true), 2500);
    } catch (e) {
      console.warn('Failed to launch Steam:', e);
    }
  };

  const handleInvite = async (friend: SteamFriend, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setInvitingId(friend.steam_id);
    try {
      const res = await api.inviteSteamFriend(friend.steam_id);
      if (res.connect_string) {
        await navigator.clipboard.writeText(res.connect_string);
      }
      setInvitedMap((prev) => ({ ...prev, [friend.steam_id]: true }));
      onInviteSent?.(
        `Opened Steam chat with ${friend.name} & copied connect string! Press Ctrl+V in chat to send.`
      );
      setTimeout(() => {
        setInvitedMap((prev) => ({ ...prev, [friend.steam_id]: false }));
      }, 5000);
    } catch (err: any) {
      console.warn('Invite error:', err);
      onInviteError?.(err.message || 'Failed to send invite');
    } finally {
      setInvitingId(null);
    }
  };

  const handleSendMessage = async (steamId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.openSteamChat(steamId);
    } catch (err) {
      console.warn('Failed to open chat:', err);
    }
  };

  const onlineFriends = friends.filter((f) => f.online || !!f.current_game);
  const onlineCount = onlineFriends.length;
  const offlineCount = friends.length - onlineCount;
  const isOnline = Boolean(steamStatus?.is_logged_on);

  const filteredFriends = friends.filter((friend) => {
    const matchesSearch =
      friend.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (friend.current_game &&
        friend.current_game.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeTab === 'online') {
      return friend.online || !!friend.current_game;
    }
    if (activeTab === 'offline') {
      return !friend.online && !friend.current_game;
    }
    return true;
  });

  return (
    <div className="relative shrink-0 flex h-full z-20">
      <aside
        className={`h-full border-l border-white/[0.08] flex flex-col transition-all duration-300 select-none overflow-hidden ${
          isExpanded ? 'w-[340px] bg-[#0f1117]' : 'w-[72px] bg-[#0b0d12]'
        }`}
      >
        {!isExpanded ? (
          /* ================= COLLAPSED MINI DOCK ================= */
          <div className="flex-1 flex flex-col items-center py-3 px-2 justify-between">
            {/* Main Friends Pill with Warm Gamer Accent Border */}
            <div className="w-full flex-1 rounded-2xl bg-gradient-to-b from-[#141824] via-[#10131c] to-[#0d1017] border border-orange-500/20 shadow-[0_0_20px_rgba(224,83,56,0.08)] p-2 flex flex-col items-center overflow-hidden">
              {/* Top Mini Steam Emblem */}
              <div
                className="w-full pb-2 mb-1 border-b border-white/[0.06] flex items-center justify-center cursor-pointer group"
                onClick={() => setIsExpanded(true)}
                title="Expand Steam Friends Panel"
              >
                <div className={`p-1.5 rounded-lg transition-all duration-200 ${
                  isOnline
                    ? 'bg-sky-500/10 text-sky-400 group-hover:bg-sky-500/20 group-hover:text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                    : 'bg-white/[0.04] text-neutral-400 group-hover:bg-white/[0.08] group-hover:text-neutral-200'
                }`}>
                  <SteamIcon className="w-4 h-4" />
                </div>
              </div>

              {/* Host Profile Avatar */}
              <div
                className="relative cursor-pointer group"
                onClick={() => setIsExpanded(true)}
                title={`${steamStatus?.persona_name || 'Steam User'} (${isOnline ? 'Online' : 'Offline - Steam Closed'})`}
              >
                <div
                  className={`w-11 h-11 rounded-full p-[2px] transition-all duration-200 ${
                    isOnline
                      ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.35)] group-hover:scale-105'
                      : 'bg-white/[0.1] border border-white/10 group-hover:border-neutral-500'
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-[#181b24] flex items-center justify-center text-neutral-300 font-bold text-xs overflow-hidden">
                    {steamStatus?.avatar && !avatarError ? (
                      <img
                        src={steamStatus.avatar}
                        alt={steamStatus.persona_name || 'Host'}
                        className={`w-full h-full rounded-full object-cover transition-opacity ${
                          !isOnline ? 'grayscale opacity-60' : ''
                        }`}
                        onError={() => setAvatarError(true)}
                      />
                    ) : steamStatus?.persona_name ? (
                      <span className="text-white font-black text-xs">
                        {steamStatus.persona_name.slice(0, 2).toUpperCase()}
                      </span>
                    ) : (
                      '👤'
                    )}
                  </div>
                </div>

                {/* Status Indicator Dot */}
                <span
                  className={`absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-[#10131c] transition-colors ${
                    isOnline
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                      : 'bg-neutral-500'
                  }`}
                />
              </div>

              {/* Expand Toggle Button with Online Count Badge */}
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="relative text-neutral-400 hover:text-orange-400 p-2 my-2 hover:bg-orange-500/10 rounded-xl transition-all border border-transparent hover:border-orange-500/25 group"
                title="Expand Steam Friends Panel"
              >
                <Users className="w-4 h-4 transition-transform group-hover:scale-110" />
                {isOnline && onlineCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded-full bg-emerald-500 text-white font-bold text-[8px] leading-tight shadow-sm">
                    {onlineCount}
                  </span>
                )}
              </button>

              <div className="w-8 border-b border-white/[0.08] mb-2" />

              {/* Friend Avatar Bubbles Stack or Offline Prompt */}
              {isOnline ? (
                <div className="flex-1 w-full flex flex-col items-center space-y-3 overflow-y-auto py-1 no-scrollbar">
                  {friends.map((friend) => {
                    const isPlaying = !!friend.current_game;
                    const isFriendOnline = friend.online || isPlaying;
                    const isSelected = selectedFriend?.steam_id === friend.steam_id;

                    return (
                      <div
                        key={friend.steam_id}
                        className="relative flex flex-col items-center"
                      >
                        {/* Avatar Circle */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(true);
                            setSelectedFriend(friend);
                            if (!friend.online && activeTab === 'online') {
                              setActiveTab('all');
                            }
                          }}
                          className={`relative w-9 h-9 rounded-full p-[1.5px] transition-all duration-200 hover:scale-110 ${
                            isPlaying
                              ? 'bg-gradient-to-tr from-emerald-500 to-lime-400 shadow-[0_0_10px_rgba(16,185,129,0.45)]'
                              : isFriendOnline
                              ? 'bg-gradient-to-tr from-sky-500 to-blue-600 shadow-[0_0_8px_rgba(56,189,248,0.35)]'
                              : 'bg-white/10'
                          }`}
                          title={`Click to open & invite/message ${friend.name}`}
                        >
                          {friend.avatar && !friendAvatarErrors[friend.steam_id] ? (
                            <img
                              src={friend.avatar}
                              alt={friend.name}
                              className={`w-full h-full rounded-full object-cover ${
                                !isFriendOnline ? 'grayscale opacity-40' : ''
                              }`}
                              onError={() =>
                                setFriendAvatarErrors((prev) => ({
                                  ...prev,
                                  [friend.steam_id]: true,
                                }))
                              }
                            />
                          ) : (
                            <div className={`w-full h-full rounded-full bg-gradient-to-br ${getAvatarGradient(friend.name)} flex items-center justify-center text-white font-black text-[10px] shadow-inner`}>
                              {friend.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          {/* Friend Status Dot */}
                          <span
                            className={`absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#10131c] ${
                              isPlaying
                                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                                : isFriendOnline
                                ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]'
                                : 'bg-[#525a66]'
                            }`}
                          />
                        </button>

                        {/* In Game Badge */}
                        {isPlaying && (
                          <span className="mt-1 px-1.5 py-0.5 rounded bg-emerald-500 text-[7px] font-black text-white tracking-tight leading-none truncate max-w-[50px] shadow-sm uppercase">
                            In Game
                          </span>
                        )}

                        {/* Floating Popover on Click */}
                        {isSelected && (
                          <div
                            className="absolute right-[56px] top-0 z-50 bg-[#161924] border border-orange-500/30 rounded-xl p-3 shadow-2xl w-48 text-left animate-in fade-in duration-150 space-y-2 backdrop-blur-md"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-start justify-between">
                              <div className="min-w-0 pr-1">
                                <h4 className="text-xs font-bold text-white truncate">
                                  {friend.name}
                                </h4>
                                <span
                                  className={`text-[10px] font-semibold block truncate ${
                                    isPlaying
                                      ? 'text-emerald-400 font-bold'
                                      : isFriendOnline
                                      ? 'text-sky-400'
                                      : 'text-neutral-500'
                                  }`}
                                >
                                  {isPlaying
                                    ? friend.current_game
                                    : isFriendOnline
                                    ? 'Online'
                                    : 'Offline'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedFriend(null)}
                                className="text-neutral-400 hover:text-white p-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex flex-col space-y-1.5 pt-1 border-t border-white/[0.08]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  handleSendMessage(friend.steam_id, e);
                                  setSelectedFriend(null);
                                }}
                                className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white text-[11px] font-medium transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                                <span>Message in Steam</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  handleInvite(friend, e);
                                  setSelectedFriend(null);
                                }}
                                className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-[#ce422b] hover:bg-[#b03420] text-white text-[11px] font-semibold transition-colors shadow-sm"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Invite to Server</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {friends.length === 0 && (
                    <div className="text-[9px] text-neutral-500 text-center py-2 font-mono">
                      No friends
                    </div>
                  )}
                </div>
              ) : (
                /* Collapsed Offline State Prompt */
                <div
                  onClick={() => setIsExpanded(true)}
                  className="flex-1 flex flex-col items-center justify-center space-y-2 cursor-pointer group text-center py-4"
                  title="Steam is closed. Click to open panel."
                >
                  <div className="p-2 rounded-xl bg-white/[0.03] group-hover:bg-orange-500/10 group-hover:text-orange-400 text-neutral-500 transition-all border border-white/[0.05] group-hover:border-orange-500/25">
                    <WifiOff className="w-4 h-4" />
                  </div>
                  <span className="text-[8px] font-mono uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300">
                    Offline
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================= EXPANDED FULL DOCK ================= */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0f1219]">
            {/* Host Profile Header */}
            <div className="p-4 border-b border-white/[0.08] bg-gradient-to-r from-[#141824] to-[#10131d] flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="relative shrink-0">
                  <div
                    className={`w-11 h-11 rounded-full p-[2px] ${
                      isOnline
                        ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                        : 'bg-white/[0.1] border border-white/10'
                    }`}
                  >
                    <div className="w-full h-full rounded-full bg-[#181b24] flex items-center justify-center text-white font-bold text-xs overflow-hidden">
                      {steamStatus?.avatar && !avatarError ? (
                        <img
                          src={steamStatus.avatar}
                          alt={steamStatus.persona_name || 'Host'}
                          className={`w-full h-full rounded-full object-cover ${
                            !isOnline ? 'grayscale opacity-60' : ''
                          }`}
                          onError={() => setAvatarError(true)}
                        />
                      ) : steamStatus?.persona_name ? (
                        <span className="text-white font-black">
                          {steamStatus.persona_name.slice(0, 2).toUpperCase()}
                        </span>
                      ) : (
                        '👤'
                      )}
                    </div>
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#141824] ${
                      isOnline
                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                        : 'bg-neutral-500'
                    }`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-bold text-white truncate flex items-center space-x-1.5">
                    <span>{steamStatus?.persona_name || 'Steam User'}</span>
                    <span className="text-[10px] text-sky-400">
                      <SteamIcon className="w-3 h-3" />
                    </span>
                  </h3>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                      }`}
                    />
                    <span
                      className={`text-[10px] font-mono font-medium ${
                        isOnline ? 'text-emerald-400' : 'text-neutral-400'
                      }`}
                    >
                      {isOnline ? 'Steam Online' : 'Steam Offline / Closed'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => loadSteamData(true)}
                  disabled={isRefreshing}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
                  title="Check / Refresh Steam Status"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isRefreshing ? 'animate-spin text-orange-400' : ''
                    }`}
                  />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors"
                  title="Collapse to Mini Dock"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Offline Callout Banner if Steam is not open */}
            {!isOnline && (
              <div className="m-3 p-4 rounded-xl bg-gradient-to-b from-[#181d2a] to-[#121520] border border-sky-500/30 shadow-xl space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                    <SteamIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Steam is Not Running</h4>
                    <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                      Launch Steam on your PC to see active friends, check their in-game presence, and invite them directly to your server.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={handleLaunchSteam}
                    className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-sky-600/20 transition-all cursor-pointer"
                  >
                    <SteamIcon className="w-3.5 h-3.5" />
                    <span>Launch Steam</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => loadSteamData(true)}
                    disabled={isRefreshing}
                    className="px-3 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 text-xs font-mono transition-colors"
                    title="Re-check if Steam started"
                  >
                    {isRefreshing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-400" />
                    ) : (
                      <span>Re-check</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Online Friends Search & Tabs (when Online) */}
            {isOnline && (
              <>
                {/* Search Bar */}
                <div className="p-3 border-b border-white/[0.06] bg-[#0c0e14]">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search Steam friends..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#131620] border border-white/[0.08] focus:border-orange-500/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Filter Tabs with Colored Counters */}
                <div className="px-3 py-2 flex items-center space-x-1.5 border-b border-white/[0.06] bg-[#0a0c11]">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 py-1 px-2 rounded-md text-[10px] font-bold tracking-wider uppercase transition-colors ${
                      activeTab === 'all'
                        ? 'bg-white/[0.1] text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.03]'
                    }`}
                  >
                    All ({friends.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('online')}
                    className={`flex-1 py-1 px-2 rounded-md text-[10px] font-bold tracking-wider uppercase transition-colors flex items-center justify-center space-x-1 ${
                      activeTab === 'online'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-neutral-400 hover:text-emerald-300 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Online ({onlineCount})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('offline')}
                    className={`flex-1 py-1 px-2 rounded-md text-[10px] font-bold tracking-wider uppercase transition-colors ${
                      activeTab === 'offline'
                        ? 'bg-white/[0.1] text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.03]'
                    }`}
                  >
                    Offline ({offlineCount})
                  </button>
                </div>

                {/* Scrollable Friends Cards List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {filteredFriends.length === 0 && !isRefreshing && (
                    <div className="py-12 text-center text-xs text-neutral-500 space-y-2">
                      <Users className="w-5 h-5 mx-auto text-neutral-600" />
                      <p>
                        {searchQuery
                          ? 'No friends match search query'
                          : 'No friends found on this account'}
                      </p>
                    </div>
                  )}

                  {filteredFriends.map((friend) => {
                    const isInviting = invitingId === friend.steam_id;
                    const isInvited = invitedMap[friend.steam_id];
                    const isPlayingGame = !!friend.current_game;
                    const isPlayingRust = friend.current_game?.toLowerCase().includes('rust');
                    const isFriendOnline = friend.online || isPlayingGame;
                    const isSelected = selectedFriend?.steam_id === friend.steam_id;

                    return (
                      <div
                        key={friend.steam_id}
                        onClick={() => setSelectedFriend(isSelected ? null : friend)}
                        className={`p-2.5 rounded-xl border transition-all flex items-center justify-between group cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-orange-500/80 border-orange-500/60 bg-orange-500/[0.08] shadow-[0_0_15px_rgba(234,90,54,0.25)]'
                            : isPlayingRust
                            ? 'bg-gradient-to-r from-orange-500/10 to-transparent border-orange-500/30 hover:border-orange-500/50'
                            : isPlayingGame
                            ? 'bg-gradient-to-r from-emerald-500/10 to-transparent border-emerald-500/30 hover:border-emerald-500/50'
                            : isFriendOnline
                            ? 'bg-[#131622] border-white/[0.07] hover:border-sky-500/40'
                            : 'bg-[#10121a] border-white/[0.04] opacity-70'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          {/* Avatar with Status Ring & Dot */}
                          <div className="relative shrink-0">
                            <div
                              className={`w-9 h-9 rounded-full p-[1.5px] ${
                                isPlayingRust
                                  ? 'bg-gradient-to-tr from-orange-500 to-amber-400 shadow-[0_0_8px_rgba(249,115,22,0.4)]'
                                  : isPlayingGame
                                  ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.35)]'
                                  : isFriendOnline
                                  ? 'bg-gradient-to-tr from-sky-500 to-blue-500 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                                  : 'bg-white/10'
                              }`}
                            >
                              {friend.avatar && !friendAvatarErrors[friend.steam_id] ? (
                                <img
                                  src={friend.avatar}
                                  alt={friend.name}
                                  className={`w-full h-full rounded-full object-cover ${
                                    !isFriendOnline ? 'grayscale opacity-40' : ''
                                  }`}
                                  onError={() =>
                                    setFriendAvatarErrors((prev) => ({
                                      ...prev,
                                      [friend.steam_id]: true,
                                    }))
                                  }
                                />
                              ) : (
                                <div className={`w-full h-full rounded-full bg-gradient-to-br ${getAvatarGradient(friend.name)} flex items-center justify-center text-white font-black text-[10px]`}>
                                  {friend.name.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>

                            <span
                              className={`absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0f1219] ${
                                isPlayingGame
                                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                                  : isFriendOnline
                                  ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]'
                                  : 'bg-neutral-600'
                              }`}
                            />
                          </div>

                          {/* Name & Activity Status */}
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-white truncate">
                              {friend.name}
                            </h4>
                            <div className="flex items-center space-x-1 mt-0.5">
                              {isPlayingRust ? (
                                <span className="text-[10px] text-orange-400 font-bold font-mono flex items-center space-x-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                                  <span>Playing Rust</span>
                                </span>
                              ) : isPlayingGame ? (
                                <span className="text-[10px] text-emerald-400 font-semibold truncate flex items-center space-x-1">
                                  <Gamepad2 className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">{friend.current_game}</span>
                                </span>
                              ) : isFriendOnline ? (
                                <span className="text-[10px] text-sky-400 font-medium font-mono">
                                  Online
                                </span>
                              ) : (
                                <span className="text-[10px] text-neutral-500 font-mono">
                                  Offline
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center space-x-1 shrink-0 ml-2">
                          <button
                            onClick={(e) => handleSendMessage(friend.steam_id, e)}
                            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-colors"
                            title="Open Steam Chat"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => handleInvite(friend, e)}
                            disabled={isInviting}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1 ${
                              isInvited
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-gradient-to-r from-[#e05338] to-[#ce422b] hover:from-[#f06145] hover:to-[#df4a32] text-white shadow-sm'
                            }`}
                            title="Invite to Rust Server"
                          >
                            {isInvited ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : isInviting ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-white" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            <span className="text-[10px]">
                              {isInvited ? 'Sent' : 'Invite'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};
