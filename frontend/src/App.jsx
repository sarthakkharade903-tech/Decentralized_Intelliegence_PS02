import React, { useRef } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import MriWorkspace from './components/MriWorkspace';

export default function App() {
  const workspaceRef = useRef(null);

  const handleExploreClick = () => {
    if (workspaceRef.current) {
      workspaceRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#E9DDD5] text-[#30252A] flex flex-col selection:bg-[#6D263D]/20 selection:text-[#6D263D]">
      {/* Top Editorial Navigation */}
      <Navbar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* World A: Warm Blush Anatomy Hero */}
        <Hero onExploreClick={handleExploreClick} />

        {/* World B: Oxblood MRI Workspace */}
        <MriWorkspace workspaceRef={workspaceRef} />
      </main>

      {/* Editorial Footer (Matching Oxblood Theme) */}
      <footer className="w-full bg-[#542031] text-[#F8F5F0]/70 py-6 px-6 lg:px-12 border-t border-[#6D263D]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-sans">
          <div>
            <span className="font-semibold text-[#F8F5F0] font-serif text-sm">NeuroVault</span> · Kurukshetra Technical Inauguration & 24h Hackathon
          </div>
          <div className="text-[11px] text-[#F8F5F0]/60 text-center sm:text-right">
            Research and hackathon prototype · AI-predicted candidate regions · Not a certified diagnostic device
          </div>
        </div>
      </footer>
    </div>
  );
}
