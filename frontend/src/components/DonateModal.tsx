import React, { useState } from 'react';
import { X, ExternalLink, Copy, Check, Heart, Coffee } from 'lucide-react';

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DonateModal: React.FC<DonateModalProps> = ({ isOpen, onClose }) => {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  if (!isOpen) return null;

  const donationLinks = [
    {
      title: 'Ko-fi',
      description: 'Support ongoing updates, server tooling, and new features.',
      url: 'https://ko-fi.com/epicrust',
      icon: Coffee,
    },
    {
      title: 'GitHub Sponsors',
      description: 'Contribute recurring or one-time support directly via GitHub.',
      url: 'https://github.com/sponsors',
      icon: Heart,
    },
  ];

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(url);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleOpen = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      <div className="relative w-full max-w-md bg-[#13151b] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between bg-[#161820]">
          <div className="flex items-center space-x-2.5">
            <h2 className="text-sm font-bold text-white tracking-wide">Support the Project</h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5 text-xs">
          <p className="text-neutral-300 leading-relaxed bg-[#171922] p-3.5 rounded-xl border border-white/[0.05]">
            Epic Rust is an independent launcher built for Rust server hosts and gamers. Contributions directly help maintain updates, SteamCMD integrations, and ongoing community development.
          </p>

          <div className="space-y-2.5 pt-1">
            {donationLinks.map((item) => {
              const Icon = item.icon;
              const isCopied = copiedLink === item.url;

              return (
                <div
                  key={item.title}
                  className="rounded-xl p-3.5 bg-[#171922] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-neutral-300 shrink-0">
                      <Icon className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-white">{item.title}</h3>
                      <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">{item.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(item.url)}
                      className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 hover:text-white transition-colors"
                      title="Copy link"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpen(item.url)}
                      className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-colors flex items-center space-x-1.5 shadow-sm shadow-orange-600/20"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3 text-white/80" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.06] bg-[#161820] flex items-center justify-between">
          <span className="text-[11px] text-neutral-500 font-mono">
            Thank you for your support
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
