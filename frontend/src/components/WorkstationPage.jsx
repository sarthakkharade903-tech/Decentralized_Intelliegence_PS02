import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import NiftiVolumeViewer from './NiftiVolumeViewer';
import {
  predictSegmentation,
  validateNiftiFile,
  checkBackendHealth,
  downloadArtifact,
  API_BASE_URL
} from '../services/api';
import {
  ArrowLeft,
  UploadCloud,
  FileDown,
  Layers,
  AlertTriangle,
  Box,
  BarChart3,
  FileText,
  Activity,
  CheckCircle2,
  Printer,
  Scissors,
  Copy,
  Download,
  RotateCw,
  Upload,
  Trash2,
  FileCheck,
  AlertCircle,
  Loader2,
  ChevronRight,
  Info,
  Eye,
  EyeOff,
  Zap,
  RotateCcw,
  CheckCircle,
  Circle,
  Lock,
  Cpu
} from 'lucide-react';

// ─── BraTS 2021 Label definitions ─────────────────────────────────────────────
const BRATS_LABELS = [
  { label: 1, name: 'Necrotic Core (NETC)', color: 'bg-teal-600', textColor: 'text-teal-700', hex: '#0d9488' },
  { label: 2, name: 'Peritumoral Edema (ED)', color: 'bg-amber-600', textColor: 'text-amber-700', hex: '#d97706' },
  { label: 4, name: 'Enhancing Tumor (ET)', color: 'bg-[#6D263D]', textColor: 'text-[#6D263D]', hex: '#6D263D' },
];

// ─── MRI Sequence slots ────────────────────────────────────────────────────────
const SEQUENCES = [
  { id: 't1', label: 'T1', fullName: 'T1 Native', description: 'Anatomical baseline & structural reference' },
  { id: 't1gd', label: 'T1ce', fullName: 'T1ce / T1Gd', description: 'Gadolinium contrast — active enhancing margin' },
  { id: 't2', label: 'T2', fullName: 'T2-Weighted', description: 'Bulk lesions & hyperintense fluid content' },
  { id: 'flair', label: 'FLAIR', fullName: 'FLAIR', description: 'Fluid-suppressed edema boundary (suppressed CSF)' },
];

// ─── Workflow Steps ────────────────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  { id: 'upload', label: 'Upload Scans', icon: UploadCloud },
  { id: 'inspect', label: 'Inspect MRI', icon: Layers },
  { id: 'segment', label: 'Run Segmentation', icon: Zap },
  { id: 'results', label: 'Explore Results', icon: Activity },
  { id: 'export', label: 'Measurements & Export', icon: FileDown },
];

export default function WorkstationPage({
  onBackToHome,
  onOpenUpload,
  predictionData = null,
  uploadedFiles = null
}) {
  // ─── File input state ────────────────────────────────────────────────────────
  const [files, setFiles] = useState(
    uploadedFiles || { t1: null, t1gd: null, t2: null, flair: null }
  );
  const [fileErrors, setFileErrors] = useState({ t1: null, t1gd: null, t2: null, flair: null });
  const [activeViewerFile, setActiveViewerFile] = useState(
    uploadedFiles?.t1gd || uploadedFiles?.t1 || uploadedFiles?.t2 || uploadedFiles?.flair || null
  );

  // ─── Viewer state ────────────────────────────────────────────────────────────
  const [viewerMetadata, setViewerMetadata] = useState(null); // from NiftiVolumeViewer callback
  const [maskUrl, setMaskUrl] = useState(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.7);

  // ─── Segmentation / inference state ─────────────────────────────────────────
  // 'idle' | 'uploading' | 'inferring' | 'success' | 'error'
  const [inferenceStatus, setInferenceStatus] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [inferenceError, setInferenceError] = useState(null);
  const [predictionResult, setPredictionResult] = useState(predictionData);
  const abortRef = useRef(null);

  // ─── Backend health state ────────────────────────────────────────────────────
  const [backendHealth, setBackendHealth] = useState(null); // null | 'online' | 'offline'

  // ─── Active workstation tab for right section ────────────────────────────────
  // 'mri' | 'atlas' | 'report'
  const [activeTab, setActiveTab] = useState('mri');

  // ─── 3D Anatomical Atlas (Three.js) ─────────────────────────────────────────
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [autoRotate, setAutoRotate] = useState(!prefersReducedMotion);
  const [cortexOpacity, setCortexOpacity] = useState(0.85);
  const [autoZoomPeel, setAutoZoomPeel] = useState(true);
  const [atlasLoading, setAtlasLoading] = useState(true);
  const threeContainerRef = useRef(null);
  const threeSceneRef = useRef(null);
  const cortexMatsRef = useRef([]);

  // ─── Report clipboard ────────────────────────────────────────────────────────
  const [copiedReport, setCopiedReport] = useState(false);
  const [isDownloadingMask, setIsDownloadingMask] = useState(false);

  // ─── Derived state ───────────────────────────────────────────────────────────
  const uploadedCount = Object.values(files).filter(Boolean).length;
  const allFourReady = uploadedCount === 4;
  const hasErrors = Object.values(fileErrors).some(Boolean);
  const canRunSegmentation =
    allFourReady && !hasErrors && inferenceStatus !== 'uploading' && inferenceStatus !== 'inferring';
  const hasResult = inferenceStatus === 'success' && predictionResult;

  // Determine workflow step
  const workflowStep = (() => {
    if (!allFourReady) return 0; // upload
    if (!viewerMetadata) return 1; // inspect
    if (inferenceStatus === 'idle' || inferenceStatus === 'error') return 2; // segment
    if (inferenceStatus === 'uploading' || inferenceStatus === 'inferring') return 2;
    if (hasResult && !predictionResult?.artifacts) return 3; // results
    return 4; // export
  })();

  // ─── Backend health probe ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    checkBackendHealth()
      .then(() => { if (!cancelled) setBackendHealth('online'); })
      .catch(() => { if (!cancelled) setBackendHealth('offline'); });
    return () => { cancelled = true; };
  }, []);

  // ─── Sync uploadedFiles prop ────────────────────────────────────────────────
  useEffect(() => {
    if (uploadedFiles) {
      setFiles(uploadedFiles);
      const preferred = uploadedFiles.t1gd || uploadedFiles.t1 || uploadedFiles.t2 || uploadedFiles.flair;
      if (preferred) {
        setActiveViewerFile(preferred);
      }
    }
  }, [uploadedFiles]);

  // ─── Sync initial predictionData prop ───────────────────────────────────────
  useEffect(() => {
    if (predictionData) {
      setPredictionResult(predictionData);
      setInferenceStatus('success');
      if (predictionData.artifacts?.segmentation_mask_url) {
        const raw = predictionData.artifacts.segmentation_mask_url;
        setMaskUrl(raw.startsWith('http') ? raw : `${API_BASE_URL}${raw}`);
      }
    }
  }, [predictionData]);

  // ─── File selection ──────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((seqId, file) => {
    if (!file) return;
    const val = validateNiftiFile(file);
    if (!val.valid) {
      setFileErrors(prev => ({ ...prev, [seqId]: val.error }));
      return;
    }
    // Check cross-slot duplicate
    for (const [key, existing] of Object.entries(files)) {
      if (key === seqId) continue;
      if (existing && existing.name === file.name && existing.size === file.size) {
        setFileErrors(prev => ({
          ...prev,
          [seqId]: `"${file.name}" is already assigned to ${SEQUENCES.find(s => s.id === key)?.fullName}.`
        }));
        return;
      }
    }
    setFileErrors(prev => ({ ...prev, [seqId]: null }));
    setFiles(prev => ({ ...prev, [seqId]: file }));
    // Auto-load first valid file into viewer for inspection
    if (seqId === 't1gd' || seqId === 't1') {
      setActiveViewerFile(file);
    }
  }, [files]);

  const handleFileRemove = useCallback((seqId) => {
    setFiles(prev => ({ ...prev, [seqId]: null }));
    setFileErrors(prev => ({ ...prev, [seqId]: null }));
    if (activeViewerFile === files[seqId]) setActiveViewerFile(null);
  }, [files, activeViewerFile]);

  // ─── Load selected sequence in viewer ────────────────────────────────────────
  const handleLoadInViewer = useCallback((seqId) => {
    if (files[seqId]) setActiveViewerFile(files[seqId]);
  }, [files]);

  // ─── Run segmentation ────────────────────────────────────────────────────────
  const handleRunSegmentation = async () => {
    if (!canRunSegmentation) return;
    setInferenceStatus('uploading');
    setUploadProgress(0);
    setInferenceError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await predictSegmentation({
        t1: files.t1,
        t1gd: files.t1gd,
        t2: files.t2,
        flair: files.flair,
        patientId: 'BraTS2021_PATIENT_CASE',
        onProgress: (pct) => {
          setUploadProgress(pct);
          if (pct >= 100) setInferenceStatus('inferring');
        },
        signal: controller.signal,
      });

      setPredictionResult(result);
      setInferenceStatus('success');

      if (result.artifacts?.segmentation_mask_url) {
        const raw = result.artifacts.segmentation_mask_url;
        setMaskUrl(raw.startsWith('http') ? raw : `${API_BASE_URL}${raw}`);
      }

      if (!activeViewerFile) {
        const preferred = files.t1gd || files.t1 || files.t2 || files.flair;
        if (preferred) setActiveViewerFile(preferred);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setInferenceStatus('idle');
        return;
      }
      setInferenceStatus('error');
      setInferenceError(err.message || 'Segmentation failed. Review error and retry.');
    }
  };

  const handleCancelSegmentation = () => {
    abortRef.current?.abort();
    setInferenceStatus('idle');
    setUploadProgress(0);
  };

  // ─── Download mask artifact ──────────────────────────────────────────────────
  const handleDownloadMask = async () => {
    if (!predictionResult?.artifacts?.segmentation_mask_url) return;
    setIsDownloadingMask(true);
    try {
      await downloadArtifact(
        predictionResult.artifacts.segmentation_mask_url,
        `${predictionResult.patient_id || 'BraTS2021'}_seg.nii.gz`
      );
    } catch (err) {
      setInferenceError(`Download failed: ${err.message}`);
    } finally {
      setIsDownloadingMask(false);
    }
  };

  // ─── Copy report ─────────────────────────────────────────────────────────────
  const handleCopyReport = () => {
    if (!predictionResult) return;
    const v = predictionResult.volumes_ml || {};
    const text = `NEUROSCOPE 3D — SEGMENTATION REPORT
Patient ID: ${predictionResult.patient_id || '—'}
Hardware: ${predictionResult.hardware_device || '—'}
Execution: ${predictionResult.execution_time_seconds || '—'}s

VOLUMETRIC FINDINGS (BraTS 2021):
Whole Tumor (WT):     ${v.whole_tumor?.toFixed(2) ?? '—'} mL  (Labels 1+2+4)
Tumor Core (TC):      ${v.tumor_core?.toFixed(2) ?? '—'} mL  (Labels 1+4)
Enhancing Tumor (ET): ${v.enhancing_tumor?.toFixed(2) ?? '—'} mL  (Label 4)
Edema (ED):           ${v.edema?.toFixed(2) ?? '—'} mL  (Label 2)
Necrotic Core (NETC): ${v.necrotic_core?.toFixed(2) ?? '—'} mL  (Label 1)

DISCLAIMER: Research and educational prototype. Not for clinical diagnosis.`;
    navigator.clipboard.writeText(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  // ─── 3D Anatomical Atlas (Three.js) ─────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'atlas') return;
    const container = threeContainerRef.current;
    if (!container) return;

    let w = container.clientWidth || 800;
    let h = container.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1215);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(2.8, 1.8, 3.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);
    threeSceneRef.current = { group, camera };

    scene.add(new THREE.AmbientLight(0x2a3342, 2.2));
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.6);
    keyLight.position.set(6, 8, 6);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.4);
    fillLight.position.set(-6, 2, -4);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xf472b6, 1.6);
    rimLight.position.set(0, -6, -4);
    scene.add(rimLight);

    cortexMatsRef.current = [];
    const loadedGeos = [];
    const loadedMats = [];

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/gltf/');
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    setAtlasLoading(true);

    gltfLoader.load(
      '/models/brain.glb',
      (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if (!child.isMesh) return;
          loadedGeos.push(child.geometry);
          const name = (child.name || '').toLowerCase();
          const matName = (child.material?.name || '').toLowerCase();
          const isInner = name.includes('inner') || name.includes('nucleus') || name.includes('ventricle') || matName.includes('inner') || matName.includes('nucleus');
          const isVessel = name.includes('artery') || name.includes('sinus') || name.includes('vein');
          const isCerebellum = name.includes('cerebell') || matName.includes('cerebell');

          let mat;
          if (isVessel) {
            mat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.3, metalness: 0.1 });
          } else if (isInner) {
            mat = new THREE.MeshPhysicalMaterial({ color: 0xfff6ec, roughness: 0.45, metalness: 0.05, clearcoat: 0.2, transparent: true, opacity: 0.95 });
          } else if (isCerebellum) {
            mat = new THREE.MeshPhysicalMaterial({ color: 0xebbbb0, roughness: 0.4, metalness: 0.05, clearcoat: 0.25, transparent: true, opacity: cortexOpacity });
            cortexMatsRef.current.push(mat);
          } else {
            mat = new THREE.MeshPhysicalMaterial({ color: 0xf5cfd4, roughness: 0.38, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.2, transparent: true, opacity: cortexOpacity, side: THREE.DoubleSide });
            cortexMatsRef.current.push(mat);
          }
          loadedMats.push(mat);
          child.material = mat;
        });

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const scale = 2.7 / (Math.max(size.x, size.y, size.z) || 1);
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        group.add(model);
        setAtlasLoading(false);
      },
      undefined,
      () => {
        // Fallback procedural hemispheres
        const makeHemi = (dx) => {
          const geo = new THREE.SphereGeometry(1.2, 48, 48);
          geo.scale(0.85, 1.15, 1.35);
          geo.translate(dx, 0, 0);
          return geo;
        };
        const mat = new THREE.MeshPhysicalMaterial({ color: 0xf5cfd4, roughness: 0.38, metalness: 0.05, clearcoat: 0.35, transparent: true, opacity: cortexOpacity });
        [-0.42, 0.42].forEach(dx => {
          const geo = makeHemi(dx);
          loadedGeos.push(geo);
          loadedMats.push(mat);
          cortexMatsRef.current.push(mat);
          group.add(new THREE.Mesh(geo, mat));
        });
        setAtlasLoading(false);
      }
    );

    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    const onMouseDown = (e) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      group.rotation.y += (e.clientX - prevMouse.x) * 0.008;
      group.rotation.x += (e.clientY - prevMouse.y) * 0.008;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging = false; };
    const onWheel = (e) => {
      e.preventDefault();
      const newZ = Math.max(1.8, Math.min(7.5, camera.position.z + e.deltaY * 0.005));
      camera.position.z = newZ;
      if (autoZoomPeel) {
        const op = Math.max(0.18, Math.min(0.95, (newZ - 1.8) / 2.3));
        cortexMatsRef.current.forEach(m => { m.opacity = op; });
        setCortexOpacity(Number(op.toFixed(2)));
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isDragging && autoRotate) group.rotation.y += 0.0035;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      w = container.clientWidth;
      h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      dracoLoader.dispose();
      loadedGeos.forEach(g => g.dispose());
      loadedMats.forEach(m => m.dispose());
    };
  }, [activeTab, autoRotate, autoZoomPeel]);

  useEffect(() => {
    cortexMatsRef.current.forEach(m => { m.opacity = cortexOpacity; });
  }, [cortexOpacity]);

  const setCameraPreset = (view) => {
    if (!threeSceneRef.current) return;
    const { group, camera } = threeSceneRef.current;
    const presets = {
      iso: { rot: [0.3, 0.6, 0], pos: [2.8, 1.8, 3.8] },
      top: { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 4.2] },
      front: { rot: [0, 0, 0], pos: [0, 0, 4.2] },
      side: { rot: [0, Math.PI / 2, 0], pos: [0, 0, 4.2] },
      peel: { rot: [0.2, 0.8, 0], pos: [1.5, 0.9, 2.0], cortex: 0.22 },
    };
    const p = presets[view];
    if (!p) return;
    group.rotation.set(...p.rot);
    camera.position.set(...p.pos);
    if (p.cortex !== undefined) setCortexOpacity(p.cortex);
  };

  // ─── Segmentation status message ─────────────────────────────────────────────
  const getSegStatusMessage = () => {
    if (!allFourReady) return 'Upload all four required MRI sequences to continue.';
    if (hasErrors) return 'Resolve file errors before running segmentation.';
    if (inferenceStatus === 'uploading') return `Uploading MRI volumes… ${uploadProgress}%`;
    if (inferenceStatus === 'inferring') return 'MONAI 3D SegResNet sliding window inference running…';
    if (inferenceStatus === 'error') return inferenceError || 'Segmentation failed. Review the error and retry.';
    if (inferenceStatus === 'success') return 'Segmentation complete. Results available below.';
    return 'All four sequences ready. Run AI segmentation to generate the tumour mask.';
  };

  const v = predictionResult?.volumes_ml || {};
  const geom = predictionResult?.original_geometry || {};

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#E9DDD5] text-[#30252A] flex flex-col font-sans">

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HEADER                                                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 h-16 w-full bg-[#F8F5F0]/95 border-b border-[#DDD0C8] backdrop-blur-md flex items-center px-6 gap-4 shadow-xs">
        {/* Left: branding + back */}
        <button
          onClick={onBackToHome}
          className="flex items-center gap-2 text-xs font-mono text-[#56474E] hover:text-[#30252A] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </button>

        <div className="w-px h-5 bg-[#DDD0C8]" />

        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-[#6D263D] flex items-center justify-center text-[#F8F5F0] shadow-xs">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-serif font-bold text-[#30252A] tracking-tight">NeuroScope 3D</span>
          <ChevronRight className="w-3.5 h-3.5 text-[#6E5D65]" />
          <span className="text-xs font-mono text-[#56474E]">MRI Workstation</span>
        </div>

        {/* Right: status indicators */}
        <div className="ml-auto flex items-center gap-4 text-xs font-mono">
          {/* Backend health */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                backendHealth === 'online' ? 'bg-emerald-600' :
                backendHealth === 'offline' ? 'bg-rose-600' :
                'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="text-[#56474E]">
              {backendHealth === 'online' ? 'Backend connected' :
               backendHealth === 'offline' ? 'Backend offline' : 'Connecting…'}
            </span>
          </div>

          <div className="w-px h-4 bg-[#DDD0C8]" />

          {/* Session status */}
          <div className="text-[#6E5D65]">
            {uploadedCount}/4 sequences
          </div>

          {onOpenUpload && (
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono text-[#30252A] border border-[#DDD0C8] bg-[#F8F5F0] hover:border-[#6D263D] hover:text-[#6D263D] transition-all cursor-pointer shadow-xs"
              title="Open full upload & sequence manager dialog"
            >
              <UploadCloud className="w-3.5 h-3.5 text-[#6D263D]" />
              <span>Upload Scans</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('report')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-mono text-[#F8F5F0] bg-[#6D263D] hover:bg-[#581D30] transition-all cursor-pointer shadow-xs"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Report</span>
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* WORKFLOW PROGRESS BAR                                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="w-full bg-[#F3ECE7] border-b border-[#DDD0C8] px-6 py-0">
        <div className="max-w-[1440px] mx-auto flex items-center h-14 gap-0">
          {WORKFLOW_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isDone = idx < workflowStep;
            const isActive = idx === workflowStep;
            const isLocked = idx > workflowStep + 1;
            return (
              <React.Fragment key={step.id}>
                <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono transition-all ${
                  isActive ? 'bg-[#F8F5F0] text-[#6D263D] font-bold border border-[#DDD0C8] shadow-xs' :
                  isDone ? 'text-emerald-700 font-medium' :
                  isLocked ? 'text-[#6E5D65]/40 cursor-not-allowed' :
                  'text-[#56474E] hover:text-[#30252A]'
                }`}>
                  {isDone ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
                  ) : isLocked ? (
                    <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[#6D263D]' : ''}`} />
                  )}
                  <span className="hidden sm:inline whitespace-nowrap">{step.label}</span>
                  {isActive && (
                    <span className="hidden md:inline w-1.5 h-1.5 rounded-full bg-[#6D263D] animate-pulse" />
                  )}
                </div>
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${idx < workflowStep ? 'bg-emerald-600' : 'bg-[#DDD0C8]'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MAIN THREE-COLUMN WORKSPACE                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col">
        <div className="max-w-[1440px] w-full mx-auto px-6 py-5 flex flex-col gap-5">

          {/* Three-column grid (Responsive: stacks on mobile/tablet, 3-column on lg+) */}
          <div className="grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_280px] gap-4">

            {/* ──────────────────────────────────────────────────────────────── */}
            {/* LEFT SIDEBAR: MRI Sequences                                      */}
            {/* ──────────────────────────────────────────────────────────────── */}
            <aside className="flex flex-col gap-3 min-w-0">
              {/* Section header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-serif font-bold text-[#30252A]">MRI Sequences</h2>
                  <p className="text-[11px] text-[#56474E] mt-0.5">Upload the required volumes</p>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                  allFourReady ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  'bg-[#EAE0D9] text-[#56474E] border border-[#DDD0C8]'
                }`}>
                  {uploadedCount}/4
                </span>
              </div>

              {/* Sequence rows */}
              <div className="flex flex-col gap-2">
                {SEQUENCES.map((seq) => {
                  const file = files[seq.id];
                  const err = fileErrors[seq.id];
                  const isLoaded = file !== null;

                  return (
                    <div
                      key={seq.id}
                      className={`rounded-2xl border p-3 transition-all ${
                        err ? 'border-rose-300 bg-rose-50/70' :
                        isLoaded ? 'border-[#DDD0C8] bg-[#F8F5F0] shadow-xs' :
                        'border-[#DDD0C8] bg-[#F8F5F0]/70 hover:border-[#6D263D]/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              isLoaded ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              'bg-[#EAE0D9] text-[#56474E] border border-[#DDD0C8]'
                            }`}>
                              {seq.label}
                            </span>
                            <span className="text-xs font-semibold text-[#30252A] truncate">{seq.fullName}</span>
                          </div>
                          <p className="text-[10px] text-[#56474E] mt-0.5 leading-tight">{seq.description}</p>
                        </div>

                        {isLoaded ? (
                          <button
                            onClick={() => handleFileRemove(seq.id)}
                            className="p-1 rounded text-[#6E5D65] hover:text-rose-700 hover:bg-rose-100/60 transition-colors cursor-pointer flex-shrink-0"
                            title="Remove file"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        ) : (
                          <label className="px-2.5 py-0.5 rounded-full text-[10px] font-mono text-[#30252A] border border-[#DDD0C8] bg-[#F3ECE7] hover:border-[#6D263D] hover:text-[#6D263D] hover:bg-[#F8F5F0] transition-colors cursor-pointer flex-shrink-0">
                            Select
                            <input
                              type="file"
                              accept=".nii,.nii.gz"
                              className="hidden"
                              onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(seq.id, e.target.files[0]); }}
                            />
                          </label>
                        )}
                      </div>

                      {/* File info / error */}
                      {err && (
                        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-rose-700">
                          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span className="leading-tight">{err}</span>
                        </div>
                      )}
                      {isLoaded && !err && (
                        <div className="mt-2 pt-2 border-t border-[#DDD0C8] flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <FileCheck className="w-3 h-3 text-emerald-700 flex-shrink-0" />
                            <span className="text-[10px] font-mono text-[#30252A] truncate">{file.name}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[9px] text-[#56474E]">
                              {file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                            </span>
                            <button
                              onClick={() => handleLoadInViewer(seq.id)}
                              className="text-[9px] font-mono text-[#6D263D] font-bold hover:text-[#581D30] transition-colors cursor-pointer ml-1"
                              title="Load in viewer"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Validation summary */}
              <div className={`rounded-2xl border p-3 text-xs ${
                allFourReady && !hasErrors
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : hasErrors
                  ? 'border-rose-300 bg-rose-50 text-rose-900'
                  : 'border-[#DDD0C8] bg-[#F8F5F0] text-[#56474E]'
              }`}>
                {allFourReady && !hasErrors ? (
                  <div className="flex items-center gap-2 text-emerald-800 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="text-[11px]">All 4 sequences ready for inference.</span>
                  </div>
                ) : hasErrors ? (
                  <div className="flex items-start gap-2 text-rose-800 font-mono">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-tight">Resolve file errors to continue.</span>
                  </div>
                ) : (
                  <div className="text-[#56474E] font-mono text-[11px]">
                    Missing: {SEQUENCES.filter(s => !files[s.id]).map(s => s.label).join(', ')}
                  </div>
                )}
              </div>

              {/* Quick upload action */}
              <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl border-2 border-dashed border-[#DDD0C8] hover:border-[#6D263D] bg-[#F8F5F0]/60 text-xs font-mono text-[#56474E] hover:text-[#30252A] transition-all cursor-pointer">
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Drop NIfTI files here</span>
                <input type="file" multiple accept=".nii,.nii.gz" className="hidden" onChange={(e) => {
                  if (!e.target.files || e.target.files.length === 0) return;
                  const newFiles = { ...files };
                  const newErrors = { ...fileErrors };
                  let firstViewerFile = null;
                  Array.from(e.target.files).forEach(file => {
                    const lower = file.name.toLowerCase();
                    const slot = lower.includes('t1ce') || lower.includes('t1gd') || lower.includes('t1_ce') ? 't1gd' :
                                 lower.includes('flair') ? 'flair' :
                                 lower.includes('t2') ? 't2' :
                                 lower.includes('t1') ? 't1' : null;
                    if (slot) {
                      const val = validateNiftiFile(file);
                      if (!val.valid) {
                        newErrors[slot] = val.error;
                      } else {
                        newErrors[slot] = null;
                        newFiles[slot] = file;
                        if (slot === 't1gd' || slot === 't1' || !firstViewerFile) {
                          firstViewerFile = file;
                        }
                      }
                    }
                  });
                  setFiles(newFiles);
                  setFileErrors(newErrors);
                  if (firstViewerFile) setActiveViewerFile(firstViewerFile);
                }} />
              </label>
            </aside>

            {/* ──────────────────────────────────────────────────────────────── */}
            {/* CENTER: MRI VIEWER WORKSPACE                                     */}
            {/* ──────────────────────────────────────────────────────────────── */}
            <main className="flex flex-col gap-3 min-w-0">
              {/* Tab navigation */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 p-1 rounded-full bg-[#EAE0D9] border border-[#DDD0C8]">
                  {[
                    { id: 'mri', label: 'MRI Viewer', icon: Layers },
                    { id: 'atlas', label: 'Anatomy Atlas', icon: Box },
                    { id: 'report', label: 'Report', icon: FileText },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono font-medium transition-all cursor-pointer ${
                        activeTab === id
                          ? 'bg-[#F8F5F0] text-[#6D263D] font-bold shadow-xs'
                          : 'text-[#56474E] hover:text-[#30252A]'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${activeTab === id ? 'text-[#6D263D]' : ''}`} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {activeTab === 'mri' && viewerMetadata && (
                  <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1.5 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    Loaded · {viewerMetadata.dimensions?.join('×')}
                  </span>
                )}
                {activeTab === 'atlas' && (
                  <span className="text-[10px] font-mono text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 font-bold">
                    ILLUSTRATIVE ANATOMY — NOT PATIENT DATA
                  </span>
                )}
              </div>

              {/* ── MRI VIEWER TAB ─────────────────────────────────────────── */}
              {activeTab === 'mri' && (
                <div className="rounded-2xl overflow-hidden border border-[#DDD0C8] bg-[#070509] shadow-md" style={{ height: 540 }}>
                  <NiftiVolumeViewer
                    initialFile={activeViewerFile}
                    initialUrl={!activeViewerFile && predictionResult ? '/samples/sample_t1gd.nii.gz' : null}
                    initialMaskUrl={maskUrl}
                    onMetadataExtracted={setViewerMetadata}
                    className="h-full w-full"
                  />
                </div>
              )}

              {/* ── ATLAS TAB ──────────────────────────────────────────────── */}
              {activeTab === 'atlas' && (
                <div className="flex flex-col gap-3">
                  {/* Atlas controls */}
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                    <div className="flex items-center gap-2 bg-[#F8F5F0] px-3.5 py-1.5 rounded-full border border-[#DDD0C8] shadow-xs">
                      <span className="text-[#56474E]">Cortex opacity:</span>
                      <input type="range" min="0.1" max="1.0" step="0.05" value={cortexOpacity}
                        onChange={(e) => { setAutoZoomPeel(false); setCortexOpacity(parseFloat(e.target.value)); }}
                        className="w-20 accent-[#6D263D] cursor-pointer" />
                      <span className="text-[#6D263D] font-bold w-8 text-right">{Math.round(cortexOpacity * 100)}%</span>
                    </div>
                    <button onClick={() => setAutoRotate(!autoRotate)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors cursor-pointer ${autoRotate ? 'bg-[#6D263D] text-[#F8F5F0] border-[#6D263D]' : 'bg-[#F8F5F0] text-[#56474E] border-[#DDD0C8] hover:text-[#30252A]'}`}>
                      <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
                      <span>{autoRotate ? 'Pause' : 'Auto-Spin'}</span>
                    </button>
                    <button onClick={() => setAutoZoomPeel(!autoZoomPeel)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors cursor-pointer ${autoZoomPeel ? 'bg-[#6D263D] text-[#F8F5F0] border-[#6D263D]' : 'bg-[#F8F5F0] text-[#56474E] border-[#DDD0C8] hover:text-[#30252A]'}`}>
                      <span>Auto-Peel: {autoZoomPeel ? 'ON' : 'OFF'}</span>
                    </button>
                    <div className="flex items-center gap-1">
                      {[['iso','Iso'],['top','Top'],['front','Front'],['side','Side'],['peel','Deep Peel']].map(([v,l]) => (
                        <button key={v} onClick={() => setCameraPreset(v)}
                          className={`px-2.5 py-1 rounded-full border text-[10px] font-mono transition-colors cursor-pointer ${v === 'peel' ? 'bg-[#6D263D] border-[#6D263D] text-[#F8F5F0]' : 'bg-[#F8F5F0] border-[#DDD0C8] text-[#56474E] hover:text-[#30252A] hover:border-[#6D263D]'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    className="relative rounded-2xl bg-[#1a1215] border border-[#DDD0C8] overflow-hidden cursor-grab active:cursor-grabbing shadow-sm"
                    style={{ height: 480 }}
                  >
                    <div ref={threeContainerRef} className="w-full h-full" />
                    {atlasLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1a1215]/90 text-[#F8F5F0] font-mono text-xs">
                        <div className="w-7 h-7 rounded-full border-2 border-[#6D263D]/30 border-t-[#6D263D] animate-spin" />
                        <span>Loading brain.glb anatomical atlas…</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-[#56474E] text-center">
                    Drag: orbit · Scroll: zoom (peels cortex near) · Reference model only — not derived from patient data
                  </p>
                </div>
              )}

              {/* ── REPORT TAB ─────────────────────────────────────────────── */}
              {activeTab === 'report' && (
                <div className="rounded-2xl border border-[#DDD0C8] bg-[#F8F5F0] p-6 space-y-5 shadow-sm">
                  {/* Report header */}
                  <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#DDD0C8]">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-4 h-4 text-[#6D263D]" />
                        <h3 className="text-base font-serif font-bold text-[#30252A]">Clinical Segmentation Report</h3>
                      </div>
                      <p className="text-[11px] text-[#56474E] font-mono">Multi-Parametric Brain MRI · BraTS 2021 Protocol</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleCopyReport} disabled={!predictionResult}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono text-[#30252A] border border-[#DDD0C8] bg-[#F3ECE7] hover:border-[#6D263D] disabled:opacity-40 transition-all cursor-pointer">
                        <Copy className="w-3 h-3" />
                        <span>{copiedReport ? 'Copied!' : 'Copy'}</span>
                      </button>
                      <button onClick={() => window.print()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono text-[#30252A] border border-[#DDD0C8] bg-[#F3ECE7] hover:border-[#6D263D] transition-all cursor-pointer">
                        <Printer className="w-3 h-3" />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>

                  {!predictionResult ? (
                    <div className="flex flex-col items-center justify-center py-12 text-[#56474E] gap-3">
                      <FileText className="w-8 h-8 text-[#6E5D65]" />
                      <p className="text-xs font-mono text-center max-w-xs">
                        Report will be generated after successful AI segmentation.
                        Upload all four MRI sequences and run segmentation to proceed.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Metadata */}
                      <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#F3ECE7] border border-[#DDD0C8] text-xs font-mono">
                        {[
                          ['Patient ID', predictionResult.patient_id || '—'],
                          ['Hardware', predictionResult.hardware_device || '—'],
                          ['Execution', `${predictionResult.execution_time_seconds ?? '—'}s`],
                          ['Grid', `${(geom.dimensions || [240,240,155]).join('×')}`],
                          ['Spacing', `${(geom.voxel_spacing_mm || [1,1,1]).join('×')} mm`],
                          ['Orientation', geom.orientation || 'RAS+'],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span className="text-[#56474E]">{k}:</span>
                            <div className="text-[#30252A] font-semibold mt-0.5">{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Volume table */}
                      <div>
                        <h4 className="text-xs font-serif font-bold text-[#30252A] uppercase tracking-wider mb-2">Volumetric Findings</h4>
                        <table className="w-full text-xs font-mono border-collapse">
                          <thead>
                            <tr className="border-b border-[#DDD0C8] text-[#56474E]">
                              <th className="text-left py-2 px-2">Region</th>
                              <th className="text-left py-2 px-2">Labels</th>
                              <th className="text-right py-2 px-2">Volume</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#DDD0C8]">
                            {[
                              { name: 'Whole Tumor (WT)', labels: '1+2+4', val: v.whole_tumor, color: 'text-[#30252A]' },
                              { name: 'Tumor Core (TC)', labels: '1+4', val: v.tumor_core, color: 'text-[#30252A]' },
                              { name: 'Enhancing Tumor (ET)', labels: '4', val: v.enhancing_tumor, color: 'text-[#991b1b]' },
                              { name: 'Edema (ED)', labels: '2', val: v.edema, color: 'text-[#b45309]' },
                              { name: 'Necrotic Core (NETC)', labels: '1', val: v.necrotic_core, color: 'text-[#0f766e]' },
                            ].map(row => (
                              <tr key={row.name}>
                                <td className={`py-2 px-2 ${row.color}`}>{row.name}</td>
                                <td className="py-2 px-2 text-[#56474E]">{row.labels}</td>
                                <td className={`py-2 px-2 text-right font-bold ${row.color}`}>
                                  {row.val != null ? `${row.val.toFixed(2)} mL` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Export */}
                      {predictionResult.artifacts?.segmentation_mask_url && (
                        <div className="flex justify-end pt-3 border-t border-[#DDD0C8]">
                          <button onClick={handleDownloadMask} disabled={isDownloadingMask}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-mono text-[#F8F5F0] bg-[#6D263D] hover:bg-[#581D30] disabled:opacity-50 transition-all cursor-pointer shadow-xs">
                            <Download className="w-3.5 h-3.5" />
                            <span>{isDownloadingMask ? 'Downloading…' : 'Download Segmentation Mask (.nii.gz)'}</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </main>

            {/* ──────────────────────────────────────────────────────────────── */}
            {/* RIGHT SIDEBAR: Scan Info + Display Controls + Seg Legend         */}
            {/* ──────────────────────────────────────────────────────────────── */}
            <aside className="flex flex-col gap-4 min-w-0">

              {/* A. Scan Information */}
              <div className="rounded-2xl border border-[#DDD0C8] bg-[#F8F5F0] p-4 space-y-3 shadow-xs">
                <h3 className="text-xs font-serif font-bold text-[#30252A] uppercase tracking-wider">Scan Information</h3>
                {viewerMetadata ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#56474E]">File</span>
                      <span className="text-[#30252A] font-semibold truncate max-w-[130px]" title={viewerMetadata.filename}>{viewerMetadata.filename}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#56474E]">Dimensions</span>
                      <span className="text-[#30252A] font-semibold">{viewerMetadata.dimensions?.join(' × ')}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#56474E]">Voxel Spacing</span>
                      <span className="text-[#30252A] font-semibold">{viewerMetadata.voxelSpacingMm?.join(' × ')} mm</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#56474E]">Intensity</span>
                      <span className="text-[#30252A] font-semibold">[{viewerMetadata.intensityRange?.join(' – ')}]</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#56474E]">Orientation</span>
                      <span className="text-[#6D263D] font-bold">RAS+</span>
                    </div>
                    {viewerMetadata.renderTimeMs && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#56474E]">Render time</span>
                        <span className="text-[#56474E]">{viewerMetadata.renderTimeMs} ms</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] font-mono text-[#56474E]">
                    Load a NIfTI scan in the viewer to see metadata.
                  </p>
                )}
              </div>

              {/* B. Display Controls (only relevant when a scan is loaded) */}
              <div className="rounded-2xl border border-[#DDD0C8] bg-[#F8F5F0] p-4 space-y-3 shadow-xs">
                <h3 className="text-xs font-serif font-bold text-[#30252A] uppercase tracking-wider">Display Controls</h3>
                {/* Viewer controls are inside NiftiVolumeViewer — shown contextually */}
                {viewerMetadata ? (
                  <p className="text-[11px] font-mono text-[#56474E]">
                    Use controls inside the viewer toolbar to adjust brightness, contrast, clip plane, and view mode.
                  </p>
                ) : (
                  <p className="text-[11px] font-mono text-[#56474E]">Available after scan is loaded.</p>
                )}

                {/* Mask overlay controls — only if mask is loaded */}
                {maskUrl && (
                  <div className="space-y-2 pt-2 border-t border-[#DDD0C8]">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#56474E]">Segmentation overlay</span>
                      <button
                        onClick={() => setOverlayVisible(!overlayVisible)}
                        className="flex items-center gap-1 text-[#30252A] hover:text-[#6D263D] transition-colors cursor-pointer"
                      >
                        {overlayVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{overlayVisible ? 'Visible' : 'Hidden'}</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="text-[#56474E] w-12">Opacity</span>
                      <input type="range" min="10" max="100" value={Math.round(overlayOpacity * 100)}
                        onChange={(e) => setOverlayOpacity(parseInt(e.target.value) / 100)}
                        className="flex-1 accent-[#6D263D] cursor-pointer" />
                      <span className="text-[#30252A] font-bold w-8 text-right">{Math.round(overlayOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* C. Segmentation Legend */}
              <div className="rounded-2xl border border-[#DDD0C8] bg-[#F8F5F0] p-4 space-y-3 shadow-xs">
                <h3 className="text-xs font-serif font-bold text-[#30252A] uppercase tracking-wider">Segmentation Legend</h3>
                {maskUrl ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-mono text-[#56474E]">BraTS 2021 label colormap</p>
                    {BRATS_LABELS.map(({ label, name, color, textColor }) => (
                      <div key={label} className="flex items-center gap-2 text-[11px] font-mono">
                        <span className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
                        <span className="text-[#56474E] w-4">{label}</span>
                        <span className={`font-medium ${textColor}`}>{name}</span>
                      </div>
                    ))}
                    <p className="text-[9px] font-mono text-[#56474E] mt-1 leading-tight">
                      WT = 1+2+4 · TC = 1+4 · ET = 4 only
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] font-mono text-[#56474E]">
                    Segmentation not yet generated. Run AI inference to produce the tumour mask.
                  </p>
                )}
              </div>

              {/* D. Processing Status */}
              <div className="rounded-2xl border border-[#DDD0C8] bg-[#F8F5F0] p-4 space-y-2 shadow-xs">
                <h3 className="text-xs font-serif font-bold text-[#30252A] uppercase tracking-wider">Processing Status</h3>
                <div className={`flex items-center gap-2 text-[11px] font-mono px-3 py-2 rounded-xl ${
                  inferenceStatus === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                  inferenceStatus === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                  inferenceStatus === 'uploading' || inferenceStatus === 'inferring' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                  'bg-[#F3ECE7] text-[#56474E] border border-[#DDD0C8]'
                }`}>
                  {inferenceStatus === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {inferenceStatus === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
                  {(inferenceStatus === 'uploading' || inferenceStatus === 'inferring') && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {inferenceStatus === 'idle' && <Circle className="w-3.5 h-3.5" />}
                  <span>
                    {inferenceStatus === 'idle' && (allFourReady ? 'Ready for segmentation' : 'Waiting for scans')}
                    {inferenceStatus === 'uploading' && `Uploading… ${uploadProgress}%`}
                    {inferenceStatus === 'inferring' && 'AI inference running…'}
                    {inferenceStatus === 'success' && 'Segmentation complete'}
                    {inferenceStatus === 'error' && 'Segmentation failed'}
                  </span>
                </div>
                {(inferenceStatus === 'uploading' || inferenceStatus === 'inferring') && (
                  <div className="w-full h-1.5 bg-[#DDD0C8] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#6D263D] transition-all duration-300 rounded-full"
                      style={{ width: `${inferenceStatus === 'inferring' ? 95 : uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>

            </aside>
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* SEGMENTATION ACTION BAR                                          */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div className="rounded-2xl border border-[#DDD0C8] bg-[#F8F5F0] px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            {/* Left: status message */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                inferenceStatus === 'success' ? 'bg-emerald-600' :
                inferenceStatus === 'error' ? 'bg-rose-600' :
                canRunSegmentation ? 'bg-amber-500' :
                'bg-[#DDD0C8]'
              }`} />
              <div className="min-w-0">
                <p className="text-xs text-[#30252A] font-mono">{getSegStatusMessage()}</p>
                {inferenceStatus === 'error' && inferenceError && (
                  <p className="text-xs text-rose-700 font-mono mt-0.5 truncate">{inferenceError}</p>
                )}
              </div>
            </div>

            {/* Right: action */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {(inferenceStatus === 'uploading' || inferenceStatus === 'inferring') && (
                <button
                  onClick={handleCancelSegmentation}
                  className="px-3.5 py-1.5 rounded-full text-xs font-mono text-[#56474E] border border-[#DDD0C8] hover:text-rose-700 hover:border-rose-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}

              <button
                onClick={handleRunSegmentation}
                disabled={!canRunSegmentation}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-mono font-semibold tracking-wide transition-all ${
                  canRunSegmentation
                    ? 'bg-[#6D263D] hover:bg-[#581D30] text-[#F8F5F0] cursor-pointer shadow-sm'
                    : 'bg-[#EAE0D9] text-[#6E5D65] cursor-not-allowed border border-[#DDD0C8]'
                }`}
              >
                {inferenceStatus === 'uploading' ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Uploading {uploadProgress}%</span></>
                ) : inferenceStatus === 'inferring' ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Running Inference…</span></>
                ) : (
                  <><Zap className="w-3.5 h-3.5" /><span>Run Segmentation</span></>
                )}
              </button>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* RESULTS AND MEASUREMENTS                                          */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <div className="rounded-2xl border border-[#DDD0C8] bg-[#F8F5F0] shadow-sm">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#DDD0C8]">
              <div>
                <h2 className="text-sm font-serif font-bold text-[#30252A]">Segmentation Results</h2>
                <p className="text-[11px] text-[#56474E] font-mono mt-0.5">Explore the generated mask and calculated measurements</p>
              </div>
              {hasResult && (
                <div className="flex items-center gap-2">
                  <button onClick={handleDownloadMask} disabled={isDownloadingMask || !predictionResult?.artifacts?.segmentation_mask_url}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono text-[#30252A] border border-[#DDD0C8] bg-[#F3ECE7] hover:border-[#6D263D] disabled:opacity-40 transition-all cursor-pointer">
                    <Download className="w-3 h-3" />
                    <span>Export Mask</span>
                  </button>
                  <button onClick={handleCopyReport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono text-[#30252A] border border-[#DDD0C8] bg-[#F3ECE7] hover:border-[#6D263D] transition-all cursor-pointer">
                    <Copy className="w-3 h-3" />
                    <span>{copiedReport ? 'Copied!' : 'Copy Summary'}</span>
                  </button>
                </div>
              )}
            </div>

            {!hasResult ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#F3ECE7] border border-[#DDD0C8] flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-[#6E5D65]" />
                </div>
                <div>
                  <p className="text-sm font-serif font-medium text-[#30252A]">No results yet</p>
                  <p className="text-xs text-[#56474E] font-mono mt-1 max-w-xs">
                    Upload all four MRI sequences and run AI segmentation. Results and volumetric measurements will appear here.
                  </p>
                </div>
              </div>
            ) : (
              /* Results grid */
              <div className="p-5 space-y-5">
                {/* Volume metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { label: 'Whole Tumor', short: 'WT', tags: '1+2+4', val: v.whole_tumor, color: 'border-[#DDD0C8]', textColor: 'text-[#30252A]' },
                    { label: 'Tumor Core', short: 'TC', tags: '1+4', val: v.tumor_core, color: 'border-[#DDD0C8]', textColor: 'text-[#30252A]' },
                    { label: 'Enhancing Tumor', short: 'ET', tags: '4', val: v.enhancing_tumor, color: 'border-rose-200', textColor: 'text-[#991b1b]' },
                    { label: 'Edema', short: 'ED', tags: '2', val: v.edema, color: 'border-amber-200', textColor: 'text-[#b45309]' },
                    { label: 'Necrotic Core', short: 'NETC', tags: '1', val: v.necrotic_core, color: 'border-teal-200', textColor: 'text-[#0f766e]' },
                  ].map(m => (
                    <div key={m.short} className={`p-3.5 rounded-xl bg-[#F3ECE7] border ${m.color} space-y-1 shadow-xs`}>
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#56474E]">
                        <span className="uppercase font-semibold">{m.short}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#EAE0D9] border border-[#DDD0C8] text-[#56474E]">{m.tags}</span>
                      </div>
                      <div className={`text-lg font-bold font-mono ${m.textColor}`}>
                        {m.val != null ? m.val.toFixed(2) : '—'}
                        <span className="text-xs font-normal text-[#56474E] ml-1">mL</span>
                      </div>
                      <p className="text-[10px] text-[#56474E]">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Volume formula note */}
                <div className="flex items-center gap-2 text-[11px] font-mono text-[#56474E] px-1">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 text-[#6D263D]" />
                  <span>Volume (mL) = Voxel count × (spacing_x × spacing_y × spacing_z) ÷ 1000 · Physical voxel spacing from NIfTI affine</span>
                </div>

                {/* Inference metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#DDD0C8] text-xs font-mono">
                  {[
                    ['Patient', predictionResult.patient_id || '—'],
                    ['Hardware', predictionResult.hardware_device || '—'],
                    ['Inference time', `${predictionResult.execution_time_seconds ?? '—'}s`],
                    ['Geometry', `${(geom.dimensions || []).join('×')} · ${geom.orientation || 'RAS+'}`],
                  ].map(([k, val]) => (
                    <div key={k}>
                      <span className="text-[#56474E] block">{k}</span>
                      <span className="text-[#30252A] font-semibold">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* RESEARCH DISCLAIMER FOOTER                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <footer className="w-full border-t border-[#DDD0C8] bg-[#F3ECE7] py-4 px-6">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-[#56474E]">
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-[#6D263D]" />
            <span>
              <span className="text-[#30252A] font-semibold">NeuroScope 3D</span> · Kurukshetra Hackathon Research Prototype
            </span>
          </div>
          <div className="text-center sm:text-right text-[10px] text-[#6E5D65] max-w-md">
            NeuroScope 3D is a research and educational prototype. It is not intended for clinical diagnosis or treatment decisions.
            Segmentation results are AI-generated candidate regions only.
          </div>
        </div>
      </footer>
    </div>
  );
}
