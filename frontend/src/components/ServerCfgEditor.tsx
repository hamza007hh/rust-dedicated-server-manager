import React, { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, FolderOpen, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../services/api';

interface ServerCfgEditorProps {
  serverIdentity: string;
}

export const ServerCfgEditor: React.FC<ServerCfgEditorProps> = ({ serverIdentity }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadCfg = async () => {
    setIsLoading(true);
    try {
      const raw = await api.getRawServerCfg();
      setContent(raw);
    } catch (e: any) {
      console.warn('Failed to load server.cfg:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCfg();
  }, [serverIdentity]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.saveRawServerCfg(content);
      setToastMsg('server.cfg saved successfully.');
      setTimeout(() => setToastMsg(null), 2500);
    } catch (e: any) {
      setToastMsg(`Error saving: ${e.message || e}`);
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setIsSaving(true);
    try {
      const defaults = await api.resetServerCfgDefaults();
      setContent(defaults);
      setToastMsg('Reset server.cfg to preset defaults.');
      setTimeout(() => setToastMsg(null), 2500);
    } catch (e: any) {
      setToastMsg(`Error resetting: ${e.message || e}`);
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await api.openCfgFolder();
    } catch (e) {
      console.warn('Failed to open cfg folder:', e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const lines = content.split('\n');

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-3 font-sans">
      {/* Header Accordion */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 text-sm font-bold text-slate-200 hover:text-white uppercase font-mono tracking-wider w-full text-left"
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-rust-500" /> : <ChevronRight className="w-4 h-4 text-rust-500" />}
        <span>server.cfg (advanced)</span>
      </button>

      {isOpen && (
        <div className="space-y-3 pt-1 animate-fade-in">
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Your server.cfg. It loads after the game's serverauto.cfg, so anything here is the final say over in-game writecfg. Changing a setting above updates only that line here; your own edits stay.
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
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isSaving}
              rows={Math.max(12, Math.min(lines.length, 24))}
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
                onClick={handleResetDefaults}
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#1a202c] hover:bg-[#242c3d] border border-[#2d3748] text-slate-300 hover:text-white text-xs font-mono transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to preset defaults</span>
              </button>

              <button
                type="button"
                onClick={handleOpenFolder}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-[#1a202c] hover:bg-[#242c3d] border border-[#2d3748] text-slate-300 hover:text-white text-xs font-mono transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Open cfg folder</span>
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
