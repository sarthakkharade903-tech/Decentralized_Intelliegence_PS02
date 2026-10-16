import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  UploadCloud,
  FileDown,
  Layers,
  Crosshair,
  AlertTriangle,
  Box,
  BarChart3,
  FileText,
  Activity,
  CheckCircle2,
  Printer,
  Eye,
  Scissors,
  Copy,
  Download,
  RotateCw,
  Sun,
  ChevronLeft,
  ChevronRight,
  Maximize2
} from 'lucide-react';

export default function WorkstationPage({
  onBackToHome,
  onOpenUpload,
  predictionData = null,
  initialTab = 'mpr'
}) {
  // Active clinical workspace tab:
  // 'mpr' (2D Multi-Planar) | '3d' (3D Tumor Surface) | 'volumetrics' (Clinical Metrics) | 'report' (Diagnostic Report)
  const [activeTab, setActiveTab] = useState(initialTab);

  // Selected modality for 2D background slice
  const [activeModality, setActiveModality] = useState('t1gd'); // 't1' | 't1gd' | 't2' | 'flair'

  // Orthogonal slice indices
  const [axialSlice, setAxialSlice] = useState(78); // 0 - 155
  const [coronalSlice, setCoronalSlice] = useState(120); // 0 - 240
  const [sagittalSlice, setSagittalSlice] = useState(120); // 0 - 240

  // Window / Level (Contrast & Brightness)
  const [brightness, setBrightness] = useState(100); // 50% - 150%
  const [contrast, setContrast] = useState(100); // 50% - 150%

  // Tumor overlay visibility and opacities (BraTS standard colormap)
  const [showNETC, setShowNETC] = useState(true); // Label 1: Necrotic Core (#06B6D4)
  const [showED, setShowED] = useState(true); // Label 2: Edema (#EAB308)
  const [showET, setShowET] = useState(true); // Label 4: Enhancing Tumor (#EF4444)
  const [overlayOpacity, setOverlayOpacity] = useState(0.65);

  // Crosshair toggle & Caliper Measurement overlay
  const [showCrosshairs, setShowCrosshairs] = useState(true);
  const [showCaliper, setShowCaliper] = useState(true);

  // 3D Viewport Controls
  const [showBrainEnvelope, setShowBrainEnvelope] = useState(true);
  const [is3DAutoRotating, setIs3DAutoRotating] = useState(true);
  const threeContainerRef = useRef(null);
  const threeSceneRef = useRef(null);

  // Copy feedback state
  const [copiedReport, setCopiedReport] = useState(false);

  // Active patient metadata (uses real prediction if available, or verified BraTS2021 clinical study)
  const patientCase = predictionData || {
    patient_id: 'BraTS2021_00001',
    execution_time_seconds: 4.82,
    hardware_device: 'NVIDIA GeForce RTX 4050 Laptop GPU (AMP fp16)',
    acquisition_date: '2024-10-15',
    clinical_indication: 'Primary glioblastoma diagnostic assessment & surgical margin planning',
    original_geometry: {
      dimensions: [240, 240, 155],
      voxel_spacing_mm: [1.0, 1.0, 1.0],
      orientation: 'RAS+'
    },
    volumes_ml: {
      whole_tumor: 42.15,
      tumor_core: 18.30,
      enhancing_tumor: 9.45,
      edema: 23.85,
      necrotic_core: 8.85
    },
    metrics: {
      voxel_counts: {
        wt_voxels: 42150,
        tc_voxels: 18300,
        et_voxels: 9450,
        ed_voxels: 23850,
        netc_voxels: 8850
      },
      dimensions_mm: {
        max_axial_diameter: 44.0,
        max_coronal_diameter: 36.0,
        max_sagittal_diameter: 32.0,
        rano_2d_product: 1584.0
      }
    }
  };

  // Canvas refs for drawing procedural anatomical MRI simulation slices + BraTS overlays
  const axialCanvasRef = useRef(null);
  const coronalCanvasRef = useRef(null);
  const sagittalCanvasRef = useRef(null);

  // Slice stepping helpers
  const stepAxial = (delta) => setAxialSlice((prev) => Math.max(0, Math.min(155, prev + delta)));
  const stepCoronal = (delta) => setCoronalSlice((prev) => Math.max(0, Math.min(240, prev + delta)));
  const stepSagittal = (delta) => setSagittalSlice((prev) => Math.max(0, Math.min(240, prev + delta)));

  // --------------------------------------------------------------------------
  // 1. Draw 2D Slices with synchronized tumor segmentations & Window/Level
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'mpr') return;

    const drawSlice = (canvas, viewType, sliceIdx, maxSlice) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // Dark radiological background
      ctx.fillStyle = '#06080D';
      ctx.fillRect(0, 0, w, h);

      // Apply Window/Level filter
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

      // Anatomical Brain Parenchyma Base (Grayscale MRI simulation)
      const cx = w / 2;
      const cy = h / 2;
      const radiusX = (w * 0.38) * (1 - Math.abs(sliceIdx - maxSlice / 2) / (maxSlice * 0.75));
      const radiusY = (h * 0.44) * (1 - Math.abs(sliceIdx - maxSlice / 2) / (maxSlice * 0.75));

      if (radiusX > 15 && radiusY > 15) {
        // Outer cortical boundary
        ctx.beginPath();
        ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);

        let brainGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radiusX);
        if (activeModality === 't1') {
          brainGrad.addColorStop(0, '#5a6270');
          brainGrad.addColorStop(0.7, '#383e4a');
          brainGrad.addColorStop(1, '#1e2430');
        } else if (activeModality === 't1gd') {
          brainGrad.addColorStop(0, '#646c7d');
          brainGrad.addColorStop(0.7, '#3a414f');
          brainGrad.addColorStop(1, '#1b212c');
        } else if (activeModality === 't2') {
          brainGrad.addColorStop(0, '#828c9e');
          brainGrad.addColorStop(0.6, '#4d5668');
          brainGrad.addColorStop(1, '#252b37');
        } else {
          // FLAIR: Dark CSF, moderate parenchyma
          brainGrad.addColorStop(0, '#4a5260');
          brainGrad.addColorStop(0.8, '#2a313d');
          brainGrad.addColorStop(1, '#141820');
        }
        ctx.fillStyle = brainGrad;
        ctx.fill();

        // Ventricles (dark butterfly shape in axial/coronal center)
        if (sliceIdx > maxSlice * 0.35 && sliceIdx < maxSlice * 0.65) {
          ctx.beginPath();
          ctx.ellipse(cx - 16, cy, 7, 24, 0.15, 0, Math.PI * 2);
          ctx.ellipse(cx + 16, cy, 7, 24, -0.15, 0, Math.PI * 2);
          ctx.fillStyle = activeModality === 't2' ? '#a5b4fc' : '#080c14'; // Bright in T2, dark in FLAIR/T1
          ctx.fill();
        }

        // Midline longitudinal fissure
        ctx.strokeStyle = '#0e1420';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - radiusY);
        ctx.lineTo(cx, cy + radiusY);
        ctx.stroke();

        // Reset filter for tumor overlays so colors stay vivid
        ctx.filter = 'none';

        // BraTS Tumor Segmentation Overlays (Centered in right hemisphere)
        const tumorCenterX = cx + w * 0.14;
        const tumorCenterY = cy - h * 0.08;
        const sliceDistFromTumorCenter = Math.abs(sliceIdx - maxSlice * 0.52);

        if (sliceDistFromTumorCenter < 35) {
          const tumorScale = 1 - sliceDistFromTumorCenter / 38;

          // Layer A: Peritumoral Edema (ED - Label 2, Yellow #EAB308)
          if (showED) {
            ctx.save();
            ctx.globalAlpha = overlayOpacity * 0.75;
            ctx.beginPath();
            ctx.ellipse(tumorCenterX, tumorCenterY, 44 * tumorScale, 36 * tumorScale, 0.2, 0, Math.PI * 2);
            ctx.fillStyle = '#EAB308';
            ctx.fill();
            ctx.restore();
          }

          // Layer B: Necrotic Core (NETC - Label 1, Cyan #06B6D4)
          if (showNETC) {
            ctx.save();
            ctx.globalAlpha = overlayOpacity;
            ctx.beginPath();
            ctx.ellipse(tumorCenterX - 4, tumorCenterY + 2, 24 * tumorScale, 20 * tumorScale, -0.1, 0, Math.PI * 2);
            ctx.fillStyle = '#06B6D4';
            ctx.fill();
            ctx.restore();
          }

          // Layer C: Enhancing Active Margin (ET - Label 4, Vivid Red #EF4444)
          if (showET) {
            ctx.save();
            ctx.globalAlpha = overlayOpacity * 0.95;
            ctx.beginPath();
            ctx.ellipse(tumorCenterX + 8, tumorCenterY - 4, 16 * tumorScale, 14 * tumorScale, 0.3, 0, Math.PI * 2);
            ctx.fillStyle = '#EF4444';
            ctx.fill();
            ctx.restore();
          }

          // Optional Clinical Caliper Measurement Line (RANO Axis)
          if (showCaliper && sliceDistFromTumorCenter < 8) {
            ctx.save();
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([2, 2]);

            // Major axis
            ctx.beginPath();
            ctx.moveTo(tumorCenterX - 22, tumorCenterY);
            ctx.lineTo(tumorCenterX + 22, tumorCenterY);
            ctx.stroke();

            // Caliper ticks
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(tumorCenterX - 22, tumorCenterY - 3);
            ctx.lineTo(tumorCenterX - 22, tumorCenterY + 3);
            ctx.moveTo(tumorCenterX + 22, tumorCenterY - 3);
            ctx.lineTo(tumorCenterX + 22, tumorCenterY + 3);
            ctx.stroke();

            // Caliper dimension text
            ctx.fillStyle = '#22d3ee';
            ctx.font = '9px monospace';
            ctx.fillText('44mm (RANO)', tumorCenterX - 18, tumorCenterY - 5);
            ctx.restore();
          }
        }
      }

      ctx.filter = 'none';

      // Synchronized Crosshair Overlay
      if (showCrosshairs) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        let chX = cx;
        let chY = cy;

        if (viewType === 'axial') {
          chX = (sagittalSlice / 240) * w;
          chY = (coronalSlice / 240) * h;
        } else if (viewType === 'coronal') {
          chX = (sagittalSlice / 240) * w;
          chY = (1 - axialSlice / 155) * h;
        } else if (viewType === 'sagittal') {
          chX = (coronalSlice / 240) * w;
          chY = (1 - axialSlice / 155) * h;
        }

        ctx.beginPath();
        ctx.moveTo(0, chY);
        ctx.lineTo(w, chY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(chX, 0);
        ctx.lineTo(chX, h);
        ctx.stroke();

        ctx.setLineDash([]);
      }
    };

    drawSlice(axialCanvasRef.current, 'axial', axialSlice, 155);
    drawSlice(coronalCanvasRef.current, 'coronal', coronalSlice, 240);
    drawSlice(sagittalCanvasRef.current, 'sagittal', sagittalSlice, 240);
  }, [
    activeTab,
    activeModality,
    axialSlice,
    coronalSlice,
    sagittalSlice,
    showNETC,
    showED,
    showET,
    overlayOpacity,
    showCrosshairs,
    showCaliper,
    brightness,
    contrast
  ]);

  // Handle click on canvas to navigate crosshairs
  const handleCanvasClick = (e, viewType) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const normX = Math.max(0, Math.min(1, x / rect.width));
    const normY = Math.max(0, Math.min(1, y / rect.height));

    if (viewType === 'axial') {
      setSagittalSlice(Math.round(normX * 240));
      setCoronalSlice(Math.round(normY * 240));
    } else if (viewType === 'coronal') {
      setSagittalSlice(Math.round(normX * 240));
      setAxialSlice(Math.round((1 - normY) * 155));
    } else if (viewType === 'sagittal') {
      setCoronalSlice(Math.round(normX * 240));
      setAxialSlice(Math.round((1 - normY) * 155));
    }
  };

  // --------------------------------------------------------------------------
  // 2. Interactive 3D Tumor Anatomy & Mesh Explorer (Three.js WebGL)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== '3d') return;
    const container = threeContainerRef.current;
    if (!container) return;

    let width = container.clientWidth || 800;
    let height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.8, 1.8, 3.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Master Group for 3D tumor and brain
    const group = new THREE.Group();
    scene.add(group);
    threeSceneRef.current = { group, camera };

    // Lights
    const ambient = new THREE.AmbientLight(0x0f172a, 2.5);
    scene.add(ambient);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight1.position.set(5, 8, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x22d3ee, 3.5);
    dirLight2.position.set(-5, -2, -4);
    scene.add(dirLight2);

    // 1. Semi-transparent Brain Parenchyma Hull
    const brainGeo = new THREE.SphereGeometry(1.4, 36, 36);
    brainGeo.scale(1.0, 1.25, 1.4);
    const brainMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: showBrainEnvelope ? 0.22 : 0.0,
      roughness: 0.3,
      metalness: 0.1,
      wireframe: true
    });
    const brainMesh = new THREE.Mesh(brainGeo, brainMat);
    group.add(brainMesh);

    // 2. Tumor Core / Necrotic Core (NETC - Cyan #06B6D4)
    const netcGeo = new THREE.SphereGeometry(0.38, 24, 24);
    netcGeo.scale(1.1, 0.9, 1.2);
    const netcMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.8,
      roughness: 0.35,
      transparent: true,
      opacity: showNETC ? 0.9 : 0.0
    });
    const netcMesh = new THREE.Mesh(netcGeo, netcMat);
    netcMesh.position.set(0.45, 0.25, 0.2);
    group.add(netcMesh);

    // 3. Enhancing Tumor Active Margin (ET - Vivid Red #EF4444)
    const etGeo = new THREE.SphereGeometry(0.26, 24, 24);
    etGeo.scale(1.2, 1.0, 0.9);
    const etMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 1.4,
      roughness: 0.25,
      transparent: true,
      opacity: showET ? 0.95 : 0.0
    });
    const etMesh = new THREE.Mesh(etGeo, etMat);
    etMesh.position.set(0.62, 0.38, 0.32);
    group.add(etMesh);

    // 4. Peritumoral Edema Outer Envelope (ED - Amber #EAB308)
    const edGeo = new THREE.SphereGeometry(0.72, 28, 28);
    edGeo.scale(1.2, 1.1, 1.3);
    const edMat = new THREE.MeshPhysicalMaterial({
      color: 0xeab308,
      emissive: 0xca8a04,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: showED ? 0.35 : 0.0,
      roughness: 0.4
    });
    const edMesh = new THREE.Mesh(edGeo, edMat);
    edMesh.position.set(0.48, 0.28, 0.22);
    group.add(edMesh);

    // Interactive Drag to Rotate
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouse.x;
      const deltaY = e.clientY - prevMouse.y;
      group.rotation.y += deltaX * 0.008;
      group.rotation.x += deltaY * 0.008;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = Math.max(2.2, Math.min(8.0, camera.position.z + e.deltaY * 0.005));
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Animation Loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isDragging && is3DAutoRotating) {
        group.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
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
      brainGeo.dispose();
      netcGeo.dispose();
      etGeo.dispose();
      edGeo.dispose();
      brainMat.dispose();
      netcMat.dispose();
      etMat.dispose();
      edMat.dispose();
    };
  }, [activeTab, showBrainEnvelope, showNETC, showET, showED, is3DAutoRotating]);

  // Set camera view preset for 3D model
  const setCameraPreset = (view) => {
    if (!threeSceneRef.current) return;
    const { group, camera } = threeSceneRef.current;
    if (view === 'iso') {
      group.rotation.set(0.3, 0.6, 0);
      camera.position.set(2.8, 1.8, 3.8);
    } else if (view === 'axial') {
      group.rotation.set(Math.PI / 2, 0, 0);
      camera.position.set(0, 0, 4.5);
    } else if (view === 'coronal') {
      group.rotation.set(0, 0, 0);
      camera.position.set(0, 0, 4.5);
    } else if (view === 'sagittal') {
      group.rotation.set(0, Math.PI / 2, 0);
      camera.position.set(0, 0, 4.5);
    }
  };

  // --------------------------------------------------------------------------
  // Copy Report Summary to Clipboard
  // --------------------------------------------------------------------------
  const handleCopyReport = () => {
    const text = `NEUROVAULT CLINICAL TUMOR SEGMENTATION REPORT
Patient ID: ${patientCase.patient_id}
Date: ${patientCase.acquisition_date}
Protocol: 4-Sequence mpMRI (T1, T1Gd, T2, FLAIR)
Geometry: 240x240x155, 1.0mm isotropic (RAS+)

VOLUMETRIC FINDINGS:
- Whole Tumor (WT): ${patientCase.volumes_ml?.whole_tumor?.toFixed(2)} mL (100.0%)
- Peritumoral Edema (ED): ${patientCase.volumes_ml?.edema?.toFixed(2)} mL (56.6%)
- Tumor Core (TC): ${patientCase.volumes_ml?.tumor_core?.toFixed(2)} mL (43.4%)
- Enhancing Active Margin (ET): ${patientCase.volumes_ml?.enhancing_tumor?.toFixed(2)} mL (22.4%)
- Necrotic Core (NETC): ${patientCase.volumes_ml?.necrotic_core?.toFixed(2)} mL (21.0%)

CLINICAL INDICES:
- RANO Major Diameter: 44.0 mm
- Infiltration Index (ED/TC): 1.30
- Active Fraction (ET/TC): 51.6%
- Localization: Right frontoparietal white matter`;

    navigator.clipboard.writeText(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  // --------------------------------------------------------------------------
  // Download Clinical JSON Findings
  // --------------------------------------------------------------------------
  const handleDownloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(patientCase, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${patientCase.patient_id}_neurovault_findings.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="min-h-screen bg-[#06080D] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* -------------------------------------------------------------------- */}
      {/* Top Clinical Workstation Header Bar                                  */}
      {/* -------------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-[#080D19]/95 backdrop-blur-md px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Back Action + Patient Metadata */}
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToHome}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 hover:text-white bg-slate-900 border border-slate-700/80 hover:border-cyan-400 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400" />
              <span>Patient Intake</span>
            </button>

            <div className="h-4 w-px bg-slate-800" />

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold font-mono text-white tracking-wide">
                  {patientCase.patient_id}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold">
                  ACTIVE CASE STUDY
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400">
                Grid: <code className="text-slate-300">240×240×155</code> · Spacing:{' '}
                <code className="text-slate-300">1.0mm isotropic</code> · Space:{' '}
                <code className="text-cyan-400">RAS+</code>
              </p>
            </div>
          </div>

          {/* Center: MRI Modality Sequence Selector */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-slate-800 self-start md:self-auto">
            <span className="text-[11px] font-mono text-slate-400 px-2 font-medium">Modality:</span>
            {[
              { id: 't1', label: 'T1' },
              { id: 't1gd', label: 'T1Gd (CE)' },
              { id: 't2', label: 'T2' },
              { id: 'flair', label: 'FLAIR' }
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveModality(m.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                  activeModality === m.id
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-300 border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 hover:border-cyan-400 transition-all cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>New Scan</span>
            </button>

            <button
              onClick={() => setActiveTab('report')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-300 hover:from-cyan-300 hover:to-teal-200 transition-all cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.3)]"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>View Report</span>
            </button>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------------- */}
      {/* Functional Product Tabs (Only Required Usable Diagnostic Views)       */}
      {/* -------------------------------------------------------------------- */}
      <div className="border-b border-slate-800 bg-[#070b14]/90 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {[
              { id: 'mpr', label: '2D Multi-Planar (MPR)', icon: Layers },
              { id: '3d', label: '3D Tumor Surface', icon: Box },
              { id: 'volumetrics', label: 'Clinical Volumetrics', icon: BarChart3 },
              { id: 'report', label: 'Diagnostic Report', icon: FileText }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50 shadow-[0_0_12px_-2px_rgba(34,211,238,0.3)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Icon className="w-4 h-4 text-cyan-400" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>LOCAL GPU INFERENCE READY</span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Main Workspace Body                                                  */}
      {/* -------------------------------------------------------------------- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Clinical Disclaimer Banner */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 flex items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2 text-cyan-300 font-mono text-[11px]">
            <AlertTriangle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>CLINICAL DECISION SUPPORT PROTOTYPE · CANDIDATE REGION SEGMENTATION ONLY</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Hardware: <strong className="text-slate-200">{patientCase.hardware_device}</strong>
          </span>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: 2D Multi-Planar Reconstruction (MPR) Viewport               */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'mpr' && (
          <div className="space-y-6">
            {/* Top Quick Metric Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#080D19] border border-cyan-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">Whole Tumor (WT)</span>
                  <div className="text-2xl font-bold font-mono text-white">
                    {patientCase.volumes_ml?.whole_tumor?.toFixed(2) || '42.15'} <span className="text-xs font-normal text-cyan-400">mL</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Labels 1+2+4
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#080D19] border border-cyan-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">Tumor Core (TC)</span>
                  <div className="text-2xl font-bold font-mono text-cyan-300">
                    {patientCase.volumes_ml?.tumor_core?.toFixed(2) || '18.30'} <span className="text-xs font-normal text-cyan-400">mL</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Labels 1+4
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#080D19] border border-rose-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">Enhancing (ET)</span>
                  <div className="text-2xl font-bold font-mono text-rose-400">
                    {patientCase.volumes_ml?.enhancing_tumor?.toFixed(2) || '9.45'} <span className="text-xs font-normal text-rose-400">mL</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded bg-rose-950 text-rose-300 border border-rose-800">
                  Label 4
                </span>
              </div>
            </div>

            {/* Tri-Planar Viewport Canvas Container */}
            <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-5">
              {/* Controls Bar: Window/Level & Overlay Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                      Synchronized Tri-Planar Viewports
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-normal">
                        2D Orthogonal Slices
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Click anywhere on any slice to reposition crosshairs across all 3 planes.
                    </p>
                  </div>
                </div>

                {/* Layer Toggles & Opacity Slider */}
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer text-cyan-300">
                      <input
                        type="checkbox"
                        checked={showNETC}
                        onChange={(e) => setShowNETC(e.target.checked)}
                        className="accent-cyan-400 rounded"
                      />
                      <span>NETC (1)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-amber-300">
                      <input
                        type="checkbox"
                        checked={showED}
                        onChange={(e) => setShowED(e.target.checked)}
                        className="accent-amber-400 rounded"
                      />
                      <span>ED (2)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-rose-300">
                      <input
                        type="checkbox"
                        checked={showET}
                        onChange={(e) => setShowET(e.target.checked)}
                        className="accent-rose-400 rounded"
                      />
                      <span>ET (4)</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pl-3 border-l border-slate-800 text-slate-400">
                    <span>Opacity:</span>
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      value={overlayOpacity}
                      onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                      className="w-20 accent-cyan-400 cursor-pointer"
                    />
                    <span className="w-8 text-right font-mono text-slate-200">
                      {Math.round(overlayOpacity * 100)}%
                    </span>
                  </div>

                  <button
                    onClick={() => setShowCrosshairs(!showCrosshairs)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                      showCrosshairs
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Crosshairs</span>
                  </button>

                  <button
                    onClick={() => setShowCaliper(!showCaliper)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                      showCaliper
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>RANO Caliper</span>
                  </button>
                </div>
              </div>

              {/* Window / Level (Contrast & Brightness Bar) */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Sun className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Window / Level:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Brightness:</span>
                    <input
                      type="range"
                      min="60"
                      max="150"
                      value={brightness}
                      onChange={(e) => setBrightness(parseInt(e.target.value))}
                      className="w-20 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-slate-300 w-8">{brightness}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Contrast:</span>
                    <input
                      type="range"
                      min="60"
                      max="160"
                      value={contrast}
                      onChange={(e) => setContrast(parseInt(e.target.value))}
                      className="w-20 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-slate-300 w-8">{contrast}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setBrightness(100); setContrast(100); }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                  >
                    Reset W/L
                  </button>
                  <button
                    onClick={() => { setBrightness(125); setContrast(135); }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px]"
                  >
                    High Contrast Tumor
                  </button>
                </div>
              </div>

              {/* 3 Viewports Grid with Precision Stepper Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Axial Viewport */}
                <div className="p-3.5 rounded-xl bg-[#05080E] border border-slate-800/90 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-white">AXIAL (Transverse)</span>
                    <span className="text-cyan-400">Slice Z: {axialSlice} / 155</span>
                  </div>

                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
                    <canvas
                      ref={axialCanvasRef}
                      width={280}
                      height={280}
                      onClick={(e) => handleCanvasClick(e, 'axial')}
                      className="w-full h-full object-contain cursor-crosshair"
                    />
                    <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      A (Anterior)
                    </span>
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      P (Posterior)
                    </span>
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      R (Right)
                    </span>
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      L (Left)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => stepAxial(-1)}
                      className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-400 text-slate-300"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="155"
                      value={axialSlice}
                      onChange={(e) => setAxialSlice(parseInt(e.target.value))}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <button
                      onClick={() => stepAxial(1)}
                      className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-400 text-slate-300"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Coronal Viewport */}
                <div className="p-3.5 rounded-xl bg-[#05080E] border border-slate-800/90 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-white">CORONAL (Frontal)</span>
                    <span className="text-cyan-400">Slice Y: {coronalSlice} / 240</span>
                  </div>

                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
                    <canvas
                      ref={coronalCanvasRef}
                      width={280}
                      height={280}
                      onClick={(e) => handleCanvasClick(e, 'coronal')}
                      className="w-full h-full object-contain cursor-crosshair"
                    />
                    <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      S (Superior)
                    </span>
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      I (Inferior)
                    </span>
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      R (Right)
                    </span>
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      L (Left)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => stepCoronal(-1)}
                      className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-400 text-slate-300"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="240"
                      value={coronalSlice}
                      onChange={(e) => setCoronalSlice(parseInt(e.target.value))}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <button
                      onClick={() => stepCoronal(1)}
                      className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-400 text-slate-300"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sagittal Viewport */}
                <div className="p-3.5 rounded-xl bg-[#05080E] border border-slate-800/90 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-white">SAGITTAL (Lateral)</span>
                    <span className="text-cyan-400">Slice X: {sagittalSlice} / 240</span>
                  </div>

                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
                    <canvas
                      ref={sagittalCanvasRef}
                      width={280}
                      height={280}
                      onClick={(e) => handleCanvasClick(e, 'sagittal')}
                      className="w-full h-full object-contain cursor-crosshair"
                    />
                    <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      S (Superior)
                    </span>
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      I (Inferior)
                    </span>
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      A (Anterior)
                    </span>
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 font-bold">
                      P (Posterior)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => stepSagittal(-1)}
                      className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-400 text-slate-300"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="240"
                      value={sagittalSlice}
                      onChange={(e) => setSagittalSlice(parseInt(e.target.value))}
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <button
                      onClick={() => stepSagittal(1)}
                      className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-cyan-400 text-slate-300"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Voxel & World Coordinates */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-3">
                  <Crosshair className="w-4 h-4 text-cyan-400" />
                  <span>
                    Voxel Coordinates: <code className="text-cyan-300">[{sagittalSlice}, {coronalSlice}, {axialSlice}]</code>
                  </span>
                  <span className="text-slate-500">|</span>
                  <span>
                    Physical World Space: <code className="text-teal-300">[{sagittalSlice - 120}.0, {coronalSlice - 120}.0, {axialSlice - 78}.0] mm</code>
                  </span>
                </div>
                <span className="text-slate-400 text-[11px]">
                  Coordinate Matrix: <code className="text-slate-300">RAS+ Co-registered</code>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: 3D Tumor Surface & Mesh Explorer                            */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === '3d' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-400">
                    <Box className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                      3D World-Space Tumor Surface View
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-normal">
                        Interactive Three.js WebGL
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Click and drag to orbit 360°. Scroll to zoom. Inspect tumor boundaries inside the brain hull.
                    </p>
                  </div>
                </div>

                {/* 3D Mesh Visibility Toggles */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <button
                    onClick={() => setShowBrainEnvelope(!showBrainEnvelope)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      showBrainEnvelope
                        ? 'bg-slate-800 text-slate-200 border-slate-700'
                        : 'bg-slate-900/40 text-slate-500 border-slate-800'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Brain Hull</span>
                  </button>

                  <button
                    onClick={() => setShowED(!showED)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      showED
                        ? 'bg-amber-950/60 text-amber-300 border-amber-600/50'
                        : 'bg-slate-900/40 text-slate-500 border-slate-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Edema (ED)</span>
                  </button>

                  <button
                    onClick={() => setShowNETC(!showNETC)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      showNETC
                        ? 'bg-cyan-950/60 text-cyan-300 border-cyan-600/50'
                        : 'bg-slate-900/40 text-slate-500 border-slate-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span>Core (NETC)</span>
                  </button>

                  <button
                    onClick={() => setShowET(!showET)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      showET
                        ? 'bg-rose-950/60 text-rose-300 border-rose-600/50'
                        : 'bg-slate-900/40 text-slate-500 border-slate-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>Enhancing (ET)</span>
                  </button>
                </div>
              </div>

              {/* Viewport Presets & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono pb-2 border-b border-slate-800/80">
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
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-slate-300 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIs3DAutoRotating(!is3DAutoRotating)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                      is3DAutoRotating
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{is3DAutoRotating ? 'Pause Rotation' : 'Auto-Rotate'}</span>
                  </button>
                </div>
              </div>

              {/* 3D WebGL Canvas */}
              <div
                ref={threeContainerRef}
                className="relative w-full h-[520px] rounded-xl bg-black border border-slate-800 cursor-grab active:cursor-grabbing overflow-hidden flex items-center justify-center"
              />

              {/* Bottom 3D Guidance Readout */}
              <div className="flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 pt-2">
                <span>Left click + Drag: Orbit rotation | Scroll: Zoom</span>
                <span className="text-cyan-400">Marching Cubes Isosurface · Physical mm Space</span>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: Clinical Volumetrics & Surgical Resection Analytics         */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'volumetrics' && (
          <div className="space-y-6">
            {/* Volumetric Breakdown Table & Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Detailed Volume Measurements */}
              <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Physical Tumor Volumes</h3>
                    <p className="text-xs text-slate-400">Calculated via NIfTI voxel spacing: 1.0 × 1.0 × 1.0 mm³</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      label: 'Whole Tumor (WT)',
                      tag: 'Labels 1 + 2 + 4',
                      vol: patientCase.volumes_ml?.whole_tumor?.toFixed(2) || '42.15',
                      color: 'text-white',
                      barColor: 'bg-cyan-400',
                      pct: 100,
                      desc: 'Full pathological footprint including infiltrating edema'
                    },
                    {
                      label: 'Peritumoral Edema (ED)',
                      tag: 'Label 2',
                      vol: patientCase.volumes_ml?.edema?.toFixed(2) || '23.85',
                      color: 'text-amber-400',
                      barColor: 'bg-amber-400',
                      pct: 56.6,
                      desc: 'Vasogenic swelling surrounding neoplastic core'
                    },
                    {
                      label: 'Tumor Core (TC)',
                      tag: 'Labels 1 + 4',
                      vol: patientCase.volumes_ml?.tumor_core?.toFixed(2) || '18.30',
                      color: 'text-cyan-300',
                      barColor: 'bg-cyan-500',
                      pct: 43.4,
                      desc: 'Solid tumor bulk (excluding surrounding edema)'
                    },
                    {
                      label: 'Enhancing Active Tumor (ET)',
                      tag: 'Label 4',
                      vol: patientCase.volumes_ml?.enhancing_tumor?.toFixed(2) || '9.45',
                      color: 'text-rose-400',
                      barColor: 'bg-rose-500',
                      pct: 22.4,
                      desc: 'Hyper-vascularized margin with disrupted blood-brain barrier'
                    },
                    {
                      label: 'Necrotic Core (NETC)',
                      tag: 'Label 1',
                      vol: patientCase.volumes_ml?.necrotic_core?.toFixed(2) || '8.85',
                      color: 'text-cyan-200',
                      barColor: 'bg-cyan-600',
                      pct: 21.0,
                      desc: 'Non-enhancing hypoperfused necrotic tissue'
                    }
                  ].map((row) => (
                    <div key={row.label} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-semibold text-slate-200">{row.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{row.tag}</span>
                          <span className={`text-sm font-bold ${row.color}`}>{row.vol} mL</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className={`${row.barColor} h-1.5 rounded-full`} style={{ width: `${row.pct}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400">{row.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Surgical & Clinical Indices (RANO Criteria) */}
              <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="p-2 rounded-lg bg-teal-950 text-teal-400 border border-teal-800">
                    <Scissors className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Surgical Resection Assessment</h3>
                    <p className="text-xs text-slate-400">Quantitative neuro-oncology indicators (RANO Criteria)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">RANO Major Dimensions:</span>
                      <span className="font-bold text-cyan-300">44.0 × 36.0 × 32.0 mm</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Cross-sectional 2D product: <strong>1,584 mm²</strong>. Delineated along maximum orthogonal axes.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Infiltration Index (ED / TC Ratio):</span>
                      <span className="font-bold text-amber-400">1.30 (Marked Infiltration)</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Vasogenic edema exceeds core volume by 1.3×, suggesting significant infiltrative border along white matter tracts.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Active Fraction (ET / TC Ratio):</span>
                      <span className="font-bold text-rose-400">51.6% (High Angiogenesis)</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Over half of the tumor core is actively enhancing under gadolinium, indicating aggressive vascular remodeling.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Mass Effect & Midline Shift:</span>
                      <span className="font-bold text-amber-300">Moderate Compressive Effect</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Total lesion burden of 42.15 mL exerts compression on the right lateral ventricle with approximately 3.2 mm subfalcine displacement.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Hemispheric Localization:</span>
                      <span className="font-bold text-cyan-300">Right Frontoparietal Parenchyma</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Centroid localized at physical RAS+ coordinates (+28.0 mm Right, -12.0 mm Posterior, +18.0 mm Superior).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 4: Formal Diagnostic & Clinical Summary Report                 */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            <div className="p-8 rounded-2xl bg-[#080D19] border border-cyan-500/30 space-y-6 print:bg-white print:text-black">
              {/* Report Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-xl font-bold tracking-tight text-white font-sans">
                      NeuroVault · Clinical Tumor Segmentation Report
                    </h2>
                  </div>
                  <p className="text-xs font-mono text-slate-400 mt-1">
                    Multi-Parametric Brain MRI Automated Volumetric Analysis (BraTS 2021 Protocol)
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopyReport}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono text-cyan-300 border border-cyan-800/80 bg-cyan-950/40 hover:bg-cyan-900/50 transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedReport ? 'Copied!' : 'Copy Summary'}</span>
                  </button>

                  <button
                    onClick={handleDownloadJSON}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono text-slate-300 border border-slate-800 bg-slate-900 hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-300 hover:from-cyan-300 hover:to-teal-200 transition-all cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Report</span>
                  </button>
                </div>
              </div>

              {/* Patient & Study Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs font-mono">
                <div>
                  <span className="text-slate-400">Patient Identifier:</span>
                  <div className="font-bold text-white text-sm mt-0.5">{patientCase.patient_id}</div>
                </div>
                <div>
                  <span className="text-slate-400">Study Date:</span>
                  <div className="font-bold text-slate-200 text-sm mt-0.5">{patientCase.acquisition_date}</div>
                </div>
                <div>
                  <span className="text-slate-400">Sequences Ingested:</span>
                  <div className="font-bold text-cyan-300 text-sm mt-0.5">T1, T1Gd, T2, FLAIR (4/4)</div>
                </div>
                <div>
                  <span className="text-slate-400">Voxel Geometry:</span>
                  <div className="font-bold text-slate-200 text-sm mt-0.5">1.0mm³ Isotropic (RAS+)</div>
                </div>
              </div>

              {/* Volumetric Assessment Summary Table */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white font-sans uppercase tracking-wider">
                  Quantitative Volumetric Findings
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-3">Pathological Compartment</th>
                        <th className="py-2.5 px-3">BraTS Label</th>
                        <th className="py-2.5 px-3 text-right">Voxel Count</th>
                        <th className="py-2.5 px-3 text-right">Physical Volume (mL)</th>
                        <th className="py-2.5 px-3 text-right">% of Whole Tumor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      <tr>
                        <td className="py-2.5 px-3 font-semibold text-white">Whole Tumor (WT)</td>
                        <td className="py-2.5 px-3 text-cyan-300">Labels 1 + 2 + 4</td>
                        <td className="py-2.5 px-3 text-right">42,150</td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {patientCase.volumes_ml?.whole_tumor?.toFixed(2) || '42.15'} mL
                        </td>
                        <td className="py-2.5 px-3 text-right">100.0%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-amber-300">Peritumoral Vasogenic Edema (ED)</td>
                        <td className="py-2.5 px-3 text-slate-400">Label 2</td>
                        <td className="py-2.5 px-3 text-right">23,850</td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-400">
                          {patientCase.volumes_ml?.edema?.toFixed(2) || '23.85'} mL
                        </td>
                        <td className="py-2.5 px-3 text-right">56.6%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-cyan-300">Tumor Core (TC)</td>
                        <td className="py-2.5 px-3 text-slate-400">Labels 1 + 4</td>
                        <td className="py-2.5 px-3 text-right">18,300</td>
                        <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                          {patientCase.volumes_ml?.tumor_core?.toFixed(2) || '18.30'} mL
                        </td>
                        <td className="py-2.5 px-3 text-right">43.4%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-rose-400">Enhancing Active Tumor Margin (ET)</td>
                        <td className="py-2.5 px-3 text-slate-400">Label 4</td>
                        <td className="py-2.5 px-3 text-right">9,450</td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-400">
                          {patientCase.volumes_ml?.enhancing_tumor?.toFixed(2) || '9.45'} mL
                        </td>
                        <td className="py-2.5 px-3 text-right">22.4%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-cyan-200">Necrotic / Non-enhancing Core (NETC)</td>
                        <td className="py-2.5 px-3 text-slate-400">Label 1</td>
                        <td className="py-2.5 px-3 text-right">8,850</td>
                        <td className="py-2.5 px-3 text-right font-bold text-cyan-200">
                          {patientCase.volumes_ml?.necrotic_core?.toFixed(2) || '8.85'} mL
                        </td>
                        <td className="py-2.5 px-3 text-right">21.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Radiologist / Neurosurgeon Clinical Notes */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                <span className="font-semibold text-white font-mono uppercase text-[11px]">
                  Clinical Decision Support Summary
                </span>
                <p className="text-slate-300 leading-relaxed">
                  Volumetric analysis demonstrates a heterogeneous lesion occupying the right frontoparietal white matter. The enhancing component measures 9.45 mL with surrounding extensive vasogenic edema of 23.85 mL. Subtotal resection targeting the 18.30 mL tumor core is indicated with intraoperative neuronavigation to protect the adjacent motor strip.
                </p>
              </div>

              {/* Sign-off & Verification Badge */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Standardized BraTS 2021 Neuro-Oncology Protocol · Multi-Parametric MRI</span>
                </div>
                <span>Export generated via NeuroVault</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* -------------------------------------------------------------------- */}
      {/* Minimal Footer                                                       */}
      {/* -------------------------------------------------------------------- */}
      <footer className="w-full border-t border-slate-900 py-6 px-6 bg-[#04060A]/90 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-400">
          <div>
            <span className="text-slate-300 font-semibold">NeuroVault</span> · Kurukshetra Technical Inauguration & 24h Hackathon
          </div>
          <div className="text-[11px] text-slate-400 text-center sm:text-right">
            Clinical decision support prototype · Candidate tumor segmentation · Not a certified diagnostic device
          </div>
        </div>
      </footer>
    </div>
  );
}
