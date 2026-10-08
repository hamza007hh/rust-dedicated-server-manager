import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  badge?: string;
  badgeColor?: 'emerald' | 'amber' | 'blue' | 'purple';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  icon: Icon,
  badge,
  badgeColor = 'blue',
}) => {
  const getBadgeClass = () => {
    switch (badgeColor) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
      case 'amber':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
      default:
        return 'bg-white/[0.05] text-neutral-300 border-white/[0.08]';
    }
  };

  return (
    <div className="bg-[#13161c] border border-white/[0.07] hover:border-orange-500/30 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 group shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 group-hover:text-neutral-200 font-mono transition-colors">
          {title}
        </span>
        <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-neutral-400 group-hover:text-orange-400 group-hover:border-orange-500/30 transition-all">
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-black font-mono text-white tracking-tight">{value}</span>
          {badge && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${getBadgeClass()}`}>
              {badge}
            </span>
          )}
        </div>
        {subtext && <p className="text-[11px] text-neutral-400 mt-1 font-mono truncate">{subtext}</p>}
      </div>
    </div>
  );
};
