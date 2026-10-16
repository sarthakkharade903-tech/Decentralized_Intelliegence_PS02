import React, { useEffect, useRef, useState } from 'react';
import { Niivue, SLICE_TYPE } from '@niivue/niivue';
import { createBraTSColormap, validateOverlayGeometry } from './GeometryValidator';
import { AlertTriangle, Loader2, UploadCloud, RefreshCw } from 'lucide-react';

/**
 * Real 2D Multi-Planar Orthogonal MRI Viewer powered by NiiVue (WebGL).
 * Displays real NIfTI volumes with synchronized crosshairs, multiplanar layouts,
 * BraTS discrete tumor segmentations, and real-time millimetre coordinate derivation.
 */
export default function MriViewer({
  baseVolume = null, // File | Blob | string (URL)
  maskVolume = null, // File | Blob | string (URL)
  sliceType = 'multiplanar', // 'multiplanar' | 'axial' | 'coronal' | 'sagittal'
  showNETC = true,
  showED = true,
  showET = true,
  overlayOpacity = 0.65,
  showCrosshairs = true,
  brightness = 100,
  contrast = 100,
  axialSlice,
  coronalSlice,
  sagittalSlice,
  onLocationChange,
  onVolumesLoaded,
  onSliceChanged,
  onOpenUpload
}) {
  const canvasRef = useRef(null);
  const nvRef = useRef(null);
  const activeObjectUrlsRef = useRef([]);
  const callbacksRef = useRef({ onLocationChange, onSliceChanged, onVolumesLoaded });

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [geometryWarning, setGeometryWarning] = useState(null);

  // Keep latest callbacks synchronized in ref
  useEffect(() => {
    callbacksRef.current = { onLocationChange, onSliceChanged, onVolumesLoaded };
  }, [onLocationChange, onSliceChanged, onVolumesLoaded]);

  // Helper to safely register and revoke Object URLs to prevent memory leaks
  const createTrackedUrl = (item) => {
    if (!item) return null;
    if (typeof item === 'string') return item;
    if (item instanceof Blob || item instanceof File) {
      const url = URL.createObjectURL(item);
      activeObjectUrlsRef.current.push(url);
      return url;
    }
    return null;
  };

  const revokeAllTrackedUrls = () => {
    activeObjectUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revoked URL cleanup errors
      }
    });
    activeObjectUrlsRef.current = [];
  };

  // --------------------------------------------------------------------------
  // 1. Initialize NiiVue Instance on Canvas
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      const nv = new Niivue({
        backColor: [0.024, 0.031, 0.051, 1], // Match #06080D dark radiological canvas
        show3Dcrosshair: true,
        isRadiologicalConvention: false,
        dragAndDropEnabled: false,
        crosshairColor: [0.024, 0.714, 0.831, 0.75], // Cyan crosshair
        crosshairWidth: 1
      });

      // Register custom discrete BraTS colormap
      const initialCmap = createBraTSColormap();
      nv.addColormap('brats_discrete', initialCmap);

      nv.attachToCanvas(canvasRef.current);
      nvRef.current = nv;

      // Handle coordinate / crosshair change events
      nv.onLocationChange = (data) => {
        if (!data || !data.values) return;

        const baseVal = data.values[0];
        const maskVal = data.values[1];

        const vox = baseVal?.vox ? [Math.round(baseVal.vox[0]), Math.round(baseVal.vox[1]), Math.round(baseVal.vox[2])] : [0, 0, 0];
        const mm = baseVal?.mm ? [baseVal.mm[0], baseVal.mm[1], baseVal.mm[2]] : [0, 0, 0];
        const intensity = baseVal?.value != null ? baseVal.value : null;
        const labelValue = maskVal?.value != null ? Math.round(maskVal.value) : null;

        callbacksRef.current.onLocationChange?.({
          voxelCoords: vox,
          worldCoords: mm,
          intensity,
          labelValue
        });

        // Report slice indices to parent
        callbacksRef.current.onSliceChanged?.({
          sagittal: vox[0],
          coronal: vox[1],
          axial: vox[2]
        });
      };
    } catch (err) {
      console.error('[NiiVue Init Error]', err);
      setTimeout(() => {
        setLoadError(`WebGL2 initialization failed: ${err.message}`);
      }, 0);
    }

    return () => {
      revokeAllTrackedUrls();
      if (nvRef.current) {
        try {
          nvRef.current.volumes = [];
        } catch {
          // Ignore volume clear cleanup errors
        }
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // 2. Synchronize Slice Type (MPR, Axial, Coronal, Sagittal)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv) return;

    try {
      switch (sliceType) {
        case 'axial':
          nv.setSliceType(SLICE_TYPE.AXIAL);
          break;
        case 'coronal':
          nv.setSliceType(SLICE_TYPE.CORONAL);
          break;
        case 'sagittal':
          nv.setSliceType(SLICE_TYPE.SAGITTAL);
          break;
        case 'multiplanar':
        default:
          nv.setSliceType(SLICE_TYPE.MULTIPLANAR);
          break;
      }
      nv.drawScene();
    } catch (err) {
      console.warn('[NiiVue SliceType error]', err);
    }
  }, [sliceType]);

  // --------------------------------------------------------------------------
  // 3. Synchronize Crosshair Visibility & Width
  // --------------------------------------------------------------------------
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv) return;
    try {
      nv.setCrosshairWidth(showCrosshairs ? 1 : 0);
      nv.drawScene();
    } catch (err) {
      console.warn('[NiiVue Crosshair error]', err);
    }
  }, [showCrosshairs]);

  // --------------------------------------------------------------------------
  // 4. Synchronize Tumor Overlay Colormap & Opacity
  // --------------------------------------------------------------------------
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv) return;

    try {
      const updatedCmap = createBraTSColormap({ showNETC, showED, showET });
      nv.addColormap('brats_discrete', updatedCmap);

      if (nv.volumes && nv.volumes.length > 1) {
        nv.setColormap(1, 'brats_discrete');
        nv.setOpacity(1, overlayOpacity);
      }
      nv.drawScene();
    } catch (err) {
      console.warn('[NiiVue Colormap update error]', err);
    }
  }, [showNETC, showED, showET, overlayOpacity]);

  // --------------------------------------------------------------------------
  // 5. Load Real Volumes (Base MRI + Optional Segmentation Mask)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || !baseVolume) return;

    let isCancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setGeometryWarning(null);

    const loadData = async () => {
      try {
        revokeAllTrackedUrls();

        const baseUrl = createTrackedUrl(baseVolume);
        if (!baseUrl) {
          throw new Error('Invalid base volume source.');
        }

        const volumeList = [
          {
            url: baseUrl,
            name: typeof baseVolume === 'object' && baseVolume.name ? baseVolume.name : 'MRI_Base',
            colormap: 'gray'
          }
        ];

        let maskUrl = null;
        if (maskVolume) {
          maskUrl = createTrackedUrl(maskVolume);
          if (maskUrl) {
            volumeList.push({
              url: maskUrl,
              name: typeof maskVolume === 'object' && maskVolume.name ? maskVolume.name : 'Segmentation_Mask',
              colormap: 'brats_discrete',
              opacity: overlayOpacity
            });
          }
        }

        await nv.loadVolumes(volumeList);
        if (isCancelled) return;

        // Verify spatial alignment and geometry between MRI and Mask
        if (nv.volumes.length > 1) {
          const geomCheck = validateOverlayGeometry(nv.volumes[0], nv.volumes[1]);
          if (!geomCheck.valid) {
            console.error('[Geometry Validation Failed]', geomCheck.error);
            setGeometryWarning(geomCheck.error);
            // Safely detach the invalid overlay volume to protect patient safety
            nv.removeVolumeByIndex(1);
          }
        }

        // Notify parent of volume geometry
        if (nv.volumes.length > 0) {
          const v0 = nv.volumes[0];
          callbacksRef.current.onVolumesLoaded?.({
            dimensions: v0.dims ? [v0.dims[1], v0.dims[2], v0.dims[3]] : [240, 240, 155],
            voxelSpacing: v0.pixDims ? [v0.pixDims[1], v0.pixDims[2], v0.pixDims[3]] : [1.0, 1.0, 1.0],
            orientation: 'RAS+',
            affine: v0.affine || null
          });
        }

        setIsLoading(false);
      } catch (err) {
        if (isCancelled) return;
        console.error('[NiiVue Volume Load Error]', err);
        setLoadError(`Failed to load NIfTI volume: ${err.message}`);
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [baseVolume, maskVolume, overlayOpacity]);

  // --------------------------------------------------------------------------
  // 6. Programmatic Slice Stepping via Scrubbers
  // --------------------------------------------------------------------------
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv || !nv.volumes || nv.volumes.length === 0) return;
    if (axialSlice == null && coronalSlice == null && sagittalSlice == null) return;

    try {
      const curVox = nv.frac2vox(nv.scene.crosshairPos);
      const newVox = [
        sagittalSlice != null ? sagittalSlice : curVox[0],
        coronalSlice != null ? coronalSlice : curVox[1],
        axialSlice != null ? axialSlice : curVox[2]
      ];

      nv.scene.crosshairPos = nv.vox2frac(newVox);
      nv.drawScene();
    } catch {
      // Ignore initial bounds check errors before first frame
    }
  }, [axialSlice, coronalSlice, sagittalSlice]);

  return (
    <div className="relative w-full h-full min-h-[460px] rounded-xl overflow-hidden bg-[#06080D] border border-slate-800 flex flex-col items-center justify-center select-none">
      {/* Real WebGL Canvas for NiiVue */}
      <div
        className="w-full h-full flex-1 relative flex items-center justify-center overflow-hidden"
        style={{
          filter: `brightness(${brightness}%) contrast(${contrast}%)`
        }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-crosshair outline-none"
          style={{ width: '100%', height: '100%', minHeight: '440px' }}
        />
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#06080D]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <div className="text-xs font-mono text-cyan-300 font-medium">
            Parsing NIfTI Volume & Geometry Transforms...
          </div>
        </div>
      )}

      {/* Geometry Mismatch Warning Banner */}
      {geometryWarning && (
        <div className="absolute top-3 left-3 right-3 z-30 p-3 rounded-lg bg-rose-950/90 border border-rose-700 text-xs font-mono text-rose-200 flex items-start gap-2.5 shadow-lg">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="text-white block font-semibold">Spatial Geometry Mismatch Detected:</strong>
            <span>{geometryWarning} The overlay was safely rejected to prevent false anatomical registration.</span>
          </div>
          <button
            onClick={() => setGeometryWarning(null)}
            className="text-rose-400 hover:text-white px-2 py-0.5 text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Empty State when no base volume is supplied */}
      {!baseVolume && !isLoading && !loadError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-[#06080D]/95">
          <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-800/60 text-cyan-400 mb-4">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-white tracking-tight mb-1">
            No NIfTI MRI Volume Loaded
          </h3>
          <p className="text-xs text-slate-400 max-w-md font-mono mb-5">
            Load an MRI scan (.nii or .nii.gz) or execute AI segmentation in the upload portal to explore real multi-planar slices and BraTS tumor overlays.
          </p>
          <button
            onClick={() => onOpenUpload?.()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-300 hover:from-cyan-300 hover:to-teal-200 transition-all cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Open Upload Modal</span>
          </button>
        </div>
      )}

      {/* Error State */}
      {loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-[#06080D]/95">
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-400 mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">Viewer Initialization Error</h4>
          <p className="text-xs text-rose-300 font-mono max-w-md mb-4">{loadError}</p>
          <button
            onClick={() => {
              setLoadError(null);
              setIsLoading(true);
              setTimeout(() => setIsLoading(false), 500);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Retry Viewer</span>
          </button>
        </div>
      )}
    </div>
  );
}
