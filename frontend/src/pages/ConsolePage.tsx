import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Trash2, ArrowDown, Terminal as TerminalIcon, Copy, Check,
  Sun, Zap
} from 'lucide-react';
import { LogEntry, LogSource, ServerStatus } from '../types/server';
import { api } from '../services/api';

interface ConsolePageProps {
  logs: LogEntry[];
  status: ServerStatus;
  onSendCommand: (command: string) => Promise<string>;
  onClearLogs: () => void;
}

export const ConsolePage: React.FC<ConsolePageProps> = ({
  logs,
  status,
  onSendCommand,
  onClearLogs,
}) => {
  const [command, setCommand] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterSource, setFilterSource] = useState<LogSource | 'ALL'>('ALL');
  const [isSending, setIsSending] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const consoleContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd || isSending) return;

    setHistory((prev) => [...prev.filter((c) => c !== cmd), cmd]);
    setHistoryIndex(-1);

    setIsSending(true);
    try {
      await onSendCommand(cmd);
      setCommand('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setCommand(history[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      if (historyIndex >= history.length - 1) {
        setHistoryIndex(-1);
        setCommand('');
      } else {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx]);
      }
    }
  };

  const handleQuickAction = async (action: string) => {
    if (status !== 'running' || isSending) return;
    setIsSending(true);
    try {
      const res = await api.quickWeatherOrAction(action);
      setActionFeedback(res);
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (e: any) {
      setActionFeedback(`Error: ${e.message || e}`);
      setTimeout(() => setActionFeedback(null), 4000);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyAll = async () => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${new Date(l.timestamp_millis).toLocaleTimeString()}] [${l.source}] ${l.message}`
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (e) {
      console.warn('Failed to copy logs to clipboard:', e);
    }
  };

  const handleCopySingle = async (idx: number, log: LogEntry) => {
    const text = `[${new Date(log.timestamp_millis).toLocaleTimeString()}] [${log.source}] ${log.message}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLine(idx);
      setTimeout(() => setCopiedLine(null), 1500);
    } catch (e) {
      console.warn('Failed to copy log line:', e);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filterSource === 'ALL') return true;
    return log.source === filterSource;
  });

  const getSourceBadge = (source: LogSource) => {
    switch (source) {
      case 'Stdout':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'Stderr':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'Rcon':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'System':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 max-w-7xl mx-auto pt-9 pb-6 px-8 text-neutral-100">
      {/* Console Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-dark-card border border-dark-border rounded-xl p-3">
        <div className="flex items-center space-x-2">
          <TerminalIcon className="w-4 h-4 text-rust-500" />
          <span className="text-sm font-bold text-slate-200 font-mono">SERVER CONSOLE</span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              status === 'running'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {status.toUpperCase()}
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              status === 'running'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : status === 'rcon_unavailable'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}
          >
            RCON: {status === 'running' ? 'READY' : status === 'rcon_unavailable' ? 'UNAVAILABLE' : 'OFFLINE'}
          </span>
        </div>

        {/* Filter & Controls */}
        <div className="flex items-center space-x-2">
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as any)}
            className="bg-dark-bg border border-dark-border text-xs rounded-lg px-2.5 py-1 text-slate-300 font-mono focus:outline-none focus:border-rust-500"
          >
            <option value="ALL">All Sources ({logs.length})</option>
            <option value="Stdout">Stdout</option>
            <option value="Stderr">Stderr</option>
            <option value="Rcon">RCON</option>
            <option value="System">System</option>
          </select>

          <button
            onClick={handleCopyAll}
            title="Copy all console output to clipboard"
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-white border border-dark-border text-xs font-mono transition-colors"
          >
            {copiedAll ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedAll ? 'Copied All!' : 'Copy All'}</span>
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
              autoScroll
                ? 'bg-rust-600/15 text-rust-400 border-rust-500/30'
                : 'bg-dark-bg text-slate-400 border-dark-border'
            }`}
          >
            <ArrowDown className="w-3 h-3" />
            <span>Auto-Scroll</span>
          </button>

          <button
            onClick={onClearLogs}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-dark-bg hover:bg-dark-elevated text-slate-400 hover:text-slate-200 border border-dark-border text-xs font-mono transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Terminal View - Selectable text */}
      <div
        ref={consoleContainerRef}
        className="flex-1 bg-dark-bg border border-dark-border rounded-xl p-4 overflow-y-auto font-mono text-xs shadow-inner space-y-1 select-text cursor-text"
      >
        {filteredLogs.map((log, index) => {
          const time = new Date(log.timestamp_millis).toLocaleTimeString();
          return (
            <div
              key={index}
              className="flex items-start justify-between space-x-2 py-0.5 leading-relaxed hover:bg-white/[0.04] px-1 rounded group transition-colors"
            >
              <div className="flex items-start space-x-2 break-all select-text">
                <span className="text-slate-500 text-[11px] shrink-0 select-text font-mono">{time}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded border shrink-0 select-text ${getSourceBadge(log.source)}`}>
                  {log.source}
                </span>
                <span
                  className={`select-text ${
                    log.source === 'Stderr'
                      ? 'text-rose-300'
                      : log.source === 'Rcon'
                      ? 'text-amber-300 font-semibold'
                      : log.source === 'System'
                      ? 'text-blue-300'
                      : 'text-slate-200'
                  }`}
                >
                  {log.message}
                </span>
              </div>
              <button
                onClick={() => handleCopySingle(index, log)}
                title="Copy line"
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white transition-opacity shrink-0 select-none"
              >
                {copiedLine === index ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          );
        })}
        {filteredLogs.length === 0 && (
          <div className="h-full flex items-center justify-center text-slate-500 italic select-none">
            Console buffer is empty. Output from stdout, stderr, and RCON will stream here in real time.
          </div>
        )}
      </div>

      {/* Feedback banner */}
      {actionFeedback && (
        <div className="px-3 py-1.5 bg-rust-500/10 border border-rust-500/30 rounded-lg text-xs font-mono text-rust-300 flex items-center justify-between animate-fade-in">
          <span>⚡ {actionFeedback}</span>
        </div>
      )}

      {/* Quick Weather & Server Action Controls */}
      <div className="space-y-2 bg-dark-card border border-dark-border rounded-xl p-3">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          <span className="text-[11px] text-slate-400 font-mono font-semibold uppercase tracking-wider shrink-0 flex items-center space-x-1">
            <Sun className="w-3 h-3 text-amber-400" />
            <span>Time & Weather:</span>
          </span>
          <button
            onClick={() => handleQuickAction('noon')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-amber-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            ☀️ Noon
          </button>
          <button
            onClick={() => handleQuickAction('sunrise')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-amber-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            🌅 Sunrise
          </button>
          <button
            onClick={() => handleQuickAction('sunset')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-amber-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            🌇 Sunset
          </button>
          <button
            onClick={() => handleQuickAction('night')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-blue-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            🌙 Night
          </button>
          <div className="h-3 w-px bg-dark-border shrink-0" />
          <button
            onClick={() => handleQuickAction('clear')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-emerald-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            🌤️ Clear
          </button>
          <button
            onClick={() => handleQuickAction('rain')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-blue-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            🌧️ Rain
          </button>
          <button
            onClick={() => handleQuickAction('fog')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-slate-200 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            🌫️ Fog
          </button>
          <button
            onClick={() => handleQuickAction('storm')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-sky-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            ⛈️ Storm
          </button>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-1 border-t border-dark-border/50 pt-2">
          <span className="text-[11px] text-slate-400 font-mono font-semibold uppercase tracking-wider shrink-0 flex items-center space-x-1">
            <Zap className="w-3 h-3 text-rust-400" />
            <span>Server Actions:</span>
          </span>
          <button
            onClick={() => handleQuickAction('airdrop')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-amber-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            📦 Call Airdrop
          </button>
          <button
            onClick={() => handleQuickAction('heli')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-rose-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            🚁 Patrol Heli
          </button>
          <button
            onClick={() => handleQuickAction('save')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-emerald-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            💾 Save World
          </button>
          <button
            onClick={() => handleQuickAction('heal_all')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-emerald-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            💊 Heal All
          </button>
          <button
            onClick={() => handleQuickAction('reload_plugins')}
            disabled={status !== 'running' || isSending}
            className="px-2 py-0.5 rounded bg-dark-bg hover:bg-dark-elevated text-slate-300 hover:text-cyan-400 border border-dark-border text-xs font-mono shrink-0 disabled:opacity-40"
          >
            🔄 Reload Plugins
          </button>
        </div>
      </div>

      {/* Command Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status !== 'running' || isSending}
            placeholder={
              status === 'running'
                ? 'Send RCON command (e.g. status, say Hello, kick <user>)... [Up/Down for history]'
                : 'Server offline. Start server to execute live RCON commands.'
            }
            className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rust-500 disabled:opacity-50 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={status !== 'running' || !command.trim() || isSending}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white font-medium text-xs font-mono shadow-lg shadow-rust-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSending ? 'Sending...' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
};
