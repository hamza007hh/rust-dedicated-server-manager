import React, { useState, useEffect, useRef } from 'react';
import {
  Server,
  Folder,
  MapPin,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Eye,
  EyeOff,
  Dices,
  Layers,
  Sparkles,
  Shield,
  FileCode,
  X,
} from 'lucide-react';
import { ServerConfig, ServerCreateProgress, ProfilesData } from '../types/server';
import { api, events } from '../services/api';

interface CreateServerWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated: (createdConfig: ServerConfig, profilesData: ProfilesData) => void;
  suggestedPort?: number;
}

export const CreateServerWizard: React.FC<CreateServerWizardProps> = ({
  isOpen,
  onClose,
  onServerCreated,
  suggestedPort = 28015,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Form state
  const [formData, setFormData] = useState<ServerConfig>({
    identity: 'server_1',
    hostname: 'My Epic Rust Server',
    description: 'Powered by Epic Rust Server Launcher',
    header_image: null,
    url: null,
    port: suggestedPort,
    query_port: suggestedPort + 2,
    rcon_port: suggestedPort + 1,
    rcon_password: 'ChangeMeImmediately!',
    max_players: 50,
    tickrate: 30,
    pve: false,
    gamemode: 'vanilla',
    mod_framework: 'vanilla',
    is_procedural: true,
    seed: 1337,
    worldsize: 3500,
    level_url: null,
    install_path: 'C:\\rustserver',
    log_file: 'output.log',
    custom_args: '',
    steamcmd_path: null,
    branch: 'public',
    branch_password: null,
    validate_on_update: true,
  });

  // Creation execution state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [creationProgress, setCreationProgress] = useState<ServerCreateProgress | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [createdProfilesData, setCreatedProfilesData] = useState<ProfilesData | null>(null);

  const unlistenProgressRef = useRef<(() => void) | null>(null);
  const unlistenErrorRef = useRef<(() => void) | null>(null);
  const unlistenCompleteRef = useRef<(() => void) | null>(null);

  // Initialize defaults on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setIsCreating(false);
      setCreationProgress(null);
      setCreationError(null);
      setIsSuccess(false);

      // Randomize an initial identity and password
      const randId = `server_${Math.floor(1000 + Math.random() * 9000)}`;
      const randSeed = Math.floor(10000 + Math.random() * 89999);
      const randPass = Math.random().toString(36).slice(-10) + '!';

      setFormData((prev) => ({
        ...prev,
        identity: randId,
        seed: randSeed,
        rcon_password: randPass,
        port: suggestedPort,
        query_port: suggestedPort + 2,
        rcon_port: suggestedPort + 1,
      }));
    }
  }, [isOpen, suggestedPort]);

  // Cleanup event listeners
  useEffect(() => {
    return () => {
      if (unlistenProgressRef.current) unlistenProgressRef.current();
      if (unlistenErrorRef.current) unlistenErrorRef.current();
      if (unlistenCompleteRef.current) unlistenCompleteRef.current();
    };
  }, []);

  if (!isOpen) return null;

  const handleChange = <K extends keyof ServerConfig>(field: K, value: ServerConfig[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleBrowseFolder = async () => {
    try {
      const selected = await api.browseDirectory();
      if (selected) {
        handleChange('install_path', selected);
      }
    } catch (e: any) {
      console.warn('Browse directory error:', e);
    }
  };

  const handleRandomizeSeed = () => {
    const seed = Math.floor(Math.random() * 2147483647);
    handleChange('seed', seed);
  };

  const handleGeneratePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 16; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    handleChange('rcon_password', pass);
  };

  // Step Validation
  const validateStep = (step: number): string | null => {
    switch (step) {
      case 1:
        if (!formData.hostname.trim()) return 'Server Name cannot be empty.';
        if (!formData.identity.trim()) return 'Server Identity cannot be empty.';
        if (formData.identity.includes(' ') || !/^[a-zA-Z0-9_-]+$/.test(formData.identity)) {
          return 'Server Identity must only contain letters, numbers, underscores, or dashes (no spaces).';
        }
        if (!formData.install_path.trim()) return 'Install Path cannot be empty.';
        return null;
      case 2:
        if (!['vanilla', 'carbon', 'oxide'].includes(formData.mod_framework)) {
          return 'Please select a valid mod framework (Vanilla, Carbon, or Oxide).';
        }
        return null;
      case 3:
        if (formData.is_procedural) {
          if (formData.worldsize < 1000 || formData.worldsize > 6000) {
            return 'World Size must be between 1000 and 6000.';
          }
        } else {
          if (!formData.level_url || !formData.level_url.trim()) {
            return 'Custom Map selected: Level URL cannot be empty.';
          }
        }
        return null;
      case 4:
        if (isNaN(formData.port) || formData.port < 1024 || formData.port > 65535) {
          return 'Game Port must be between 1024 and 65535.';
        }
        if (isNaN(formData.rcon_port) || formData.rcon_port < 1024 || formData.rcon_port > 65535) {
          return 'RCON Port must be between 1024 and 65535.';
        }
        if (formData.port === formData.rcon_port) {
          return 'Game Port and RCON Port cannot be the same.';
        }
        if (!formData.rcon_password.trim()) {
          return 'RCON Password cannot be empty.';
        }
        if (formData.max_players < 1 || formData.max_players > 500) {
          return 'Max Players must be between 1 and 500.';
        }
        if (formData.tickrate < 10 || formData.tickrate > 100) {
          return 'Tickrate must be between 10 and 100.';
        }
        return null;
      default:
        return null;
    }
  };

  const handleNext = () => {
    const error = validateStep(currentStep);
    if (error) {
      setCreationError(error);
      return;
    }
    setCreationError(null);
    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setCreationError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Execution: Create Server
  const handleCreateServer = async () => {
    for (let s = 1; s <= 4; s++) {
      const err = validateStep(s);
      if (err) {
        setCurrentStep(s);
        setCreationError(err);
        return;
      }
    }

    setCreationError(null);
    setIsCreating(true);
    setCreationProgress({
      step: 'preparing',
      message: 'Preparing server creation...',
      percent: 5,
      framework: formData.mod_framework,
    });

    try {
      // Setup event listeners
      const uProg = await events.onServerCreateProgress((prog) => {
        setCreationProgress(prog);
      });
      unlistenProgressRef.current = uProg;

      const uErr = await events.onServerCreateError((err) => {
        setCreationError(err?.error || String(err));
        setIsCreating(false);
      });
      unlistenErrorRef.current = uErr;

      const uComp = await events.onServerCreateComplete(() => {
        setIsCreating(false);
        setIsSuccess(true);
      });
      unlistenCompleteRef.current = uComp;

      // Invoke backend command
      const profilesRes = await api.createServer(formData);
      setCreatedProfilesData(profilesRes);
      setIsCreating(false);
      setIsSuccess(true);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setCreationError(msg);
      setIsCreating(false);
    }
  };

  const handleFinish = () => {
    if (createdProfilesData) {
      onServerCreated(formData, createdProfilesData);
    }
    onClose();
  };

  // Step definitions for display
  const stepsList = [
    { num: 1, title: 'Basic Info' },
    { num: 2, title: 'Framework' },
    { num: 3, title: 'Map' },
    { num: 4, title: 'Settings' },
    { num: 5, title: 'Review' },
  ];

  // Framework-specific progress checklist
  const getExpectedSteps = () => {
    switch (formData.mod_framework) {
      case 'carbon':
        return [
          { key: 'preparing', label: 'Preparing server' },
          { key: 'installing_rust', label: 'Installing Rust Dedicated Server' },
          { key: 'validating_rust', label: 'Validating Rust installation' },
          { key: 'installing_carbon', label: 'Installing Carbon modding framework' },
          { key: 'generating_config', label: 'Generating server configuration & server.cfg' },
          { key: 'finalizing', label: 'Finalizing server' },
        ];
      case 'oxide':
        return [
          { key: 'preparing', label: 'Preparing server' },
          { key: 'installing_rust', label: 'Installing Rust Dedicated Server' },
          { key: 'validating_rust', label: 'Validating Rust installation' },
          { key: 'installing_oxide', label: 'Installing Oxide (uMod) framework' },
          { key: 'generating_config', label: 'Generating server configuration & server.cfg' },
          { key: 'finalizing', label: 'Finalizing server' },
        ];
      default:
        return [
          { key: 'preparing', label: 'Preparing server' },
          { key: 'installing_rust', label: 'Installing Rust Dedicated Server' },
          { key: 'validating_rust', label: 'Validating Rust installation' },
          { key: 'generating_config', label: 'Generating server configuration & server.cfg' },
          { key: 'finalizing', label: 'Finalizing server' },
        ];
    }
  };

  const isStepDone = (stepKey: string): boolean => {
    if (isSuccess) return true;
    if (!creationProgress) return false;
    const all = getExpectedSteps();
    const currIndex = all.findIndex((s) => s.key === creationProgress.step);
    const thisIndex = all.findIndex((s) => s.key === stepKey);
    return currIndex > thisIndex || creationProgress.step === 'complete';
  };

  const isStepActive = (stepKey: string): boolean => {
    if (isSuccess) return false;
    if (!creationProgress) return false;
    return creationProgress.step === stepKey;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-dark-card border border-dark-border rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="p-5 border-b border-dark-border flex items-center justify-between bg-dark-bg/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rust-600/20 border border-rust-500/30 flex items-center justify-center text-rust-500">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>Create Rust Dedicated Server</span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-rust-500/10 text-rust-400 border border-rust-500/20">
                  WIZARD
                </span>
              </h2>
              <p className="text-xs text-slate-400">Step {currentStep} of 5 • {stepsList[currentStep - 1]?.title}</p>
            </div>
          </div>
          {!isCreating && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-elevated transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Wizard Step Progress Tracker */}
        {!isCreating && !isSuccess && (
          <div className="px-6 py-3 border-b border-dark-border bg-dark-bg/30">
            <div className="flex items-center justify-between">
              {stepsList.map((step, idx) => {
                const isActive = currentStep === step.num;
                const isCompleted = currentStep > step.num;
                return (
                  <React.Fragment key={step.num}>
                    <div className="flex items-center space-x-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                          isActive
                            ? 'bg-rust-600 text-white shadow-lg shadow-rust-600/30 ring-2 ring-rust-500/40'
                            : isCompleted
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-dark-elevated text-slate-500 border border-dark-border'
                        }`}
                      >
                        {isCompleted ? '✓' : step.num}
                      </div>
                      <span
                        className={`text-xs font-mono hidden sm:inline ${
                          isActive ? 'text-slate-100 font-bold' : isCompleted ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                    {idx < stepsList.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 rounded transition-all ${
                          currentStep > idx + 1 ? 'bg-emerald-500/40' : 'bg-dark-border'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Error Notification Banner */}
        {creationError && !isCreating && (
          <div className="m-4 mb-0 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">Error: </span>
              <span>{creationError}</span>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ---------------- CREATION / PROGRESS OVERLAY ---------------- */}
          {(isCreating || isSuccess) && (
            <div className="py-4 space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 rounded-2xl bg-rust-500/10 border border-rust-500/20 text-rust-400 mb-1">
                  {isSuccess ? (
                    <CheckCircle className="w-8 h-8 text-emerald-400 animate-in zoom-in-75 duration-300" />
                  ) : (
                    <RefreshCw className="w-8 h-8 animate-spin text-rust-500" />
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-100">
                  {isSuccess ? 'Server Created Successfully!' : 'Building Your Rust Dedicated Server'}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Framework: <span className="text-rust-400 uppercase font-bold">{formData.mod_framework}</span> •
                  Identity: <span className="text-slate-200">{formData.identity}</span>
                </p>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5 font-mono">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{creationProgress?.message || 'Processing...'}</span>
                  <span className="text-rust-400 font-bold">
                    {isSuccess ? 100 : Math.round(creationProgress?.percent || 0)}%
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-dark-bg border border-dark-border overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isSuccess ? 'bg-emerald-500' : 'bg-rust-600'
                    }`}
                    style={{ width: `${isSuccess ? 100 : creationProgress?.percent || 5}%` }}
                  />
                </div>
              </div>

              {/* Step Checklist */}
              <div className="bg-dark-bg/60 border border-dark-border rounded-xl p-4 space-y-2.5 font-mono text-xs">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                  Creation Workflow
                </div>
                {getExpectedSteps().map((s) => {
                  const done = isStepDone(s.key);
                  const active = isStepActive(s.key);
                  return (
                    <div
                      key={s.key}
                      className={`flex items-center space-x-3 p-2 rounded-lg transition-colors ${
                        active
                          ? 'bg-rust-500/10 border border-rust-500/30 text-rust-300'
                          : done
                          ? 'text-slate-200'
                          : 'text-slate-500'
                      }`}
                    >
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        {done ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        ) : active ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-rust-400" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-700" />
                        )}
                      </div>
                      <span className={`${active ? 'font-bold' : ''}`}>{s.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* If Success: summary button */}
              {isSuccess && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono space-y-3">
                  <div className="flex items-center space-x-2 font-bold">
                    <CheckCircle className="w-4 h-4" />
                    <span>Server files, configuration, and {formData.mod_framework.toUpperCase()} modding ready.</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    The server has been configured with ports {formData.port} (Game) and {formData.rcon_port} (RCON)
                    at <code className="text-emerald-400 bg-black/40 px-1 py-0.5 rounded">{formData.install_path}</code>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ---------------- STEP 1: BASIC INFORMATION ---------------- */}
          {!isCreating && !isSuccess && currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  Server Name <span className="text-rust-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.hostname}
                  onChange={(e) => handleChange('hostname', e.target.value)}
                  placeholder="My Rust Dedicated Server"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm focus:border-rust-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1 font-mono">
                  Display name shown in the Rust server browser.
                </p>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  Server Identity <span className="text-rust-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.identity}
                  onChange={(e) => handleChange('identity', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="server_identity"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1 font-mono">
                  Folder name for server saves, configurations, and user data (e.g. <code>server/{formData.identity || '...'}/</code>).
                </p>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  Install Path <span className="text-rust-500">*</span>
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={formData.install_path}
                    onChange={(e) => handleChange('install_path', e.target.value)}
                    placeholder="C:\rustserver"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="px-4 py-2.5 rounded-xl bg-dark-elevated hover:bg-dark-border border border-dark-border text-slate-200 text-xs font-mono transition-colors flex items-center space-x-1.5 shrink-0"
                  >
                    <Folder className="w-3.5 h-3.5 text-rust-500" />
                    <span>Browse...</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-mono">
                  Directory where RustDedicated.exe and server files will reside.
                </p>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Release Branch</label>
                <select
                  value={formData.branch || 'public'}
                  onChange={(e) => handleChange('branch', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                >
                  <option value="public">public (Official Stable Release - Recommended)</option>
                  <option value="staging">staging (Pre-release testing branch)</option>
                  <option value="aux01">aux01 (Auxiliary developer branch)</option>
                </select>
              </div>
            </div>
          )}

          {/* ---------------- STEP 2: MOD FRAMEWORK ---------------- */}
          {!isCreating && !isSuccess && currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200 font-mono">Select Modding Framework</h4>
                <p className="text-xs text-slate-400">
                  Choose the modding framework to integrate during server setup. This determines plugin support.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* Vanilla Card */}
                <div
                  onClick={() => handleChange('mod_framework', 'vanilla')}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-4 select-none relative ${
                    formData.mod_framework === 'vanilla'
                      ? 'bg-rust-600/10 border-rust-500 shadow-xl shadow-rust-600/10 ring-2 ring-rust-500/40'
                      : 'bg-dark-bg/60 border-dark-border hover:border-slate-600'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                        <Shield className="w-5 h-5" />
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          formData.mod_framework === 'vanilla'
                            ? 'bg-rust-500/20 text-rust-300 border-rust-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        OFFICIAL
                      </span>
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-100 text-base">Vanilla</h5>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">Official Rust server</p>
                    </div>
                    <ul className="text-xs text-slate-300 space-y-1.5 font-mono pt-2 border-t border-dark-border/50">
                      <li className="flex items-center space-x-2">
                        <span className="text-emerald-400">✓</span>
                        <span>Pure vanilla gameplay</span>
                      </li>
                      <li className="flex items-center space-x-2 text-slate-400">
                        <span className="text-slate-500">•</span>
                        <span>No mod framework</span>
                      </li>
                      <li className="flex items-center space-x-2 text-slate-400">
                        <span className="text-amber-500">⚠</span>
                        <span>Plugins unavailable</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs font-mono">
                    <span
                      className={`text-[11px] ${
                        formData.mod_framework === 'vanilla' ? 'text-rust-400 font-bold' : 'text-slate-500'
                      }`}
                    >
                      {formData.mod_framework === 'vanilla' ? '● SELECTED' : 'Click to select'}
                    </span>
                    {formData.mod_framework === 'vanilla' && <CheckCircle className="w-4 h-4 text-rust-400" />}
                  </div>
                </div>

                {/* Carbon Card */}
                <div
                  onClick={() => handleChange('mod_framework', 'carbon')}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-4 select-none relative ${
                    formData.mod_framework === 'carbon'
                      ? 'bg-cyan-600/10 border-cyan-500 shadow-xl shadow-cyan-600/10 ring-2 ring-cyan-500/40'
                      : 'bg-dark-bg/60 border-dark-border hover:border-slate-600'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-800 flex items-center justify-center text-cyan-400">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          formData.mod_framework === 'carbon'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        MODERN
                      </span>
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-100 text-base">Carbon</h5>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">Modern Rust modding framework</p>
                    </div>
                    <ul className="text-xs text-slate-300 space-y-1.5 font-mono pt-2 border-t border-dark-border/50">
                      <li className="flex items-center space-x-2">
                        <span className="text-cyan-400">✓</span>
                        <span>High-performance core</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <span className="text-cyan-400">✓</span>
                        <span>Supports Oxide plugins</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <span className="text-cyan-400">✓</span>
                        <span>Plugins available</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs font-mono">
                    <span
                      className={`text-[11px] ${
                        formData.mod_framework === 'carbon' ? 'text-cyan-400 font-bold' : 'text-slate-500'
                      }`}
                    >
                      {formData.mod_framework === 'carbon' ? '● SELECTED' : 'Click to select'}
                    </span>
                    {formData.mod_framework === 'carbon' && <CheckCircle className="w-4 h-4 text-cyan-400" />}
                  </div>
                </div>

                {/* Oxide Card */}
                <div
                  onClick={() => handleChange('mod_framework', 'oxide')}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-4 select-none relative ${
                    formData.mod_framework === 'oxide'
                      ? 'bg-amber-600/10 border-amber-500 shadow-xl shadow-amber-600/10 ring-2 ring-amber-500/40'
                      : 'bg-dark-bg/60 border-dark-border hover:border-slate-600'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800 flex items-center justify-center text-amber-400">
                        <Layers className="w-5 h-5" />
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          formData.mod_framework === 'oxide'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        CLASSIC
                      </span>
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-100 text-base">Oxide</h5>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">uMod/Oxide framework</p>
                    </div>
                    <ul className="text-xs text-slate-300 space-y-1.5 font-mono pt-2 border-t border-dark-border/50">
                      <li className="flex items-center space-x-2">
                        <span className="text-amber-400">✓</span>
                        <span>Vast uMod ecosystem</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <span className="text-amber-400">✓</span>
                        <span>Stable C# runtime</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <span className="text-amber-400">✓</span>
                        <span>Plugins available</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs font-mono">
                    <span
                      className={`text-[11px] ${
                        formData.mod_framework === 'oxide' ? 'text-amber-400 font-bold' : 'text-slate-500'
                      }`}
                    >
                      {formData.mod_framework === 'oxide' ? '● SELECTED' : 'Click to select'}
                    </span>
                    {formData.mod_framework === 'oxide' && <CheckCircle className="w-4 h-4 text-amber-400" />}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 3: MAP ---------------- */}
          {!isCreating && !isSuccess && currentStep === 3 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200 font-mono">Map Generation</h4>
                <p className="text-xs text-slate-400">Choose between a procedural world or custom community map.</p>
              </div>

              {/* Map Type Toggle */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleChange('is_procedural', true)}
                  className={`p-3.5 rounded-xl border text-xs font-mono font-medium transition-all flex items-center justify-center space-x-2 ${
                    formData.is_procedural
                      ? 'bg-rust-600/20 border-rust-500 text-rust-300 shadow-sm'
                      : 'bg-dark-bg border-dark-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  <span>Procedural Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('is_procedural', false)}
                  className={`p-3.5 rounded-xl border text-xs font-mono font-medium transition-all flex items-center justify-center space-x-2 ${
                    !formData.is_procedural
                      ? 'bg-rust-600/20 border-rust-500 text-rust-300 shadow-sm'
                      : 'bg-dark-bg border-dark-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  <span>Custom Map / URL</span>
                </button>
              </div>

              {/* Procedural Settings */}
              {formData.is_procedural ? (
                <div className="space-y-4 pt-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-mono text-slate-300">Seed</label>
                      <button
                        type="button"
                        onClick={handleRandomizeSeed}
                        className="text-[11px] font-mono text-rust-400 hover:text-rust-300 flex items-center space-x-1"
                      >
                        <Dices className="w-3.5 h-3.5" />
                        <span>Randomize</span>
                      </button>
                    </div>
                    <input
                      type="number"
                      value={formData.seed}
                      onChange={(e) => handleChange('seed', parseInt(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-mono text-slate-300">World Size (meters)</label>
                      <span className="text-xs font-mono text-rust-400 font-bold">{formData.worldsize}</span>
                    </div>
                    <input
                      type="range"
                      min={1000}
                      max={6000}
                      step={100}
                      value={formData.worldsize}
                      onChange={(e) => handleChange('worldsize', parseInt(e.target.value) || 3500)}
                      className="w-full accent-rust-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                      <span>1000m (Tiny)</span>
                      <span>3500m (Standard)</span>
                      <span>6000m (Massive)</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Custom Map Settings */
                <div className="pt-2">
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Level URL (.map) <span className="text-rust-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={formData.level_url || ''}
                    onChange={(e) => handleChange('level_url', e.target.value)}
                    placeholder="https://example.com/custom_maps/my_island.map"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1 font-mono">
                    Direct downloadable URL to a compiled Rust <code>.map</code> file.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ---------------- STEP 4: SERVER SETTINGS ---------------- */}
          {!isCreating && !isSuccess && currentStep === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Max Players</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={formData.max_players}
                    onChange={(e) => handleChange('max_players', parseInt(e.target.value) || 50)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Tickrate (FPS)</label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={formData.tickrate}
                    onChange={(e) => handleChange('tickrate', parseInt(e.target.value) || 30)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Game Port (UDP)</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => {
                      const p = parseInt(e.target.value) || 28015;
                      setFormData((prev) => ({
                        ...prev,
                        port: p,
                        query_port: p + 2,
                        rcon_port: p + 1,
                      }));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">RCON Port (TCP)</label>
                  <input
                    type="number"
                    value={formData.rcon_port}
                    onChange={(e) => handleChange('rcon_port', parseInt(e.target.value) || 28016)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-mono text-slate-300">
                    RCON Password <span className="text-rust-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] font-mono text-rust-400 hover:text-rust-300 flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generate Secure</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.rcon_password}
                    onChange={(e) => handleChange('rcon_password', e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Gamemode</label>
                  <select
                    value={formData.gamemode}
                    onChange={(e) => handleChange('gamemode', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-slate-100 text-sm font-mono focus:border-rust-500 focus:outline-none"
                  >
                    <option value="vanilla">vanilla (Standard Survival)</option>
                    <option value="softcore">softcore (Casual / Claim Reclaim)</option>
                    <option value="hardcore">hardcore (No Compass / No Map)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Game Rules</label>
                  <div className="flex space-x-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleChange('pve', false)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-mono font-medium transition-colors ${
                        !formData.pve
                          ? 'bg-rust-600/20 border-rust-500 text-rust-300'
                          : 'bg-dark-bg border-dark-border text-slate-400'
                      }`}
                    >
                      PvP Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChange('pve', true)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-mono font-medium transition-colors ${
                        formData.pve
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                          : 'bg-dark-bg border-dark-border text-slate-400'
                      }`}
                    >
                      PvE Only
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- STEP 5: REVIEW ---------------- */}
          {!isCreating && !isSuccess && currentStep === 5 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200 font-mono">Review Server Configuration</h4>
                <p className="text-xs text-slate-400">
                  Verify the parameters below. Once created, files and framework dependencies will be generated.
                </p>
              </div>

              <div className="bg-dark-bg/80 border border-dark-border rounded-xl p-4 divide-y divide-dark-border/50 font-mono text-xs">
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Server Name</span>
                  <span className="text-slate-100 font-bold">{formData.hostname}</span>
                </div>
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Identity</span>
                  <span className="text-rust-400 font-bold">{formData.identity}</span>
                </div>
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Install Path</span>
                  <span className="text-slate-300 truncate max-w-xs">{formData.install_path}</span>
                </div>
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Branch</span>
                  <span className="text-slate-300">{formData.branch || 'public'}</span>
                </div>
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Mod Framework</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${
                      formData.mod_framework === 'carbon'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : formData.mod_framework === 'oxide'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-700 text-slate-300 border-slate-600'
                    }`}
                  >
                    {formData.mod_framework}
                  </span>
                </div>
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Map</span>
                  <span className="text-slate-200">
                    {formData.is_procedural ? 'Procedural Map' : 'Custom (.map)'}
                  </span>
                </div>
                {formData.is_procedural ? (
                  <>
                    <div className="py-2 flex justify-between items-center">
                      <span className="text-slate-400">Seed</span>
                      <span className="text-slate-200">{formData.seed}</span>
                    </div>
                    <div className="py-2 flex justify-between items-center">
                      <span className="text-slate-400">World Size</span>
                      <span className="text-slate-200">{formData.worldsize}m</span>
                    </div>
                  </>
                ) : (
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-slate-400">Level URL</span>
                    <span className="text-slate-300 truncate max-w-xs">{formData.level_url}</span>
                  </div>
                )}
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Max Players</span>
                  <span className="text-slate-200">{formData.max_players}</span>
                </div>
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Game Port</span>
                  <span className="text-rust-400 font-bold">{formData.port}</span>
                </div>
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">RCON Port</span>
                  <span className="text-rust-400 font-bold">{formData.rcon_port}</span>
                </div>
                <div className="py-2 flex justify-between items-center">
                  <span className="text-slate-400">Mode</span>
                  <span className="text-slate-200">{formData.pve ? 'PvE' : 'PvP'} ({formData.gamemode})</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 border-t border-dark-border bg-dark-bg/60 flex items-center justify-between">
          {!isCreating && !isSuccess ? (
            <>
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-2.5 rounded-xl bg-dark-elevated hover:bg-dark-border border border-dark-border text-slate-300 text-xs font-mono font-medium transition-colors flex items-center space-x-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-mono transition-colors"
                >
                  Cancel
                </button>
              )}

              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-5 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono font-bold shadow-lg shadow-rust-600/20 transition-all flex items-center space-x-1.5"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateServer}
                  className="px-6 py-2.5 rounded-xl bg-rust-600 hover:bg-rust-500 text-white text-xs font-mono font-bold shadow-lg shadow-rust-600/20 transition-all flex items-center space-x-2"
                >
                  <Server className="w-4 h-4" />
                  <span>Create Server</span>
                </button>
              )}
            </>
          ) : isSuccess ? (
            <div className="w-full flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleFinish}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center space-x-1.5"
              >
                <span>Switch to Server Dashboard</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="w-full text-center text-xs text-slate-500 font-mono py-1">
              Please wait while the server is being provisioned...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
