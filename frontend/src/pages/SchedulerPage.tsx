import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Bell, Calendar, ShieldCheck, CheckCircle, AlertTriangle, RefreshCw, AlertOctagon, RotateCcw } from 'lucide-react';
import { ServerStatus, SchedulerStatus, SchedulerConfig, CrashStatus } from '../types/server';
import { api, events } from '../services/api';

interface SchedulerPageProps {
  status: ServerStatus;
}

export const SchedulerPage: React.FC<SchedulerPageProps> = () => {
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [crashStatus, setCrashStatus] = useState<CrashStatus | null>(null);

  // Form states
  const [isEnabled, setIsEnabled] = useState(true);
  const [restartTime, setRestartTime] = useState('04:00');
  const [intervalHours, setIntervalHours] = useState('24');
  const [warn15m, setWarn15m] = useState(true);
  const [warn5m, setWarn5m] = useState(true);
  const [warn1m, setWarn1m] = useState(true);

  // UI status
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latestWarning, setLatestWarning] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState<string>('--:--:--');

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sched, crash] = await Promise.all([
        api.getSchedulerStatus(),
        api.getCrashStatus(),
      ]);
      setSchedulerStatus(sched);
      setCrashStatus(crash);
      setIsEnabled(sched.enabled);
      setRestartTime(sched.restart_time);
    } catch (e: any) {
      console.warn('Failed to fetch scheduler/crash status:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Listen to live scheduler warnings
    const sub = events.onSchedulerWarning((tag) => {
      setLatestWarning(tag);
      setTimeout(() => setLatestWarning(null), 10000);
    });

    return () => {
      sub.then((unsub) => unsub());
    };
  }, [fetchStatus]);

  // Live countdown timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      if (!schedulerStatus || !schedulerStatus.enabled || !schedulerStatus.next_restart_timestamp_millis) {
        setCountdownText('Disabled');
        return;
      }

      const diff = schedulerStatus.next_restart_timestamp_millis - Date.now();
      if (diff <= 0) {
        setCountdownText('Restart imminent...');
      } else {
        const totalSecs = Math.floor(diff / 1000);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        setCountdownText(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [schedulerStatus]);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    setSavedSuccess(false);

    const cfg: SchedulerConfig = {
      enabled: isEnabled,
      restart_time: restartTime,
      interval_hours: parseInt(intervalHours) || 24,
      warn_15m: warn15m,
      warn_5m: warn5m,
      warn_1m: warn1m,
    };

    try {
      await api.saveSchedulerConfig(cfg);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      await fetchStatus();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to persist scheduler configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetCrashCount = async () => {
    try {
      await api.resetCrashCount();
      await fetchStatus();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to reset crash count');
    }
  };

  const handleToggleAutoRestart = async () => {
    if (!crashStatus) return;
    try {
      await api.setAutoRestart(!crashStatus.auto_restart_active);
      await fetchStatus();
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to update auto-restart preference');
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto px-8 pt-9 pb-16">
      <div className="max-w-4xl mx-auto space-y-6 text-neutral-100">
        {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-dark-border">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Clock className="w-5 h-5 text-rust-500" />
            <span>Automated Restart Scheduler & Crash Protection</span>
          </h2>
          <p className="text-xs text-slate-400">
            Configure automated daily server restarts, in-game warnings via RCON, and supervise crash circuit breakers.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchStatus}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border hover:border-slate-700 text-xs text-slate-300 font-mono transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-rust-500' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono font-medium shadow-lg shadow-rust-600/20 disabled:opacity-50 transition-all"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            <span>Save Schedule</span>
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2 font-mono">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Scheduler settings saved and active.</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 font-mono">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {latestWarning && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center space-x-2 font-mono animate-pulse">
          <Bell className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Active in-game countdown alert dispatched: {latestWarning.toUpperCase()}</span>
        </div>
      )}

      {/* Next Restart Countdown Card */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-3 font-mono">
        <div className="flex items-center justify-between pb-2 border-b border-dark-border">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Next Scheduled Restart</span>
          <span className="text-xs text-slate-500">
            {schedulerStatus?.next_restart_timestamp_millis
              ? new Date(schedulerStatus.next_restart_timestamp_millis).toLocaleString()
              : 'Not Scheduled'}
          </span>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="text-3xl font-black tracking-widest text-rust-500">
              {countdownText}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Time remaining until automated server stop, restart, and state recovery.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-dark-bg/60 border border-dark-border text-right text-xs">
            <div className="text-slate-400">Target Time</div>
            <div className="text-slate-100 font-bold text-sm">{restartTime} (Daily)</div>
          </div>
        </div>
      </div>

      {/* Main Schedule Toggle Card */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Enable Automated Scheduled Restarts</h3>
            <p className="text-xs text-slate-400">
              Regular restarts maintain maximum tickrate, purge entity fragmentation, and prevent memory leaks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsEnabled(!isEnabled)}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              isEnabled ? 'bg-rust-600 justify-end' : 'bg-dark-elevated border border-dark-border justify-start'
            }`}
          >
            <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
          </button>
        </div>
      </div>

      {/* Timing Controls */}
      <div className={`space-y-4 ${isEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 font-mono flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-rust-500" />
            <span>Restart Timing</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Daily Restart Time (24h format)</label>
              <input
                type="time"
                value={restartTime}
                onChange={(e) => setRestartTime(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                Typically scheduled during off-peak hours (e.g. 04:00 AM).
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Recurrence Interval</label>
              <select
                value={intervalHours}
                onChange={(e) => setIntervalHours(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-rust-500"
              >
                <option value="6">Every 6 Hours</option>
                <option value="12">Every 12 Hours</option>
                <option value="24">Every 24 Hours (Daily)</option>
                <option value="48">Every 48 Hours</option>
              </select>
            </div>
          </div>
        </div>

        {/* Warning Broadcasts */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 font-mono flex items-center space-x-2">
            <Bell className="w-4 h-4 text-rust-500" />
            <span>In-Game Countdown Announcements</span>
          </h3>
          <p className="text-xs text-slate-400">
            Broadcasts automated warning messages into global chat prior to restarting.
          </p>

          <div className="space-y-3 font-mono text-xs">
            <label className="flex items-center space-x-3 p-3 rounded bg-dark-bg/60 border border-dark-border/60 cursor-pointer">
              <input
                type="checkbox"
                checked={warn15m}
                onChange={(e) => setWarn15m(e.target.checked)}
                className="w-4 h-4 rounded text-rust-600 bg-dark-card border-dark-border focus:ring-0"
              />
              <span className="text-slate-200">15 Minutes Warning ("say Server restart in 15 minutes!")</span>
            </label>

            <label className="flex items-center space-x-3 p-3 rounded bg-dark-bg/60 border border-dark-border/60 cursor-pointer">
              <input
                type="checkbox"
                checked={warn5m}
                onChange={(e) => setWarn5m(e.target.checked)}
                className="w-4 h-4 rounded text-rust-600 bg-dark-card border-dark-border focus:ring-0"
              />
              <span className="text-slate-200">5 Minutes Warning ("say Server restart in 5 minutes! Seek shelter.")</span>
            </label>

            <label className="flex items-center space-x-3 p-3 rounded bg-dark-bg/60 border border-dark-border/60 cursor-pointer">
              <input
                type="checkbox"
                checked={warn1m}
                onChange={(e) => setWarn1m(e.target.checked)}
                className="w-4 h-4 rounded text-rust-600 bg-dark-card border-dark-border focus:ring-0"
              />
              <span className="text-slate-200">1 Minute Warning ("say Server restart in 60s! Saving map...")</span>
            </label>
          </div>
        </div>
      </div>

      {/* Crash Protection & Circuit Breaker */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4 font-mono">
        <div className="flex items-center justify-between pb-3 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
            <AlertOctagon className="w-4 h-4 text-rust-500" />
            <span>Process Crash Circuit Breaker</span>
          </h3>

          <button
            onClick={handleResetCrashCount}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-dark-elevated hover:bg-dark-border border border-dark-border text-xs text-slate-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3 text-rust-500" />
            <span>Reset Crash Counter</span>
          </button>
        </div>

        {crashStatus?.is_in_crash_loop && (
          <div className="p-3.5 rounded-xl bg-rose-600/10 border border-rose-500 text-rose-300 text-xs flex items-center space-x-3">
            <AlertOctagon className="w-5 h-5 text-rose-500 shrink-0" />
            <div>
              <div className="font-bold">CRASH LOOP DETECTED: Automatic restarts halted.</div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                The server crashed more than 3 times within 5 minutes. To avoid boot-looping and corrupting saves, automatic restart has been automatically held. Inspect logs and click "Reset Crash Counter" when resolved.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-dark-bg/60 border border-dark-border/60">
            <span className="text-slate-400 block text-[11px] mb-1">Recent Crashes</span>
            <span className={`text-base font-bold ${crashStatus && crashStatus.crash_count > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {crashStatus ? crashStatus.crash_count : 0} crashes
            </span>
          </div>

          <div className="p-3 rounded-lg bg-dark-bg/60 border border-dark-border/60">
            <span className="text-slate-400 block text-[11px] mb-1">Last Exit Code</span>
            <span className="text-base font-bold text-slate-200">
              {crashStatus?.last_exit_code !== null && crashStatus?.last_exit_code !== undefined
                ? crashStatus.last_exit_code
                : 'None'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-dark-bg/60 border border-dark-border/60 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block text-[11px]">Auto-Restart on Crash</span>
              <span className="text-xs font-bold text-slate-200">
                {crashStatus?.auto_restart_active ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <button
              onClick={handleToggleAutoRestart}
              className={`px-3 py-1 rounded text-[11px] border ${
                crashStatus?.auto_restart_active
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              Toggle
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
