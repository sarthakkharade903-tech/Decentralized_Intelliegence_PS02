import React from 'react';
import { ArrowRight, ShieldCheck, Layers, Sparkles, Brain, Cpu } from 'lucide-react';
import brainHeroImg from '../assets/brain-hero.jpg';

export default function Hero({ onOpenUpload }) {
  return (
    <section className="relative min-h-[calc(100vh-5rem)] flex items-center justify-center overflow-hidden py-12 lg:py-20">
      {/* Background Ambience: Obsidian Radial Glows and Subtle Dot Grid */}
      <div className="absolute inset-0 bg-dot-grid pointer-events-none opacity-40" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Sophisticated Editorial Content */}
          <div className="lg:col-span-6 space-y-8 text-left">
            {/* Context Badge */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 text-cyan-300 text-xs font-mono tracking-wide shadow-[0_0_15px_-3px_rgba(34,211,238,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>KURUKSHETRA HACKATHON · 3D BRAIN MRI SEGMENTATION</span>
            </div>

            {/* Monumental Headline */}
            <div className="space-y-2">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white font-sans leading-[1.08]">
                Look deeper. <br />
                <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
                  See beyond.
                </span>
              </h1>
            </div>

            {/* Focused Clinical Description */}
            <p className="text-base sm:text-lg text-slate-300 font-normal leading-relaxed max-w-xl">
              NeuroVault transforms multi-parametric brain MRI scans into clinically exact 3D segmentations of Whole Tumor, Tumor Core, and Enhancing Margins—preserving physical affine geometry and standardized BraTS 2021 label hierarchy.
            </p>

            {/* Modality Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono text-slate-400">
              <span className="text-slate-400 mr-1 font-sans text-xs">Required modalities:</span>
              {['T1 Native', 'T1Gd Contrast', 'T2-Weighted', 'FLAIR Edema'].map((seq) => (
                <span
                  key={seq}
                  className="px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-800 text-slate-300"
                >
                  {seq}
                </span>
              ))}
            </div>

            {/* Primary CTA and Actions */}
            <div className="pt-2 space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <button
                  onClick={onOpenUpload}
                  className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl font-semibold text-sm tracking-wide text-slate-950 bg-gradient-to-r from-cyan-400 via-cyan-300 to-teal-300 hover:from-cyan-300 hover:to-teal-200 transition-all duration-300 shadow-[0_0_30px_-5px_rgba(34,211,238,0.5)] hover:shadow-[0_0_40px_-2px_rgba(34,211,238,0.7)] hover:scale-[1.02] cursor-pointer"
                >
                  <span>Upload MRI Scan</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>

                <div className="flex items-center gap-2 text-xs font-mono text-slate-400 px-2 py-1">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span>MONAI 3D SegResNet Ready</span>
                </div>
              </div>

              {/* Strict Privacy-Conscious Processing Statement */}
              <div className="flex items-center gap-2 text-xs text-slate-400 max-w-lg pt-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  <strong className="text-slate-300 font-medium">Local-Only Processing:</strong> MRI data is kept local in your browser. Zero cloud transmission, zero patient data leakage.
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: The 3D Anatomical Brain Visual (Main Attraction) */}
          <div className="lg:col-span-6 relative flex items-center justify-center">
            {/* Ambient Radial Aura Behind Brain */}
            <div className="absolute w-[450px] h-[450px] sm:w-[520px] sm:h-[520px] rounded-full bg-cyan-500/15 blur-[90px] animate-pulse-glow pointer-events-none" />

            {/* Visual Glass Stage */}
            <div className="relative w-full max-w-[560px] aspect-square rounded-3xl p-3 sm:p-5 bg-gradient-to-b from-slate-900/60 to-slate-950/80 border border-slate-800/80 shadow-[0_0_80px_-20px_rgba(6,182,212,0.25)] backdrop-blur-xl group overflow-hidden animate-float">
              
              {/* MRI Scanning Laser Slice Simulation */}
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-scan-sweep pointer-events-none z-20" />
              
              {/* Image Frame */}
              <div className="relative w-full h-full rounded-2xl overflow-hidden bg-[#04060A] border border-cyan-500/20 flex items-center justify-center">
                <img
                  src={brainHeroImg}
                  alt="3D Anatomical Brain with Neural Pathways"
                  className="w-full h-full object-contain filter contrast-[1.05] brightness-100 transition-transform duration-700 group-hover:scale-[1.03]"
                  loading="eager"
                />

                {/* Subtle Vignette Gradient */}
                <div className="absolute inset-0 bg-radial-glow pointer-events-none" />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />

                {/* Scientific HUD Coordinates Overlay */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>ORIENTATION: RAS+</span>
                </div>

                <div className="absolute top-4 right-4 z-10 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md border border-slate-800 text-[10px] font-mono text-slate-400">
                  1.0mm ISOTROPIC
                </div>

                <div className="absolute bottom-4 left-4 z-10 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-cyan-400" />
                  <span>4 CHANNELS (T1, T1Gd, T2, FLAIR)</span>
                </div>

                <div className="absolute bottom-4 right-4 z-10 px-2.5 py-1 rounded bg-black/60 backdrop-blur-md border border-cyan-900/60 text-[10px] font-mono text-cyan-400">
                  BraTS'21 [0, 1, 2, 4]
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
