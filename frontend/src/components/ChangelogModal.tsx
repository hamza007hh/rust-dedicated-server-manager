import React from 'react';
import { X } from 'lucide-react';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="relative w-full max-w-md bg-[#13151b] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
        {/* Header - Simple clean style from Image 4 */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between bg-[#161820]">
          <h2 className="text-sm font-bold text-white tracking-wide">Changelog</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Changelog List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs leading-relaxed">
          {/* v1.0.0 CURRENT */}
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-orange-500 font-bold font-mono text-sm">v1.0.0</span>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                CURRENT
              </span>
            </div>

            <ul className="mt-2.5 space-y-2 text-neutral-300 pl-1">
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Start appears as soon as an install or repair finishes.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Direct 1-click Dedicated Server management with auto crash watchdog and restart.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Multi-profile support to create, switch, and host multiple independent server instances.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Live interactive RCON terminal with command autocomplete and colorized log filtering.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Native support for Vanilla, Oxide (uMod), and Carbon modding frameworks.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>In-app plugin manager to search, install, enable, and disable uMod plugins instantly.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>High-resolution procedural satellite map viewer with seed and world size preview.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>ConVar server rules editor for Bradley APC, Cargo Ship, radiation, decay, upkeep, and instant craft.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Automated wipe scheduler and timestamped zip snapshot backup restore points.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Steam Friends dock showing online friends with 1-click server connect invites and direct chat.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Integrated SteamCMD toolchain with auto-download, game validation, and branch switching.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>Real-time hardware telemetry: Server FPS, active players, player queue, RAM, and entity count.</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-neutral-500 select-none">•</span>
                <span>System tray support with launch on startup, minimize to tray, and close to tray.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
