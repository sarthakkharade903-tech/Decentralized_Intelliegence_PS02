import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import UploadModal from './components/UploadModal';

export default function App() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsUploadOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#06080D] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Minimal Navigation */}
      <Navbar onOpenUpload={() => setIsUploadOpen(true)} />

      {/* Main Hero Landing Experience */}
      <main className="flex-1 flex flex-col justify-center">
        <Hero onOpenUpload={() => setIsUploadOpen(true)} />
      </main>

      {/* Minimal Editorial Footer */}
      <footer className="w-full border-t border-slate-900/80 py-6 px-6 bg-[#04060A]/90">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-400">
          <div>
            <span className="text-slate-300 font-semibold">NeuroVault</span> · Kurukshetra Technical Inauguration & 24h Hackathon
          </div>
          <div className="text-[11px] text-slate-400 text-center sm:text-right">
            Research and hackathon prototype · AI-predicted candidate regions · Not a certified diagnostic device
          </div>
        </div>
      </footer>

      {/* Sequence Ingestion Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />
    </div>
  );
}
