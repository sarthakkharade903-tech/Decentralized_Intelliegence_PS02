import React from 'react';
import { Activity, ShieldCheck, Cpu } from 'lucide-react';

export default function Navbar({ onOpenUpload }) {
  return (
    <header className="relative z-30 w-full border-b border-slate-800/80 bg-[#06080D]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Brand Wordmark */}
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/10 border border-cyan-500/40 group-hover:border-cyan-400 transition-colors shadow-[0_0_15px_-3px_rgba(34,211,238,0.3)]">
            <Activity className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
            <div className="absolute inset-0 rounded-xl bg-cyan-400/10 animate-pulse-glow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white font-sans">
                NEURO<span className="text-cyan-400 font-light">VAULT</span>
              </span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold tracking-wider">
                3D-AI
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400 tracking-wide">
              BRAIN MRI VOLUMETRIC SEGMENTATION
            </p>
          </div>
        </div>

        {/* Status Indicators & Actions */}
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-5 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LOCAL RUNTIME</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5 text-slate-400">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>MONAI · BraTS'21</span>
            </div>
          </div>

          <button
            onClick={onOpenUpload}
            className="px-4 py-2 rounded-lg text-xs font-medium tracking-wide text-cyan-300 border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 hover:border-cyan-400 hover:text-white transition-all shadow-[0_0_12px_-2px_rgba(34,211,238,0.2)]"
          >
            Upload Sequences
          </button>
        </div>
      </div>
    </header>
  );
}
