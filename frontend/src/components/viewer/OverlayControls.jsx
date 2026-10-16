import React from 'react';
import { Eye, Crosshair, Sparkles, ShieldCheck, Sliders } from 'lucide-react';

export default function OverlayControls({
  showNETC = true,
  showED = true,
  showET = true,
  onToggleNETC,
  onToggleED,
  onToggleET,
  showTP = true,
  showFP = true,
  showFN = true,
  onToggleTP,
  onToggleFP,
  onToggleFN,
  overlayOpacity = 0.65,
  onChangeOpacity,
  showCrosshairs = true,
  onToggleCrosshairs,
  activeSource = 'prediction',
  hasExpertMask = false,
  onToggleSource
}) {
  const handlePresetWT = () => {
    onToggleNETC?.(true);
    onToggleED?.(true);
    onToggleET?.(true);
  };

  const handlePresetTC = () => {
    onToggleNETC?.(true);
    onToggleED?.(false);
    onToggleET?.(true);
  };

  const handlePresetET = () => {
    onToggleNETC?.(false);
    onToggleED?.(false);
    onToggleET?.(true);
  };

  const handleClearAll = () => {
    onToggleNETC?.(false);
    onToggleED?.(false);
    onToggleET?.(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
      {/* Left: Discrete BraTS Region Toggles OR Error Map Toggles */}
      {activeSource === 'error' ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-amber-400 font-semibold tracking-wide flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span>Error Map:</span>
          </span>

          {/* TP */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 cursor-pointer hover:bg-emerald-900/40 transition-colors">
            <input
              type="checkbox"
              checked={showTP}
              onChange={(e) => onToggleTP?.(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-400 rounded cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            <span className="font-medium">TP (Match)</span>
            <span className="text-[10px] text-emerald-400/80">#22C55E</span>
          </label>

          {/* FP */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 cursor-pointer hover:bg-rose-900/40 transition-colors">
            <input
              type="checkbox"
              checked={showFP}
              onChange={(e) => onToggleFP?.(e.target.checked)}
              className="w-3.5 h-3.5 accent-rose-400 rounded cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span className="font-medium">FP (Over-call)</span>
            <span className="text-[10px] text-rose-400/80">#EF4444</span>
          </label>

          {/* FN */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-950/60 border border-sky-800/80 text-sky-300 cursor-pointer hover:bg-sky-900/40 transition-colors">
            <input
              type="checkbox"
              checked={showFN}
              onChange={(e) => onToggleFN?.(e.target.checked)}
              className="w-3.5 h-3.5 accent-sky-400 rounded cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
            <span className="font-medium">FN (Missed)</span>
            <span className="text-[10px] text-sky-400/80">#38BDF8</span>
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-slate-400 font-semibold tracking-wide flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sub-Regions:</span>
          </span>

          {/* NETC (Label 1) */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-800/80 text-cyan-300 cursor-pointer hover:bg-cyan-900/40 transition-colors">
            <input
              type="checkbox"
              checked={showNETC}
              onChange={(e) => onToggleNETC?.(e.target.checked)}
              className="w-3.5 h-3.5 accent-cyan-400 rounded cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-[#06B6D4]" />
            <span className="font-medium">NETC (1)</span>
            <span className="text-[10px] text-cyan-400/80">Necrotic</span>
          </label>

          {/* ED (Label 2) */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-800/80 text-amber-300 cursor-pointer hover:bg-amber-900/40 transition-colors">
            <input
              type="checkbox"
              checked={showED}
              onChange={(e) => onToggleED?.(e.target.checked)}
              className="w-3.5 h-3.5 accent-amber-400 rounded cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-[#EAB308]" />
            <span className="font-medium">ED (2)</span>
            <span className="text-[10px] text-amber-400/80">Edema</span>
          </label>

          {/* ET (Label 4) */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 cursor-pointer hover:bg-rose-900/40 transition-colors">
            <input
              type="checkbox"
              checked={showET}
              onChange={(e) => onToggleET?.(e.target.checked)}
              className="w-3.5 h-3.5 accent-rose-400 rounded cursor-pointer"
            />
            <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
            <span className="font-medium">ET (4)</span>
            <span className="text-[10px] text-rose-400/80">Enhancing</span>
          </label>

          {/* Presets */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            <button
              onClick={handlePresetWT}
              title="Whole Tumor (WT): Necrotic (1) + Edema (2) + Enhancing (4)"
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              WT
            </button>
            <button
              onClick={handlePresetTC}
              title="Tumor Core (TC): Necrotic (1) + Enhancing (4)"
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              TC
            </button>
            <button
              onClick={handlePresetET}
              title="Enhancing Tumor (ET): Label 4 only"
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              ET
            </button>
            <button
              onClick={handleClearAll}
              title="Hide all tumor overlays"
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              Off
            </button>
          </div>
        </div>
      )}

      {/* Right: Opacity + Crosshairs + Provenance Source */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Opacity Slider */}
        <div className="flex items-center gap-2 text-slate-400">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>Opacity:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={overlayOpacity}
            onChange={(e) => onChangeOpacity?.(parseFloat(e.target.value))}
            className="w-20 accent-cyan-400 cursor-pointer"
          />
          <span className="w-9 text-right font-mono text-slate-200">
            {Math.round(overlayOpacity * 100)}%
          </span>
        </div>

        {/* Crosshairs Toggle */}
        <button
          onClick={() => onToggleCrosshairs?.()}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
            showCrosshairs
              ? 'bg-cyan-950 text-cyan-300 border-cyan-800/80 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Crosshairs</span>
        </button>

        {/* Provenance Badge (Model Prediction vs Expert Ground Truth vs Error Map) */}
        {hasExpertMask ? (
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-800/90 border border-slate-700">
            <button
              onClick={() => onToggleSource?.('prediction')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                activeSource === 'prediction'
                  ? 'bg-cyan-950 text-cyan-300 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>AI Prediction</span>
            </button>
            <button
              onClick={() => onToggleSource?.('expert')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                activeSource === 'expert'
                  ? 'bg-emerald-950 text-emerald-300 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Ground Truth</span>
            </button>
            <button
              onClick={() => onToggleSource?.('error')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                activeSource === 'error'
                  ? 'bg-amber-950 text-amber-300 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3 h-3 text-amber-400" />
              <span>Error Map</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-cyan-300 text-[11px]">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>MONAI Inference Mask</span>
          </div>
        )}
      </div>
    </div>
  );
}
