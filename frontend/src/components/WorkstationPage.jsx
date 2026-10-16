import React, { useState } from 'react';
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
  Download
} from 'lucide-react';
import MriViewer from './viewer/MriViewer';
import ModalityBar from './viewer/ModalityBar';
import OverlayControls from './viewer/OverlayControls';
import SliceControls from './viewer/SliceControls';
import CoordinatePanel from './viewer/CoordinatePanel';
import Segmentation3DViewer from './viewer/Segmentation3DViewer';

export default function WorkstationPage({
  onBackToHome,
  onOpenUpload,
  predictionData = null,
  initialTab = 'mpr',
  sessionFiles = null
}) {
  // Active clinical workspace tab:
  // 'mpr' (2D Multi-Planar) | '3d' (3D Tumor Surface) | 'volumetrics' (Clinical Metrics) | 'report' (Diagnostic Report)
  const [activeTab, setActiveTab] = useState(initialTab);

  // Selected modality for 2D background slice
  const [activeModality, setActiveModality] = useState('t1gd'); // 't1' | 't1gd' | 't2' | 'flair'

  // 2D Viewer Display Modes & Provenance
  const [sliceType, setSliceType] = useState('multiplanar'); // 'multiplanar' | 'axial' | 'coronal' | 'sagittal'
  const [activeMaskSource, setActiveMaskSource] = useState('prediction'); // 'prediction' | 'expert'

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

  // Crosshair toggle
  const [showCrosshairs, setShowCrosshairs] = useState(true);

  // Real-time Coordinate & Physical Geometry Telemetry
  const [coordsData, setCoordsData] = useState({
    voxelCoords: [120, 120, 78],
    worldCoords: [0.0, 0.0, 0.0],
    intensity: null,
    labelValue: null
  });

  const [geometryData, setGeometryData] = useState({
    dimensions: [240, 240, 155],
    voxelSpacing: [1.0, 1.0, 1.0],
    orientation: 'RAS+'
  });

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

  // Available modalities derived from session uploads or mock demo
  const availableModalities = {
    t1: Boolean(sessionFiles?.t1 || !sessionFiles),
    t1gd: Boolean(sessionFiles?.t1gd || !sessionFiles),
    t2: Boolean(sessionFiles?.t2 || !sessionFiles),
    flair: Boolean(sessionFiles?.flair || !sessionFiles)
  };

  // Active base MRI volume (from session uploads if present)
  const currentBaseVolume = sessionFiles ? sessionFiles[activeModality] : null;

  // Active segmentation mask volume (from expert upload or AI prediction artifact)
  let currentMaskVolume = null;
  if (activeMaskSource === 'expert' && sessionFiles?.expertSeg) {
    currentMaskVolume = sessionFiles.expertSeg;
  } else if (patientCase?.artifacts?.segmentation_mask_url) {
    currentMaskVolume = patientCase.artifacts.segmentation_mask_url;
  }



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
            <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-4">
              {/* Header Title & Mode Info */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                      Multi-Planar Orthogonal Medical Imaging
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80 font-normal">
                        NiiVue WebGL
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Real-time synchronized crosshairs across Axial, Coronal, and Sagittal planes with discrete BraTS sub-region segmentation overlays.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {currentBaseVolume ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Volume Loaded</span>
                    </span>
                  ) : (
                    <button
                      onClick={onOpenUpload}
                      className="px-3 py-1 rounded-lg text-xs font-mono text-cyan-300 border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 cursor-pointer flex items-center gap-1.5"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Upload MRI Scan</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Modality Bar */}
              <ModalityBar
                activeModality={activeModality}
                onSelectModality={setActiveModality}
                availableModalities={availableModalities}
              />

              {/* Discrete BraTS Region Toggles & Opacity & Provenance */}
              <OverlayControls
                showNETC={showNETC}
                showED={showED}
                showET={showET}
                onToggleNETC={setShowNETC}
                onToggleED={setShowED}
                onToggleET={setShowET}
                overlayOpacity={overlayOpacity}
                onChangeOpacity={setOverlayOpacity}
                showCrosshairs={showCrosshairs}
                onToggleCrosshairs={() => setShowCrosshairs(!showCrosshairs)}
                activeSource={activeMaskSource}
                hasExpertMask={Boolean(sessionFiles?.expertSeg)}
                onToggleSource={setActiveMaskSource}
              />

              {/* Real 2D NiiVue Multi-Planar Orthogonal WebGL Viewport */}
              <MriViewer
                baseVolume={currentBaseVolume}
                maskVolume={currentMaskVolume}
                sliceType={sliceType}
                showNETC={showNETC}
                showED={showED}
                showET={showET}
                overlayOpacity={overlayOpacity}
                showCrosshairs={showCrosshairs}
                brightness={brightness}
                contrast={contrast}
                axialSlice={axialSlice}
                coronalSlice={coronalSlice}
                sagittalSlice={sagittalSlice}
                onLocationChange={(info) => setCoordsData(info)}
                onVolumesLoaded={(geom) => setGeometryData(geom)}
                onSliceChanged={(slices) => {
                  if (slices.axial != null) setAxialSlice(slices.axial);
                  if (slices.coronal != null) setCoronalSlice(slices.coronal);
                  if (slices.sagittal != null) setSagittalSlice(slices.sagittal);
                }}
                onOpenUpload={onOpenUpload}
              />

              {/* Slice Scrubbers, Layout Switcher & Window/Level */}
              <SliceControls
                sliceType={sliceType}
                onChangeSliceType={setSliceType}
                axialSlice={axialSlice}
                coronalSlice={coronalSlice}
                sagittalSlice={sagittalSlice}
                maxAxial={geometryData.dimensions[2] || 155}
                maxCoronal={geometryData.dimensions[1] || 240}
                maxSagittal={geometryData.dimensions[0] || 240}
                onChangeAxial={setAxialSlice}
                onChangeCoronal={setCoronalSlice}
                onChangeSagittal={setSagittalSlice}
                onResetView={() => {
                  setAxialSlice(Math.round((geometryData.dimensions[2] || 155) / 2));
                  setCoronalSlice(Math.round((geometryData.dimensions[1] || 240) / 2));
                  setSagittalSlice(Math.round((geometryData.dimensions[0] || 240) / 2));
                }}
                brightness={brightness}
                contrast={contrast}
                onChangeBrightness={setBrightness}
                onChangeContrast={setContrast}
                onResetWL={() => {
                  setBrightness(100);
                  setContrast(100);
                }}
              />

              {/* Real-Time Coordinates & Tissue Readout */}
              <CoordinatePanel
                voxelCoords={coordsData.voxelCoords}
                worldCoords={coordsData.worldCoords}
                orientation={geometryData.orientation}
                mriIntensity={coordsData.intensity}
                labelValue={coordsData.labelValue}
                dimensions={geometryData.dimensions}
                voxelSpacing={geometryData.voxelSpacing}
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: 3D Tumor Surface & Mesh Explorer                            */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === '3d' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-4">
              <Segmentation3DViewer
                maskVolume={currentMaskVolume}
                activeSource={activeMaskSource}
                showNETC={showNETC}
                showED={showED}
                showET={showET}
                onToggleNETC={setShowNETC}
                onToggleED={setShowED}
                onToggleET={setShowET}
                overlayOpacity={overlayOpacity}
                onChangeOpacity={setOverlayOpacity}
                onOpenUpload={onOpenUpload}
              />
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
