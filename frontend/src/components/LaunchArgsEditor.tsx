import React, { useState, useEffect, useRef } from 'react';
import { Save, Trash2, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../services/api';

interface LaunchArgsEditorProps {
  serverIdentity: string;
  onArgsSaved?: (newArgs: string) => void;
}

export const LaunchArgsEditor: React.FC<LaunchArgsEditorProps> = ({
  serverIdentity,
  onArgsSaved,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [fullText, setFullText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadArgs = async () => {
    setIsLoading(true);
    try {
      const formatted = await api.getFormattedLaunchArgs();
      setFullText(formatted);
    } catch (e: any) {
      console.warn('Failed to load formatted launch args:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArgs();
  }, [serverIdentity]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.saveCustomLaunchArgs(fullText);
      if (onArgsSaved) onArgsSaved(fullText);
      setToastMsg('Launch arguments updated.');
      setTimeout(() => setToastMsg(null), 2500);
    } catch (e: any) {
      setToastMsg(`Error saving args: ${e.message || e}`);
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveCustom = async () => {
    const divider = '// ---- your own arguments, one per line (e.g. -useNewNavmesh) ----';
    const idx = fullText.indexOf(divider);
    if (idx !== -1) {
      const clean = fullText.substring(0, idx + divider.length) + '\n';
      setFullText(clean);
      setIsSaving(true);
      try {
        await api.saveCustomLaunchArgs(clean);
        if (onArgsSaved) onArgsSaved(clean);
        setToastMsg('Custom arguments removed.');
        setTimeout(() => setToastMsg(null), 2500);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const lines = fullText.split('\n');

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-3 font-sans">
      {/* Header Accordion */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 text-sm font-bold text-slate-200 hover:text-white uppercase font-mono tracking-wider w-full text-left"
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-rust-500" /> : <ChevronRight className="w-4 h-4 text-rust-500" />}
        <span>Launch arguments (advanced)</span>
      </button>

      {isOpen && (
        <div className="space-y-3 pt-1 animate-fade-in">
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            The command line this server starts with. Some Rust options are switches, not convars, so server.cfg cannot set them at all. Add yours below the divider, one per line. Changes apply the next time the server starts.
          </p>

          {/* Code Editor Box with Line Numbers */}
          <div className="relative border border-[#232936] rounded-lg overflow-hidden bg-[#10141b] flex font-mono text-xs">
            {/* Line numbers gutter */}
            <div className="py-3 px-3 bg-[#0a0d13] text-slate-600 select-none text-right font-mono text-xs border-r border-[#1c222e] min-w-[2.5rem]">
              {lines.map((_, idx) => (
                <div key={idx} className="leading-6">
                  {idx + 1}
                </div>
              ))}
            </div>

            {/* Editable Text Area */}
            <textarea
              ref={textareaRef}
              value={fullText}
              onChange={(e) => setFullText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isSaving}
              rows={Math.max(14, Math.min(lines.length, 26))}
              spellCheck={false}
              className="w-full bg-transparent text-[#e6edf3] p-3 leading-6 font-mono text-xs focus:outline-none resize-y selection:bg-rust-600/40 select-text whitespace-pre overflow-x-auto"
            />
          </div>

          {/* Status & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-500 font-mono">
              Ctrl+S to save.
            </span>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-[#b84e12] hover:bg-[#d05915] text-white text-xs font-mono font-medium shadow transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </button>

              <button
                type="button"
                onClick={handleRemoveCustom}
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#1a202c] hover:bg-[#242c3d] border border-[#2d3748] text-rose-300 hover:text-rose-200 text-xs font-mono transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove custom arguments</span>
              </button>
            </div>
          </div>

          {toastMsg && (
            <div className="text-xs font-mono text-rust-400 bg-rust-500/10 border border-rust-500/30 p-2 rounded-lg flex items-center space-x-2">
              <Check className="w-3.5 h-3.5" />
              <span>{toastMsg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
