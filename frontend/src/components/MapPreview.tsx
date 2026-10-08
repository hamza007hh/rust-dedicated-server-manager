import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ExternalLink, Copy, Check, Compass, Download, RefreshCw, Sparkles, MapPin } from 'lucide-react';
import { RealRustMapInfo } from '../types/server';
import { api } from '../services/api';

interface MapPreviewProps {
  seed: number;
  worldsize: number;
  isProcedural: boolean;
  levelUrl?: string | null;
  compact?: boolean;
}

export const MapPreview: React.FC<MapPreviewProps> = ({
  seed,
  worldsize,
  isProcedural,
  levelUrl,
  compact = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [realMap, setRealMap] = useState<RealRustMapInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const rustMapsUrl = `https://rustmaps.com/map/${worldsize}_${seed}`;

  const loadRealMap = useCallback(async () => {
    if (!isProcedural) return;
    setIsLoading(true);
    setImgError(false);
    try {
      const data = await api.fetchRealRustMap(seed, worldsize);
      setRealMap(data);
    } catch (e) {
      console.warn('Failed to fetch real Rust map:', e);
      setRealMap(null);
    } finally {
      setIsLoading(false);
    }
  }, [seed, worldsize, isProcedural]);

  useEffect(() => {
    loadRealMap();
  }, [loadRealMap]);

  // Seeded Perlin/multi-octave pseudo-random generator for authentic dynamic fallback
  const pseudoRandom = (s: number) => {
    let t = (s % 2147483647) + 1;
    return () => {
      t = (t * 16807) % 2147483647;
      return (t - 1) / 2147483646;
    };
  };

  useEffect(() => {
    if (!isProcedural || !canvasRef.current || (realMap?.image_url && !imgError)) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const rng = pseudoRandom(seed);

    // Deep ocean background
    ctx.fillStyle = '#0a1926';
    ctx.fillRect(0, 0, width, height);

    // Radial ocean depth gradient
    const oceanGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.1,
      width / 2,
      height / 2,
      width * 0.55
    );
    oceanGrad.addColorStop(0, '#103046');
    oceanGrad.addColorStop(0.7, '#0a1a27');
    oceanGrad.addColorStop(1, '#050c14');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, width, height);

    // Generate Island Contour with unique seed-based harmonics
    const numPoints = 84;
    const islandPoints: [number, number][] = [];
    const sizeScale = Math.min(Math.max(worldsize / 4000, 0.7), 1.25);
    const baseRadius = width * 0.35 * sizeScale;

    const p1 = rng() * 10;
    const p2 = rng() * 10;
    const p3 = rng() * 10;

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const noise =
        Math.sin(angle * 3 + p1) * 22 +
        Math.cos(angle * 6 + p2) * 16 +
        Math.sin(angle * 9 + p3) * 9 +
        (rng() - 0.5) * 18;
      const r = Math.max(baseRadius + noise, width * 0.15);
      const x = width / 2 + Math.cos(angle) * r;
      const y = height / 2 + Math.sin(angle) * r;
      islandPoints.push([x, y]);
    }

    // Draw main island landmass
    ctx.beginPath();
    ctx.moveTo(islandPoints[0][0], islandPoints[0][1]);
    for (let i = 1; i < islandPoints.length; i++) {
      ctx.lineTo(islandPoints[i][0], islandPoints[i][1]);
    }
    ctx.closePath();

    // Biome gradient (North: Arctic Snow, Middle: Forest/Plains, South: Arid Desert)
    const landGrad = ctx.createLinearGradient(0, height * 0.12, 0, height * 0.88);
    landGrad.addColorStop(0, '#eaf2f8'); // Snow
    landGrad.addColorStop(0.22, '#c4deda'); // Tundra
    landGrad.addColorStop(0.42, '#386330'); // Forest
    landGrad.addColorStop(0.68, '#4f752d'); // Plains
    landGrad.addColorStop(0.85, '#bc944e'); // Desert
    landGrad.addColorStop(1, '#d8b066'); // Dunes

    ctx.fillStyle = landGrad;
    ctx.fill();

    // Coastline shore border
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#27585c';
    ctx.stroke();

    // Mountain Ridges
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    const mountainCount = Math.floor(4 + rng() * 6);
    for (let m = 0; m < mountainCount; m++) {
      const mx = width * 0.28 + rng() * width * 0.44;
      const my = height * 0.22 + rng() * height * 0.48;
      const mr = 14 + rng() * 32;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rust Coordinate Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    const gridCols = 8;
    const cellW = width / gridCols;
    for (let x = 0; x <= width; x += cellW) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += cellW) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [seed, worldsize, isProcedural, realMap, imgError]);

  const handleCopySeed = () => {
    navigator.clipboard.writeText(seed.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (realMap?.image_url && !imgError) {
      window.open(realMap.image_url, '_blank');
      return;
    }
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `rust_map_${worldsize}_${seed}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const areaSqKm = ((worldsize * worldsize) / 1000000).toFixed(1);

  if (compact) {
    /* COMPACT VIEW FOR DASHBOARD HERO */
    return (
      <div className="rounded-2xl bg-[#12141a]/90 border border-white/[0.08] p-4 flex flex-col space-y-3 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Compass className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold text-white tracking-wide">
              {realMap?.is_real ? 'Real Satellite Map' : 'Procedural Topology'}
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleCopySeed}
              className="px-2 py-0.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[11px] font-mono text-neutral-300 border border-white/[0.06] transition-all flex items-center space-x-1"
              title="Copy seed"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{seed}</span>
            </button>
            <a
              href={rustMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 transition-all"
              title="Open on RustMaps.com"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Map Image / Canvas Display */}
        <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black/50 border border-white/[0.06] flex items-center justify-center group">
          {realMap?.image_url && !imgError ? (
            <img
              src={realMap.image_url}
              alt={`Rust Map ${worldsize}_${seed}`}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <canvas
              ref={canvasRef}
              width={260}
              height={260}
              className="w-full h-full object-cover rounded-xl"
            />
          )}

          {/* Badge Overlay */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-black/75 text-white border border-white/10 backdrop-blur-sm">
              {worldsize}m ({areaSqKm} km²)
            </span>
            {realMap?.is_real ? (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/80 text-white border border-emerald-400/30 backdrop-blur-sm flex items-center space-x-1">
                <Sparkles className="w-3 h-3" />
                <span>Verified</span>
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-orange-500/80 text-white border border-orange-400/30 backdrop-blur-sm">
                Seeded
              </span>
            )}
          </div>

          {isLoading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-orange-400 animate-spin" />
            </div>
          )}
        </div>

        {/* Monuments count or quick info */}
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-0.5">
          <span>Monuments:</span>
          <span className="text-white font-semibold">
            {realMap?.total_monuments ? `${realMap.total_monuments} sites` : '~24 major sites'}
          </span>
        </div>
      </div>
    );
  }

  /* FULL VIEW FOR MAPS PAGE */
  return (
    <div className="bg-[#12141a] border border-white/[0.08] rounded-2xl p-6 space-y-5 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              {realMap?.is_real ? 'Official RustMaps Satellite Render' : 'Procedural Island Topology'}
            </h3>
            <p className="text-[11px] text-neutral-400 font-mono">
              Seed: {seed} • World Size: {worldsize}m ({areaSqKm} km²)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadRealMap}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-neutral-300 hover:text-white border border-white/[0.06] transition-all"
            title="Refresh Map Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
          </button>
          <button
            onClick={handleCopySeed}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-neutral-200 border border-white/[0.06] text-xs font-mono transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copy Seed: {seed}</span>
          </button>
          <a
            href={rustMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 border border-orange-500/30 text-xs font-mono font-medium transition-colors"
          >
            <span>RustMaps.com</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {isProcedural ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Visual Display */}
          <div className="lg:col-span-2 relative flex justify-center bg-black/60 rounded-2xl p-3 border border-white/[0.06] overflow-hidden group">
            {realMap?.image_url && !imgError ? (
              <img
                src={realMap.image_url}
                alt={`Rust Map ${worldsize}_${seed}`}
                onError={() => setImgError(true)}
                className="rounded-xl shadow-2xl max-w-full aspect-square border border-white/10 object-cover"
              />
            ) : (
              <canvas
                ref={canvasRef}
                width={440}
                height={440}
                className="rounded-xl shadow-2xl max-w-full aspect-square border border-white/10"
              />
            )}

            <button
              onClick={handleDownload}
              title="Download or View High-Res Map"
              className="absolute top-5 right-5 p-2 rounded-xl bg-black/75 hover:bg-black text-neutral-300 hover:text-white border border-white/10 shadow transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            {realMap?.is_real && (
              <div className="absolute bottom-5 left-5 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center space-x-1.5 backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Satellite Render</span>
              </div>
            )}
          </div>

          {/* Map Metadata & Topography Details */}
          <div className="space-y-4 text-xs font-mono">
            <div className="bg-[#161822] border border-white/[0.06] rounded-xl p-4 space-y-2.5">
              <span className="text-neutral-400 font-bold block uppercase text-[10px] tracking-widest">
                Map Generation Specs
              </span>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-neutral-400">Map Type:</span>
                <span className="text-white font-semibold">Procedural Map</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-neutral-400">Seed:</span>
                <span className="text-orange-400 font-bold">{seed}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.05]">
                <span className="text-neutral-400">World Size:</span>
                <span className="text-white font-semibold">{worldsize}m ({areaSqKm} km²)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-400">Monuments:</span>
                <span className="text-emerald-400 font-semibold">
                  {realMap?.total_monuments ? `${realMap.total_monuments} indexed` : 'Estimated 24+ sites'}
                </span>
              </div>
            </div>

            {/* Monuments sample if available */}
            {realMap?.monuments && realMap.monuments.length > 0 && (
              <div className="bg-[#161822] border border-white/[0.06] rounded-xl p-4 space-y-2">
                <span className="text-neutral-400 font-bold block uppercase text-[10px] tracking-widest">
                  Key Monuments Indexed ({realMap.monuments.length})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
                  {realMap.monuments.slice(0, 16).map((m, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.06] text-[10px] text-neutral-300 flex items-center space-x-1"
                    >
                      <MapPin className="w-2.5 h-2.5 text-orange-400" />
                      <span>{m}</span>
                    </span>
                  ))}
                  {realMap.monuments.length > 16 && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] text-neutral-500">
                      +{realMap.monuments.length - 16} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Biome Legend */}
            <div className="bg-[#161822] border border-white/[0.06] rounded-xl p-4 space-y-2.5">
              <span className="text-neutral-400 font-bold block uppercase text-[10px] tracking-widest">
                Biome Topography
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-[#eaf2f8] border border-neutral-600 inline-block" />
                  <span className="text-neutral-300">Arctic (Snow)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-[#386330] inline-block" />
                  <span className="text-neutral-300">Forest / Plains</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-[#d8b066] inline-block" />
                  <span className="text-neutral-300">Desert (Arid)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-[#103046] inline-block" />
                  <span className="text-neutral-300">Coastline</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-neutral-400 leading-relaxed bg-[#161822]/80 p-3 rounded-xl border border-white/[0.05]">
              💡 Tip: Click <span className="text-orange-400 font-semibold">RustMaps.com</span> to view 3D topology, underground tunnel networks, and cave systems for this exact seed.
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-neutral-400 space-y-2 font-mono text-xs">
          <p>Custom Map Selected</p>
          {levelUrl ? (
            <p className="text-neutral-200 break-all">URL: {levelUrl}</p>
          ) : (
            <p className="text-amber-400">No Level URL configured yet.</p>
          )}
        </div>
      )}
    </div>
  );
};
