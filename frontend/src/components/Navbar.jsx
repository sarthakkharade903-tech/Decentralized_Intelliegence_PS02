import React from 'react';

export default function Navbar() {
  return (
    <header className="relative z-30 w-full bg-[#E9DDD5] px-6 lg:px-12 pt-6 pb-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left: Brain Icon + NeuroVault Wordmark + Home */}
        <div className="flex items-center">
          {/* Engraved Brain Icon */}
          <div className="flex items-center gap-2.5 cursor-pointer">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#30252A"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 text-[#30252A]"
            >
              <path d="M9.5 4a3.5 3.5 0 0 0-3.5 3.5c0 .35.05.69.15 1A3.5 3.5 0 0 0 4 11.5c0 .54.12 1.05.34 1.5A3.5 3.5 0 0 0 4 15.5c0 1.25.66 2.35 1.65 2.95A4 4 0 0 0 9.5 20h.5v-16z" />
              <path d="M14.5 4a3.5 3.5 0 0 1 3.5 3.5c0 .35-.05.69-.15 1A3.5 3.5 0 0 1 20 11.5c0 .54-.12 1.05-.34 1.5A3.5 3.5 0 0 1 20 15.5c0 1.25-.66 2.35-1.65 2.95A4 4 0 0 1 14.5 20h-.5v-16z" />
              <path d="M12 4v16" strokeDasharray="1 1.5" />
              <path d="M8 9a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2" />
              <path d="M16 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2" />
            </svg>
            <span className="text-xl font-bold tracking-tight text-[#30252A] font-serif">
              NeuroVault
            </span>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-[#30252A]/20 mx-4" />

          {/* Navigation Item */}
          <nav className="flex items-center">
            <a
              href="#home"
              className="text-xs font-semibold text-[#30252A] tracking-wider uppercase border-b-2 border-[#6D263D] pb-0.5"
            >
              Home
            </a>
          </nav>
        </div>

        {/* Right: Research Preview Badge */}
        <div className="flex items-center gap-2 text-xs font-medium text-[#6E5D65]">
          <span className="w-2 h-2 rounded-full bg-[#6D263D]" />
          <span>Research Preview</span>
        </div>
      </div>
    </header>
  );
}
