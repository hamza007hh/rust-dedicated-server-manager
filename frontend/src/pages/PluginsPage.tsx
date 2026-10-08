import React, { useState } from 'react';
import { Puzzle, Search, Download, RefreshCw, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { FrameworkStatus, PluginItem, UmodPluginItem, ServerStatus } from '../types/server';
import { Modal } from '../components/Modal';
import { api } from '../services/api';

interface PluginsPageProps {
  status: ServerStatus;
  frameworkStatus: FrameworkStatus;
  plugins: PluginItem[];
  modFramework?: string;
  onNavigate?: (page: string) => void;
  onRefreshPlugins: () => Promise<void>;
  onTogglePlugin: (name: string, enable: boolean) => Promise<void>;
  onInstallOxide: () => Promise<void>;
  onInstallCarbon: () => Promise<void>;
  onSearchUmod: (query: string) => Promise<UmodPluginItem[]>;
  onInstallUmodPlugin: (slug: string) => Promise<string>;
  onDeletePlugin?: (name: string) => Promise<void>;
}

export const PluginsPage: React.FC<PluginsPageProps> = ({
  status: _status,
  frameworkStatus,
  plugins,
  modFramework,
  onNavigate,
  onRefreshPlugins,
  onTogglePlugin,
  onInstallOxide,
  onInstallCarbon,
  onSearchUmod,
  onInstallUmodPlugin,
  onDeletePlugin,
}) => {
  const [activeTab, setActiveTab] = useState<'installed' | 'search'>('installed');
  const [filterMode, setFilterMode] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UmodPluginItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  const [isInstallingOxide, setIsInstallingOxide] = useState(false);
  const [isInstallingCarbon, setIsInstallingCarbon] = useState(false);

  const [pluginToDelete, setPluginToDelete] = useState<PluginItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const filteredPlugins = plugins.filter((p) => {
    if (filterMode === 'enabled') return p.is_enabled;
    if (filterMode === 'disabled') return !p.is_enabled;
    return true;
  });

  const handleSearchUmod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setActionMsg(null);
    try {
      const results = await onSearchUmod(searchQuery.trim());
      setSearchResults(results);
    } catch (err: any) {
      setActionMsg({ text: err?.message || 'Failed to search uMod repository', type: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleInstallPlugin = async (slug: string) => {
    setInstallingSlug(slug);
    setActionMsg(null);
    try {
      await onInstallUmodPlugin(slug);
      setActionMsg({ text: `Plugin "${slug}" successfully installed into oxide/plugins/`, type: 'success' });
    } catch (err: any) {
      setActionMsg({ text: err?.message || 'Failed to install plugin from uMod', type: 'error' });
    } finally {
      setInstallingSlug(null);
    }
  };

  const handleConfirmDeletePlugin = async () => {
    if (!pluginToDelete) return;
    const toDelete = pluginToDelete;
    setIsDeleteModalOpen(false);
    setActionMsg(null);
    try {
      if (onDeletePlugin) {
        await onDeletePlugin(toDelete.name);
      } else {
        await api.deletePlugin(toDelete.name);
        await onRefreshPlugins();
      }
      setActionMsg({ text: `Plugin "${toDelete.name}" (${toDelete.filename}) deleted.`, type: 'success' });
    } catch (err: any) {
      setActionMsg({ text: err?.message || 'Failed to delete plugin', type: 'error' });
    }
  };

  const handleOxideAction = async () => {
    setIsInstallingOxide(true);
    setActionMsg(null);
    try {
      await onInstallOxide();
      setActionMsg({ text: 'Oxide.Rust installed / updated successfully.', type: 'success' });
    } catch (err: any) {
      setActionMsg({ text: err?.message || 'Failed to install Oxide', type: 'error' });
    } finally {
      setIsInstallingOxide(false);
    }
  };

  const handleCarbonAction = async () => {
    setIsInstallingCarbon(true);
    setActionMsg(null);
    try {
      await onInstallCarbon();
      setActionMsg({ text: 'Carbon framework installed / updated successfully.', type: 'success' });
    } catch (err: any) {
      setActionMsg({ text: err?.message || 'Failed to install Carbon', type: 'error' });
    } finally {
      setIsInstallingCarbon(false);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto px-8 pt-9 pb-16">
      <div className="max-w-5xl mx-auto space-y-6 text-neutral-100">
        {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-dark-border">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Puzzle className="w-5 h-5 text-rust-500" />
            <span>Plugin & Mod Framework Manager</span>
          </h2>
          <p className="text-xs text-slate-400">
            Manage C# plugins, manage enabled/disabled states, and install modding frameworks.
          </p>
        </div>

        <button
          onClick={() => onRefreshPlugins()}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border hover:border-slate-700 text-xs text-slate-300 font-mono transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {actionMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center space-x-2 font-mono ${
            actionMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {modFramework === 'vanilla' ? (
        <div className="bg-dark-card border border-amber-500/30 rounded-2xl p-8 text-center space-y-4 max-w-2xl mx-auto my-6 font-mono animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <Puzzle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-100">
              Plugins Unavailable on Vanilla Server
            </h3>
            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              This server is currently running the <strong>Vanilla</strong> Rust server. Plugins are not supported on Vanilla servers because official Rust binaries do not include a modding runtime.
            </p>
            <p className="text-xs text-slate-400 font-sans leading-relaxed">
              To install and manage plugins, switch this server's framework to <strong>Carbon</strong> or <strong>Oxide</strong> via Server Config, or create a new modded server instance.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('server')}
                className="px-4 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono font-bold transition-all shadow-lg shadow-rust-600/20"
              >
                Go to Server Config &gt; Change Mod Framework
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Framework Status Cards */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 font-mono">Modding Framework Status</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          {/* Oxide Card */}
          <div className="p-4 rounded-xl bg-dark-bg/60 border border-dark-border flex flex-col justify-between space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-200">Oxide.Rust (uMod)</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    frameworkStatus.is_oxide_installed
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {frameworkStatus.is_oxide_installed ? 'INSTALLED' : 'NOT DETECTED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {frameworkStatus.oxide_version ? `Version: ${frameworkStatus.oxide_version}` : 'Standard C# plugin framework for Rust.'}
              </p>
            </div>

            <div className="pt-2 border-t border-dark-border/50 flex justify-end">
              <button
                onClick={handleOxideAction}
                disabled={isInstallingOxide}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono disabled:opacity-50 transition-colors"
              >
                {isInstallingOxide ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                <span>{frameworkStatus.is_oxide_installed ? 'Update Oxide' : 'Install Oxide'}</span>
              </button>
            </div>
          </div>

          {/* Carbon Card */}
          <div className="p-4 rounded-xl bg-dark-bg/60 border border-dark-border flex flex-col justify-between space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-200">Carbon Community</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    frameworkStatus.is_carbon_installed
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {frameworkStatus.is_carbon_installed ? 'INSTALLED' : 'NOT DETECTED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {frameworkStatus.carbon_version ? `Version: ${frameworkStatus.carbon_version}` : 'Modern high-performance modding framework.'}
              </p>
            </div>

            <div className="pt-2 border-t border-dark-border/50 flex justify-end">
              <button
                onClick={handleCarbonAction}
                disabled={isInstallingCarbon}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono disabled:opacity-50 transition-colors"
              >
                {isInstallingCarbon ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                <span>{frameworkStatus.is_carbon_installed ? 'Update Carbon' : 'Install Carbon'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-border space-x-6">
        <button
          onClick={() => setActiveTab('installed')}
          className={`pb-2 text-xs font-mono font-semibold transition-colors border-b-2 ${
            activeTab === 'installed'
              ? 'border-rust-500 text-rust-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Installed Plugins ({plugins.length})
        </button>

        <button
          onClick={() => setActiveTab('search')}
          className={`pb-2 text-xs font-mono font-semibold transition-colors border-b-2 ${
            activeTab === 'search'
              ? 'border-rust-500 text-rust-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Discover uMod Plugins
        </button>
      </div>

      {/* Tab: Installed Plugins */}
      {activeTab === 'installed' && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            {(['all', 'enabled', 'disabled'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1 rounded text-xs font-mono uppercase transition-colors ${
                  filterMode === mode
                    ? 'bg-rust-600/20 text-rust-400 border border-rust-500/40'
                    : 'bg-dark-card text-slate-400 border border-dark-border hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredPlugins.map((plugin) => (
              <div
                key={plugin.name}
                className="flex items-center justify-between p-3.5 rounded-lg bg-dark-card border border-dark-border hover:border-slate-700 transition-colors font-mono"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-100">{plugin.name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border ${
                        plugin.is_enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {plugin.is_enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {plugin.path} ({(plugin.file_size / 1024).toFixed(1)} KB)
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onTogglePlugin(plugin.name, !plugin.is_enabled)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      plugin.is_enabled
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {plugin.is_enabled ? 'Disable' : 'Enable'}
                  </button>

                  <button
                    onClick={() => {
                      setPluginToDelete(plugin);
                      setIsDeleteModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                    title="Delete plugin file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {filteredPlugins.length === 0 && (
              <p className="text-xs text-slate-500 italic py-8 text-center font-mono bg-dark-card border border-dark-border rounded-xl">
                No plugins match the selected filter.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Discover uMod */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <form onSubmit={handleSearchUmod} className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search uMod repository (e.g. Gather, Kits, Backpacks, BGrade)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-dark-card border border-dark-border rounded-xl px-4 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rust-500"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-5 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white font-medium text-xs font-mono shadow-lg shadow-rust-600/20 disabled:opacity-50 flex items-center space-x-2 transition-colors"
            >
              {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Search</span>
            </button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {searchResults.map((item) => (
              <div
                key={item.slug}
                className="bg-dark-card border border-dark-border rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-bold text-slate-100 font-mono">{item.name}</h4>
                    {item.downloads && (
                      <span className="text-[10px] font-mono text-slate-500">{item.downloads.toLocaleString()} DLs</span>
                    )}
                  </div>
                  {item.author && <p className="text-[11px] text-rust-400 font-mono mb-2">by {item.author}</p>}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                    {item.description || 'No description provided.'}
                  </p>
                </div>

                <div className="flex justify-end pt-2 border-t border-dark-border">
                  <button
                    onClick={() => handleInstallPlugin(item.slug)}
                    disabled={installingSlug === item.slug}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-dark-elevated hover:bg-rust-600 hover:text-white border border-dark-border text-slate-200 text-xs font-mono transition-colors disabled:opacity-40"
                  >
                    {installingSlug === item.slug ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    <span>{installingSlug === item.slug ? 'Installing...' : 'Install Plugin'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {searchResults.length === 0 && !isSearching && (
            <p className="text-xs text-slate-500 italic py-8 text-center font-mono bg-dark-card border border-dark-border rounded-xl">
              Type a search query above to browse the uMod repository.
            </p>
          )}
          </div>
        )}
      </>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDeletePlugin}
        title="Confirm Plugin Deletion"
        description={`Permanently delete plugin "${pluginToDelete?.name}" (${pluginToDelete?.filename}) from server? This will remove the C# script file from your filesystem.`}
        confirmText="Yes, Delete Plugin"
        isDestructive={true}
      />
      </div>
    </div>
  );
};
