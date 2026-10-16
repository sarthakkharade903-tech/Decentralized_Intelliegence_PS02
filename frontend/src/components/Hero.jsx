import React, { useState, useEffect } from 'react';
import { ArrowRight, ShieldCheck, UploadCloud } from 'lucide-react';
import AnnotatedBrain from './AnnotatedBrain';
import thumbSuperior from '../assets/atlas/view_thumb_superior.png';
import thumbLateral from '../assets/atlas/view_thumb_lateral.png';
import thumbVentral from '../assets/atlas/view_thumb_ventral.png';

const VIEW_OPTIONS = [
  {
    id: 'superior',
    label: 'Superior',
    sub: 'Axial / Top',
    thumb: thumbSuperior
  },
  {
    id: 'lateral',
    label: 'Lateral',
    sub: 'Sagittal / Side',
    thumb: thumbLateral
  },
  {
    id: 'ventral',
    label: 'Ventral',
    sub: 'Basal / Inferior',
    thumb: thumbVentral
  }
];

export default function Hero({
  onExploreClick = () => {},
  onOpenUpload = () => {},
  onLaunchWorkstation = () => {}
}) {
  const [activeView, setActiveView] = useState('lateral');
  const [isAutoCycling, setIsAutoCycling] = useState(true);

  // Auto-cycle between views every 9 seconds if not paused
  useEffect(() => {
    if (!isAutoCycling) return;

    const interval = setInterval(() => {
      setActiveView((prev) => {
        if (prev === 'lateral') return 'superior';
        if (prev === 'superior') return 'ventral';
        return 'lateral';
      });
    }, 9000);

    return () => clearInterval(interval);
  }, [isAutoCycling]);

  const handleManualSelect = (viewId) => {
    setActiveView(viewId);
    // Pause auto-cycle briefly on manual click so user can study the view
    setIsAutoCycling(false);
    setTimeout(() => setIsAutoCycling(true), 15000);
  };

  const handlePrimaryClick = () => {
    if (onExploreClick) {
      onExploreClick();
    } else if (onOpenUpload) {
      onOpenUpload();
    }
  };

  return (
    <section className="relative w-full bg-[#E9DDD5] px-6 lg:px-10 pt-6 pb-16 lg:pb-22">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-3 items-center">
          
          {/* Left Column: Editorial Headline & Actions */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-6 text-left z-10">
            {/* Eyebrow */}
            <p className="text-xs font-semibold tracking-widest uppercase text-[#6E5D65]">
              Brain MRI · Anatomical Research
            </p>

            {/* Editorial Headline */}
            <div className="space-y-1">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-normal tracking-tight text-[#30252A] font-serif leading-[1.02]">
                Look deeper. <br />
                <span className="italic font-serif">See beyond.</span>
              </h1>
            </div>

            {/* Description */}
            <p className="text-sm sm:text-base text-[#56474E] font-normal leading-relaxed max-w-sm">
              Explore brain MRI through AI-powered tumor-region segmentation and immersive visualization.
            </p>

            {/* 4 Modality Labels */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {['T1', 'T1Gd', 'T2', 'FLAIR'].map((mod) => (
                <span
                  key={mod}
                  className="px-3.5 py-1 rounded-full bg-[#F3ECE7] border border-[#DDD0C8] text-xs font-medium text-[#30252A] shadow-xs"
                >
                  {mod}
                </span>
              ))}
            </div>

            {/* Primary CTA Button & Privacy Statement */}
            <div className="pt-2 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handlePrimaryClick}
                  className="group inline-flex items-center justify-center gap-3 px-7 py-3.5 rounded-full font-medium text-sm text-[#F8F5F0] bg-[#6D263D] hover:bg-[#581D30] transition-all duration-300 shadow-[0_6px_20px_rgba(109,38,61,0.25)] hover:shadow-[0_8px_25px_rgba(109,38,61,0.35)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 stroke-[2]" />
                  <span>Explore with MRI scans</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={onLaunchWorkstation}
                  className="inline-flex items-center gap-1.5 px-4 py-3 rounded-full text-xs font-medium text-[#6D263D] hover:bg-[#DDD0C8]/40 transition-colors cursor-pointer"
                >
                  <span>3D Workstation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Privacy-Conscious Statement */}
              <div className="flex items-center gap-2 text-xs text-[#6E5D65] max-w-sm pt-1">
                <ShieldCheck className="w-4 h-4 text-[#6D263D] flex-shrink-0" />
                <span>Privacy-conscious processing. MRI files are handled locally according to the active workflow.</span>
              </div>
            </div>
          </div>

          {/* Center Column: Dominant Interactive Multi-View Brain */}
          <div className="lg:col-span-7 xl:col-span-7 flex items-center justify-center">
            <AnnotatedBrain
              activeView={activeView}
              onViewChange={(v) => setActiveView(v)}
            />
          </div>

          {/* Far Right Rail: Interactive 3-View Switcher Rail */}
          <div className="hidden lg:flex lg:col-span-1 justify-end">
            <div className="w-24 flex flex-col items-center py-4 px-2 rounded-2xl bg-[#E2D5CC]/50 border border-[#D5C2B8] shadow-xs space-y-4">
              
              {/* Rail Header */}
              <div className="text-center">
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#6E5D65] block font-semibold">
                  HUMAN
                </span>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#30252A] block font-bold">
                  BRAIN
                </span>
                <div className="w-8 h-px bg-[#D5C2B8] mx-auto mt-1" />
              </div>

              {/* 3 Interactive Thumbnail Buttons */}
              <div className="space-y-3 w-full">
                {VIEW_OPTIONS.map((opt) => {
                  const isActive = activeView === opt.id;

                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleManualSelect(opt.id)}
                      className={`group w-full flex flex-col items-center p-1.5 rounded-xl transition-all duration-300 cursor-pointer ${
                        isActive
                          ? 'bg-[#F8F5F0] border-2 border-[#6D263D] shadow-sm scale-105'
                          : 'bg-[#F8F5F0]/60 border border-[#DDD0C8] hover:bg-[#F8F5F0] hover:border-[#6D263D]/50 hover:scale-102'
                      }`}
                      title={`Switch to ${opt.label} View`}
                    >
                      <div className="relative w-12 h-12 flex items-center justify-center rounded-lg overflow-hidden bg-[#E9DDD5]">
                        <img
                          src={opt.thumb}
                          alt={opt.label}
                          className="w-full h-full object-contain filter contrast-[1.03]"
                        />
                        {isActive && (
                          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#6D263D] shadow-xs" />
                        )}
                      </div>
                      <span className={`text-[10px] font-sans font-bold mt-1.5 leading-tight ${
                        isActive ? 'text-[#6D263D]' : 'text-[#30252A]'
                      }`}>
                        {opt.label}
                      </span>
                      <span className="text-[8px] font-mono text-[#6E5D65] leading-none">
                        {opt.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Rail Footer */}
              <div className="text-center pt-1 border-t border-[#D5C2B8] w-full">
                <span className="text-[9px] font-mono tracking-wider uppercase text-[#6E5D65] block leading-tight">
                  ANATOMICAL<br />VIEWS
                </span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
