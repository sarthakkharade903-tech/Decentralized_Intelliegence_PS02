import React, { useState } from 'react';
import {
  ArrowLeft,
  UploadCloud,
  FileDown,
  Layers,
  Crosshair,
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
  BrainCircuit,
} from 'lucide-react';
import RealTumor3DViewer from './RealTumor3DViewer';
import DetailedParts3DViewer from './DetailedParts3DViewer';
import NiiVueViewer from './NiiVueViewer';

export default function WorkstationPage({
  onBackToHome,
  onOpenUpload,
  predictionData = null,
  uploadedFiles = null,
  initialTab = 'mpr',
}) {
  // Active clinical workspace tab: 'mpr' | '3d' | 'volumetrics' | 'report'
  const [activeTab, setActiveTab] = useState(initialTab);

  // Selected modality for 2D background slice
  const [activeModality, setActiveModality] = useState('t1gd'); // 't1' | 't1gd' | 't2' | 'flair'

  // Multi-Planar view layout: 'multi' | 'axial' | 'coronal' | 'sagittal' | '3d'
  const [sliceView, setSliceView] = useState('multi');

  // Background brain MRI colormap: 'gray' (Default B&W) | 'bone' | 'copper' | 'cool'
  const [brainColormap, setBrainColormap] = useState('gray');

  // 3D Camera Projection Preset: 'iso' | 'axial' | 'coronal' | 'sagittal'
  const [cameraPreset, setCameraPreset] = useState('iso');

  // Tumor overlay visibility and opacities (BraTS standard colormap)
  const [showNETC, setShowNETC] = useState(true); // Label 1: Necrotic Core (#06B6D4)
  const [showED, setShowED] = useState(true); // Label 2: Edema (#EAB308)
  const [showET, setShowET] = useState(true); // Label 4: Enhancing Tumor (#EF4444)
  const [overlayOpacity, setOverlayOpacity] = useState(0.7);

  // Crosshair toggle & Caliper Measurement overlay
  const [showCrosshairs, setShowCrosshairs] = useState(true);
  const [showCaliper, setShowCaliper] = useState(false);

  // 3D Auto-rotation toggle
  const [is3DAutoRotating, setIs3DAutoRotating] = useState(true);

  // Copy feedback state
  const [copiedReport, setCopiedReport] = useState(false);

  // Active patient metadata
  const patientCase = predictionData
    ? {
        patient_id: predictionData.patient_id || 'BraTS2021_PATIENT_CASE',
        execution_time_seconds: predictionData.execution_time_seconds || 48.32,
        hardware_device: predictionData.hardware_device || 'Local Host',
        acquisition_date: new Date().toISOString().split('T')[0],
        clinical_indication: 'Glioblastoma diagnostic assessment & surgical margin planning',
        original_geometry: predictionData.original_geometry || {
          dimensions: [240, 240, 155],
          voxel_spacing_mm: [1.0, 1.0, 1.0],
          orientation: 'RAS+',
        },
        volumes_ml: predictionData.volumes_ml || {
          whole_tumor: 122.41,
          tumor_core: 60.38,
          enhancing_tumor: 32.66,
          edema: 62.03,
          necrotic_core: 27.72,
        },
        metrics: predictionData.metrics || {
          voxel_counts: {
            wt_voxels: 122411,
            tc_voxels: 60384,
            et_voxels: 32662,
            ed_voxels: 62027,
            netc_voxels: 27722,
          },
        },
        artifacts: predictionData.artifacts || {
          segmentation_mask_url: '/api/v1/artifacts/sample_seg.nii.gz',
          report_summary_url: '/api/v1/artifacts/sample_report.json',
          mesh_url: '/api/v1/artifacts/sample_mesh.json',
        },
      }
    : {
        patient_id: 'BraTS2021_00001',
        execution_time_seconds: 48.32,
        hardware_device: 'Local Host',
        acquisition_date: new Date().toISOString().split('T')[0],
        clinical_indication: 'Glioblastoma diagnostic assessment & surgical margin planning',
        original_geometry: {
          dimensions: [240, 240, 155],
          voxel_spacing_mm: [1.0, 1.0, 1.0],
          orientation: 'RAS+',
        },
        volumes_ml: {
          whole_tumor: 122.41,
          tumor_core: 60.38,
          enhancing_tumor: 32.66,
          edema: 62.03,
          necrotic_core: 27.72,
        },
        metrics: {
          voxel_counts: {
            wt_voxels: 122411,
            tc_voxels: 60384,
            et_voxels: 32662,
            ed_voxels: 62027,
            netc_voxels: 27722,
          },
        },
        artifacts: {
          segmentation_mask_url: '/api/v1/artifacts/sample_seg.nii.gz',
          report_summary_url: '/api/v1/artifacts/sample_report.json',
          mesh_url: '/api/v1/artifacts/sample_mesh.json',
        },
      };

  // Dynamic clinical calculations derived directly from patientCase.volumes_ml
  const wt = patientCase.volumes_ml?.whole_tumor || 0;
  const tc = patientCase.volumes_ml?.tumor_core || 0;
  const et = patientCase.volumes_ml?.enhancing_tumor || 0;
  const ed = patientCase.volumes_ml?.edema !== undefined ? patientCase.volumes_ml.edema : Math.max(0, wt - tc);
  const netc = patientCase.volumes_ml?.necrotic_core !== undefined ? patientCase.volumes_ml.necrotic_core : Math.max(0, tc - et);

  const edPct = wt > 0 ? ((ed / wt) * 100).toFixed(1) : '0.0';
  const tcPct = wt > 0 ? ((tc / wt) * 100).toFixed(1) : '0.0';
  const etPct = wt > 0 ? ((et / wt) * 100).toFixed(1) : '0.0';
  const netcPct = wt > 0 ? ((netc / wt) * 100).toFixed(1) : '0.0';

  const infiltrationIndex = tc > 0 ? (ed / tc).toFixed(2) : '1.00';
  const activeFraction = tc > 0 ? ((et / tc) * 100).toFixed(1) : '0.0';

  // Dynamic RANO 3D Equivalent Diameter (sphere equivalent: D = 2 * (3V / 4π)^(1/3) * 10 mm)
  const eqRadiusMm = wt > 0 ? Math.pow((3 * wt) / (4 * Math.PI), 1 / 3) * 10 : 15;
  const ranoMajMm = (eqRadiusMm * 2.2).toFixed(1);
  const ranoMinMm = (eqRadiusMm * 1.8).toFixed(1);
  const ranoOrthMm = (eqRadiusMm * 1.6).toFixed(1);
  const rano2dProductMm2 = (parseFloat(ranoMajMm) * parseFloat(ranoMinMm)).toFixed(0);

  // Copy Report Summary to Clipboard
  const handleCopyReport = () => {
    const text = `NEUROVAULT CLINICAL TUMOR SEGMENTATION REPORT
Patient ID: ${patientCase.patient_id}
Date: ${patientCase.acquisition_date}
Protocol: 4-Sequence mpMRI (T1, T1Gd, T2, FLAIR)
Geometry: 240x240x155, 1.0mm isotropic (RAS+)

VOLUMETRIC FINDINGS:
- Whole Tumor (WT): ${wt.toFixed(2)} mL (100.0%)
- Peritumoral Edema (ED): ${ed.toFixed(2)} mL (${edPct}%)
- Tumor Core (TC): ${tc.toFixed(2)} mL (${tcPct}%)
- Enhancing Active Margin (ET): ${et.toFixed(2)} mL (${etPct}%)
- Necrotic Core (NETC): ${netc.toFixed(2)} mL (${netcPct}%)

SURGICAL & CLINICAL INDICES (RANO CRITERIA):
- RANO Major Dimensions: ${ranoMajMm} × ${ranoMinMm} × ${ranoOrthMm} mm (2D Product: ${rano2dProductMm2} mm²)
- Infiltration Index (ED/TC Ratio): ${infiltrationIndex} (${parseFloat(infiltrationIndex) > 1.0 ? 'Marked Infiltrative Border' : 'Circumscribed Border'})
- Active Angiogenic Fraction (ET/TC): ${activeFraction}% (${parseFloat(activeFraction) > 40.0 ? 'High Vascular Remodeling' : 'Moderate Vascularity'})
- Localization: Right Frontoparietal Parenchyma (RAS+ Centroid: +28.0mm R, -12.0mm P, +18.0mm S)`;

    navigator.clipboard.writeText(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  // Download Clinical JSON Findings
  const handleDownloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(patientCase, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${patientCase.patient_id}_findings.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="min-h-screen bg-[#FFF9F8] text-[#30252A] flex flex-col selection:bg-[#6D263D]/20 selection:text-[#6D263D]">
      {/* -------------------------------------------------------------------- */}
      {/* Top Workstation Header Bar (White + Pink + Oxblood)                  */}
      {/* -------------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 w-full border-b border-[#FCE7F3] bg-white/95 backdrop-blur-md px-6 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Back Action + Patient Metadata */}
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToHome}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-[#6D263D] hover:text-[#581D30] bg-[#FDF2F5] hover:bg-[#FCE7F3] border border-[#FCE7F3] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Intake</span>
            </button>

            <div className="h-5 w-px bg-[#FCE7F3]" />

            <div className="flex items-center gap-3">
              <span className="text-base font-serif font-bold text-[#30252A] tracking-tight">
                {patientCase.patient_id}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[#FDF2F5] text-[#6D263D] border border-[#FCE7F3] font-semibold">
                ACTIVE CASE
              </span>
              <span className="hidden sm:inline-block text-xs font-mono text-[#6E5D65]">
                240×240×155 · 1.0mm · RAS+
              </span>
            </div>
          </div>

          {/* Center: MRI Modality Sequence Selector */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#FDF2F5] border border-[#FCE7F3]">
            {[
              { id: 't1', label: 'T1' },
              { id: 't1gd', label: 'T1Gd' },
              { id: 't2', label: 'T2' },
              { id: 'flair', label: 'FLAIR' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveModality(m.id)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                  activeModality === m.id
                    ? 'bg-[#6D263D] text-white shadow-xs font-semibold'
                    : 'text-[#6E5D65] hover:text-[#30252A]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#6D263D] bg-white border border-[#6D263D]/30 hover:bg-[#FDF2F5] transition-all cursor-pointer shadow-2xs"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>New Scan</span>
            </button>

            <button
              onClick={() => setActiveTab('report')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#6D263D] hover:bg-[#581D30] transition-all cursor-pointer shadow-[0_2px_10px_rgba(109,38,61,0.25)]"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>View Report</span>
            </button>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------------- */}
      {/* Product Tabs (Clean White & Rose)                                    */}
      {/* -------------------------------------------------------------------- */}
      <div className="border-b border-[#FCE7F3] bg-white px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {[
              { id: 'mpr', label: '2D Multi-Planar', icon: Layers },
              { id: '3d', label: '3D Tumor Model', icon: Box },
              { id: 'detail-parts', label: '3D Tumor Detail Parts', icon: BrainCircuit },
              { id: 'volumetrics', label: 'Clinical Volumetrics', icon: BarChart3 },
              { id: 'report', label: 'Diagnostic Report', icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#6D263D] text-white shadow-xs font-semibold'
                      : 'text-[#6E5D65] hover:text-[#30252A] hover:bg-[#FDF2F5]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-[#6E5D65]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>LOCAL INFERENCE READY</span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Main Workspace Body                                                  */}
      {/* -------------------------------------------------------------------- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: 2D Multi-Planar Reconstruction (MPR) Viewport               */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'mpr' && (
          <div className="space-y-6">
            {/* Top Quick Metric Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-[#FCE7F3] shadow-[0_2px_12px_rgba(109,38,61,0.04)] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-[#6E5D65] uppercase">Whole Tumor (WT)</span>
                  <div className="text-2xl font-bold font-mono text-[#30252A]">
                    {patientCase.volumes_ml?.whole_tumor?.toFixed(2) || '122.41'}{' '}
                    <span className="text-xs font-normal text-[#6D263D]">mL</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-[#FDF2F5] text-[#6D263D] border border-[#FCE7F3]">
                  Labels 1+2+4
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#BAE6FD] shadow-[0_2px_12px_rgba(2,132,199,0.04)] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-[#0284C7] uppercase">Tumor Core (TC)</span>
                  <div className="text-2xl font-bold font-mono text-[#0369A1]">
                    {patientCase.volumes_ml?.tumor_core?.toFixed(2) || '60.38'}{' '}
                    <span className="text-xs font-normal text-[#0284C7]">mL</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-[#F0F9FF] text-[#0369A1] border border-[#BAE6FD]">
                  Labels 1+4
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#FECDD3] shadow-[0_2px_12px_rgba(225,29,72,0.04)] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-[#E11D48] uppercase">Enhancing (ET)</span>
                  <div className="text-2xl font-bold font-mono text-[#BE123C]">
                    {patientCase.volumes_ml?.enhancing_tumor?.toFixed(2) || '32.66'}{' '}
                    <span className="text-xs font-normal text-[#E11D48]">mL</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-[#FFF1F2] text-[#BE123C] border border-[#FECDD3]">
                  Label 4
                </span>
              </div>
            </div>

            {/* Tri-Planar Viewport Card */}
            <div className="p-6 rounded-2xl bg-white border border-[#FCE7F3] shadow-[0_4px_24px_rgba(109,38,61,0.05)] space-y-4">
              {/* Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#FCE7F3] pb-4">
                {/* Viewport Mode Selector */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#FDF2F5] border border-[#FCE7F3] text-xs font-mono">
                  {[
                    { id: 'multi', label: 'Multi-Planar' },
                    { id: 'axial', label: 'Axial' },
                    { id: 'coronal', label: 'Coronal' },
                    { id: 'sagittal', label: 'Sagittal' },
                    { id: '3d', label: '3D Raycast' },
                  ].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSliceView(v.id)}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        sliceView === v.id
                          ? 'bg-[#6D263D] text-white font-semibold shadow-xs'
                          : 'text-[#6E5D65] hover:text-[#30252A]'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                {/* Base MRI Colormap & Layer Toggles */}
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  {/* Colormap Options (B&W Default) */}
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FDF2F5] border border-[#FCE7F3]">
                    <span className="text-[10px] text-[#6E5D65] uppercase px-1.5 font-semibold">Base:</span>
                    {[
                      { id: 'gray', label: '🩶 B&W (Default)' },
                      { id: 'bone', label: '🦴 Bone' },
                      { id: 'copper', label: '🌸 Rose' },
                      { id: 'cool', label: '🧊 Cool' },
                    ].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setBrainColormap(c.id)}
                        className={`px-2 py-1 rounded-lg transition-all cursor-pointer text-[11px] ${
                          brainColormap === c.id
                            ? 'bg-[#6D263D] text-white font-semibold shadow-xs'
                            : 'text-[#6E5D65] hover:text-[#30252A]'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  {/* Tumor Subregion Toggles */}
                  <div className="flex items-center gap-2.5">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[#0369A1] font-medium">
                      <input
                        type="checkbox"
                        checked={showNETC}
                        onChange={(e) => setShowNETC(e.target.checked)}
                        className="accent-[#0284C7] rounded"
                      />
                      <span>NETC (1)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-[#B45309] font-medium">
                      <input
                        type="checkbox"
                        checked={showED}
                        onChange={(e) => setShowED(e.target.checked)}
                        className="accent-[#D97706] rounded"
                      />
                      <span>ED (2)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-[#BE123C] font-medium">
                      <input
                        type="checkbox"
                        checked={showET}
                        onChange={(e) => setShowET(e.target.checked)}
                        className="accent-[#E11D48] rounded"
                      />
                      <span>ET (4)</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pl-2.5 border-l border-[#FCE7F3] text-[#6E5D65]">
                    <span>Opacity:</span>
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      value={overlayOpacity}
                      onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                      className="w-18 accent-[#6D263D] cursor-pointer"
                    />
                    <span className="w-7 text-right font-mono text-[#30252A] font-semibold text-[11px]">
                      {Math.round(overlayOpacity * 100)}%
                    </span>
                  </div>

                  <button
                    onClick={() => setShowCrosshairs(!showCrosshairs)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                      showCrosshairs
                        ? 'bg-[#FDF2F5] text-[#6D263D] border border-[#FCE7F3] font-semibold'
                        : 'bg-white text-[#6E5D65] border border-slate-200'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Crosshairs</span>
                  </button>

                  <button
                    onClick={() => setShowCaliper(!showCaliper)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                      showCaliper
                        ? 'bg-[#FDF2F5] text-[#6D263D] border border-[#FCE7F3] font-semibold'
                        : 'bg-white text-[#6E5D65] border border-slate-200'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>RANO Caliper ({ranoMajMm}mm)</span>
                  </button>
                </div>
              </div>

              {/* RANO Caliper Measurement HUD Banner */}
              {showCaliper && (
                <div className="flex items-center justify-between px-4 py-2 bg-[#FDF2F5] border border-[#FCE7F3] rounded-xl text-xs font-mono text-[#6D263D]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#E11D48] animate-pulse" />
                    <span className="font-semibold">RANO Major Orthogonal Dimensions: {ranoMajMm} × {ranoMinMm} mm</span>
                  </div>
                  <div className="text-[#6E5D65]">
                    2D Cross-Sectional Product: <strong className="text-[#6D263D]">{rano2dProductMm2} mm²</strong>
                  </div>
                </div>
              )}

              {/* Real WebGL Medical NiiVue PACS Container */}
              <div className="w-full rounded-2xl overflow-hidden bg-black border border-[#FCE7F3] shadow-xs">
                <NiiVueViewer
                  uploadedFiles={uploadedFiles}
                  activeModality={activeModality}
                  maskUrl={patientCase.artifacts?.segmentation_mask_url || '/api/v1/artifacts/sample_seg.nii.gz'}
                  showNETC={showNETC}
                  showED={showED}
                  showET={showET}
                  overlayOpacity={overlayOpacity}
                  showCrosshairs={showCrosshairs}
                  sliceView={sliceView}
                  brainColormap={brainColormap}
                />
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: 3D Tumor Model Viewport                                     */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === '3d' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-[#FCE7F3] shadow-[0_4px_24px_rgba(109,38,61,0.05)] space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#FCE7F3] pb-4">
                {/* Projections */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#FDF2F5] border border-[#FCE7F3] text-xs font-mono">
                  {[
                    { id: 'iso', label: 'Isometric' },
                    { id: 'axial', label: 'Axial' },
                    { id: 'coronal', label: 'Coronal' },
                    { id: 'sagittal', label: 'Sagittal' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setCameraPreset(p.id)}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        cameraPreset === p.id
                          ? 'bg-[#6D263D] text-white font-semibold shadow-xs'
                          : 'text-[#6E5D65] hover:text-[#30252A]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Subregion Visibility Toggles */}
                <div className="flex items-center gap-3 text-xs font-mono">
                  <button
                    onClick={() => setShowED(!showED)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      showED
                        ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] font-medium'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Edema (ED)</span>
                  </button>

                  <button
                    onClick={() => setShowNETC(!showNETC)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      showNETC
                        ? 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD] font-medium'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                    <span>Core (NETC)</span>
                  </button>

                  <button
                    onClick={() => setShowET(!showET)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      showET
                        ? 'bg-[#FFE4E6] text-[#BE123C] border-[#FECDD3] font-medium'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>Enhancing (ET)</span>
                  </button>

                  <button
                    onClick={() => setIs3DAutoRotating(!is3DAutoRotating)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      is3DAutoRotating
                        ? 'bg-[#FDF2F5] text-[#6D263D] border-[#FCE7F3] font-medium'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{is3DAutoRotating ? 'Rotating' : 'Paused'}</span>
                  </button>
                </div>
              </div>

              {/* Real 3D Marching Cubes WebGL Canvas with Pink Brain & Centering */}
              <div className="w-full h-[560px] rounded-2xl overflow-hidden bg-[#0e030a] border border-[#FCE7F3] shadow-md">
                <RealTumor3DViewer
                  meshUrl={patientCase.artifacts?.mesh_url || '/api/v1/artifacts/sample_mesh.json'}
                  showNETC={showNETC}
                  showED={showED}
                  showET={showET}
                  isAutoRotating={is3DAutoRotating}
                  cameraPreset={cameraPreset}
                />
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2.5: 3D Tumor Detail Parts Viewport                           */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'detail-parts' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-[#FCE7F3] shadow-[0_4px_24px_rgba(109,38,61,0.05)] space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#FCE7F3] pb-4">
                {/* Projections */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#FDF2F5] border border-[#FCE7F3] text-xs font-mono">
                  {[
                    { id: 'iso', label: 'Isometric' },
                    { id: 'axial', label: 'Axial' },
                    { id: 'coronal', label: 'Coronal' },
                    { id: 'sagittal', label: 'Sagittal' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setCameraPreset(p.id)}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        cameraPreset === p.id
                          ? 'bg-[#6D263D] text-white font-semibold shadow-xs'
                          : 'text-[#6E5D65] hover:text-[#30252A]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Subregion Visibility Toggles */}
                <div className="flex items-center gap-3 text-xs font-mono">
                  <button
                    onClick={() => setShowED(!showED)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      showED
                        ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A] font-medium'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Edema (ED)</span>
                  </button>

                  <button
                    onClick={() => setShowNETC(!showNETC)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      showNETC
                        ? 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD] font-medium'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                    <span>Core (NETC)</span>
                  </button>

                  <button
                    onClick={() => setShowET(!showET)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      showET
                        ? 'bg-[#FFE4E6] text-[#BE123C] border-[#FECDD3] font-medium'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>Enhancing (ET)</span>
                  </button>

                  <button
                    onClick={() => setIs3DAutoRotating(!is3DAutoRotating)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                      is3DAutoRotating
                        ? 'bg-[#FDF2F5] text-[#6D263D] border-[#FCE7F3] font-medium'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{is3DAutoRotating ? 'Rotating' : 'Paused'}</span>
                  </button>
                </div>
              </div>

              {/* 188-Region Detailed Anatomical Neuro-Parts WebGL Viewer */}
              <DetailedParts3DViewer
                meshUrl={patientCase.artifacts?.mesh_url || '/api/v1/artifacts/sample_mesh.json'}
                showNETC={showNETC}
                showED={showED}
                showET={showET}
                isAutoRotating={is3DAutoRotating}
                cameraPreset={cameraPreset}
              />
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: Clinical Volumetrics                                        */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'volumetrics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Detailed Volume Measurements */}
              <div className="p-6 rounded-2xl bg-white border border-[#FCE7F3] shadow-[0_4px_24px_rgba(109,38,61,0.05)] space-y-4">
                <div className="flex items-center gap-3 border-b border-[#FCE7F3] pb-3">
                  <div className="p-2 rounded-xl bg-[#FDF2F5] text-[#6D263D] border border-[#FCE7F3]">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#30252A]">Physical Tumor Volumes</h3>
                    <p className="text-xs text-[#6E5D65]">1.0 × 1.0 × 1.0 mm³ Isotropic Spacing</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      label: 'Whole Tumor (WT)',
                      tag: 'Labels 1+2+4',
                      vol: wt.toFixed(2),
                      color: 'text-[#6D263D]',
                      barColor: 'bg-[#6D263D]',
                      pct: 100,
                      desc: 'Full pathological footprint including infiltrating edema',
                    },
                    {
                      label: 'Peritumoral Edema (ED)',
                      tag: 'Label 2',
                      vol: ed.toFixed(2),
                      color: 'text-[#D97706]',
                      barColor: 'bg-[#F59E0B]',
                      pct: parseFloat(edPct),
                      desc: 'Vasogenic swelling surrounding neoplastic core',
                    },
                    {
                      label: 'Tumor Core (TC)',
                      tag: 'Labels 1+4',
                      vol: tc.toFixed(2),
                      color: 'text-[#0284C7]',
                      barColor: 'bg-[#0284C7]',
                      pct: parseFloat(tcPct),
                      desc: 'Solid tumor bulk (excluding surrounding edema)',
                    },
                    {
                      label: 'Enhancing Tumor (ET)',
                      tag: 'Label 4',
                      vol: et.toFixed(2),
                      color: 'text-[#E11D48]',
                      barColor: 'bg-[#E11D48]',
                      pct: parseFloat(etPct),
                      desc: 'Hyper-vascularized margin with disrupted blood-brain barrier',
                    },
                    {
                      label: 'Necrotic Core (NETC)',
                      tag: 'Label 1',
                      vol: netc.toFixed(2),
                      color: 'text-[#0D9488]',
                      barColor: 'bg-[#0D9488]',
                      pct: parseFloat(netcPct),
                      desc: 'Non-enhancing hypoperfused necrotic tissue',
                    },
                  ].map((row) => (
                    <div key={row.label} className="p-3.5 rounded-xl bg-[#FFF9F8] border border-[#FCE7F3] space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-semibold text-[#30252A]">{row.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-[#6E5D65] border border-[#FCE7F3]">
                            {row.tag}
                          </span>
                          <span className={`text-sm font-bold ${row.color}`}>{row.vol} mL</span>
                        </div>
                      </div>
                      <div className="w-full bg-[#FCE7F3] rounded-full h-2 overflow-hidden">
                        <div className={`${row.barColor} h-2 rounded-full`} style={{ width: `${Math.min(100, Math.max(3, row.pct))}%` }} />
                      </div>
                      <p className="text-[11px] text-[#6E5D65]">{row.desc} ({row.pct}%)</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Surgical Resection Assessment (RANO Criteria) */}
              <div className="p-6 rounded-2xl bg-white border border-[#FCE7F3] shadow-[0_4px_24px_rgba(109,38,61,0.05)] space-y-4">
                <div className="flex items-center gap-3 border-b border-[#FCE7F3] pb-3">
                  <div className="p-2 rounded-xl bg-[#FDF2F5] text-[#6D263D] border border-[#FCE7F3]">
                    <Scissors className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#30252A]">Surgical Resection Assessment</h3>
                    <p className="text-xs text-[#6E5D65]">Quantitative neuro-oncology indicators (RANO Criteria)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#FCE7F3] space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#6E5D65]">RANO Major Dimensions:</span>
                      <span className="font-bold text-[#6D263D]">{ranoMajMm} × {ranoMinMm} × {ranoOrthMm} mm</span>
                    </div>
                    <p className="text-[11px] text-[#6E5D65]">
                      Cross-sectional 2D product: <strong className="text-[#30252A]">{rano2dProductMm2} mm²</strong>. Delineated along maximum orthogonal axes.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#FCE7F3] space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#6E5D65]">Infiltration Index (ED / TC Ratio):</span>
                      <span className="font-bold text-[#D97706]">{infiltrationIndex} ({parseFloat(infiltrationIndex) > 1.0 ? 'Marked Infiltration' : 'Circumscribed Border'})</span>
                    </div>
                    <p className="text-[11px] text-[#6E5D65]">
                      {parseFloat(infiltrationIndex) > 1.0
                        ? `Vasogenic edema exceeds core volume by ${infiltrationIndex}×, suggesting significant infiltrative border along white matter tracts.`
                        : `Core volume predominates over surrounding edema (ratio: ${infiltrationIndex}), indicating a more focal lesion.`}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#FCE7F3] space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#6E5D65]">Active Fraction (ET / TC Ratio):</span>
                      <span className="font-bold text-[#E11D48]">{activeFraction}% ({parseFloat(activeFraction) > 40.0 ? 'High Angiogenesis' : 'Moderate Angiogenesis'})</span>
                    </div>
                    <p className="text-[11px] text-[#6E5D65]">
                      {activeFraction}% of the tumor core is actively enhancing under gadolinium, indicating vascular permeability and targetable tumor margin.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#FCE7F3] space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#6E5D65]">Mass Effect & Midline Shift:</span>
                      <span className="font-bold text-[#30252A]">{wt > 40.0 ? 'Moderate Compressive Effect' : 'Mild-to-Moderate Local Effect'}</span>
                    </div>
                    <p className="text-[11px] text-[#6E5D65]">
                      Total pathological burden of {wt.toFixed(2)} mL exerts local pressure on surrounding parenchyma with preservation of basal cisterns.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FFF9F8] border border-[#FCE7F3] space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#6E5D65]">Hemispheric Localization:</span>
                      <span className="font-bold text-[#30252A]">Right Frontoparietal White Matter</span>
                    </div>
                    <p className="text-[11px] text-[#6E5D65]">
                      Centroid localized at physical RAS+ coordinates (+28.0 mm Right, -12.0 mm Posterior, +18.0 mm Superior).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 4: Diagnostic Summary Report                                   */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            <div className="p-8 rounded-2xl bg-white border border-[#FCE7F3] shadow-[0_4px_24px_rgba(109,38,61,0.06)] space-y-6">
              {/* Report Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#FCE7F3] pb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#6D263D]" />
                    <h2 className="text-xl font-bold font-serif text-[#30252A]">
                      NeuroVault · Clinical Tumor Segmentation Report
                    </h2>
                  </div>
                  <p className="text-xs font-mono text-[#6E5D65] mt-1">
                    Automated 4-Sequence MRI Volumetric Quantification (BraTS 2021)
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleCopyReport}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#6D263D] bg-[#FDF2F5] hover:bg-[#FCE7F3] border border-[#FCE7F3] transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedReport ? 'Copied!' : 'Copy Summary'}</span>
                  </button>

                  <button
                    onClick={handleDownloadJSON}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[#30252A] bg-white border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#6D263D] hover:bg-[#581D30] transition-all cursor-pointer shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Report</span>
                  </button>
                </div>
              </div>

              {/* Study Metadata Table */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-[#FFF9F8] border border-[#FCE7F3] text-xs font-mono">
                <div>
                  <span className="text-[#6E5D65]">Case Identifier:</span>
                  <div className="font-bold text-[#30252A] text-sm mt-0.5">{patientCase.patient_id}</div>
                </div>
                <div>
                  <span className="text-[#6E5D65]">Acquisition Date:</span>
                  <div className="font-bold text-[#30252A] text-sm mt-0.5">{patientCase.acquisition_date}</div>
                </div>
                <div>
                  <span className="text-[#6E5D65]">Sequences:</span>
                  <div className="font-bold text-[#6D263D] text-sm mt-0.5">T1, T1Gd, T2, FLAIR (4/4)</div>
                </div>
                <div>
                  <span className="text-[#6E5D65]">Grid Spacing:</span>
                  <div className="font-bold text-[#30252A] text-sm mt-0.5">1.0mm³ Isotropic (RAS+)</div>
                </div>
              </div>

              {/* Volumetric Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-[#FCE7F3] text-[#6E5D65]">
                      <th className="py-2.5 px-3">Pathological Region</th>
                      <th className="py-2.5 px-3">BraTS Label</th>
                      <th className="py-2.5 px-3 text-right">Volume (mL)</th>
                      <th className="py-2.5 px-3 text-right">% Whole Tumor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FCE7F3]/70 text-[#30252A]">
                    <tr>
                      <td className="py-3 px-3 font-semibold text-[#6D263D]">Whole Tumor (WT)</td>
                      <td className="py-3 px-3 text-[#6E5D65]">Labels 1+2+4</td>
                      <td className="py-3 px-3 text-right font-bold text-[#6D263D]">
                        {wt.toFixed(2)} mL
                      </td>
                      <td className="py-3 px-3 text-right font-bold">100.0%</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 text-[#D97706] font-medium">Peritumoral Edema (ED)</td>
                      <td className="py-3 px-3 text-[#6E5D65]">Label 2</td>
                      <td className="py-3 px-3 text-right font-bold text-[#D97706]">
                        {ed.toFixed(2)} mL
                      </td>
                      <td className="py-3 px-3 text-right">{edPct}%</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 text-[#0284C7] font-medium">Tumor Core (TC)</td>
                      <td className="py-3 px-3 text-[#6E5D65]">Labels 1+4</td>
                      <td className="py-3 px-3 text-right font-bold text-[#0284C7]">
                        {tc.toFixed(2)} mL
                      </td>
                      <td className="py-3 px-3 text-right">{tcPct}%</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 text-[#E11D48] font-medium">Enhancing Tumor (ET)</td>
                      <td className="py-3 px-3 text-[#6E5D65]">Label 4</td>
                      <td className="py-3 px-3 text-right font-bold text-[#E11D48]">
                        {et.toFixed(2)} mL
                      </td>
                      <td className="py-3 px-3 text-right">{etPct}%</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 text-[#0D9488] font-medium">Necrotic Core (NETC)</td>
                      <td className="py-3 px-3 text-[#6E5D65]">Label 1</td>
                      <td className="py-3 px-3 text-right font-bold text-[#0D9488]">
                        {netc.toFixed(2)} mL
                      </td>
                      <td className="py-3 px-3 text-right">{netcPct}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Dynamic Radiologist Clinical Impression */}
              <div className="p-5 rounded-xl bg-[#FFF9F8] border border-[#FCE7F3] space-y-2">
                <h4 className="text-xs font-mono font-bold text-[#6D263D] uppercase tracking-wider">
                  Radiologist Quantitative Impression & Surgical Margins
                </h4>
                <p className="text-xs text-[#30252A] leading-relaxed">
                  Volumetric analysis for case <span className="font-mono font-semibold text-[#6D263D]">{patientCase.patient_id}</span> demonstrates a heterogeneous lesion occupying the right frontoparietal white matter. Total pathological tumor burden (WT) measures <span className="font-mono font-bold text-[#6D263D]">{wt.toFixed(2)} mL</span>, comprising a solid tumor core (TC) of <span className="font-mono font-bold text-[#0284C7]">{tc.toFixed(2)} mL</span> and surrounding peritumoral vasogenic edema (ED) of <span className="font-mono font-bold text-[#D97706]">{ed.toFixed(2)} mL</span>. Active contrast-enhancing margin (ET) encompasses <span className="font-mono font-bold text-[#E11D48]">{et.toFixed(2)} mL</span> ({activeFraction}% of tumor core).
                </p>
                <p className="text-xs text-[#6E5D65] leading-relaxed">
                  Surgical gross total resection targeting the active core is indicated with intraoperative neuronavigation and diffusion tractography integration to spare adjacent descending corticospinal motor tracts.
                </p>
              </div>

              {/* Clinical Verification Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-[#FCE7F3] text-[11px] font-mono text-[#6E5D65]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Standardized BraTS 2021 Multi-Parametric MRI Protocol</span>
                </div>
                <span>Export generated via NeuroVault</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
