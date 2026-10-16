import React from 'react';

export default function Navbar() {
  return (
    <header className="relative z-30 w-full bg-[#06080D]/90">
      <div className="max-w-7xl mx-auto px-6 h-16 sm:h-20 flex items-center justify-between">
        {/* Left: Brain Icon & NeuroVault Wordmark */}
        <div className="flex items-center gap-3 cursor-pointer group">
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

        {/* Center: Only "Home" navigation item with glowing active indicator */}
        <nav className="flex items-center justify-center">
          <div className="relative cursor-pointer group py-1">
            <span className="text-sm font-medium text-cyan-300 tracking-wide font-sans group-hover:text-cyan-200 transition-colors">
              Home
            </span>
            <div className="w-5 h-0.5 bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full mx-auto mt-1 shadow-[0_0_8px_#22d3ee]" />
          </div>
        </nav>

        {/* Right side spacer for balanced centering */}
        <div className="w-24 hidden sm:block" />
      </div>
    </header>
  );
}
