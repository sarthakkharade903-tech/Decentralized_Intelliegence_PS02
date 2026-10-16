import React, { useRef } from 'react';
import { ArrowRight, ShieldCheck, Layers, UploadCloud } from 'lucide-react';
import Brain3D from './Brain3D';
import UploadPanel from './UploadPanel';

export default function Hero() {
  const uploadPanelRef = useRef(null);

  const handleScrollToUpload = () => {
    if (uploadPanelRef.current) {
      uploadPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add subtle glow flash on focus
      uploadPanelRef.current.classList.add('ring-2', 'ring-cyan-400');
      setTimeout(() => {
        uploadPanelRef.current?.classList.remove('ring-2', 'ring-cyan-400');
      }, 1200);
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-5rem)] flex flex-col justify-center overflow-hidden px-6 py-6 lg:py-10">
      {/* Background Ambience: Subtle atmospheric depth and sparse radial lights */}
      <div className="absolute top-1/4 right-1/4 w-[650px] h-[650px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[450px] h-[450px] bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto w-full">
        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          
          {/* Left Column: Hero Content & Typography */}
          <div className="lg:col-span-6 space-y-6 text-left">
            {/* Top Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-cyan-500/30 text-cyan-300 text-xs font-mono tracking-wide shadow-[0_0_15px_-3px_rgba(34,211,238,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>KURUKSHETRA HACKATHON · 3D BRAIN MRI SEGMENTATION</span>
            </div>

            {/* Monumental Headline */}
            <div className="space-y-1">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white font-sans leading-[1.08]">
                Look deeper. <br />
                <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
                  See beyond.
                </span>
              </h1>
            </div>

            {/* Exact Supporting Copy */}
            <p className="text-base sm:text-lg text-slate-300 font-normal leading-relaxed max-w-xl">
              Explore brain MRI through AI-powered tumor-region segmentation and immersive 3D visualization.
            </p>

            {/* Modality Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {['T1 Native', 'T1Gd Contrast', 'T2-Weighted', 'FLAIR Edema'].map((seq) => (
                <span
                  key={seq}
                  className="px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-mono"
                >
                  {seq}
                </span>
              ))}
            </div>

            {/* Primary CTA Button */}
            <div className="pt-2 space-y-3">
              <div>
                <button
                  onClick={handleScrollToUpload}
                  className="group relative inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl font-semibold text-sm tracking-wide text-slate-950 bg-gradient-to-r from-cyan-400 via-cyan-300 to-teal-300 hover:from-cyan-300 hover:to-teal-200 transition-all duration-300 shadow-[0_0_28px_-4px_rgba(34,211,238,0.55)] hover:shadow-[0_0_36px_-2px_rgba(34,211,238,0.75)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 stroke-[2.2]" />
                  <span>Upload MRI Scan</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Privacy-Conscious Statement */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Local-only processing. MRI files stay on your device.</span>
              </div>
            </div>
          </div>

          {/* Right Column: Framed 3D Brain View Panel */}
          <div className="lg:col-span-6 relative">
            {/* The Framed Brain Canvas Box */}
            <div className="relative w-full aspect-[4/3] sm:aspect-square lg:aspect-[1.12/1] rounded-2xl border border-cyan-500/30 bg-[#060A12]/70 backdrop-blur-md overflow-hidden shadow-[0_0_60px_-15px_rgba(6,182,212,0.22)] flex flex-col justify-between">
              
              {/* Top Frame Bar */}
              <div className="relative z-20 flex items-center justify-between px-5 pt-4 text-xs font-mono">
                <div className="flex items-center gap-2 text-cyan-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="tracking-wider uppercase font-medium">3D Brain View</span>
                </div>
                <div className="text-slate-400 tracking-wider">
                  1.0mm <span className="text-slate-600">|</span> ISOTROPIC
                </div>
              </div>

              {/* Center Canvas: Interactive 3D Anatomical Brain */}
              <div className="relative flex-1 w-full h-full min-h-[340px]">
                <Brain3D />

                {/* Right Edge: Subtle Measurement Scale Ticks */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 opacity-40 pointer-events-none">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-px bg-cyan-400 ${i % 3 === 0 ? 'w-3' : 'w-1.5'}`}
                    />
                  ))}
                </div>
              </div>

              {/* Bottom Frame Bar */}
              <div className="relative z-20 flex items-center justify-between px-5 pb-4 text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-400">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[11px] uppercase tracking-wide">
                    4 MRI Sequences <span className="text-slate-500">(T1, T1Gd, T2, FLAIR)</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                  <span className="w-1 h-1 rounded-full bg-cyan-400" />
                  <span className="tracking-wider uppercase">Research Preview</span>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* MRI Upload Panel: Positioned beneath left content with layered overlap aesthetic */}
        <div className="mt-8 lg:mt-10 lg:-mr-12 max-w-2xl">
          <UploadPanel panelRef={uploadPanelRef} />
        </div>

      </div>
    </section>
  );
}
