import React, { useState } from 'react';
import { Download, Sparkles, AlertCircle, RefreshCw, ExternalLink, X } from 'lucide-react';
import { AppUpdateInfo } from '../types/server';
import { api } from '../services/api';

interface UpdateModalProps {
  isOpen: boolean;
  updateInfo: AppUpdateInfo | null;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ isOpen, updateInfo, onClose }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Downloading update...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !updateInfo) return null;

  const handleApplyUpdate = async () => {
    if (!updateInfo.download_url) {
      if (updateInfo.html_url) {
        window.open(updateInfo.html_url, '_blank');
      }
      return;
    }

    try {
      setIsUpdating(true);
      setErrorMessage(null);
      setStatusMessage('Downloading update from GitHub...');

      // Give visual feedback before triggering the restart
      setTimeout(() => {
        if (isUpdating) {
          setStatusMessage('Installing update & restarting Epic Rust...');
        }
      }, 3500);

      await api.applyAppUpdate(updateInfo.download_url);
    } catch (err: any) {
      console.error('Update failed:', err);
      setIsUpdating(false);
      setErrorMessage(typeof err === 'string' ? err : err?.message || 'Failed to download or apply update.');
    }
  };

  const handleOpenGitHub = () => {
    const url = updateInfo.html_url || 'https://github.com/hamza007hh/Epic-Rust-Launcher/releases/latest';
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-lg bg-[#12141a] border border-orange-500/30 rounded-2xl shadow-2xl shadow-orange-950/40 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500" />

        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.08] flex items-center justify-between bg-[#161822]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide">Update Available</h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  {updateInfo.latest_version}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Current version: <span className="font-mono text-neutral-300 font-semibold">{updateInfo.current_version}</span>
              </p>
            </div>
          </div>

          {!isUpdating && (
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Release Title Banner */}
          {updateInfo.release_name && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
              <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                Release Highlight
              </div>
              <div className="text-sm font-medium text-white">
                {updateInfo.release_name}
              </div>
            </div>
          )}

          {/* Release Notes */}
          <div>
            <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>What's New</span>
              {updateInfo.published_at && (
                <span className="text-[10px] text-neutral-500 font-normal">
                  {new Date(updateInfo.published_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </span>
              )}
            </div>
            <div className="bg-black/40 border border-white/[0.06] rounded-xl p-4 max-h-48 overflow-y-auto font-sans text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap select-text">
              {updateInfo.release_notes ? (
                updateInfo.release_notes
              ) : (
                <div className="text-neutral-500 italic">
                  This update includes general performance enhancements, bug fixes, and stability improvements.
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 flex items-start space-x-3 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Update Failed</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Updating In-Progress Indicator */}
          {isUpdating && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-3 text-orange-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-xs font-medium">{statusMessage}</span>
              </div>
              <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 animate-pulse rounded-full w-full" />
              </div>
              <p className="text-[11px] text-neutral-400">
                The launcher will restart automatically once the update files are applied.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/[0.08] bg-[#161822] flex items-center justify-between">
          <button
            onClick={handleOpenGitHub}
            disabled={isUpdating}
            className="flex items-center space-x-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
          >
            <span>GitHub Release</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center space-x-3">
            {!isUpdating && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.06] rounded-xl transition-colors"
              >
                Later
              </button>
            )}

            <button
              onClick={handleApplyUpdate}
              disabled={isUpdating}
              className={`px-5 py-2.5 rounded-xl font-semibold text-xs flex items-center space-x-2 transition-all shadow-lg ${
                isUpdating
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-orange-950/50 hover:shadow-orange-900/60 active:scale-[0.98]'
              }`}
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Update & Restart Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
