import React, { useEffect, useRef, useState } from 'react';
import { Niivue, SLICE_TYPE } from '@niivue/niivue';
import { Loader2, AlertCircle, Maximize2, Crosshair } from 'lucide-react';
import { API_BASE_URL } from '../services/api';

export default function NiiVueViewer({
  uploadedFiles = null,
  activeModality = 't1gd',
  maskUrl = null,
  showNETC = true,
  showED = true,
  showET = true,
  overlayOpacity = 0.65,
  showCrosshairs = true,
  sliceView = 'multi', // 'multi' | 'axial' | 'coronal' | 'sagittal' | '3d'
  brainColormap = 'gray', // 'gray' (Default B&W) | 'bone' | 'copper' | 'cool'
  onLocationChange = null,
}) {
  const canvasRef = useRef(null);
  const nvRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCoords, setActiveCoords] = useState(null);

  // Canonical BraTS 2021 Colormap Definition for Niivue Label Maps
  // Label 1: NETC (Cyan #06B6D4)
  // Label 2: ED (Amber #FBBF24)
  // Label 3: Deprecated/Unused
  // Label 4: ET (Scarlet #F43F5E)
  const buildBratsColormap = (netcVisible, edVisible, etVisible, opacity) => {
    const alphaBase = Math.round(opacity * 255);
    return {
      R: [0, 6, 251, 0, 244],
      G: [0, 182, 191, 0, 63],
      B: [0, 212, 36, 0, 94],
      A: [
        0,
        netcVisible ? alphaBase : 0,
        edVisible ? Math.round(alphaBase * 0.85) : 0,
        0,
        etVisible ? alphaBase : 0,
      ],
      I: [0, 1, 2, 3, 4],
      labels: ['Background', 'NETC', 'ED', 'Unused', 'ET'],
    };
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    let isCancelled = false;
    setLoading(true);
    setError(null);

    // Initialize Niivue instance with optimized PACS multiplanar configuration
    const nv = new Niivue({
      show3Dcrosshair: showCrosshairs,
      backColor: [0.035, 0.02, 0.035, 1.0], // Deep obsidian velvet
      crosshairColor: [0.96, 0.45, 0.71, 0.9], // Soft surgical rose crosshair (#f472b6)
      loadingText: 'Rendering High-Resolution 2D PACS...',
      dragMode: 1, // Contrast & brightness on right click drag
      isCornerOrientationText: true, // Anatomical labels in corners (A, P, L, R, S, I)
      isOrientationTextVisible: true,
      textHeight: 0.036,
      fontColor: [0.96, 0.80, 0.90, 0.9],
      multiplanarLayout: 3, // MULTIPLANAR_TYPE.ROW (Axial, Coronal, Sagittal)
      multiplanarShowRender: 0, // SHOW_RENDER.NEVER (removes awkward 4th panel)
      multiplanarEqualSize: true, // Equal square scaling for all 3 planes
      multiplanarPadPixels: 6, // Crisp 6px separation between viewports
      onLocationChange: (data) => {
        if (data && data.vox) {
          setActiveCoords(data.vox);
          if (onLocationChange) onLocationChange(data);
        }
      },
    });

    nv.attachToCanvas(canvasRef.current);
    nvRef.current = nv;

    // Resolve Scan URL & Name (From uploaded File blob or sample artifact)
    let scanUrl = null;
    let isBlob = false;
    let scanName = null;
    const backendBase = API_BASE_URL || 'http://localhost:8000';
    if (uploadedFiles && uploadedFiles[activeModality] instanceof File) {
      scanUrl = URL.createObjectURL(uploadedFiles[activeModality]);
      isBlob = true;
      scanName = uploadedFiles[activeModality].name;
    } else {
      scanUrl = `${backendBase}/api/v1/artifacts/sample_${activeModality}.nii.gz`;
      scanName = `sample_${activeModality}.nii.gz`;
    }

    // Resolve Mask URL & Name
    let targetMaskUrl = null;
    let maskName = 'segmentation.nii.gz';
    if (maskUrl) {
      targetMaskUrl = maskUrl.startsWith('http') ? maskUrl : `${backendBase}${maskUrl}`;
      const urlParts = maskUrl.split('/');
      maskName = urlParts[urlParts.length - 1] || 'segmentation.nii.gz';
    } else {
      targetMaskUrl = `${backendBase}/api/v1/artifacts/sample_seg.nii.gz`;
      maskName = 'sample_seg.nii.gz';
    }

    // Configure initial slice view
    if (sliceView === 'axial') nv.setSliceType(SLICE_TYPE.AXIAL);
    else if (sliceView === 'coronal') nv.setSliceType(SLICE_TYPE.CORONAL);
    else if (sliceView === 'sagittal') nv.setSliceType(SLICE_TYPE.SAGITTAL);
    else if (sliceView === '3d') nv.setSliceType(SLICE_TYPE.RENDER);
    else {
      nv.setSliceType(SLICE_TYPE.MULTIPLANAR);
      nv.opts.multiplanarLayout = 3; // ROW
      nv.opts.multiplanarShowRender = 0;
      nv.opts.multiplanarEqualSize = true;
      nv.opts.multiplanarPadPixels = 6;
    }

    async function loadVolumeData() {
      try {
        const bratsCmap = buildBratsColormap(showNETC, showED, showET, overlayOpacity);
        await nv.loadVolumes([
          { url: scanUrl, name: scanName, colormap: brainColormap || 'gray' },
          { url: targetMaskUrl, name: maskName, colormapLabel: bratsCmap, opacity: overlayOpacity },
        ]);

        if (nv.volumes && nv.volumes.length > 1) {
          nv.volumes[0].colormap = brainColormap || 'gray';
          nv.volumes[1].setColormapLabel(bratsCmap);
          nv.volumes[1].opacity = overlayOpacity;
          nv.volumes[1].cal_min = 1;
          nv.volumes[1].cal_max = 4;
          nv.updateGLVolume();
        }

        if (!isCancelled) setLoading(false);
      } catch (err) {
        console.warn('Primary volume load warning, trying background scan only:', err);
        try {
          await nv.loadVolumes([{ url: scanUrl, name: scanName, colormap: brainColormap || 'gray' }]);
          if (!isCancelled) setLoading(false);
        } catch (innerErr) {
          if (!isCancelled) {
            setError(innerErr.message || 'Failed to load WebGL MRI volumes.');
            setLoading(false);
          }
        }
      }
    }

    loadVolumeData();

    return () => {
      isCancelled = true;
      if (isBlob && scanUrl) {
        URL.revokeObjectURL(scanUrl);
      }
      try {
        nv.cleanup();
      } catch (e) {
        console.debug('Niivue cleanup:', e);
      }
    };
  }, [uploadedFiles, activeModality, maskUrl]);

  // React to sliceView changes
  useEffect(() => {
    if (!nvRef.current) return;
    const nv = nvRef.current;
    if (sliceView === 'axial') nv.setSliceType(SLICE_TYPE.AXIAL);
    else if (sliceView === 'coronal') nv.setSliceType(SLICE_TYPE.CORONAL);
    else if (sliceView === 'sagittal') nv.setSliceType(SLICE_TYPE.SAGITTAL);
    else if (sliceView === '3d') nv.setSliceType(SLICE_TYPE.RENDER);
    else {
      nv.setSliceType(SLICE_TYPE.MULTIPLANAR);
      nv.opts.multiplanarLayout = 3; // ROW
      nv.opts.multiplanarShowRender = 0;
      nv.opts.multiplanarEqualSize = true;
      nv.opts.multiplanarPadPixels = 6;
      nv.drawScene();
    }
  }, [sliceView]);

  // React to background brain colormap changes (B&W default, Bone, Rose, Cool)
  useEffect(() => {
    if (!nvRef.current || !nvRef.current.volumes || nvRef.current.volumes.length === 0) return;
    nvRef.current.volumes[0].colormap = brainColormap || 'gray';
    nvRef.current.updateGLVolume();
  }, [brainColormap]);

  // React to overlay opacity and subregion toggle changes
  useEffect(() => {
    if (!nvRef.current || !nvRef.current.volumes || nvRef.current.volumes.length < 2) return;
    const bratsCmap = buildBratsColormap(showNETC, showED, showET, overlayOpacity);
    nvRef.current.volumes[1].setColormapLabel(bratsCmap);
    nvRef.current.volumes[1].opacity = overlayOpacity;
    nvRef.current.updateGLVolume();
  }, [showNETC, showED, showET, overlayOpacity]);

  // React to crosshair visibility changes
  useEffect(() => {
    if (!nvRef.current) return;
    nvRef.current.setCrosshairWidth(showCrosshairs ? 1 : 0);
  }, [showCrosshairs]);

  const isMultiPlanar = sliceView === 'multi';

  return (
    <div className={`relative w-full ${isMultiPlanar ? 'h-[440px]' : 'h-[540px]'} rounded-2xl overflow-hidden bg-[#0c0309] border border-[#FCE7F3]/40 flex flex-col transition-all duration-200`}>
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-20 bg-[#0c0309]/90 backdrop-blur-sm flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-7 h-7 text-[#F472B6] animate-spin" />
          <p className="text-xs font-mono text-[#F472B6] font-medium tracking-wide">
            Rendering 2D PACS Slices with Tumor Overlays...
          </p>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-20 bg-[#0c0309]/95 flex flex-col items-center justify-center space-y-2 p-6 text-center">
          <AlertCircle className="w-7 h-7 text-rose-400" />
          <p className="text-xs font-mono text-rose-300 font-semibold">WebGL Medical Viewer Error</p>
          <p className="text-[11px] font-mono text-slate-400 max-w-sm">{error}</p>
        </div>
      )}

      {/* Synchronized Multi-Planar Column Headers (Only in Multi-Planar mode) */}
      {isMultiPlanar && (
        <div className="grid grid-cols-3 px-3 py-1.5 bg-[#1a0512]/90 border-b border-[#F472B6]/25 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-[#FBCFE8] font-semibold pl-2">
            <span className="w-2 h-2 rounded-full bg-[#F472B6]" />
            <span>AXIAL (TRANSVERSE)</span>
            <span className="text-[10px] text-[#FBCFE8]/60 font-normal hidden sm:inline">· S/I Axis</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#BAE6FD] font-semibold pl-2">
            <span className="w-2 h-2 rounded-full bg-[#06B6D4]" />
            <span>CORONAL (FRONTAL)</span>
            <span className="text-[10px] text-[#BAE6FD]/60 font-normal hidden sm:inline">· A/P Axis</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#FDE68A] font-semibold pl-2">
            <span className="w-2 h-2 rounded-full bg-[#FBBF24]" />
            <span>SAGITTAL (MEDIAN)</span>
            <span className="text-[10px] text-[#FDE68A]/60 font-normal hidden sm:inline">· L/R Axis</span>
          </div>
        </div>
      )}

      {/* Real WebGL Medical Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full flex-1 cursor-crosshair min-h-[360px]"
      />

      {/* Minimal Coordinates & Clinical Guidance Bar */}
      <div className="absolute bottom-2.5 left-4 right-4 pointer-events-none flex items-center justify-between text-[11px] font-mono text-[#FBCFE8]/80 bg-[#1a0512]/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-[#F472B6]/30 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white">Left Click: Crosshair / Slice Jump</span>
          <span className="text-[#FBCFE8]/40 hidden sm:inline">|</span>
          <span className="hidden sm:inline">Right Drag: Contrast</span>
          <span className="text-[#FBCFE8]/40 hidden sm:inline">|</span>
          <span className="hidden sm:inline">Scroll: Slice Navigate</span>
        </div>
        {activeCoords && (
          <div className="text-white flex items-center gap-2">
            <span className="text-[#FBCFE8]/60 text-[10px]">COORDS:</span>
            <code className="text-[#F472B6] font-semibold bg-black/40 px-2 py-0.5 rounded border border-[#F472B6]/30">
              [{activeCoords.map(Math.round).join(', ')}]
            </code>
          </div>
        )}
      </div>
    </div>
  );
}
