import React, { useState } from 'react';
import { ServerRules, ServerStatus } from '../types/server';
import { api } from '../services/api';
import { Zap, RotateCcw, Info } from 'lucide-react';

interface LiveServerRulesProps {
  rules: ServerRules;
  status: ServerStatus;
  onRulesChanged: (newRules: ServerRules) => void;
}

interface RuleItemConfig {
  key: keyof ServerRules;
  label: string;
  description?: string;
}

// Rules that can be applied immediately live to the running server via RCON without restarting!
const LIVE_HOTRELOAD_RULES: RuleItemConfig[] = [
  { key: 'bradley_apc', label: 'Bradley APC', description: 'bradley.enabled' },
  { key: 'timed_events', label: 'Timed events', description: 'server.events' },
  { key: 'cargo_ship', label: 'Cargo Ship', description: 'cargoship.event_enabled' },
  { key: 'radiation', label: 'Radiation', description: 'server.radiation' },
  { key: 'scientists_npcs', label: 'Scientists / NPCs AI', description: 'ai.think' },
  { key: 'structural_stability', label: 'Structural stability', description: 'server.stability' },
  { key: 'halloween_event', label: 'Halloween event', description: 'halloween.enabled' },
  { key: 'christmas_event', label: 'Christmas event', description: 'xmas.enabled' },
  { key: 'no_animals', label: 'No animals', description: 'ai.npc_enable' },
  { key: 'passive_scientists', label: 'Passive scientists', description: 'ai.ignoreplayers' },
  { key: 'lock_time_16_8', label: 'Lock time to 16.8 (Day)', description: 'env.time 16.8 & env.progresstime' },
  { key: 'lock_clear_weather', label: 'Lock clear weather', description: 'weather.* clear' },
  { key: 'spawn_loot_on_start', label: 'Populate world loot', description: 'spawn.respawn_populations' },
  { key: 'no_building_upkeep', label: 'No building upkeep', description: 'decay.upkeep false' },
  { key: 'no_decay', label: 'No decay', description: 'decay.scale 0' },
  { key: 'instant_craft', label: 'Instant craft', description: 'crafting.instant true' },
  { key: 'creative_mode', label: 'Creative mode for everyone', description: 'creative.allusers' },
  { key: 'free_build', label: 'Free build', description: 'creative.freebuild' },
  { key: 'free_placement', label: 'Free placement', description: 'creative.freeplacement' },
  { key: 'free_repair', label: 'Free repair', description: 'creative.freerepair' },
  { key: 'unlimited_io', label: 'Unlimited IO wiring', description: 'creative.unlimitedio' },
  { key: 'instant_placement', label: 'Instant placement', description: 'creative.freeplacement' },
  { key: 'always_on_entities', label: 'Always-on electricals', description: 'creative.alwaysonenabled' },
];

// Rules that alter engine launch flags or bootloader generation and REQUIRE a server restart
const RESTART_REQUIRED_RULES: RuleItemConfig[] = [
  {
    key: 'relaxed_anti_cheat',
    label: 'Relaxed anti-cheat (No EAC)',
    description: 'Disables EasyAntiCheat client verification. Requires server restart to apply command-line boot flags.',
  },
  {
    key: 'skip_ai_navmesh',
    label: 'Skip AI navmesh (Faster boot)',
    description: 'Bypasses AI navmesh grid generation on map load, speeding up server boot by up to 80%. Requires server restart.',
  },
];

export const LiveServerRules: React.FC<LiveServerRulesProps> = ({
  rules,
  status,
  onRulesChanged,
}) => {
  const [toastMsg, setToastMsg] = useState<{ text: string; isRestart: boolean } | null>(null);

  const handleToggle = async (key: keyof ServerRules, requiresRestart: boolean) => {
    const updated = {
      ...rules,
      [key]: !rules[key],
    };
    onRulesChanged(updated);

    try {
      await api.updateServerRules(updated);
      const isRunning = status === 'running';
      const prettyName = key.replace(/_/g, ' ');

      if (isRunning && requiresRestart) {
        setToastMsg({
          text: `Saved "${prettyName}". Server restart required for this setting to take effect.`,
          isRestart: true,
        });
      } else if (isRunning && !requiresRestart) {
        setToastMsg({
          text: `⚡ Applied "${prettyName}" live to server via RCON (No restart needed)!`,
          isRestart: false,
        });
      } else {
        setToastMsg({
          text: `Saved "${prettyName}" to server.cfg.`,
          isRestart: false,
        });
      }
      setTimeout(() => setToastMsg(null), 3500);
    } catch (e: any) {
      console.warn('Failed to update server rule:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 bg-dark-card border px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2.5 text-xs font-mono text-slate-100 animate-fade-in ${
            toastMsg.isRestart
              ? 'border-amber-500/50 text-amber-200'
              : 'border-emerald-500/50 text-emerald-200'
          }`}
        >
          {toastMsg.isRestart ? (
            <RotateCcw className="w-4 h-4 text-amber-400 shrink-0 animate-spin-slow" />
          ) : (
            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* EXPLANATORY HEADER BANNER */}
      <div className="bg-dark-bg/80 border border-dark-border rounded-xl p-3.5 flex items-start space-x-3 text-xs">
        <Info className="w-4 h-4 text-rust-400 shrink-0 mt-0.5" />
        <div className="text-slate-300 space-y-1 font-sans leading-relaxed text-[11.5px]">
          <span className="font-semibold text-slate-100 block font-mono">
            Live Hot-Reloading vs Server Restart:
          </span>
          <p>
            The <strong>22 gameplay &amp; creative rules</strong> below can be enabled and disabled <strong>live while the server is online</strong> without restarting. Changes are dispatched instantly over RCON and saved to <code className="text-rust-400 font-mono">server.cfg</code>. Only startup-level rules (Anti-Cheat &amp; NavMesh) require restarting the server.
          </p>
        </div>
      </div>

      {/* LIVE SERVER RULES SECTION */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
              Live Hot-Reload Rules ({LIVE_HOTRELOAD_RULES.length})
            </span>
          </div>
          {status === 'running' ? (
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Hot-Reloads Live Over RCON</span>
            </span>
          ) : (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/40 px-2 py-0.5 rounded border border-slate-700/40">
              Saved to server.cfg
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {LIVE_HOTRELOAD_RULES.map((item) => {
            const isActive = !!rules[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleToggle(item.key, false)}
                className="flex items-center space-x-3 w-full bg-[#161a22] hover:bg-[#1c212b] border border-[#232936] rounded-lg px-4 py-3 text-left transition-all group"
              >
                {/* Switch Toggle */}
                <div
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out shrink-0 ${
                    isActive
                      ? 'bg-[#e26412] justify-end shadow-sm shadow-[#e26412]/50'
                      : 'bg-[#2a303e] justify-start'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full transition-transform duration-200 ${
                      isActive ? 'bg-white shadow' : 'bg-[#64748b]'
                    }`}
                  />
                </div>

                {/* Label & ConVar hint */}
                <div className="flex flex-col flex-1 min-w-0">
                  <span
                    className={`text-sm font-medium transition-colors truncate ${
                      isActive ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-300'
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.description && (
                    <span className="text-[10px] font-mono text-slate-500 truncate">
                      {item.description}
                    </span>
                  )}
                </div>

                {/* Live Badge */}
                <span className="text-[9px] font-mono text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                  LIVE
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RESTART REQUIRED SECTION */}
      <div className="space-y-3 border-t border-dark-border/60 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
              Startup &amp; Performance Rules
            </span>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            Requires Server Restart
          </span>
        </div>

        <div className="space-y-2.5">
          {RESTART_REQUIRED_RULES.map((item) => {
            const isActive = !!rules[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleToggle(item.key, true)}
                className="flex items-center space-x-3 w-full bg-[#161a22] hover:bg-[#1c212b] border border-[#232936] rounded-lg px-4 py-3.5 text-left transition-all group"
              >
                {/* Switch Toggle */}
                <div
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out shrink-0 ${
                    isActive
                      ? 'bg-[#e26412] justify-end shadow-sm shadow-[#e26412]/50'
                      : 'bg-[#2a303e] justify-start'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full transition-transform duration-200 ${
                      isActive ? 'bg-white shadow' : 'bg-[#64748b]'
                    }`}
                  />
                </div>

                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-sm font-medium transition-colors ${
                        isActive ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-300'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="text-[9px] font-mono text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">
                      RESTART REQ.
                    </span>
                  </div>
                  {item.description && (
                    <span className="text-xs text-slate-500 mt-0.5">
                      {item.description}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

