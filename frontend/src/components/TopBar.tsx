import React from 'react';
import {
  Heart,
  FileText,
  Minus,
  Square,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { RustLogo } from './RustLogo';

interface TopBarProps {
  onOpenDonate: () => void;
  onOpenChangelog: () => void;
  onNavigate?: (page: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenDonate, onOpenChangelog, onNavigate: _onNavigate }) => {
  const handleOpenDiscord = () => {
    try {
      window.open('https://discord.gg/rust', '_blank');
    } catch (e) {
      console.warn('Failed to open discord link:', e);
    }
  };

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {
      await api.windowMinimize();
    }
  };

  const handleToggleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch {
      await api.windowToggleMaximize();
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      // ignore
    }
    await api.windowClose();
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target.closest('[data-no-drag]')) {
        return;
      }
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().startDragging();
      } catch {
        await api.windowStartDragging();
      }
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="h-10 bg-[#0c0e13] border-b border-white/[0.06] flex items-center justify-between pl-3 pr-0 select-none z-30 shrink-0 w-full cursor-default"
    >
      {/* Left: Custom Rust Emblem & Brand Typography (Universal drag area) */}
      <div
        data-tauri-drag-region
        className="flex items-center space-x-2.5 px-1 py-1 select-none cursor-default pointer-events-none"
      >
        <RustLogo size="xs" />

        <div className="flex items-center space-x-2">
          <span className="text-xs font-black tracking-widest text-white font-sans uppercase">
            EPIC RUST
          </span>
        </div>
      </div>

      {/* Middle Drag Area */}
      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      {/* Right: Community buttons & Prominent Window Controls */}
      <div className="flex items-center h-full pointer-events-auto">
        {/* Discord Button */}
        <button
          data-no-drag
          onClick={handleOpenDiscord}
          className="p-1.5 mx-0.5 rounded-md text-neutral-400 hover:text-[#5865F2] hover:bg-white/[0.05] transition-all flex items-center space-x-1 group cursor-pointer"
          title="Join Discord Community"
        >
          <svg
            className="w-3.5 h-3.5 fill-current transition-colors"
            viewBox="0 0 24 24"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.078.078 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </button>

        {/* Donate Button */}
        <button
          data-no-drag
          onClick={onOpenDonate}
          className="p-1.5 mx-0.5 rounded-md text-neutral-400 hover:text-orange-400 hover:bg-white/[0.05] transition-all flex items-center space-x-1 group cursor-pointer"
          title="Support Creator"
        >
          <Heart className="w-3.5 h-3.5 transition-colors group-hover:fill-orange-400/20" />
        </button>

        {/* Changelog Button */}
        <button
          data-no-drag
          onClick={onOpenChangelog}
          className="p-1.5 mx-0.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-all flex items-center space-x-1 group cursor-pointer"
          title="Changelog & Version"
        >
          <FileText className="w-3.5 h-3.5 transition-colors" />
        </button>

        <div className="h-3.5 w-px bg-white/[0.08] mx-2" />

        {/* Minimize Button */}
        <button
          data-no-drag
          onClick={handleMinimize}
          className="w-11 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Minimize"
          aria-label="Minimize"
        >
          <Minus className="w-3.5 h-3.5 stroke-[2]" />
        </button>

        {/* Maximize / Restore Button */}
        <button
          data-no-drag
          onClick={handleToggleMaximize}
          className="w-11 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Maximize or Restore"
          aria-label="Maximize"
        >
          <Square className="w-3 h-3 stroke-[2]" />
        </button>

        {/* Exit Button */}
        <button
          data-no-drag
          onClick={handleClose}
          className="w-12 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#c93b2b] transition-colors group cursor-pointer"
          title="Exit Application"
          aria-label="Exit Application"
        >
          <X className="w-4 h-4 stroke-[2.2]" />
        </button>
      </div>
    </header>
  );
};
