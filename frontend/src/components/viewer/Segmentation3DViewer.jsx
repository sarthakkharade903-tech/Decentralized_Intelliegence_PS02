import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  parseNiftiVolume,
  extractLabelSurface,
  computeTumorCentroid,
  computeLabelBounds
} from './SurfaceExtractor';
import {
  Box,
  RotateCw,
  Layers,
  RefreshCw,
  AlertTriangle,
  UploadCloud,
  CheckCircle2
} from 'lucide-react';

/**
 * Real 3D Interactive Tumor Surface & Isosurface Viewer powered by Three.js (WebGL).
 * Extracts genuine patient-specific polygonal surfaces from NIfTI discrete segmentation masks
 * using Marching Cubes in physical millimetre world space (RAS+).
 */
export default function Segmentation3DViewer({
  maskVolume = null, // File | Blob | string (URL) | ArrayBuffer
  activeSource = 'prediction', // 'prediction' | 'expert' | null
  showNETC = true,
  showED = true,
  showET = true,
  onToggleNETC,
  onToggleED,
  onToggleET,
  overlayOpacity = 0.75,
  onChangeOpacity,
  onOpenUpload
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animFrameIdRef = useRef(null);

  // Mesh and scene object references for live updates
  const meshesRef = useRef({
    netc: null,
    ed: null,
    et: null,
    boxHelper: null,
    axesHelper: null,
    group: null
  });

  // Viewer state
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'empty' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [isWireframe, setIsWireframe] = useState(false);
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [metrics, setMetrics] = useState({
    netcVoxels: 0,
    edVoxels: 0,
    etVoxels: 0,
    wtVoxels: 0,
    tcVoxels: 0,
    dimensionsMm: [0, 0, 0],
    centroidMm: [0, 0, 0]
  });

  // Track raw parsed volume in memory to allow instant re-extraction if needed
  const parsedVolumeRef = useRef(null);

  // --------------------------------------------------------------------------
  // Helper: Read input source into an ArrayBuffer
  // --------------------------------------------------------------------------
  const getArrayBufferFromSource = async (source) => {
    if (!source) return null;
    if (source instanceof ArrayBuffer) return source;
    if (source.buffer instanceof ArrayBuffer) return source.buffer;

    if (source instanceof Blob || source instanceof File) {
      return await source.arrayBuffer();
    }

    if (typeof source === 'string') {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch segmentation mask (${response.status} ${response.statusText})`);
      }
      return await response.arrayBuffer();
    }

    throw new Error('Unsupported mask volume data type.');
  };

  // --------------------------------------------------------------------------
  // Clean up all Three.js meshes, materials, and geometries
  // --------------------------------------------------------------------------
  const cleanupMeshes = useCallback(() => {
    const { group, netc, ed, et, boxHelper, axesHelper } = meshesRef.current;
    if (group) {
      [netc, ed, et, boxHelper, axesHelper].forEach((mesh) => {
        if (!mesh) return;
        group.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    }
    meshesRef.current = {
      netc: null,
      ed: null,
      et: null,
      boxHelper: null,
      axesHelper: null,
      group
    };
  }, []);

  // --------------------------------------------------------------------------
  // Setup Three.js Scene, Camera, Lights, and OrbitControls
  // --------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(70, 50, 90);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.8;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 2.0;
    controlsRef.current = controls;

    // Master Group for patient meshes
    const group = new THREE.Group();
    scene.add(group);
    meshesRef.current.group = group;

    // Lighting for crisp anatomical surface definition
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight1.position.set(100, 150, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight2.position.set(-100, -50, -100);
    scene.add(dirLight2);

    const dirLight3 = new THREE.DirectionalLight(0xf43f5e, 0.8);
    dirLight3.position.set(0, -100, 80);
    scene.add(dirLight3);

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Render / Animation Loop
    let isCancelled = false;
    const animate = () => {
      if (isCancelled) return;
      animFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      isCancelled = true;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      cleanupMeshes();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [cleanupMeshes]);

  // Keep auto-rotate synchronized with state
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotating;
    }
  }, [isAutoRotating]);

  // --------------------------------------------------------------------------
  // Load NIfTI Mask and Extract Marching Cubes Surfaces
  // --------------------------------------------------------------------------
  const extractSurfaces = useCallback(async () => {
    if (!maskVolume) {
      cleanupMeshes();
      setStatus('empty');
      parsedVolumeRef.current = null;
      return;
    }

    try {
      setStatus('loading');
      setErrorMessage(null);

      // 1. Fetch raw buffer
      const buffer = await getArrayBufferFromSource(maskVolume);
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('Mask file is empty or corrupted.');
      }

      // 2. Parse NIfTI header and volume data
      const parsed = parseNiftiVolume(buffer);
      parsedVolumeRef.current = parsed;

      const { volume, dims, pixDims, affine } = parsed;

      // 3. Inspect discrete BraTS labels
      const netcBounds = computeLabelBounds(volume, dims, new Set([1]));
      const edBounds = computeLabelBounds(volume, dims, new Set([2]));
      const etBounds = computeLabelBounds(volume, dims, new Set([4]));

      const wtCount = netcBounds.count + edBounds.count + etBounds.count;
      const tcCount = netcBounds.count + etBounds.count;

      if (wtCount === 0) {
        // Honest empty state: no tumor voxels detected
        cleanupMeshes();
        setStatus('empty');
        setMetrics({
          netcVoxels: 0,
          edVoxels: 0,
          etVoxels: 0,
          wtVoxels: 0,
          tcVoxels: 0,
          dimensionsMm: [0, 0, 0],
          centroidMm: [0, 0, 0]
        });
        return;
      }

      // 4. Compute unified tumor centroid in physical world space (RAS+ mm)
      const centroid = computeTumorCentroid({ volume, dims, affine });

      // Clean old meshes before adding new ones
      cleanupMeshes();
      const group = meshesRef.current.group;
      if (!group) return;

      // 5. Extract genuine 3D polygonal isosurfaces
      // NETC (Label 1: Necrotic Core - Cyan #06B6D4)
      let netcMesh = null;
      if (netcBounds.count > 0) {
        const netcGeo = extractLabelSurface({
          volume,
          dims,
          pixDims,
          affine,
          targetLabels: [1],
          centerOffset: centroid
        });

        if (netcGeo) {
          const netcMat = new THREE.MeshStandardMaterial({
            color: 0x06b6d4,
            emissive: 0x0891b2,
            emissiveIntensity: 0.35,
            roughness: 0.35,
            metalness: 0.1,
            transparent: true,
            opacity: Math.min(1.0, overlayOpacity + 0.15),
            wireframe: isWireframe
          });
          netcMesh = new THREE.Mesh(netcGeo, netcMat);
          netcMesh.visible = showNETC;
          group.add(netcMesh);
        }
      }

      // ED (Label 2: Peritumoral Edema - Amber #EAB308)
      let edMesh = null;
      if (edBounds.count > 0) {
        const edGeo = extractLabelSurface({
          volume,
          dims,
          pixDims,
          affine,
          targetLabels: [2],
          centerOffset: centroid
        });

        if (edGeo) {
          const edMat = new THREE.MeshStandardMaterial({
            color: 0xeab308,
            emissive: 0xca8a04,
            emissiveIntensity: 0.2,
            roughness: 0.45,
            metalness: 0.05,
            transparent: true,
            opacity: Math.min(0.65, overlayOpacity * 0.45),
            wireframe: isWireframe
          });
          edMesh = new THREE.Mesh(edGeo, edMat);
          edMesh.visible = showED;
          group.add(edMesh);
        }
      }

      // ET (Label 4: Enhancing Margin - Vivid Rose/Red #EF4444)
      let etMesh = null;
      if (etBounds.count > 0) {
        const etGeo = extractLabelSurface({
          volume,
          dims,
          pixDims,
          affine,
          targetLabels: [4],
          centerOffset: centroid
        });

        if (etGeo) {
          const etMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0xdc2626,
            emissiveIntensity: 0.5,
            roughness: 0.25,
            metalness: 0.15,
            transparent: true,
            opacity: Math.min(1.0, overlayOpacity + 0.2),
            wireframe: isWireframe
          });
          etMesh = new THREE.Mesh(etGeo, etMat);
          etMesh.visible = showET;
          group.add(etMesh);
        }
      }

      // 6. Compute 3D Bounding Caliper & BoxHelper
      const box = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Create bounding box caliper wireframe
      const boxGeo = new THREE.BoxGeometry(
        Math.max(size.x, 2),
        Math.max(size.y, 2),
        Math.max(size.z, 2)
      );
      const boxEdges = new THREE.EdgesGeometry(boxGeo);
      const boxMat = new THREE.LineBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.35
      });
      const boxHelper = new THREE.LineSegments(boxEdges, boxMat);
      boxHelper.position.copy(box.getCenter(new THREE.Vector3()));
      boxHelper.visible = showBoundingBox;
      group.add(boxHelper);

      // Orientation Axes Gizmo (Red: +X Right, Green: +Y Anterior, Blue: +Z Superior)
      const axesHelper = new THREE.AxesHelper(Math.max(size.x, size.y, size.z, 20) * 0.7);
      axesHelper.visible = showAxes;
      group.add(axesHelper);

      // Save references
      meshesRef.current = {
        group,
        netc: netcMesh,
        ed: edMesh,
        et: etMesh,
        boxHelper,
        axesHelper
      };

      // 7. Adjust camera position to comfortably frame the tumor bounding sphere
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const radius = Math.max(sphere.radius, 15);
      const dist = radius * 2.8;

      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(dist * 0.75, dist * 0.6, dist * 0.85);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }

      // 8. Update metrics state
      setMetrics({
        netcVoxels: netcBounds.count,
        edVoxels: edBounds.count,
        etVoxels: etBounds.count,
        wtVoxels: wtCount,
        tcVoxels: tcCount,
        dimensionsMm: [
          Number(size.x.toFixed(1)),
          Number(size.y.toFixed(1)),
          Number(size.z.toFixed(1))
        ],
        centroidMm: [
          Number(centroid[0].toFixed(1)),
          Number(centroid[1].toFixed(1)),
          Number(centroid[2].toFixed(1))
        ]
      });

      setStatus('success');
    } catch (err) {
      console.error('Surface extraction error:', err);
      cleanupMeshes();
      setStatus('error');
      setErrorMessage(err.message || 'Failed to extract 3D surface mesh from segmentation.');
    }
  }, [
    maskVolume,
    cleanupMeshes,
    overlayOpacity,
    isWireframe,
    showNETC,
    showED,
    showET,
    showBoundingBox,
    showAxes
  ]);

  // Trigger surface extraction when maskVolume changes
  useEffect(() => {
    let active = true;
    const runExtraction = async () => {
      if (!active) return;
      await extractSurfaces();
    };
    runExtraction();
    return () => {
      active = false;
    };
  }, [extractSurfaces]);

  // --------------------------------------------------------------------------
  // Dynamic Mesh Visibility, Opacity, and Wireframe Updates (No Re-extraction)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const { netc, ed, et } = meshesRef.current;
    if (netc) netc.visible = Boolean(showNETC);
    if (ed) ed.visible = Boolean(showED);
    if (et) et.visible = Boolean(showET);
  }, [showNETC, showED, showET]);

  useEffect(() => {
    const { netc, ed, et } = meshesRef.current;
    if (netc && netc.material) {
      netc.material.opacity = Math.min(1.0, overlayOpacity + 0.15);
    }
    if (ed && ed.material) {
      ed.material.opacity = Math.min(0.65, overlayOpacity * 0.45);
    }
    if (et && et.material) {
      et.material.opacity = Math.min(1.0, overlayOpacity + 0.2);
    }
  }, [overlayOpacity]);

  useEffect(() => {
    const { netc, ed, et } = meshesRef.current;
    [netc, ed, et].forEach((mesh) => {
      if (mesh && mesh.material) {
        mesh.material.wireframe = isWireframe;
      }
    });
  }, [isWireframe]);

  useEffect(() => {
    const { boxHelper, axesHelper } = meshesRef.current;
    if (boxHelper) boxHelper.visible = showBoundingBox;
    if (axesHelper) axesHelper.visible = showAxes;
  }, [showBoundingBox, showAxes]);

  // --------------------------------------------------------------------------
  // Camera View Presets
  // --------------------------------------------------------------------------
  const setCameraPreset = (view) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const { boxHelper } = meshesRef.current;
    let dist = 80;
    if (boxHelper && boxHelper.geometry) {
      boxHelper.geometry.computeBoundingSphere();
      const r = boxHelper.geometry.boundingSphere?.radius || 30;
      dist = Math.max(r * 2.8, 40);
    }

    if (view === 'iso') {
      camera.position.set(dist * 0.75, dist * 0.6, dist * 0.85);
      camera.up.set(0, 0, 1);
    } else if (view === 'axial') {
      // Axial: Superior view looking down +Z axis
      camera.position.set(0, 0, dist * 1.3);
      camera.up.set(0, 1, 0);
    } else if (view === 'coronal') {
      // Coronal: Anterior view looking from +Y axis
      camera.position.set(0, dist * 1.3, 0);
      camera.up.set(0, 0, 1);
    } else if (view === 'sagittal') {
      // Sagittal: Lateral view looking from +X axis
      camera.position.set(dist * 1.3, 0, 0);
      camera.up.set(0, 0, 1);
    }

    controls.target.set(0, 0, 0);
    controls.update();
  };

  const handleResetCamera = () => {
    setCameraPreset('iso');
  };

  return (
    <div className="space-y-4">
      {/* Viewport Top Header & Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-400">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              3D Patient-Specific Tumor Surface Mesh
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80 font-normal">
                Marching Cubes WebGL
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Discrete polygonal isosurfaces generated from real NIfTI segmentation mask in physical RAS+ coordinates.
            </p>
          </div>
        </div>

        {/* Provenance Badge */}
        <div className="flex items-center gap-2">
          {activeSource === 'expert' ? (
            <span className="px-2.5 py-1 rounded-lg text-xs font-mono bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Ground Truth (Expert Mask)</span>
            </span>
          ) : activeSource === 'prediction' && maskVolume ? (
            <span className="px-2.5 py-1 rounded-lg text-xs font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>AI Prediction (FastAPI + MONAI)</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 text-slate-400 border border-slate-800 flex items-center gap-1.5">
              <span>No Mask Loaded</span>
            </span>
          )}
        </div>
      </div>

      {/* Region Toggles, Composite Presets & Opacity Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Sub-Region Checkbox Toggles */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {/* NETC (Label 1) */}
            <button
              onClick={() => {
                if (onToggleNETC) onToggleNETC(!showNETC);
              }}
              disabled={status !== 'success'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                showNETC
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-600/50'
                  : 'bg-slate-900/40 text-slate-500 border-slate-800'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span>Necrotic Core (NETC)</span>
              {status === 'success' && (
                <span className="text-[10px] text-cyan-400/80 font-mono">
                  ({metrics.netcVoxels} vx)
                </span>
              )}
            </button>

            {/* ED (Label 2) */}
            <button
              onClick={() => {
                if (onToggleED) onToggleED(!showED);
              }}
              disabled={status !== 'success'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                showED
                  ? 'bg-amber-950/60 text-amber-300 border-amber-600/50'
                  : 'bg-slate-900/40 text-slate-500 border-slate-800'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Edema (ED)</span>
              {status === 'success' && (
                <span className="text-[10px] text-amber-400/80 font-mono">
                  ({metrics.edVoxels} vx)
                </span>
              )}
            </button>

            {/* ET (Label 4) */}
            <button
              onClick={() => {
                if (onToggleET) onToggleET(!showET);
              }}
              disabled={status !== 'success'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                showET
                  ? 'bg-rose-950/60 text-rose-300 border-rose-600/50'
                  : 'bg-slate-900/40 text-slate-500 border-slate-800'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span>Enhancing (ET)</span>
              {status === 'success' && (
                <span className="text-[10px] text-rose-400/80 font-mono">
                  ({metrics.etVoxels} vx)
                </span>
              )}
            </button>

            {/* Composite Quick Presets */}
            <div className="h-4 w-px bg-slate-800 mx-1" />

            <button
              onClick={() => {
                const allActive = showNETC && showED && showET;
                if (onToggleNETC) onToggleNETC(!allActive);
                if (onToggleED) onToggleED(!allActive);
                if (onToggleET) onToggleET(!allActive);
              }}
              disabled={status !== 'success'}
              className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 hover:text-white hover:border-slate-700 text-xs cursor-pointer"
            >
              Whole Tumor (WT)
            </button>

            <button
              onClick={() => {
                const tcActive = showNETC && showET && !showED;
                if (tcActive) {
                  if (onToggleNETC) onToggleNETC(true);
                  if (onToggleED) onToggleED(true);
                  if (onToggleET) onToggleET(true);
                } else {
                  if (onToggleNETC) onToggleNETC(true);
                  if (onToggleED) onToggleED(false);
                  if (onToggleET) onToggleET(true);
                }
              }}
              disabled={status !== 'success'}
              className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 hover:text-white hover:border-slate-700 text-xs cursor-pointer"
            >
              Tumor Core (TC)
            </button>
          </div>

          {/* Opacity Slider */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-400">Opacity:</span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={overlayOpacity}
              onChange={(e) => {
                if (onChangeOpacity) onChangeOpacity(parseFloat(e.target.value));
              }}
              className="w-24 accent-cyan-500 cursor-pointer"
            />
            <span className="w-8 text-cyan-300 font-mono">
              {Math.round(overlayOpacity * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Viewport Presets, Camera Reset & Display Options */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono pb-2 border-b border-slate-800/80">
        {/* Projections */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Projections:</span>
          {[
            { id: 'iso', label: 'Isometric' },
            { id: 'axial', label: 'Axial (Top)' },
            { id: 'coronal', label: 'Coronal (Front)' },
            { id: 'sagittal', label: 'Sagittal (Side)' }
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setCameraPreset(p.id)}
              disabled={status !== 'success'}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-slate-300 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {p.label}
            </button>
          ))}

          <button
            onClick={handleResetCamera}
            disabled={status !== 'success'}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-slate-300 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        {/* Display Toggles */}
        <div className="flex items-center gap-2">
          {/* Wireframe */}
          <button
            onClick={() => setIsWireframe(!isWireframe)}
            disabled={status !== 'success'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
              isWireframe
                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            } disabled:opacity-40`}
          >
            <Layers className="w-3 h-3" />
            <span>Wireframe</span>
          </button>

          {/* Bounding Box Caliper */}
          <button
            onClick={() => setShowBoundingBox(!showBoundingBox)}
            disabled={status !== 'success'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
              showBoundingBox
                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            } disabled:opacity-40`}
          >
            <Box className="w-3 h-3" />
            <span>Caliper Box</span>
          </button>

          {/* Axes Helper */}
          <button
            onClick={() => setShowAxes(!showAxes)}
            disabled={status !== 'success'}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
              showAxes
                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            } disabled:opacity-40`}
          >
            <span>RAS+ Axes</span>
          </button>

          {/* Auto-Rotate */}
          <button
            onClick={() => setIsAutoRotating(!isAutoRotating)}
            disabled={status !== 'success'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
              isAutoRotating
                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            } disabled:opacity-40`}
          >
            <RotateCw className={`w-3 h-3 ${isAutoRotating ? 'animate-spin' : ''}`} />
            <span>{isAutoRotating ? 'Pause' : 'Auto-Rotate'}</span>
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Container with Overlays */}
      <div className="relative w-full h-[540px] rounded-xl bg-black border border-slate-800 overflow-hidden">
        {/* Three.js Canvas Host */}
        <div
          ref={containerRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

        {/* LOADING OVERLAY */}
        {status === 'loading' && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
            <div className="p-3 rounded-full bg-cyan-950/60 border border-cyan-800 text-cyan-400 animate-spin">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-white">Extracting 3D Tumor Mesh</p>
              <p className="text-xs text-slate-400 font-mono">
                Executing Paul Bourke Marching Cubes over NIfTI label subvolumes...
              </p>
            </div>
          </div>
        )}

        {/* EMPTY STATE OVERLAY */}
        {status === 'empty' && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-4 p-6 text-center z-20">
            <div className="p-3.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
              <Box className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h4 className="text-base font-bold text-white">No 3D Tumor Data Available</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {maskVolume
                  ? 'The loaded segmentation mask contains 0 active tumor voxels (all labels zero). No pathological tissue was segmented.'
                  : 'Run AI model inference on 4-sequence brain MRI scans or load an expert segmentation mask to generate real 3D tumor surfaces.'}
              </p>
            </div>
            {onOpenUpload && (
              <button
                onClick={onOpenUpload}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-500 text-white font-medium text-xs flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer shadow-lg shadow-cyan-950"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload MRI Dataset</span>
              </button>
            )}
          </div>
        )}

        {/* ERROR STATE OVERLAY */}
        {status === 'error' && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-4 p-6 text-center z-20">
            <div className="p-3.5 rounded-full bg-rose-950/60 border border-rose-800 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h4 className="text-base font-bold text-rose-300">Surface Extraction Failed</h4>
              <p className="text-xs text-slate-400 font-mono leading-relaxed">
                {errorMessage || 'Unable to parse NIfTI volume or extract isosurfaces.'}
              </p>
            </div>
            <button
              onClick={extractSurfaces}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Extraction</span>
            </button>
          </div>
        )}

        {/* In-Canvas Caliper & Physical Dimensions HUD (When Mesh is Visible) */}
        {status === 'success' && (
          <div className="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 rounded-lg p-2.5 text-[11px] font-mono text-slate-300 space-y-1 z-10 pointer-events-none">
            <div className="text-cyan-400 font-bold text-[10px] tracking-wide uppercase">
              Physical Caliper (RAS+ mm)
            </div>
            <div className="flex items-center gap-3">
              <span>
                <strong className="text-white">X (R-L):</strong> {metrics.dimensionsMm[0]} mm
              </span>
              <span>
                <strong className="text-white">Y (A-P):</strong> {metrics.dimensionsMm[1]} mm
              </span>
              <span>
                <strong className="text-white">Z (I-S):</strong> {metrics.dimensionsMm[2]} mm
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Tumor Centroid: [{metrics.centroidMm.join(', ')}] mm
            </div>
          </div>
        )}

        {/* Interaction Hint HUD */}
        <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-md border border-slate-800/60 rounded px-2.5 py-1 text-[10px] font-mono text-slate-400 z-10 pointer-events-none">
          Left Drag: Orbit | Right/Shift Drag: Pan | Wheel: Zoom
        </div>
      </div>
    </div>
  );
}
