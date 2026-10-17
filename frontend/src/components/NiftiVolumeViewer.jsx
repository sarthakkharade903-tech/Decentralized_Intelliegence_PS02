import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Niivue, SLICE_TYPE, SHOW_RENDER, NVImage } from '@niivue/niivue';
import { API_BASE_URL } from '../services/api';
import {
  RotateCcw,
  Box,
  Layers,
  Eye,
  EyeOff,
  UploadCloud,
  AlertCircle,
  Loader2,
  Sliders,
  Scissors,
  Crosshair,
  Activity,
  Maximize2,
  Minimize2,
  Tag,
  Info
} from 'lucide-react';

// BraTS 2021 Colormap: 0=transparent, 1=Cyan (NETC), 2=Amber (ED), 4=Vivid Red (ET)
const BRATS_COLORMAP = {
  R: [0, 6, 234, 239],
  G: [0, 182, 179, 68],
  B: [0, 212, 8, 68],
  A: [0, 210, 210, 240],
  I: [0, 1, 2, 4]
};

// Documented BraTS 2021 Biological Labels
const BRA_TS_LABELS = {
  0: { name: 'Background / Healthy Tissue', color: 'text-slate-400' },
  1: { name: 'Necrotic & Non-Enhancing Core (NETC)', color: 'text-cyan-400' },
  2: { name: 'Peritumoral Vasogenic Edema (ED)', color: 'text-amber-400' },
  3: { name: 'Deprecated Label (BraTS 2017)', color: 'text-slate-500' },
  4: { name: 'Active Enhancing Tumor Margin (ET)', color: 'text-rose-400' }
};

export default function NiftiVolumeViewer({
  initialFile = null,
  initialUrl = null,
  initialMaskUrl = null,
  onMetadataExtracted = null,
  className = ''
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const nvRef = useRef(null);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Initializing WebGL2...');
  const [error, setError] = useState(null);
  const [renderTimeMs, setRenderTimeMs] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Scientific Metadata
  const [metadata, setMetadata] = useState(null);
  const [activeLocation, setActiveLocation] = useState({
    mm: [0, 0, 0],
    vox: [0, 0, 0],
    intensity: null,
    maskLabel: null
  });

  // Viewport Configuration
  const [viewMode, setViewMode] = useState('multiplanar'); // 'multiplanar' | 'render' | 'axial' | 'coronal' | 'sagittal'
  const [showCrosshairs, setShowCrosshairs] = useState(true);

  // Volume & Window/Level Controls
  const [brightness, setBrightness] = useState(1.0); // 0.5 - 2.0
  const [contrast, setContrast] = useState(1.0); // 0.5 - 2.0
  const [clipDepth, setClipDepth] = useState(0); // 0 (no clip) to 100 (deep clip)

  // Segmentation Mask Layer State
  const [maskMetadata, setMaskMetadata] = useState(null);
  const [isMaskVisible, setIsMaskVisible] = useState(true);
  const [maskOpacity, setMaskOpacity] = useState(0.7);
  const maskOpacityRef = useRef(maskOpacity);
  useEffect(() => {
    maskOpacityRef.current = maskOpacity;
  }, [maskOpacity]);

  const lastLoadedMaskRef = useRef(null);
  const lastLoadedBaseRef = useRef(null);

  // Fullscreen expansion toggle
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --------------------------------------------------------------------------
  // 1. Initialize NiiVue Instance with Research-Grade Preferences
  // --------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let nvInstance = null;

    try {
      nvInstance = new Niivue({
        show3Dcrosshair: true,
        backColor: [0.027, 0.035, 0.055, 1.0], // Deep charcoal obsidian
        crosshairColor: [0.95, 0.25, 0.45, 0.85], // Restrained pink/magenta accent
        crosshairWidth: 1.0,
        loadingText: 'Loading Medical Voxel Data...',
        isOrientCube: true, // Scientific 3D orientation cube (A, P, S, I, L, R)
        isOrientationTextVisible: true,
        multiplanarShowRender: SHOW_RENDER.ALWAYS,
        dragAndDropEnabled: false // Handled cleanly via React for reliable state updates
      });

      // Register official BraTS 2021 segmentation colormap
      nvInstance.addColormap('brats_labels', BRATS_COLORMAP);

      // Attach to WebGL2 Canvas
      nvInstance.attachToCanvas(canvas);

      // Default to Multi-Planar + 3D View (Simultaneous Orthogonal + 3D Raycast)
      nvInstance.setSliceType(nvInstance.sliceTypeMultiplanar);

      // Location tracking for crosshairs & physical world millimeter readouts
      nvInstance.onLocationChange = (data) => {
        if (!data) return;
        const mm = data.mm ? [data.mm[0].toFixed(1), data.mm[1].toFixed(1), data.mm[2].toFixed(1)] : [0, 0, 0];
        const vox = data.vox ? [Math.round(data.vox[0]), Math.round(data.vox[1]), Math.round(data.vox[2])] : [0, 0, 0];
        const intensity = data.values?.[0]?.value != null ? Math.round(data.values[0].value) : null;
        const maskVal = data.values?.[1]?.value != null ? Math.round(data.values[1].value) : null;

        setActiveLocation({
          mm,
          vox,
          intensity,
          maskLabel: maskVal
        });
      };

      nvRef.current = nvInstance;
    } catch (e) {
      console.error('Failed to initialize NiiVue WebGL2 context:', e);
      setError(`WebGL2 / NiiVue initialization error: ${e.message}`);
    }

    // Window resize observer
    const handleResize = () => {
      if (nvInstance && canvasRef.current) {
        nvInstance.resizeListener();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (nvInstance) {
        try {
          while (nvInstance.volumes && nvInstance.volumes.length > 0) {
            nvInstance.removeVolumeByIndex(0);
          }
        } catch (err) {
          console.warn('NiiVue cleanup error:', err);
        }
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // 2. Load Base Anatomical MRI Volume
  // --------------------------------------------------------------------------
  const loadBaseVolume = useCallback(async (source, sourceName = 'scan.nii.gz') => {
    const nv = nvRef.current;
    if (!nv) return;

    setIsLoading(true);
    setLoadingMessage('Decompressing & Streaming NIfTI Voxels...');
    setError(null);
    const startTime = performance.now();

    try {
      // Clear previous volumes
      while (nv.volumes && nv.volumes.length > 0) {
        nv.removeVolumeByIndex(0);
      }
      setMaskMetadata(null);

      // Ingest base scan into Layer 0
      if (source instanceof File || source instanceof Blob) {
        await nv.loadFromFile(source);
      } else if (typeof source === 'string') {
        await nv.loadVolumes([{ url: source }]);
      } else if (source instanceof ArrayBuffer) {
        await nv.loadFromArrayBuffer(source, sourceName);
      }

      // Enforce clean grayscale anatomical colormap
      if (nv.volumes[0]) {
        nv.setColormap(nv.volumes[0].id, 'gray');
      }

      // Draw initial scene
      nv.setSliceType(viewMode === 'render' ? nv.sliceTypeRender : nv.sliceTypeMultiplanar);
      nv.drawScene();

      const elapsed = Math.round(performance.now() - startTime);
      setRenderTimeMs(elapsed);

      // Extract authentic geometric metadata
      const vol = nv.volumes[0];
      if (vol) {
        const meta = {
          filename: source.name || sourceName,
          dimensions: vol.dims ? [vol.dims[1], vol.dims[2], vol.dims[3]] : [240, 240, 155],
          voxelSpacingMm: vol.pixDims
            ? [
                parseFloat(vol.pixDims[1].toFixed(3)),
                parseFloat(vol.pixDims[2].toFixed(3)),
                parseFloat(vol.pixDims[3].toFixed(3))
              ]
            : [1.0, 1.0, 1.0],
          intensityRange: [
            vol.cal_min != null ? Math.round(vol.cal_min) : 0,
            vol.cal_max != null ? Math.round(vol.cal_max) : 255
          ],
          datatype: vol.datatypeCode || 'FLOAT32',
          renderTimeMs: elapsed
        };
        setMetadata(meta);
        if (onMetadataExtracted) onMetadataExtracted(meta);
      }
    } catch (err) {
      console.error('Failed to load base MRI:', err);
      setError(`Failed to render MRI volume: ${err.message || 'Corrupted NIfTI stream'}`);
    } finally {
      setIsLoading(false);
    }
  }, [viewMode, onMetadataExtracted]);

  // --------------------------------------------------------------------------
  // 3. Load & Overlay Real Segmentation Mask (Layer 1)
  // --------------------------------------------------------------------------
  const loadSegmentationMask = useCallback(async (source, maskName = 'tumor_segmentation.nii.gz') => {
    const nv = nvRef.current;
    if (!nv || !nv.volumes || nv.volumes.length === 0) {
      setError('Please load an anatomical MRI scan before overlaying a segmentation mask.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Aligning 3D Segmentation Mask to Anatomical Affine...');
    setError(null);

    const currentOpacity = maskOpacityRef.current;

    try {
      // If a mask layer already exists at index 1, remove it first
      if (nv.volumes.length > 1) {
        nv.removeVolumeByIndex(1);
      }

      if (source instanceof File || source instanceof Blob) {
        const maskVol = await NVImage.loadFromFile({
          file: source,
          name: maskName,
          colormap: 'brats_labels',
          opacity: currentOpacity
        });
        nv.addVolume(maskVol);
      } else if (typeof source === 'string') {
        const fullUrl = source.startsWith('http')
          ? source
          : `${API_BASE_URL}${source.startsWith('/') ? source : `/${source}`}`;
        await nv.addVolumeFromUrl({
          url: fullUrl,
          name: maskName,
          colormap: 'brats_labels',
          opacity: currentOpacity
        });
      }

      const maskVol = nv.volumes[1];
      if (maskVol) {
        nv.setColormap(maskVol.id, 'brats_labels');
        nv.setOpacity(1, currentOpacity);
        setMaskMetadata({
          name: source.name || maskName,
          opacity: currentOpacity,
          dims: maskVol.dims ? [maskVol.dims[1], maskVol.dims[2], maskVol.dims[3]] : null
        });
      }

      // Refresh scene
      nv.drawScene();
    } catch (err) {
      console.error('Failed to overlay segmentation mask:', err);
      setError(`Failed to overlay segmentation mask: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Remove active mask layer
  const handleRemoveMask = () => {
    const nv = nvRef.current;
    if (nv && nv.volumes && nv.volumes.length > 1) {
      nv.removeVolumeByIndex(1);
      nv.drawScene();
      setMaskMetadata(null);
      lastLoadedMaskRef.current = null;
    }
  };

  // Toggle mask visibility
  const handleToggleMaskVisibility = () => {
    const nv = nvRef.current;
    if (!nv || !nv.volumes || nv.volumes.length < 2) return;

    const nextState = !isMaskVisible;
    setIsMaskVisible(nextState);
    nv.setOpacity(1, nextState ? maskOpacity : 0.0);
    nv.drawScene();
  };

  // Adjust mask opacity
  const handleMaskOpacityChange = (val) => {
    setMaskOpacity(val);
    const nv = nvRef.current;
    if (nv && nv.volumes && nv.volumes.length > 1 && isMaskVisible) {
      nv.setOpacity(1, val);
      nv.drawScene();
    }
  };

  // Initial load effect
  useEffect(() => {
    if (initialFile) {
      loadBaseVolume(initialFile, initialFile.name);
    } else if (initialUrl) {
      loadBaseVolume(initialUrl, 'sample_t1gd.nii.gz');
    }
  }, [initialFile, initialUrl, loadBaseVolume]);

  // Initial mask overlay effect
  useEffect(() => {
    if (initialMaskUrl && metadata) {
      if (
        lastLoadedMaskRef.current === initialMaskUrl &&
        lastLoadedBaseRef.current === metadata.filename
      ) {
        return;
      }
      lastLoadedMaskRef.current = initialMaskUrl;
      lastLoadedBaseRef.current = metadata.filename;
      loadSegmentationMask(initialMaskUrl, 'predicted_mask.nii.gz');
    }
  }, [initialMaskUrl, metadata, loadSegmentationMask]);

  // --------------------------------------------------------------------------
  // 4. Viewport Projections & Internal Inspection Clipping
  // --------------------------------------------------------------------------
  const handleSetViewMode = (mode) => {
    const nv = nvRef.current;
    if (!nv) return;

    setViewMode(mode);
    switch (mode) {
      case 'multiplanar':
        nv.setSliceType(nv.sliceTypeMultiplanar);
        break;
      case 'render':
        nv.setSliceType(nv.sliceTypeRender);
        break;
      case 'axial':
        nv.setSliceType(nv.sliceTypeAxial);
        break;
      case 'coronal':
        nv.setSliceType(nv.sliceTypeCoronal);
        break;
      case 'sagittal':
        nv.setSliceType(nv.sliceTypeSagittal);
        break;
      default:
        nv.setSliceType(nv.sliceTypeMultiplanar);
    }
    nv.drawScene();
  };

  // Internal 3D Clipping Plane Slider: slices into the volume along Z/axial axis
  const handleClipPlaneChange = (depthPercent) => {
    setClipDepth(depthPercent);
    const nv = nvRef.current;
    if (!nv) return;

    if (depthPercent === 0) {
      // Reset clip plane (disabled)
      nv.setClipPlane([2.0, 0, 0]);
    } else {
      // Map 0 - 100% to depth coordinate range (-1.0 to 1.0)
      const mappedDepth = -1.0 + (depthPercent / 100.0) * 2.0;
      nv.setClipPlane([mappedDepth, 0, 0]);
    }
    nv.drawScene();
  };

  // Window/Level Brightness & Contrast Adjustment
  const handleBriConChange = (newBri, newCon) => {
    setBrightness(newBri);
    setContrast(newCon);
    const nv = nvRef.current;
    if (!nv || !nv.volumes || nv.volumes.length === 0) return;

    const baseVol = nv.volumes[0];
    const range = (baseVol.robust_max || 1000) - (baseVol.robust_min || 0);
    const windowVal = range / (newCon || 1.0);
    const levelVal = ((baseVol.robust_max || 1000) + (baseVol.robust_min || 0)) / 2 * newBri;

    baseVol.cal_min = levelVal - windowVal / 2;
    baseVol.cal_max = levelVal + windowVal / 2;
    nv.updateGLVolume();
    nv.drawScene();
  };

  // Camera Reset
  const handleResetCamera = () => {
    const nv = nvRef.current;
    if (!nv) return;

    nv.scene.renderAzimuth = 120;
    nv.scene.renderElevation = 15;
    nv.resetBriCon();
    setBrightness(1.0);
    setContrast(1.0);
    setClipDepth(0);
    nv.setClipPlane([2.0, 0, 0]);
    nv.drawScene();
  };

  // Toggle crosshair visibility
  const handleToggleCrosshairs = () => {
    const nv = nvRef.current;
    if (!nv) return;
    const nextState = !showCrosshairs;
    setShowCrosshairs(nextState);
    nv.opts.crosshairWidth = nextState ? 1.0 : 0.0;
    nv.drawScene();
  };

  // --------------------------------------------------------------------------
  // 5. File Drag & Drop Handlers
  // --------------------------------------------------------------------------
  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;

    const name = droppedFile.name.toLowerCase();
    if (!name.endsWith('.nii') && !name.endsWith('.nii.gz')) {
      setError(`"${droppedFile.name}" is not a valid NIfTI file (.nii or .nii.gz).`);
      return;
    }

    // Auto-detect whether dropped file is a segmentation mask or base scan
    if (name.includes('seg') || name.includes('mask') || name.includes('label')) {
      loadSegmentationMask(droppedFile, droppedFile.name);
    } else {
      loadBaseVolume(droppedFile, droppedFile.name);
    }
  };

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleFileDrop}
      className={`relative w-full h-full flex flex-col bg-[#070B14] border border-slate-800/90 rounded-2xl overflow-hidden select-none font-sans text-slate-100 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      } ${className}`}
    >
      {/* -------------------------------------------------------------------- */}
      {/* Top Clinical Header & Mode Switcher Bar                              */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#140e16]/95 border-b border-[#2d2028] backdrop-blur-md z-10 flex-wrap gap-2.5">
        {/* Left: View Modes */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#6D263D]/30 border border-[#6D263D]/60 text-[#f5cfd4] text-xs font-mono font-semibold">
            <Activity className="w-3.5 h-3.5" />
            <span>NiiVue Raycast</span>
          </div>

          <div className="flex items-center bg-[#09060b] rounded-full p-0.5 border border-[#2d2028] text-xs font-mono">
            {[
              { id: 'multiplanar', label: 'MPR + 3D', icon: Layers },
              { id: 'render', label: '3D Volume', icon: Box },
              { id: 'axial', label: 'Axial' },
              { id: 'coronal', label: 'Coronal' },
              { id: 'sagittal', label: 'Sagittal' }
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => handleSetViewMode(m.id)}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  viewMode === m.id
                    ? 'bg-[#6D263D] text-[#F8F5F0] font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Actions & Tools */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {/* Crosshair Toggle */}
          <button
            onClick={handleToggleCrosshairs}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
              showCrosshairs
                ? 'bg-[#6D263D]/40 text-[#f5cfd4] border-[#6D263D]/80'
                : 'bg-[#18111b] text-slate-400 border-[#2d2028]'
            }`}
            title="Toggle Synchronized Orthogonal Crosshairs"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Crosshair</span>
          </button>

          {/* Camera Reset */}
          <button
            onClick={handleResetCamera}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-slate-300 bg-[#18111b] hover:bg-[#221826] border border-[#2d2028] transition-colors cursor-pointer"
            title="Reset 3D camera orientation, zoom & brightness"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {/* Quick Demo Scan Button */}
          <button
            onClick={() => loadBaseVolume('/samples/sample_t1gd.nii.gz', 'sample_t1gd.nii.gz')}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-[#f5cfd4] bg-[#6D263D]/30 hover:bg-[#6D263D]/50 border border-[#6D263D]/60 transition-colors cursor-pointer"
            title="Load authentic BraTS T1Gd benchmark scan"
          >
            <span>Demo MRI</span>
          </button>

          {/* Open Local Scan File */}
          <label className="flex items-center gap-1.5 px-3.5 py-1 rounded-full font-semibold bg-[#6D263D] text-[#F8F5F0] hover:bg-[#581D30] transition-all cursor-pointer shadow-xs">
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Load NIfTI</span>
            <input
              type="file"
              accept=".nii,.nii.gz"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) loadBaseVolume(e.target.files[0], e.target.files[0].name);
              }}
            />
          </label>

          {/* Fullscreen Expansion Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-full bg-[#18111b] text-slate-400 hover:text-white border border-[#2d2028] transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Secondary Scientific Inspection Control Strip                        */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0c080e]/95 border-b border-[#2d2028] text-xs font-mono text-slate-300 flex-wrap gap-4">
        {/* Sliders: Internal 3D Clip Depth & Window/Level */}
        <div className="flex items-center gap-5 flex-wrap">
          {/* Internal Anatomical Slicing Plane */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 flex items-center gap-1">
              <Scissors className="w-3.5 h-3.5 text-[#f5cfd4]" />
              <span>3D Internal Clip:</span>
            </span>
            <input
              type="range"
              min="0"
              max="90"
              value={clipDepth}
              onChange={(e) => handleClipPlaneChange(parseInt(e.target.value))}
              className="w-24 accent-[#6D263D] cursor-pointer"
            />
            <span className="text-[#f5cfd4] w-8">{clipDepth}%</span>
          </div>

          {/* Brightness Level */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Brightness:</span>
            <input
              type="range"
              min="50"
              max="180"
              value={Math.round(brightness * 100)}
              onChange={(e) => handleBriConChange(parseInt(e.target.value) / 100.0, contrast)}
              className="w-20 accent-[#6D263D] cursor-pointer"
            />
            <span className="text-slate-300 w-8">{Math.round(brightness * 100)}%</span>
          </div>

          {/* Contrast Window */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Contrast:</span>
            <input
              type="range"
              min="50"
              max="200"
              value={Math.round(contrast * 100)}
              onChange={(e) => handleBriConChange(brightness, parseInt(e.target.value) / 100.0)}
              className="w-20 accent-pink-500 cursor-pointer"
            />
            <span className="text-slate-300 w-8">{Math.round(contrast * 100)}%</span>
          </div>
        </div>

        {/* Real Segmentation Layer Controls */}
        <div className="flex items-center gap-3">
          {maskMetadata ? (
            <div className="flex items-center gap-2 bg-pink-950/30 border border-pink-700/50 rounded-lg px-2.5 py-1">
              <div className="flex items-center gap-1.5 text-pink-300 font-semibold">
                <Tag className="w-3 h-3 text-pink-400" />
                <span className="truncate max-w-[120px]">{maskMetadata.name}</span>
                {maskMetadata.name.includes('481') ? (
                  <span className="text-[9px] font-mono text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/80" title="Cross-patient evaluation mask from Patient 481; not native to Patient 747 scan">
                    Pt 481 Eval
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/80">
                    Patient Match
                  </span>
                )}
              </div>

              {/* Mask Visibility Toggle */}
              <button
                onClick={handleToggleMaskVisibility}
                className="p-1 rounded text-pink-400 hover:text-white cursor-pointer"
                title={isMaskVisible ? 'Hide Segmentation Mask' : 'Show Segmentation Mask'}
              >
                {isMaskVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>

              {/* Mask Opacity Slider */}
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(maskOpacity * 100)}
                onChange={(e) => handleMaskOpacityChange(parseInt(e.target.value) / 100.0)}
                className="w-16 accent-pink-500 cursor-pointer"
                title="Mask Overlay Opacity"
              />

              {/* Remove Mask Layer */}
              <button
                onClick={handleRemoveMask}
                className="text-[10px] text-slate-400 hover:text-rose-400 ml-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-[11px]">Segmentation:</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500">
                Unavailable (No Mask Loaded)
              </span>

              {/* Button to load a real mask overlay */}
              <label className="text-[11px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-pink-500 transition-colors cursor-pointer">
                <span>+ Load Mask</span>
                <input
                  type="file"
                  accept=".nii,.nii.gz"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) loadSegmentationMask(e.target.files[0], e.target.files[0].name);
                  }}
                />
              </label>

              {/* Demo Mask Button with clear provenance */}
              <button
                onClick={() => loadSegmentationMask('/samples/sample_seg.nii.gz', 'BRATS_481_seg.nii.gz')}
                className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-amber-800/60 text-amber-300 hover:text-white hover:border-amber-500 transition-colors cursor-pointer"
                title="Overlay Patient 481 ground-truth mask for viewer evaluation (Note: different patient from Patient 747 scan)"
              >
                Pt 481 Eval Mask
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Dominant WebGL2 Viewport Canvas                                      */}
      {/* -------------------------------------------------------------------- */}
      <div className="relative flex-1 w-full h-full overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-crosshair active:cursor-grabbing"
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md gap-3 text-[#f5cfd4]">
            <Loader2 className="w-8 h-8 animate-spin text-[#6D263D]" />
            <span className="text-xs font-mono font-medium tracking-wide">{loadingMessage}</span>
          </div>
        )}

        {/* Drag-over Indication */}
        {isDragOver && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#240e18]/85 border-2 border-dashed border-[#6D263D] backdrop-blur-sm gap-2">
            <UploadCloud className="w-12 h-12 text-[#f5cfd4] animate-bounce" />
            <span className="text-sm font-semibold text-white font-mono">
              Drop NIfTI Volume (.nii or .nii.gz) for Multiplanar Raycast
            </span>
          </div>
        )}

        {/* Empty State Prompt */}
        {!metadata && !isLoading && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <div className="p-4 rounded-full bg-[#18111b] border border-[#2d2028] text-[#f5cfd4] mb-3 shadow-[0_0_30px_rgba(109,38,61,0.3)]">
              <Box className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-serif font-bold text-white tracking-tight">
              Research-Grade 3D & Multi-Planar NIfTI Viewer Ready
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
              Drag & drop any anatomical scan (<span className="text-[#f5cfd4]">.nii</span> or{' '}
              <span className="text-[#f5cfd4]">.nii.gz</span>) to inspect synchronized internal slices alongside the 3D raycast.
            </p>
            <div className="flex items-center gap-3 mt-4 pointer-events-auto">
              <button
                onClick={() => loadBaseVolume('/samples/sample_t1gd.nii.gz', 'sample_t1gd.nii.gz')}
                className="px-4 py-2 rounded-xl text-xs font-mono font-semibold bg-gradient-to-r from-pink-600 to-rose-500 text-white hover:shadow-[0_0_20px_rgba(244,63,94,0.4)] transition-all cursor-pointer"
              >
                Load BraTS Benchmark Scan
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="absolute bottom-4 left-4 right-4 z-20 p-3.5 rounded-xl bg-rose-950/90 border border-rose-800 text-rose-200 text-xs flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="px-2.5 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-[11px] font-mono cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Real Scientific Metadata Overlay Badge (Top Right) */}
        {metadata && (
          <div className="absolute top-3 right-3 z-10 p-3.5 rounded-xl bg-[#090E1D]/90 border border-slate-800/90 text-xs font-mono text-slate-300 space-y-1.5 backdrop-blur-md shadow-2xl min-w-[220px]">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="font-semibold text-white truncate max-w-[130px]">{metadata.filename}</span>
              <span className="text-[10px] text-pink-400 font-bold">{metadata.renderTimeMs} ms</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Dimensions:</span>
              <span className="text-slate-200">{metadata.dimensions?.join(' × ')}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Voxel Spacing:</span>
              <span className="text-slate-200">{metadata.voxelSpacingMm?.join(' × ')} mm</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Intensity Range:</span>
              <span className="text-slate-200">[{metadata.intensityRange?.join(' – ')}]</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Coordinate Grid:</span>
              <span className="text-pink-400 font-bold">RAS+ Isotropic</span>
            </div>
          </div>
        )}

        {/* Live Synchronized Crosshair Voxel & World Coordinates (Bottom HUD) */}
        {metadata && (
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-4 px-3.5 py-2 rounded-xl bg-[#080D1A]/90 border border-slate-800/90 text-xs font-mono text-slate-300 backdrop-blur-md shadow-2xl pointer-events-none flex-wrap">
            <div className="flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-pink-400" />
              <span className="text-slate-400">World:</span>
              <span className="text-pink-300 font-bold">
                [{activeLocation.mm[0]}, {activeLocation.mm[1]}, {activeLocation.mm[2]}] mm
              </span>
            </div>

            <span className="text-slate-600">|</span>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Voxel:</span>
              <span className="text-slate-200">[{activeLocation.vox.join(', ')}]</span>
            </div>

            {activeLocation.intensity != null && (
              <>
                <span className="text-slate-600">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Intensity:</span>
                  <span className="text-teal-300 font-semibold">{activeLocation.intensity}</span>
                </div>
              </>
            )}

            {/* If mask label active at crosshair */}
            {activeLocation.maskLabel != null && BRA_TS_LABELS[activeLocation.maskLabel] && (
              <>
                <span className="text-slate-600">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Segment:</span>
                  <span className={`font-bold ${BRA_TS_LABELS[activeLocation.maskLabel].color}`}>
                    {BRA_TS_LABELS[activeLocation.maskLabel].name}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* BraTS Label Color Legend (Bottom Right Overlay if Mask is Loaded) */}
        {maskMetadata && isMaskVisible && (
          <div className="absolute bottom-3 right-3 z-10 p-2.5 rounded-xl bg-[#090E1D]/90 border border-slate-800/90 text-[10px] font-mono text-slate-300 space-y-1 backdrop-blur-md pointer-events-none">
            <div className="text-slate-400 font-bold uppercase pb-1 border-b border-slate-800">
              BraTS 2021 Colormap
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span>Label 1: Necrotic Core (NETC)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Label 2: Peritumoral Edema (ED)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Label 4: Enhancing Tumor (ET)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
