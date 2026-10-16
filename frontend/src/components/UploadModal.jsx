import React, { useState, useRef, useCallback } from 'react';
import {
  X,
  UploadCloud,
  FileCheck,
  AlertCircle,
  Info,
  Shield,
  Trash2,
  Loader2,
  CheckCircle2,
  ServerCrash,
  FlaskConical,
} from 'lucide-react';
import { predictSegmentation, ApiError, MAX_FILE_BYTES } from '../services/api';

// ─── Sequence Definitions ─────────────────────────────────────────────────────
const SEQUENCES = [
  {
    id: 't1',
    name: 'T1 Native',
    tag: 'T1',
    description: 'Anatomical reference & structural baseline',
  },
  {
    id: 't1gd',
    name: 'T1Gd (Gadolinium)',
    tag: 'T1CE',
    description: 'Vascular breakdown & active tumor margin (ET)',
  },
  {
    id: 't2',
    name: 'T2-Weighted',
    tag: 'T2',
    description: 'Bulk hyperintense lesions & fluid content',
  },
  {
    id: 'flair',
    name: 'FLAIR',
    tag: 'FLAIR',
    description: 'Fluid-suppressed vasogenic peritumoral edema (ED)',
  },
];

/**
 * Upload state machine values.
 * idle → inferring → success
 *                 ↘ error
 */
const STATUS = {
  IDLE: 'idle',
  INFERRING: 'inferring',
  SUCCESS: 'success',
  ERROR: 'error',
};

const MAX_FILE_LABEL = '1 GiB';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function isValidExtension(fileName) {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.nii') || lower.endsWith('.nii.gz');
}

function validateFile(file) {
  if (!isValidExtension(file.name)) {
    return `"${file.name}" is not a valid NIfTI file. Only .nii and .nii.gz files are accepted.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" exceeds the ${MAX_FILE_LABEL} per-file limit (file is ${formatFileSize(file.size)}).`;
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UploadModal({ isOpen, onClose, onSegmentationComplete }) {
  // ── All hooks are declared unconditionally at the top ──────────────────────
  const [files, setFiles] = useState({ t1: null, t1gd: null, t2: null, flair: null });
  const [validationError, setValidationError] = useState(null);
  const [status, setStatus] = useState(STATUS.IDLE);
  const [errorMsg, setErrorMsg] = useState(null);
  const [result, setResult] = useState(null);

  // One ref per sequence slot plus the batch input — declared unconditionally
  const refT1 = useRef(null);
  const refT1gd = useRef(null);
  const refT2 = useRef(null);
  const refFlair = useRef(null);
  const refBatch = useRef(null);

  // Map sequence id → ref for convenience
  const fileInputRefs = {
    t1: refT1,
    t1gd: refT1gd,
    t2: refT2,
    flair: refFlair,
    batch: refBatch,
  };

  const isProcessing = status === STATUS.INFERRING;

  // ── Individual File Selection ──────────────────────────────────────────────
  const handleSelectFile = useCallback((seqId, file) => {
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setFiles((prev) => ({ ...prev, [seqId]: file }));
  }, []);

  // ── Batch Auto-Assignment ──────────────────────────────────────────────────
  const handleBatchFiles = useCallback((uploadedFiles) => {
    setValidationError(null);
    const updated = {};
    let assignedCount = 0;
    const sizeErrors = [];

    Array.from(uploadedFiles).forEach((file) => {
      if (!isValidExtension(file.name)) return;
      if (file.size > MAX_FILE_BYTES) {
        sizeErrors.push(`"${file.name}" exceeds the ${MAX_FILE_LABEL} limit (${formatFileSize(file.size)}).`);
        return;
      }
      const lower = file.name.toLowerCase();
      if (lower.includes('t1ce') || lower.includes('t1gd') || lower.includes('t1_ce')) {
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

    if (sizeErrors.length > 0) {
      setValidationError(sizeErrors.join(' '));
      return;
    }
    if (assignedCount === 0) {
      setValidationError(
        'Could not auto-detect sequence types from filenames. Please assign each sequence individually.'
      );
    } else {
      setFiles((prev) => ({ ...prev, ...updated }));
    }
  }, []);

  // ── File Removal ──────────────────────────────────────────────────────────
  const handleRemoveFile = useCallback((seqId) => {
    setFiles((prev) => ({ ...prev, [seqId]: null }));
    const ref = fileInputRefs[seqId];
    if (ref?.current) ref.current.value = '';
  // fileInputRefs is a stable object referencing stable useRef values — safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Clear All ─────────────────────────────────────────────────────────────
  const handleClearAll = useCallback(() => {
    setFiles({ t1: null, t1gd: null, t2: null, flair: null });
    [refT1, refT1gd, refT2, refFlair, refBatch].forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
    setValidationError(null);
    setStatus(STATUS.IDLE);
    setErrorMsg(null);
    setResult(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dismiss Inference Error ───────────────────────────────────────────────
  const handleDismissError = useCallback(() => {
    setStatus(STATUS.IDLE);
    setErrorMsg(null);
  }, []);

  // ── Submit Segmentation Request ───────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setStatus(STATUS.INFERRING);
    setErrorMsg(null);
    setResult(null);

    try {
      const prediction = await predictSegmentation({
        t1: files.t1,
        t1gd: files.t1gd,
        t2: files.t2,
        flair: files.flair,
      });
      setResult(prediction);
      setStatus(STATUS.SUCCESS);
      if (typeof onSegmentationComplete === 'function') {
        onSegmentationComplete(prediction);
      }
    } catch (err) {
      setStatus(STATUS.ERROR);
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred. Check the browser console for details.');
      }
    }
  }, [files, onSegmentationComplete]);

  // ── Derived State ─────────────────────────────────────────────────────────
  const uploadedCount = Object.values(files).filter(Boolean).length;

  // ── Early return AFTER all hooks ──────────────────────────────────────────
  if (!isOpen) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-[#090D16] border border-slate-800 shadow-[0_0_60px_-15px_rgba(6,182,212,0.2)] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/50 text-cyan-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
                Upload mpMRI Sequences
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-normal">
                  {uploadedCount}/4 Ready
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Assign co-registered NIfTI scans (
                <span className="text-cyan-300">.nii</span> or{' '}
                <span className="text-cyan-300">.nii.gz</span>, max {MAX_FILE_LABEL} each) for 3D BraTS segmentation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
            disabled={isProcessing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Modal Body ───────────────────────────────────────────────── */}
        <div className="p-6 overflow-y-auto space-y-6">

          {/* File format / size validation error */}
          {validationError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center gap-3 text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Inference error banner */}
          {status === STATUS.ERROR && errorMsg && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-start gap-3 text-rose-200 text-xs">
              <ServerCrash className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-rose-100">Segmentation Failed</p>
                <p className="text-rose-300 leading-relaxed">{errorMsg}</p>
              </div>
              <button
                onClick={handleDismissError}
                className="p-1 rounded text-rose-400 hover:text-rose-200 transition-colors"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Success result panel */}
          {status === STATUS.SUCCESS && result && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-200 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  Segmentation Complete — {result.execution_time_seconds?.toFixed(2)}s
                  {result.hardware_device ? ` on ${result.hardware_device}` : ''}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Whole Tumor', key: 'whole_tumor', color: 'text-cyan-300' },
                  { label: 'Tumor Core', key: 'tumor_core', color: 'text-teal-300' },
                  { label: 'Enhancing', key: 'enhancing_tumor', color: 'text-rose-300' },
                ].map(({ label, key, color }) => (
                  <div
                    key={key}
                    className="rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-center"
                  >
                    <p className={`text-sm font-mono font-bold ${color}`}>
                      {result.volumes_ml?.[key] != null
                        ? `${result.volumes_ml[key].toFixed(2)} mL`
                        : '— mL'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 font-mono">
                Research prototype · AI-predicted candidate regions · Not a clinical diagnostic
              </p>
            </div>
          )}

          {/* Inferring progress banner */}
          {isProcessing && (
            <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/40 flex items-center gap-3 text-cyan-200 text-xs">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin flex-shrink-0" />
              <div>
                <p className="font-semibold">Running MONAI 3D SegResNet inference…</p>
                <p className="text-cyan-400/70 mt-0.5">
                  Sliding-window inference in progress. This may take 10–60 seconds on GPU.
                </p>
              </div>
            </div>
          )}

          {/* Batch drop zone — hidden while processing or after success */}
          {!isProcessing && status !== STATUS.SUCCESS && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handleBatchFiles(e.dataTransfer.files);
              }}
              onClick={() => refBatch.current?.click()}
              className="group cursor-pointer p-4 rounded-xl border border-dashed border-slate-700/80 hover:border-cyan-500/60 bg-slate-900/30 hover:bg-cyan-950/20 transition-all text-center"
            >
              <input
                ref={refBatch}
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

          {/* 4 Sequence Slots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {SEQUENCES.map((seq) => {
              const file = files[seq.id];
              const ref = fileInputRefs[seq.id];
              return (
                <div
                  key={seq.id}
                  className={`relative p-4 rounded-xl border transition-all ${
                    file
                      ? 'border-cyan-500/50 bg-cyan-950/20 shadow-[0_0_15px_-3px_rgba(34,211,238,0.1)]'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                  } ${isProcessing ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <input
                    ref={ref}
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
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800/80 text-cyan-300 border border-slate-700">
                          {seq.tag}
                        </span>
                        <h4 className="text-sm font-semibold text-slate-200">{seq.name}</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{seq.description}</p>
                    </div>

                    {file ? (
                      <button
                        onClick={() => handleRemoveFile(seq.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                        title="Remove file"
                        disabled={isProcessing}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => ref.current?.click()}
                        className="px-2.5 py-1 rounded text-[11px] font-mono text-cyan-400 border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 hover:border-cyan-400 transition-colors"
                        disabled={isProcessing}
                      >
                        Select
                      </button>
                    )}
                  </div>

                  {/* Selected file details */}
                  {file ? (
                    <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <FileCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-slate-200 font-mono truncate text-[11px]">{file.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-slate-800/40 flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                      <span>Awaiting .nii / .nii.gz (max {MAX_FILE_LABEL})</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Backend-standby notice — only shown before first submission */}
          {status === STATUS.IDLE && (
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3 text-xs text-slate-300">
              <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-slate-200">Local Frontend Stage · AI Inference Standby</p>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Selected files are kept strictly within your local browser sandbox. Once the local backend server (
                  <code className="text-cyan-300 font-mono">/api/v1/segment/predict</code>) is launched, these scans
                  will be forwarded to the MONAI SegResNet 3D inference engine. No fake predictions or synthetic metrics
                  are displayed.
                </p>
              </div>
            </div>
          )}

          {/* Persistent research disclaimer */}
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-900/30 flex items-start gap-2.5 text-[11px] text-amber-200/70">
            <FlaskConical className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong className="text-amber-300/90">Research &amp; Educational Prototype Only.</strong> AI-predicted
              candidate tumour regions. Not a certified diagnostic device. Not a replacement for professional
              radiological evaluation. Never transmit identifiable patient data.
            </span>
          </div>
        </div>

        {/* ── Modal Footer ─────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero-cloud transmission</span>
          </div>

          <div className="flex items-center gap-3">
            {uploadedCount > 0 && !isProcessing && status !== STATUS.SUCCESS && (
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear All
              </button>
            )}

            {status === STATUS.SUCCESS ? (
              <button
                onClick={handleClearAll}
                className="px-5 py-2 rounded-xl text-xs font-semibold tracking-wide bg-slate-700 text-slate-200 hover:bg-slate-600 transition-all"
              >
                Upload New Study
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={uploadedCount < 4 || isProcessing}
                title={
                  uploadedCount < 4
                    ? 'Please select all 4 sequences'
                    : isProcessing
                    ? 'Inference in progress…'
                    : 'Send to MONAI backend for segmentation'
                }
                className={`px-5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all flex items-center gap-2 ${
                  uploadedCount === 4 && !isProcessing
                    ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 font-bold hover:shadow-[0_0_20px_-3px_rgba(34,211,238,0.5)] cursor-pointer'
                    : 'bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isProcessing
                  ? 'Running Inference…'
                  : uploadedCount === 4
                  ? 'Run Segmentation'
                  : `Assign All 4 Sequences (${uploadedCount}/4)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
