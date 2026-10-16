import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  FileCheck,
  AlertCircle,
  Shield,
  Trash2,
  Loader2,
  CheckCircle,
  Activity,
  RotateCcw,
  Download,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { predictSegmentation, validateNiftiFile, downloadArtifact } from '../services/api';

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

  // State machine: 'idle' | 'validating' | 'uploading' | 'inferring' | 'success' | 'error'
  const [status, setStatus] = useState('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);
  const [isDownloadingMask, setIsDownloadingMask] = useState(false);

  // Active drag target slot
  const [dragOverSlot, setDragOverSlot] = useState(null);

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

  // Check if a file is already assigned to a different slot
  const findDuplicateSlot = (file, targetSlotId) => {
    for (const seq of SEQUENCES) {
      if (seq.id === targetSlotId) continue;
      const existing = files[seq.id];
      if (existing && existing.name === file.name && existing.size === file.size) {
        return seq;
      }
    }
    return null;
  };

  const handleSelectFile = (seqId, file) => {
    if (!file) return;

    // 1. Client-Side Format & 1 GiB Guard
    const validation = validateNiftiFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }

    // 2. Prevent duplicate file assignment across slots
    const dup = findDuplicateSlot(file, seqId);
    if (dup) {
      setErrorMessage(
        `Duplicate assignment: "${file.name}" is already assigned to ${dup.name}. Each MRI modality must be a distinct scan.`
      );
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
    setErrorMessage(null);
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
    const fileList = Array.from(uploadedFiles);

    // Track used file names to avoid duplicates in batch drop
    const usedNames = new Set();

    fileList.forEach((file) => {
      const val = validateNiftiFile(file);
      if (!val.valid) return;

      const lower = file.name.toLowerCase();
      let slotKey = null;

      if (lower.includes('seg') || lower.includes('truth') || lower.includes('mask') || lower.includes('label')) {
        slotKey = 'expertSeg';
      } else if (lower.includes('t1ce') || lower.includes('t1gd') || lower.includes('t1_ce')) {
        slotKey = 't1gd';
      } else if (lower.includes('flair')) {
        slotKey = 'flair';
      } else if (lower.includes('t2')) {
        slotKey = 't2';
      } else if (lower.includes('t1')) {
        slotKey = 't1';
      }

      if (slotKey && !usedNames.has(file.name)) {
        updated[slotKey] = file;
        usedNames.add(file.name);
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

  // Cancel in-flight upload / inference
  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('idle');
    setUploadProgress(0);
    setErrorMessage('Upload and inference cancelled by user.');
  };

  const handleSubmit = async () => {
    // 1. Validate all 4 core modalities are present
    const missing = SEQUENCES.filter((s) => s.required && !files[s.id]);
    if (missing.length > 0) {
      setErrorMessage(`Missing required sequence: ${missing.map((s) => s.name).join(', ')}.`);
      return;
    }

    // 2. Validate distinct files
    const coreEntries = [
      { key: 't1', file: files.t1 },
      { key: 't1gd', file: files.t1gd },
      { key: 't2', file: files.t2 },
      { key: 'flair', file: files.flair }
    ];

    for (let i = 0; i < coreEntries.length; i++) {
      for (let j = i + 1; j < coreEntries.length; j++) {
        if (
          coreEntries[i].file.name === coreEntries[j].file.name &&
          coreEntries[i].file.size === coreEntries[j].file.size
        ) {
          setErrorMessage(
            `Duplicate files detected: "${coreEntries[i].file.name}" is assigned to multiple slots. Each MRI modality must be distinct.`
          );
          return;
        }
      }
    }

    setErrorMessage(null);
    setErrorDetails(null);
    setStatus('validating');
    setUploadProgress(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Small micro-delay for smooth transition to uploading
    setTimeout(async () => {
      if (!isMountedRef.current) return;
      setStatus('uploading');

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
    }, 150);
  };

  const handleDownloadNiftiMask = async () => {
    if (!predictionResult?.artifacts?.segmentation_mask_url) return;
    setIsDownloadingMask(true);
    try {
      await downloadArtifact(
        predictionResult.artifacts.segmentation_mask_url,
        `${predictionResult.patient_id || 'BraTS2021'}_seg.nii.gz`
      );
    } catch (err) {
      setErrorMessage(`Failed to download mask artifact: ${err.message}`);
    } finally {
      if (isMountedRef.current) setIsDownloadingMask(false);
    }
  };

  const requiredCount = [files.t1, files.t1gd, files.t2, files.flair].filter(Boolean).length;
  const missingSequences = SEQUENCES.filter((s) => s.required && !files[s.id]);
  const isReady = requiredCount === 4 && status !== 'uploading' && status !== 'inferring' && status !== 'validating';

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
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white tracking-tight">
                  Upload mpMRI Sequences
                </h3>
                {requiredCount === 4 ? (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1 font-semibold">
                    <CheckCircle className="w-3 h-3" />
                    <span>4/4 Core Ready</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 flex items-center gap-1 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Missing: {missingSequences.map((s) => s.tag).join(', ')}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Assign 4 co-registered scans (<span className="text-cyan-300">.nii</span> or <span className="text-cyan-300">.nii.gz</span>, max 1 GiB each). Server validation is authoritative.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={status === 'uploading' || status === 'inferring' || status === 'validating'}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Error Banner with Retry Action */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 space-y-2 text-xs text-rose-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-rose-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Validation & Processing Notice</span>
                </div>
                {status === 'error' && (
                  <button
                    onClick={handleSubmit}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800/80 border border-rose-700/80 text-rose-100 font-mono text-[11px] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retry Inference</span>
                  </button>
                )}
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

              {/* Dice Scores (if expert ground truth was evaluated) */}
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

              {/* Artifact Download Action */}
              {predictionResult.artifacts?.segmentation_mask_url && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleDownloadNiftiMask}
                    disabled={isDownloadingMask}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 bg-slate-900 border border-slate-800 hover:border-cyan-400 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isDownloadingMask ? 'Downloading Mask...' : 'Download Predicted Mask (.nii.gz)'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Active Upload / Inference Progress Overlay */}
          {(status === 'validating' || status === 'uploading' || status === 'inferring') && (
            <div className="p-5 rounded-xl bg-slate-900/90 border border-cyan-500/50 space-y-3 text-center">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                  <span className="text-sm font-semibold text-white">
                    {status === 'validating'
                      ? 'Validating NIfTI formats & checking duplicate assignments...'
                      : status === 'uploading'
                      ? `Uploading MRI Scans (${uploadProgress}%)...`
                      : 'Running MONAI 3D SegResNet Sliding Window Inference...'}
                  </span>
                </div>

                <button
                  onClick={handleCancelRequest}
                  className="px-2.5 py-1 rounded text-xs font-mono text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-teal-400 h-2 transition-all duration-300 rounded-full"
                  style={{
                    width: `${
                      status === 'validating' ? 15 : status === 'uploading' ? uploadProgress : 95
                    }%`
                  }}
                />
              </div>

              <p className="text-[11px] font-mono text-slate-400">
                {status === 'validating'
                  ? 'Verifying client bounds and sequence headers'
                  : status === 'uploading'
                  ? 'Streaming multi-channel volumes to local FastAPI backend'
                  : 'Computing patch-wise tensor inferences on local GPU (RTX 4050)'}
              </p>
            </div>
          )}

          {/* Batch Drop Zone */}
          {status !== 'success' && status !== 'uploading' && status !== 'inferring' && status !== 'validating' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSlot('batch');
              }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverSlot(null);
                if (e.dataTransfer.files) handleBatchFiles(e.dataTransfer.files);
              }}
              onClick={() => document.getElementById('modal-batch-input')?.click()}
              className={`group cursor-pointer p-4 rounded-xl border border-dashed transition-all text-center ${
                dragOverSlot === 'batch'
                  ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                  : 'border-slate-700/80 hover:border-cyan-500/60 bg-slate-900/30 hover:bg-cyan-950/20'
              }`}
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
                <span>Drop all 4 NIfTI files here for auto-assignment, or assign each sequence individually below</span>
              </div>
            </div>
          )}

          {/* Sequence Slots Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SEQUENCES.map((seq) => {
              const file = files[seq.id];
              const isDragTarget = dragOverSlot === seq.id;

              return (
                <div
                  key={seq.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverSlot(seq.id);
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverSlot(null);
                    if (e.dataTransfer.files?.[0]) {
                      handleSelectFile(seq.id, e.dataTransfer.files[0]);
                    }
                  }}
                  className={`relative p-3.5 rounded-xl border transition-all ${
                    isDragTarget
                      ? 'border-cyan-400 bg-cyan-950/50 shadow-[0_0_20px_rgba(34,211,238,0.25)]'
                      : file
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
                        disabled={status === 'uploading' || status === 'inferring' || status === 'validating'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors disabled:opacity-40 cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => document.getElementById(`modal-input-${seq.id}`)?.click()}
                        disabled={status === 'uploading' || status === 'inferring' || status === 'validating'}
                        className="px-2.5 py-1 rounded text-[10px] font-mono text-cyan-400 border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 hover:border-cyan-400 transition-colors disabled:opacity-40 cursor-pointer"
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
                    <div className="mt-2.5 pt-2 border-t border-slate-800/40 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                        <span>{seq.required ? 'Required scan' : 'Optional mask'}</span>
                      </span>
                      <span className="text-slate-500">Drop here</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Local Privacy & Medical Invariant Banner */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-2.5 text-xs text-slate-300">
            <Shield className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-slate-400">
              <strong className="text-slate-200">Local Hardware Pipeline:</strong> Scans stay strictly on your local machine. Server verifies 3D spatial dimensions (<code className="text-slate-300">240×240×155</code>), affine orientation (<code className="text-cyan-400">RAS+</code>), and runs MONAI sliding window inference.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Endpoint: <code className="text-slate-300">POST /api/v1/segment/predict</code></span>
          </div>

          <div className="flex items-center gap-3">
            {requiredCount > 0 && status !== 'uploading' && status !== 'inferring' && status !== 'validating' && (
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Reset All
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
                <ArrowRight className="w-3.5 h-3.5" />
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
                {status === 'validating' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Validating...</span>
                  </>
                ) : status === 'uploading' ? (
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
