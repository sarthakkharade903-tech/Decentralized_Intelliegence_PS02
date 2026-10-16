import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileCheck,
  AlertCircle,
  Info,
  Shield,
  Trash2,
  Loader2,
  CheckCircle,
  Activity
} from 'lucide-react';
import { predictSegmentation, validateNiftiFile } from '../services/api';

const SEQUENCES = [
  {
    id: 't1',
    name: 'T1 Native',
    tag: 'T1',
    description: 'Anatomical reference & structural baseline',
    required: true
  },
  {
    id: 't1gd',
    name: 'T1Gd (Gadolinium)',
    tag: 'T1CE',
    description: 'Vascular breakdown & active tumor margin (ET)',
    required: true
  },
  {
    id: 't2',
    name: 'T2-Weighted',
    tag: 'T2',
    description: 'Bulk hyperintense lesions & fluid content',
    required: true
  },
  {
    id: 'flair',
    name: 'FLAIR',
    tag: 'FLAIR',
    description: 'Fluid-suppressed vasogenic peritumoral edema (ED)',
    required: true
  },
  {
    id: 'expertSeg',
    name: 'Expert Ground Truth (Optional)',
    tag: 'GT MASK',
    description: 'BraTS 2021 label map (0,1,2,4) for automated Dice benchmark',
    required: false
  }
];

export default function UploadModal({ isOpen, onClose, onInferenceSuccess }) {
  const [files, setFiles] = useState({
    t1: null,
    t1gd: null,
    t2: null,
    flair: null,
    expertSeg: null
  });

  // State machine: 'idle' | 'uploading' | 'inferring' | 'success' | 'error'
  const [status, setStatus] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);

  // Safety refs to prevent state updates after unmount & allow aborting requests
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!isOpen) return null;

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSelectFile = (seqId, file) => {
    if (!file) return;

    const validation = validateNiftiFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }

    setErrorMessage(null);
    setErrorDetails(null);
    setFiles((prev) => ({ ...prev, [seqId]: file }));
  };

  const handleRemoveFile = (seqId) => {
    setFiles((prev) => ({ ...prev, [seqId]: null }));
    const el = document.getElementById(`modal-input-${seqId}`);
    if (el) el.value = '';
  };

  const handleClearAll = () => {
    setFiles({
      t1: null,
      t1gd: null,
      t2: null,
      flair: null,
      expertSeg: null
    });
    setErrorMessage(null);
    setErrorDetails(null);
    setStatus('idle');
    setPredictionResult(null);
    setUploadProgress(0);
  };

  // Batch auto-assignment based on standard BraTS filename conventions
  const handleBatchFiles = (uploadedFiles) => {
    setErrorMessage(null);
    setErrorDetails(null);
    const updated = { ...files };
    let assignedCount = 0;

    Array.from(uploadedFiles).forEach((file) => {
      const val = validateNiftiFile(file);
      if (!val.valid) return;

      const lower = file.name.toLowerCase();
      if (lower.includes('seg') || lower.includes('truth') || lower.includes('mask') || lower.includes('label')) {
        updated.expertSeg = file;
        assignedCount++;
      } else if (lower.includes('t1ce') || lower.includes('t1gd') || lower.includes('t1_ce')) {
        updated.t1gd = file;
        assignedCount++;
      } else if (lower.includes('flair')) {
        updated.flair = file;
        assignedCount++;
      } else if (lower.includes('t2')) {
        updated.t2 = file;
        assignedCount++;
      } else if (lower.includes('t1')) {
        updated.t1 = file;
        assignedCount++;
      }
    });

    if (assignedCount === 0) {
      setErrorMessage(
        'Could not auto-detect sequence types from filenames. Please assign each sequence slot individually.'
      );
    } else {
      setFiles(updated);
    }
  };

  const handleSubmit = async () => {
    if (!files.t1 || !files.t1gd || !files.t2 || !files.flair) {
      setErrorMessage('All 4 core sequences (T1, T1Gd, T2, FLAIR) must be assigned before running inference.');
      return;
    }

    setErrorMessage(null);
    setErrorDetails(null);
    setStatus('uploading');
    setUploadProgress(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await predictSegmentation({
        t1: files.t1,
        t1gd: files.t1gd,
        t2: files.t2,
        flair: files.flair,
        expertSeg: files.expertSeg,
        patientId: 'BraTS2021_PATIENT_CASE',
        onProgress: (percent) => {
          if (!isMountedRef.current) return;
          setUploadProgress(percent);
          if (percent >= 100) {
            setStatus('inferring');
          }
        },
        signal: controller.signal
      });

      if (!isMountedRef.current) return;
      setPredictionResult(result);
      setStatus('success');
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err.name === 'AbortError') return;

      setStatus('error');
      setErrorMessage(err.message || 'An unexpected error occurred during segmentation inference.');
      setErrorDetails(err.detail || null);
    }
  };

  const requiredCount = [files.t1, files.t1gd, files.t2, files.flair].filter(Boolean).length;
  const isReady = requiredCount === 4 && status !== 'uploading' && status !== 'inferring';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-[#090D16] border border-slate-800 shadow-[0_0_60px_-15px_rgba(6,182,212,0.2)] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/50 text-cyan-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
                Upload mpMRI Sequences
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-normal">
                  {requiredCount}/4 Core Sequences
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Assign co-registered NIfTI scans (<span className="text-cyan-300">.nii</span> or <span className="text-cyan-300">.nii.gz</span>, max 1 GiB each).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={status === 'uploading' || status === 'inferring'}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 space-y-1.5 text-xs text-rose-200">
              <div className="flex items-center gap-2 font-semibold text-rose-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Segmentation Processing Error</span>
              </div>
              <p className="pl-6 text-[11px] leading-relaxed">{errorMessage}</p>
              {errorDetails && (
                <div className="pl-6 pt-1 text-[10px] font-mono text-rose-400/80">
                  {typeof errorDetails === 'object' ? JSON.stringify(errorDetails) : String(errorDetails)}
                </div>
              )}
            </div>
          )}

          {/* Success Summary View */}
          {status === 'success' && predictionResult && (
            <div className="p-5 rounded-xl bg-cyan-950/30 border border-cyan-500/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span>3D Tumour Segmentation Complete</span>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {predictionResult.execution_time_seconds
                    ? `${predictionResult.execution_time_seconds}s execution`
                    : 'Execution verified'}
                </span>
              </div>

              {/* Volume Breakdown Cards */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Whole Tumor (WT)</span>
                  <div className="text-lg font-bold font-mono text-white mt-1">
                    {predictionResult.volumes_ml?.whole_tumor != null
                      ? `${predictionResult.volumes_ml.whole_tumor.toFixed(2)} mL`
                      : '—'}
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400">Labels 1 + 2 + 4</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Tumor Core (TC)</span>
                  <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
                    {predictionResult.volumes_ml?.tumor_core != null
                      ? `${predictionResult.volumes_ml.tumor_core.toFixed(2)} mL`
                      : '—'}
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400">Labels 1 + 4</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Enhancing (ET)</span>
                  <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                    {predictionResult.volumes_ml?.enhancing_tumor != null
                      ? `${predictionResult.volumes_ml.enhancing_tumor.toFixed(2)} mL`
                      : '—'}
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400">Label 4</span>
                </div>
              </div>

              {/* Dice Scores (if expert mask was compared) */}
              {predictionResult.metrics?.dice && (
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs">
                  <span className="font-semibold text-emerald-300">Ground-Truth Comparison Metrics (Dice):</span>
                  <div className="flex items-center gap-4 mt-1 font-mono text-slate-200 text-[11px]">
                    <span>WT: {(predictionResult.metrics.dice.whole_tumor * 100).toFixed(1)}%</span>
                    <span>TC: {(predictionResult.metrics.dice.tumor_core * 100).toFixed(1)}%</span>
                    <span>ET: {(predictionResult.metrics.dice.enhancing_tumor * 100).toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Upload / Inference Progress Overlay */}
          {(status === 'uploading' || status === 'inferring') && (
            <div className="p-5 rounded-xl bg-slate-900/90 border border-cyan-500/50 space-y-3 text-center">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                <span className="text-sm font-semibold text-white">
                  {status === 'uploading'
                    ? `Uploading MRI Scans (${uploadProgress}%)...`
                    : 'Running MONAI 3D SegResNet Sliding Window Inference...'}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-teal-400 h-2 transition-all duration-300 rounded-full"
                  style={{ width: `${status === 'uploading' ? uploadProgress : 95}%` }}
                />
              </div>
              <p className="text-[11px] font-mono text-slate-400">
                {status === 'uploading'
                  ? 'Streaming uncompressed volumes to local backend'
                  : 'Computing patch-wise tensor inferences on local GPU (RTX 4050)'}
              </p>
            </div>
          )}

          {/* Batch Drop Zone */}
          {status !== 'success' && status !== 'uploading' && status !== 'inferring' && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handleBatchFiles(e.dataTransfer.files);
              }}
              onClick={() => document.getElementById('modal-batch-input')?.click()}
              className="group cursor-pointer p-4 rounded-xl border border-dashed border-slate-700/80 hover:border-cyan-500/60 bg-slate-900/30 hover:bg-cyan-950/20 transition-all text-center"
            >
              <input
                id="modal-batch-input"
                type="file"
                multiple
                accept=".nii,.nii.gz"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleBatchFiles(e.target.files);
                }}
              />
              <div className="flex items-center justify-center gap-2 text-xs text-slate-300 group-hover:text-cyan-200 transition-colors font-medium">
                <UploadCloud className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span>Drop all 4 NIfTI files here for auto-assignment, or select individually below</span>
              </div>
            </div>
          )}

          {/* Sequence Slots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SEQUENCES.map((seq) => {
              const file = files[seq.id];
              return (
                <div
                  key={seq.id}
                  className={`relative p-3.5 rounded-xl border transition-all ${
                    file
                      ? 'border-cyan-500/50 bg-cyan-950/20 shadow-[0_0_15px_-3px_rgba(34,211,238,0.1)]'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                  }`}
                >
                  <input
                    id={`modal-input-${seq.id}`}
                    type="file"
                    accept=".nii,.nii.gz"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleSelectFile(seq.id, e.target.files[0]);
                    }}
                  />

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800/80 text-cyan-300 border border-slate-700">
                          {seq.tag}
                        </span>
                        <h4 className="text-xs font-semibold text-slate-200">{seq.name}</h4>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{seq.description}</p>
                    </div>

                    {file ? (
                      <button
                        onClick={() => handleRemoveFile(seq.id)}
                        disabled={status === 'uploading' || status === 'inferring'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors disabled:opacity-40"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => document.getElementById(`modal-input-${seq.id}`)?.click()}
                        disabled={status === 'uploading' || status === 'inferring'}
                        className="px-2.5 py-1 rounded text-[10px] font-mono text-cyan-400 border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 hover:border-cyan-400 transition-colors disabled:opacity-40"
                      >
                        Select
                      </button>
                    )}
                  </div>

                  {/* Selected File Details */}
                  {file ? (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="text-slate-200 font-mono truncate text-[11px]">{file.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/40 flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                      <span>{seq.required ? 'Required (.nii/.nii.gz)' : 'Optional evaluation mask'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Research & Local Privacy Disclaimer */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-2.5 text-xs text-slate-300">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-slate-400">
              <strong className="text-slate-200">Local Processing:</strong> Scans are processed entirely on your local machine ({API_BASE_URL}). Zero data is transmitted to cloud APIs or external LLMs. Research & teaching prototype only.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Local privacy guaranteed</span>
          </div>

          <div className="flex items-center gap-3">
            {requiredCount > 0 && status !== 'uploading' && status !== 'inferring' && (
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors"
              >
                Reset
              </button>
            )}

            {status === 'success' ? (
              <button
                onClick={() => {
                  if (onInferenceSuccess && predictionResult) {
                    onInferenceSuccess(predictionResult);
                  } else {
                    onClose();
                  }
                }}
                className="px-5 py-2 rounded-xl text-xs font-semibold tracking-wide bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-300 text-slate-950 font-bold hover:shadow-[0_0_20px_-3px_rgba(34,211,238,0.6)] cursor-pointer flex items-center gap-1.5"
              >
                <span>Open in 3D Workstation</span>
                <span>→</span>
              </button>
            ) : (
              <button
                disabled={!isReady}
                onClick={handleSubmit}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  isReady
                    ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 font-bold hover:shadow-[0_0_20px_-3px_rgba(34,211,238,0.5)] cursor-pointer'
                    : 'bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                {status === 'uploading' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading ({uploadProgress}%)</span>
                  </>
                ) : status === 'inferring' ? (
                  <>
                    <Activity className="w-3.5 h-3.5 animate-spin text-cyan-950" />
                    <span>Inferring 3D Segments...</span>
                  </>
                ) : (
                  <span>Run 3D Segmentation ({requiredCount}/4)</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
