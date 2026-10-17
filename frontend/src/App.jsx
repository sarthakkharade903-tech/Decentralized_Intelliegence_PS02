import React, { useRef, useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import MriWorkspace from './components/MriWorkspace';
import WorkstationPage from './components/WorkstationPage';
import UploadModal from './components/UploadModal';

export default function App() {
  const [currentPage, setCurrentPage] = useState('landing'); // 'landing' | 'workstation'
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [predictionData, setPredictionData] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState(null);
  const workspaceRef = useRef(null);

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

  const handleExploreClick = () => {
    if (currentPage !== 'landing') {
      setCurrentPage('landing');
      setTimeout(() => {
        workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } else {
      workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleInferenceSuccess = (result, files = null) => {
    setPredictionData(result);
    if (files) {
      setUploadedFiles(files);
    }
    setIsUploadOpen(false);
    setCurrentPage('workstation');
  };

  return (
    <div className="min-h-screen bg-[#E9DDD5] text-[#30252A] flex flex-col selection:bg-[#6D263D]/20 selection:text-[#6D263D]">
      {/* Top Editorial Navigation */}
      <Navbar
        currentPage={currentPage}
        onNavigate={(page) => setCurrentPage(page)}
        onOpenUpload={handleExploreClick}
      />

      {/* Dynamic Multi-Page Router */}
      {currentPage === 'landing' ? (
        <>
          <main className="flex-1 flex flex-col">
            {/* World A: Warm Blush Anatomy Hero */}
            <Hero
              onExploreClick={handleExploreClick}
              onLaunchWorkstation={() => setCurrentPage('workstation')}
            />

            {/* World B: Oxblood MRI Workspace */}
            <MriWorkspace
              workspaceRef={workspaceRef}
              onInferenceSuccess={handleInferenceSuccess}
            />
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
        </>
      ) : (
        <main className="flex-1 flex flex-col">
          <WorkstationPage
            onBackToHome={() => setCurrentPage('landing')}
            onOpenUpload={() => setIsUploadOpen(true)}
            predictionData={predictionData}
            uploadedFiles={uploadedFiles}
          />
        </main>
      )}

      {/* Global Ingestion & Inference Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onInferenceSuccess={handleInferenceSuccess}
      />
    </div>
  );
}
