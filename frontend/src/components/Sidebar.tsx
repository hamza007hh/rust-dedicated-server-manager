import React from 'react';
import {
  LayoutDashboard,
  Server,
  Plus,
  Terminal,
  Puzzle,
  HardDrive,
  Clock,
  Sliders,
  Map,
  Settings,
  Lock,
} from 'lucide-react';
import { SteamStatus } from '../types/server';

interface SidebarProps {
  currentPage: string;
  onSelectPage: (page: string) => void;
  hasCreatedServer?: boolean;
  onOpenCreateWizard?: () => void;
  serversCount?: number;
  backupsCount?: number;
  pluginsCount?: number;
  isRunning?: boolean;
  steamStatus?: SteamStatus | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | null;
  badgeClass?: string;
  requiredServer: boolean;
  isAction?: boolean;
}

interface NavCategory {
  title?: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  hasCreatedServer = true,
  onOpenCreateWizard,
  serversCount = 1,
  backupsCount = 0,
  pluginsCount = 0,
  isRunning = false,
  steamStatus,
}) => {
  const categories: NavCategory[] = [
    {
      title: 'GAME MANAGEMENT',
      items: [
        {
          id: 'console',
          label: 'Live Console',
          icon: Terminal,
          badge: isRunning ? 'LIVE' : null,
          badgeClass: isRunning ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : undefined,
          requiredServer: true,
        },
        {
          id: 'plugins',
          label: 'Mods & Plugins',
          icon: Puzzle,
          badge: pluginsCount > 0 ? String(pluginsCount) : null,
          requiredServer: true,
        },
        {
          id: 'saves',
          label: 'Backups & Saves',
          icon: HardDrive,
          badge: backupsCount > 0 ? String(backupsCount) : null,
          requiredServer: true,
        },
        {
          id: 'scheduler',
          label: 'Task Scheduler',
          icon: Clock,
          requiredServer: true,
        },
      ],
    },
    {
      title: 'SERVER SETTINGS',
      items: [
        {
          id: 'maps',
          label: 'Map & World',
          icon: Map,
          requiredServer: true,
        },
        {
          id: 'server_cfg',
          label: 'Server Config',
          icon: Sliders,
          requiredServer: true,
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          requiredServer: false,
        },
      ],
    },
  ];

  return (
    <aside className="w-60 bg-[#0e1015] border-r border-white/[0.06] flex flex-col h-full select-none z-20 shrink-0 text-neutral-300">
      {/* Pinned Top Navigation */}
      <div className="p-3 pb-2.5 space-y-1.5 border-b border-white/[0.06] shrink-0 bg-[#0c0e12]">
        {/* Dashboard Button */}
        <button
          onClick={() => onSelectPage('dashboard')}
          className={`w-full relative flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all group ${
            currentPage === 'dashboard'
              ? 'bg-white/[0.07] text-white border border-white/[0.09] shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          {currentPage === 'dashboard' && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-[#e05338] shadow-[0_0_8px_rgba(224,83,56,0.5)]" />
          )}
          <div className="flex items-center space-x-2.5 min-w-0">
            <LayoutDashboard className={`w-4 h-4 shrink-0 transition-colors ${currentPage === 'dashboard' ? 'text-orange-400' : 'text-neutral-400 group-hover:text-neutral-200'}`} />
            <span className="truncate">Dashboard</span>
          </div>
          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${currentPage === 'dashboard' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25' : 'bg-white/[0.03] text-neutral-500'}`}>
            HOME
          </span>
        </button>

        {/* My Game Servers Button */}
        <button
          disabled={!hasCreatedServer}
          onClick={() => onSelectPage('server')}
          className={`w-full relative flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-wide transition-all group ${
            (currentPage === 'server' || currentPage === 'server_cfg')
              ? 'bg-white/[0.07] text-white font-semibold border border-white/[0.09] shadow-sm'
              : !hasCreatedServer
              ? 'text-neutral-600 cursor-not-allowed opacity-40'
              : 'text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.03]'
          }`}
        >
          {(currentPage === 'server' || currentPage === 'server_cfg') && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-[#e05338] shadow-[0_0_8px_rgba(224,83,56,0.5)]" />
          )}
          <div className="flex items-center space-x-2.5 min-w-0">
            <Server className={`w-4 h-4 shrink-0 transition-colors ${(currentPage === 'server' || currentPage === 'server_cfg') ? 'text-orange-400' : 'text-neutral-400 group-hover:text-neutral-200'}`} />
            <span className="truncate">My Game Servers</span>
          </div>
          {serversCount > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold bg-white/[0.04] text-neutral-400 border border-white/[0.06]">
              {serversCount}
            </span>
          )}
        </button>

        {/* Create New Server Button */}
        <button
          onClick={() => onOpenCreateWizard?.()}
          className="w-full relative flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-wide transition-all text-neutral-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-orange-500/30 group"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <Plus className="w-4 h-4 shrink-0 text-orange-400 group-hover:rotate-90 transition-transform duration-200" />
            <span className="truncate font-semibold">Create New Server</span>
          </div>
        </button>
      </div>

      {/* Categorized Navigation List */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {categories.map((cat, catIdx) => (
          <div key={catIdx} className="space-y-1">
            {cat.title && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-widest text-neutral-500 uppercase font-mono">
                {cat.title}
              </div>
            )}

            <div className="space-y-0.5">
              {cat.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                const isLocked = !hasCreatedServer && item.requiredServer;

                return (
                  <button
                    key={item.id}
                    disabled={isLocked}
                    onClick={() => {
                      if (item.isAction) {
                        onOpenCreateWizard?.();
                      } else if (!isLocked) {
                        onSelectPage(item.id);
                      }
                    }}
                    className={`w-full relative flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium tracking-wide transition-all group ${
                      isActive
                        ? 'bg-white/[0.07] text-white font-semibold border border-white/[0.09] shadow-sm'
                        : isLocked
                        ? 'text-neutral-600 cursor-not-allowed opacity-40'
                        : 'text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.03]'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-[#e05338] shadow-[0_0_8px_rgba(224,83,56,0.5)]" />
                    )}

                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-orange-400'
                            : isLocked
                            ? 'text-neutral-600'
                            : 'text-neutral-400 group-hover:text-neutral-200'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {/* Status Badge / Lock */}
                    <div className="flex items-center space-x-1 shrink-0 ml-2">
                      {isLocked ? (
                        <Lock className="w-3 h-3 text-neutral-600" />
                      ) : item.badge ? (
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                            item.badgeClass ||
                            (isActive
                              ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25'
                              : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]')
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Steam Profile Status Card */}
      <div className="shrink-0 p-3 border-t border-white/[0.06] bg-[#0c0e12]">
        <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full p-[1.5px] bg-white/[0.1] border border-white/10">
              <div className="w-full h-full rounded-full bg-[#161922] flex items-center justify-center text-white font-bold text-xs overflow-hidden">
                {steamStatus?.avatar ? (
                  <img
                    src={steamStatus.avatar}
                    alt={steamStatus.persona_name || 'Steam User'}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : steamStatus?.persona_name ? (
                  steamStatus.persona_name.slice(0, 2).toUpperCase()
                ) : (
                  '👤'
                )}
              </div>
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c0e12] ${
                steamStatus?.is_logged_on ? 'bg-[#54b848]' : 'bg-slate-500'
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">
              {steamStatus?.persona_name || (steamStatus?.is_available ? 'Steam User' : 'Steam Offline')}
            </div>
            <div className="text-[10px] text-neutral-400 truncate flex items-center space-x-1 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${steamStatus?.is_logged_on ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className={steamStatus?.is_logged_on ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                {steamStatus?.is_logged_on ? 'Steam Connected' : 'Steam Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
