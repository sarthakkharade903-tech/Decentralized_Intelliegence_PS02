import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import WorkstationPage from './components/WorkstationPage';
import UploadModal from './components/UploadModal';

export default function App() {
  const [currentPage, setCurrentPage] = useState('landing'); // 'landing' | 'workstation'
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [predictionData, setPredictionData] = useState(null);

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

  // When inference succeeds in modal, load data into workstation and switch view
  const handleInferenceSuccess = (result) => {
    setPredictionData(result);
    setIsUploadOpen(false);
    setCurrentPage('workstation');
  };

  return (
    <div className="min-h-screen bg-[#06080D] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation with Page Switching */}
      <Navbar
        currentPage={currentPage}
        onNavigate={(page) => setCurrentPage(page)}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      {/* Dynamic Multi-Page Router */}
      {currentPage === 'landing' ? (
        <main className="flex-1 flex flex-col justify-center">
          <Hero
            onOpenUpload={() => setIsUploadOpen(true)}
            onLaunchWorkstation={() => setCurrentPage('workstation')}
          />
        </main>
      ) : (
        <WorkstationPage
          onBackToHome={() => setCurrentPage('landing')}
          onOpenUpload={() => setIsUploadOpen(true)}
          predictionData={predictionData}
        />
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

