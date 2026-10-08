import React from 'react';

interface RustLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 20, icon: 20 },
  sm: { box: 26, icon: 26 },
  md: { box: 34, icon: 34 },
  lg: { box: 44, icon: 44 },
  xl: { box: 56, icon: 56 },
};

/**
 * Premium custom vector emblem for Epic Rust Server Launcher:
 * Features a weathered industrial beveled hex-shield forged from gunmetal steel,
 * with a bold, tactical stencil 'R' fueled by a radiant Rust molten ember core.
 */
export const RustLogo: React.FC<RustLogoProps> = ({
  size = 'md',
  showText = false,
  className = '',
}) => {
  const dim = SIZE_MAP[size];

  return (
    <div className={`inline-flex items-center space-x-2.5 select-none ${className}`}>
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: dim.box, height: dim.box }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-[0_2px_8px_rgba(224,83,56,0.35)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Dark Gunmetal Shield Gradient */}
            <linearGradient id="rust_steel" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#252a34" />
              <stop offset="50%" stopColor="#181b22" />
              <stop offset="100%" stopColor="#0f1116" />
            </linearGradient>

            {/* Ember Core Gradient (Official Rust Color Spectrum) */}
            <linearGradient id="rust_ember" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff7a45" />
              <stop offset="45%" stopColor="#e05338" />
              <stop offset="100%" stopColor="#ce422b" />
            </linearGradient>

            {/* Subtle Metallic Highlight */}
            <linearGradient id="rust_highlight" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
            </linearGradient>

            {/* Inner Glow Radial */}
            <radialGradient id="rust_glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#e05338" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#e05338" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Outer Ambient Ember Glow */}
          <circle cx="50" cy="50" r="46" fill="url(#rust_glow)" />

          {/* Heavy Tactical Hexagonal Outer Plate */}
          <polygon
            points="50,4 90,26 90,74 50,96 10,74 10,26"
            fill="url(#rust_steel)"
            stroke="#e05338"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Subtle Inner Bevel Edge */}
          <polygon
            points="50,8 86,28 86,72 50,92 14,72 14,28"
            fill="none"
            stroke="url(#rust_highlight)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />

          {/* Precision Corner Rivets / Bolt Studs */}
          <circle cx="50" cy="11" r="2.2" fill="#e05338" />
          <circle cx="83" cy="29" r="2.2" fill="#e05338" />
          <circle cx="83" cy="71" r="2.2" fill="#e05338" />
          <circle cx="50" cy="89" r="2.2" fill="#e05338" />
          <circle cx="17" cy="71" r="2.2" fill="#e05338" />
          <circle cx="17" cy="29" r="2.2" fill="#e05338" />

          {/* Tactical Crosshair / Hash Guides */}
          <line x1="28" y1="50" x2="33" y2="50" stroke="#e05338" strokeWidth="1.2" strokeOpacity="0.6" />
          <line x1="67" y1="50" x2="72" y2="50" stroke="#e05338" strokeWidth="1.2" strokeOpacity="0.6" />

          {/* Bold Stencil Rust 'R' Emblem */}
          {/* Stem of the R */}
          <rect
            x="34"
            y="28"
            width="9"
            height="44"
            rx="1.5"
            fill="url(#rust_ember)"
          />

          {/* Upper Loop of the R */}
          <path
            d="M43 28 H 58 C 65 28 69 32 69 39 C 69 46 65 50 58 50 H 43 Z"
            fill="url(#rust_ember)"
          />
          {/* Inner Negative Hole of the R Loop */}
          <rect
            x="43"
            y="35.5"
            width="14"
            height="7"
            rx="1"
            fill="#181b22"
          />

          {/* Lower Diagonal Leg of the R */}
          <path
            d="M51 49 L 66 72 H 56 L 43 51 Z"
            fill="url(#rust_ember)"
          />

          {/* Molten Core Highlight Notch */}
          <polygon
            points="34,28 43,28 43,40 34,40"
            fill="#ffffff"
            fillOpacity="0.18"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-black tracking-widest text-white uppercase font-sans">
              EPIC RUST
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
