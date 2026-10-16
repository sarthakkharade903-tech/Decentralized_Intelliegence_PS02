import React from 'react';

export default function Navbar({
  currentPage = 'landing',
  onNavigate = () => {},
  onOpenUpload = () => {}
}) {
  return (
    <header className="relative z-30 w-full bg-[#06080D]/90 border-b border-slate-900/60">
      <div className="max-w-7xl mx-auto px-6 h-16 sm:h-20 flex items-center justify-between">
        {/* Left: Brain Icon & NeuroVault Wordmark */}
        <div
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-3 cursor-pointer group"
          title="Return to Home"
        >
          {/* Anatomical Brain SVG Icon */}
          <div className="relative w-8 h-8 flex items-center justify-center text-cyan-400 group-hover:text-cyan-300 transition-colors">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-7 h-7 filter drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
            >
              {/* Left Hemisphere */}
              <path d="M9.5 4a3.5 3.5 0 0 0-3.5 3.5c0 .35.05.69.15 1A3.5 3.5 0 0 0 4 11.5c0 .54.12 1.05.34 1.5A3.5 3.5 0 0 0 4 15.5c0 1.25.66 2.35 1.65 2.95A4 4 0 0 0 9.5 20h.5v-16z" />
              {/* Right Hemisphere */}
              <path d="M14.5 4a3.5 3.5 0 0 1 3.5 3.5c0 .35-.05.69-.15 1A3.5 3.5 0 0 1 20 11.5c0 .54-.12 1.05-.34 1.5A3.5 3.5 0 0 1 20 15.5c0 1.25-.66 2.35-1.65 2.95A4 4 0 0 1 14.5 20h-.5v-16z" />
              {/* Fissure and internal folds */}
              <path d="M12 4v16" strokeDasharray="1 1" />
              <path d="M8 9a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2" />
              <path d="M16 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2" />
            </svg>
          </div>

          <div className="flex items-center">
            <span className="text-xl font-bold tracking-tight text-white font-sans">
              Neuro<span className="text-cyan-400 font-semibold">Vault</span>
            </span>
          </div>
        </div>

        {/* Center: Navigation tabs (Home & Workstation) */}
        <nav className="flex items-center gap-8">
          {/* Home Tab */}
          <button
            onClick={() => onNavigate('landing')}
            className="relative cursor-pointer group py-1 text-left focus:outline-none"
          >
            <span
              className={`text-sm font-medium tracking-wide font-sans transition-colors ${
                currentPage === 'landing'
                  ? 'text-cyan-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Home
            </span>
            {currentPage === 'landing' && (
              <div className="w-5 h-0.5 bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full mx-auto mt-1 shadow-[0_0_8px_#22d3ee]" />
            )}
          </button>

          {/* Workstation Tab */}
          <button
            onClick={() => onNavigate('workstation')}
            className="relative cursor-pointer group py-1 text-left focus:outline-none flex items-center gap-1.5"
          >
            <span
              className={`text-sm font-medium tracking-wide font-sans transition-colors ${
                currentPage === 'workstation'
                  ? 'text-cyan-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Workstation
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
              3D
            </span>
            {currentPage === 'workstation' && (
              <div className="w-6 h-0.5 bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full mx-auto mt-1 shadow-[0_0_8px_#22d3ee]" />
            )}
          </button>
        </nav>

        {/* Right side: Quick Ingestion Button */}
        <div className="flex items-center justify-end">
          <button
            onClick={onOpenUpload}
            className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium text-cyan-300 border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 hover:border-cyan-400 hover:text-white transition-all cursor-pointer shadow-[0_0_10px_-2px_rgba(34,211,238,0.2)]"
          >
            Upload Sequences
          </button>
        </div>
      </div>
    </header>
  );
}
