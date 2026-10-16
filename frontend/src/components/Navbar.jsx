import React from 'react';

export default function Navbar({
  currentPage = 'landing',
  onNavigate = () => {},
  onOpenUpload = () => {}
}) {
  return (
    <header className="relative z-30 w-full bg-[#E9DDD5] px-6 lg:px-12 pt-6 pb-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left: Brain Icon + NeuroVault Wordmark + Navigation */}
        <div className="flex items-center">
          {/* Engraved Brain Icon */}
          <div
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-2.5 cursor-pointer group"
            title="Return to Home"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#30252A"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 text-[#30252A] group-hover:text-[#6D263D] transition-colors"
            >
              <path d="M9.5 4a3.5 3.5 0 0 0-3.5 3.5c0 .35.05.69.15 1A3.5 3.5 0 0 0 4 11.5c0 .54.12 1.05.34 1.5A3.5 3.5 0 0 0 4 15.5c0 1.25.66 2.35 1.65 2.95A4 4 0 0 0 9.5 20h.5v-16z" />
              <path d="M14.5 4a3.5 3.5 0 0 1 3.5 3.5c0 .35-.05.69-.15 1A3.5 3.5 0 0 1 20 11.5c0 .54-.12 1.05-.34 1.5A3.5 3.5 0 0 1 20 15.5c0 1.25-.66 2.35-1.65 2.95A4 4 0 0 1 14.5 20h-.5v-16z" />
              <path d="M12 4v16" strokeDasharray="1 1.5" />
              <path d="M8 9a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2" />
              <path d="M16 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2" />
            </svg>
            <span className="text-xl font-bold tracking-tight text-[#30252A] font-serif group-hover:text-[#6D263D] transition-colors">
              NeuroVault
            </span>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-[#30252A]/20 mx-4" />

          {/* Navigation Items */}
          <nav className="flex items-center gap-5 sm:gap-6">
            <button
              onClick={() => onNavigate('landing')}
              className={`text-xs font-semibold tracking-wider uppercase transition-all pb-0.5 cursor-pointer ${
                currentPage === 'landing'
                  ? 'text-[#30252A] border-b-2 border-[#6D263D]'
                  : 'text-[#6E5D65] hover:text-[#30252A]'
              }`}
            >
              Home
            </button>

            <button
              onClick={() => onNavigate('workstation')}
              className={`text-xs font-semibold tracking-wider uppercase transition-all pb-0.5 cursor-pointer flex items-center gap-1.5 ${
                currentPage === 'workstation'
                  ? 'text-[#30252A] border-b-2 border-[#6D263D]'
                  : 'text-[#6E5D65] hover:text-[#30252A]'
              }`}
            >
              <span>Workstation</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#6D263D]/10 text-[#6D263D] border border-[#6D263D]/25 font-bold">
                3D
              </span>
            </button>
          </nav>
        </div>

        {/* Right: Actions & Research Preview Badge */}
        <div className="flex items-center gap-4">
          {currentPage === 'landing' ? (
            <button
              onClick={onOpenUpload}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#6D263D] border border-[#6D263D]/30 hover:bg-[#6D263D]/10 transition-colors cursor-pointer"
            >
              Upload Scans
            </button>
          ) : (
            <button
              onClick={() => onNavigate('landing')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#6D263D] border border-[#6D263D]/30 hover:bg-[#6D263D]/10 transition-colors cursor-pointer"
            >
              ← Back to Atlas
            </button>
          )}

          <div className="flex items-center gap-2 text-xs font-medium text-[#6E5D65]">
            <span className="w-2 h-2 rounded-full bg-[#6D263D]" />
            <span className="hidden md:inline">Research Preview</span>
          </div>
        </div>
      </div>
    </header>
  );
}
