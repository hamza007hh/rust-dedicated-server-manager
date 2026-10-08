import React from 'react';
import { Play, Square, RotateCw, Copy, Check } from 'lucide-react';
import { ServerStatus, NetInfo, ServerConfig } from '../types/server';
import { ServerProfileSwitcher } from './ServerProfileSwitcher';

interface HeaderProps {
  title: string;
  status: ServerStatus;
  config: ServerConfig;
  onProfileSwitched: (newConfig: ServerConfig) => void;
  netInfo: NetInfo | null;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  isActionLoading: boolean;
  isInstalled?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  status,
  config,
  onProfileSwitched,
  netInfo,
  onStart,
  onStop,
  onRestart,
  isActionLoading,
  isInstalled = true,
}) => {
  const [copiedLocal, setCopiedLocal] = React.useState(false);
  const [copiedLan, setCopiedLan] = React.useState(false);

  const copyToClipboard = (text: string, isLan: boolean) => {
    navigator.clipboard.writeText(text);
    if (isLan) {
      setCopiedLan(true);
      setTimeout(() => setCopiedLan(false), 2000);
    } else {
      setCopiedLocal(true);
      setTimeout(() => setCopiedLocal(false), 2000);
    }
  };

  const isRunning = status === 'running' || status === 'rcon_unavailable';
  const isTransitioning = status === 'starting' || status === 'stopping';

  return (
    <header className="h-14 bg-[#101217] border-b border-white/[0.06] px-6 flex items-center justify-between select-none shrink-0 z-10">
      {/* Title & Server Profile Switcher */}
      <div className="flex items-center space-x-4">
        <h2 className="text-sm font-bold text-white hidden md:block tracking-wide uppercase font-mono">{title}</h2>
        <ServerProfileSwitcher
          status={status}
          currentConfig={config}
          onProfileSwitched={onProfileSwitched}
        />
      </div>

      {/* Connection Info & Action Buttons */}
      <div className="flex items-center space-x-3">
        {netInfo && (
          <div className="hidden lg:flex items-center space-x-2">
            <button
              onClick={() => copyToClipboard(netInfo.connect_local, false)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.07] text-xs font-mono text-neutral-300 hover:border-orange-500/40 transition-colors"
              title="Copy local connection command"
            >
              <span className="text-neutral-500">Local:</span>
              <span>:{netInfo.game_port}</span>
              {copiedLocal ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-neutral-500" />}
            </button>

            <button
              onClick={() => copyToClipboard(netInfo.connect_lan, true)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.07] text-xs font-mono text-neutral-300 hover:border-orange-500/40 transition-colors"
              title="Copy LAN connection command"
            >
              <span className="text-neutral-500">LAN:</span>
              <span>{netInfo.lan_ip}:{netInfo.game_port}</span>
              {copiedLan ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-neutral-500" />}
            </button>
          </div>
        )}

        {/* Primary Lifecycle Controls */}
        <div className="flex items-center space-x-2 pl-3 border-l border-white/[0.07]">
          {status === 'running' || status === 'rcon_unavailable' ? (
            <button
              onClick={onStop}
              disabled={isActionLoading}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-[#ce422b] hover:bg-[#b03420] text-white font-semibold text-xs disabled:opacity-50 transition-colors shadow-sm"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Server</span>
            </button>
          ) : status === 'stopping' ? (
            <button
              disabled
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-[#ce422b]/60 text-white font-semibold text-xs disabled:opacity-50 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current animate-pulse" />
              <span>Stopping...</span>
            </button>
          ) : status === 'starting' ? (
            <button
              disabled
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-amber-600/70 text-white font-semibold text-xs disabled:opacity-50 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current animate-pulse" />
              <span>Starting...</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={isActionLoading || isInstalled === false}
              title={isInstalled === false ? "Cannot start: Rust Dedicated Server is not installed or configured." : undefined}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs disabled:opacity-40 transition-colors shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Server</span>
            </button>
          )}

          <button
            onClick={onRestart}
            disabled={!isRunning || isTransitioning || isActionLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 border border-white/[0.07] font-medium text-xs disabled:opacity-40 transition-colors"
            title="Restart server"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Restart</span>
          </button>
        </div>
      </div>
    </header>
  );
};
