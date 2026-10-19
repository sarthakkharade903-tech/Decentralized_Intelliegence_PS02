import React, { useRef, useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  X,
  AlertCircle,
  BarChart3,
  Info,
  Loader2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { validateNiftiFile, predictSegmentation, API_BASE_URL } from '../services/api';
import thumbT1 from '../assets/atlas/thumb_t1.png';
import thumbT1Gd from '../assets/atlas/thumb_t1gd.png';
import thumbT2 from '../assets/atlas/thumb_t2.png';
import thumbFlair from '../assets/atlas/thumb_flair.png';

const SEQUENCES = [
  {
    id: 't1',
    name: 'T1',
    thumb: thumbT1,
    info: 'T1 Native anatomical baseline'
  },
  {
    id: 't1gd',
    name: 'T1Gd',
    thumb: thumbT1Gd,
    info: 'T1 Gadolinium contrast-enhanced (active tumor margin)'
  },
  {
    id: 't2',
    name: 'T2',
    thumb: thumbT2,
    info: 'T2-weighted (bulk lesion and fluid edema)'
  },
  {
    id: 'flair',
    name: 'FLAIR',
    thumb: thumbFlair,
    info: 'Fluid Attenuated Inversion Recovery (peritumoral vasogenic edema)'
  }
];

export default function MriWorkspace({ workspaceRef, onInferenceSuccess }) {
  const [files, setFiles] = useState({
    t1: null,
    t1gd: null,
    t2: null,
    flair: null
  });

  const [errors, setErrors] = useState({
    t1: null,
    t1gd: null,
    t2: null,
    flair: null
  });

  const [activeTooltip, setActiveTooltip] = useState(null);
  // 'idle' | 'uploading' | 'inferring' | 'error' | 'success'
  const [analysisStatus, setAnalysisStatus] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState(null);

  const fileInputRefs = {
    t1: useRef(null),
    t1gd: useRef(null),
    t2: useRef(null),
    flair: useRef(null)
  };

  const abortControllerRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleSelectFile = (seqId, file) => {
    if (!file) return;

    // Use api.js validation (extension, size, empty)
    const validation = validateNiftiFile(file);
    if (!validation.valid) {
      setErrors((prev) => ({
        ...prev,
        [seqId]: validation.error
      }));
      return;
    }

    // Check for duplicate file assignment across slots
    for (const [key, existingFile] of Object.entries(files)) {
      if (key !== seqId && existingFile && existingFile.name === file.name && existingFile.size === file.size) {
        const otherName = SEQUENCES.find((s) => s.id === key)?.name || key;
        setErrors((prev) => ({
          ...prev,
          [seqId]: `Duplicate file: Already assigned to ${otherName}`
        }));
        return;
      }
    }

    setErrors((prev) => ({ ...prev, [seqId]: null }));
    setFiles((prev) => ({ ...prev, [seqId]: file }));
  };

  const handleRemoveFile = (seqId, e) => {
    e.stopPropagation();
    setFiles((prev) => ({ ...prev, [seqId]: null }));
    setErrors((prev) => ({ ...prev, [seqId]: null }));
    if (fileInputRefs[seqId].current) {
      fileInputRefs[seqId].current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (seqId, e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleSelectFile(seqId, droppedFile);
    }
  };

  const uploadedCount = Object.values(files).filter(Boolean).length;
  const allUploaded = uploadedCount === 4;

  const handleContinueAnalysis = async () => {
    if (!allUploaded) return;

    setAnalysisStatus('uploading');
    setUploadProgress(0);
    setAnalysisError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await predictSegmentation({
        t1: files.t1,
        t1gd: files.t1gd,
        t2: files.t2,
        flair: files.flair,
        onProgress: (percent) => {
          setUploadProgress(percent);
          if (percent >= 100) {
            setAnalysisStatus('inferring');
          }
        },
        signal: controller.signal
      });

      setAnalysisStatus('success');
      if (onInferenceSuccess) {
        onInferenceSuccess(result, files);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setAnalysisStatus('idle');
        return;
      }
      setAnalysisStatus('error');
      setAnalysisError(
        err.message || `Unable to connect to FastAPI backend at ${API_BASE_URL || 'http://localhost:8000'}.`
      );
    }
  };

  // Dynamic step tracker reflecting live pipeline state
  const isProcessing = analysisStatus === 'uploading' || analysisStatus === 'inferring';
  const workflowSteps = [
    { step: '1', label: 'Upload Scans', active: !allUploaded && analysisStatus === 'idle' },
    { step: '2', label: 'Process', active: isProcessing },
    { step: '3', label: 'View Results', active: analysisStatus === 'success' },
    { step: '4', label: 'Explore & Analyze', active: false }
  ];

  return (
    <section
      ref={workspaceRef}
      id="mri-workspace"
      className="relative w-full bg-[#6D263D] px-6 lg:px-12 pt-14 pb-18 text-[#F8F5F0]"
    >
      <div className="max-w-7xl mx-auto space-y-10">

        {/* Workspace Header: Eyebrow + Title + Description */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-3">
            <p className="text-xs font-semibold tracking-widest uppercase text-[#F8F5F0]/70">
              Your MRI Workspace
            </p>
            <h2 className="text-4xl sm:text-5xl font-normal tracking-tight text-[#F8F5F0] font-serif leading-[1.08]">
              Begin with your <br />
              <span className="font-serif">MRI scans.</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#F8F5F0]/80 leading-relaxed pt-1 max-w-sm">
              Select the four MRI sequences (NIfTI format) to get started.
            </p>

            {/* Dynamic Workflow Step Indicator */}
            <div className="pt-4 flex flex-col space-y-2.5">
              {workflowSteps.map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      s.active
                        ? 'bg-[#F8F5F0] text-[#6D263D]'
                        : 'bg-[#542031] text-[#F8F5F0]/60 border border-[#8C3A52]/40'
                    }`}
                  >
                    {s.step}
                  </div>
                  <span
                    className={`text-xs font-medium transition-colors ${
                      s.active ? 'text-[#F8F5F0] font-semibold' : 'text-[#F8F5F0]/60'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 4 Sequence Upload Cards */}
          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {SEQUENCES.map((seq) => {
                const file = files[seq.id];
                const error = errors[seq.id];

                return (
                  <div
                    key={seq.id}
                    className="relative bg-[#F8F5F0] rounded-2xl p-4 text-[#30252A] shadow-md flex flex-col justify-between transition-all duration-200 hover:shadow-lg"
                  >
                    {/* Hidden Native File Input */}
                    <input
                      ref={fileInputRefs[seq.id]}
                      type="file"
                      accept=".nii,.nii.gz"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleSelectFile(seq.id, e.target.files[0]);
                        }
                      }}
                    />

                    {/* Card Top: Thumbnail + Title + Info Icon */}
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-[#EBE3DE]">
                        <div className="flex items-center gap-2.5">
                          {/* Miniature Axial MRI Slice Thumbnail */}
                          <div className="w-9 h-9 rounded-lg overflow-hidden bg-black flex-shrink-0 shadow-xs border border-black/10">
                            <img
                              src={seq.thumb}
                              alt={`${seq.name} scan thumbnail`}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-sm font-bold text-[#30252A]">{seq.name}</h4>
                              <div
                                className="relative cursor-pointer"
                                onMouseEnter={() => setActiveTooltip(seq.id)}
                                onMouseLeave={() => setActiveTooltip(null)}
                              >
                                <Info className="w-3.5 h-3.5 text-[#8C7C83] hover:text-[#6D263D] transition-colors" />
                                {activeTooltip === seq.id && (
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-40 p-2 rounded-lg bg-[#30252A] text-[#F8F5F0] text-[10px] leading-tight z-30 shadow-lg pointer-events-none">
                                    {seq.info}
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] font-mono text-[#8C7C83]">.nii / .nii.gz</p>
                          </div>
                        </div>

                        {file && (
                          <div className="text-emerald-700" title="Sequence loaded">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Dropzone / Choose File Area */}
                      <div
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(seq.id, e)}
                        onClick={() => fileInputRefs[seq.id].current?.click()}
                        className="mt-3 py-4 px-2 rounded-xl border border-dashed border-[#DDD0C8] hover:border-[#6D263D]/60 bg-[#F4ECE7]/50 hover:bg-[#F4ECE7] transition-all cursor-pointer text-center group"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Upload className="w-4 h-4 text-[#6D263D] group-hover:-translate-y-0.5 transition-transform" />
                          <span className="text-xs font-semibold text-[#30252A] group-hover:text-[#6D263D] transition-colors">
                            Choose File
                          </span>
                          <span className="text-[10px] text-[#8C7C83]">or drag and drop</span>
                        </div>
                      </div>

                      {/* Selected File Details */}
                      {file && (
                        <div className="mt-2.5 p-2 rounded-lg bg-[#EAE0D9] flex items-center justify-between text-xs">
                          <div className="min-w-0 pr-1">
                            <p title={file.name} className="text-[11px] font-mono text-[#30252A] truncate">
                              {file.name}
                            </p>
                            <p className="text-[10px] font-mono text-[#6E5D65]">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleRemoveFile(seq.id, e)}
                            className="p-1 rounded text-[#6E5D65] hover:text-[#6D263D] transition-colors cursor-pointer"
                            title="Remove file"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Format / Duplicate Error */}
                      {error && (
                        <div className="mt-2 p-1.5 rounded bg-rose-100 border border-rose-300 text-[10px] text-rose-800 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate" title={error}>{error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Requirement Banner & Action CTA */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center pt-2">

          {/* Requirement Notice Box */}
          <div className="lg:col-span-8 p-4 rounded-xl bg-[#542031]/80 border border-[#8C3A52]/40 flex items-center gap-3.5">
            <div className="p-2 rounded-lg bg-[#6D263D] text-[#F8F5F0] flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-xs sm:text-sm font-semibold text-[#F8F5F0]">
                All four sequences are required
              </h5>
              <p className="text-[11px] sm:text-xs text-[#F8F5F0]/75 mt-0.5 leading-normal">
                T1, T1Gd, T2, and FLAIR help the model identify and segment tumor regions accurately.
              </p>
            </div>
          </div>

          {/* Analysis Action Button */}
          <div className="lg:col-span-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (onInferenceSuccess) onInferenceSuccess(null);
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-medium text-xs sm:text-sm bg-transparent border border-[#F8F5F0]/40 text-[#F8F5F0] hover:bg-[#F8F5F0]/10 transition-all cursor-pointer"
              title="Explore full 3D interactive workstation with precomputed BraTS 2021 patient case"
            >
              <span>Explore Demo Case</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F8F5F0]/20 font-bold">3D</span>
            </button>

            <button
              onClick={handleContinueAnalysis}
              disabled={!allUploaded || isProcessing}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-medium text-xs sm:text-sm transition-all duration-300 ${
                allUploaded && !isProcessing
                  ? 'bg-[#F8F5F0] text-[#6D263D] hover:bg-white shadow-md cursor-pointer font-semibold'
                  : 'bg-[#4C1929] text-[#A66E80] border border-[#6B283C] cursor-not-allowed opacity-80'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#6D263D]" />
                  <span>{analysisStatus === 'uploading' ? `Uploading (${uploadProgress}%)` : 'Inferring 3D...'}</span>
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4" />
                  <span>Continue to analysis</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* Live Upload Progress Notification */}
        {analysisStatus === 'uploading' && (
          <div className="p-4 rounded-xl bg-[#542031] border border-[#8C3A52]/60 space-y-2 text-xs text-[#F8F5F0] animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Ingesting MRI Sequences via Multipart Stream...
              </span>
              <span className="font-mono">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-[#441A27] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#F8F5F0] h-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Live Inference Execution Notification */}
        {analysisStatus === 'inferring' && (
          <div className="p-4 rounded-xl bg-[#542031] border border-[#8C3A52]/60 flex items-start gap-3 text-xs text-[#F8F5F0] animate-in fade-in duration-200">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5 text-cyan-300" />
            <div>
              <p className="font-semibold text-[#F8F5F0]">
                Running 3D Sliding Window Inference...
              </p>
              <p className="text-[11px] text-[#F8F5F0]/80 mt-1 leading-relaxed">
                Preprocessing scans, resampling to isotropic grid, and executing MONAI SegResNet. Results will open in the 3D Workstation automatically.
              </p>
            </div>
          </div>
        )}

        {/* Honest Backend Connection Error Feedback */}
        {analysisStatus === 'error' && (
          <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800/80 flex flex-col sm:flex-row items-start justify-between gap-4 text-xs text-rose-200 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-100">
                  Backend Server Offline (Laptop Compute Preserved)
                </p>
                <p className="text-[11px] text-rose-200/90 mt-1 leading-relaxed max-w-xl">
                  {analysisError}
                </p>
                <p className="text-[10px] text-rose-300/70 mt-1 font-mono">
                  You can explore the full precomputed BraTS 2021 case with 3D mesh reconstruction, RANO metrics, and diagnostic report without a live backend:
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
              <button
                onClick={() => {
                  if (onInferenceSuccess) onInferenceSuccess(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F8F5F0] text-[#6D263D] hover:bg-white transition-colors cursor-pointer"
              >
                <span>View Precomputed Demo</span>
              </button>
              <button
                onClick={handleContinueAnalysis}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-900 text-rose-100 hover:bg-rose-800 border border-rose-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
