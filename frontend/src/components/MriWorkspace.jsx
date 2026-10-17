import React, { useRef, useState, useEffect } from 'react';
import {
  UploadCloud,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
  ShieldCheck,
  Layers,
  ArrowRight,
  Loader2,
  FileText,
  Info,
  Check,
  AlertTriangle,
  Compass
} from 'lucide-react';
import Brain3D from './Brain3D';
import {
  validateNiftiFile,
  suggestSequenceFromFilename,
  validateMriDataset
} from '../services/api';

const SEQUENCES = [
  {
    id: 't1',
    name: 'T1',
    fullName: 'T1 Native',
    tag: 'T1',
    desc: 'Anatomical structural baseline & gray/white matter contrast'
  },
  {
    id: 't1gd',
    name: 'T1ce',
    fullName: 'T1ce / T1Gd',
    tag: 'T1CE',
    desc: 'Gadolinium contrast — active enhancing tumor margins (ET)'
  },
  {
    id: 't2',
    name: 'T2',
    fullName: 'T2-Weighted',
    tag: 'T2',
    desc: 'Water/fluid sensitivity — bulk lesion and edema hyperintensity'
  },
  {
    id: 'flair',
    name: 'FLAIR',
    fullName: 'FLAIR',
    tag: 'FLAIR',
    desc: 'Fluid Attenuated Inversion Recovery — peritumoral vasogenic edema (ED)'
  }
];

export default function MriWorkspace({ workspaceRef, onInferenceSuccess }) {
  // ─── File State ────────────────────────────────────────────────────────────
  const [files, setFiles] = useState({
    t1: null,
    t1gd: null,
    t2: null,
    flair: null
  });

  // Slot validation states: 'empty' | 'selected' | 'validating' | 'valid' | 'invalid'
  const [slotStates, setSlotStates] = useState({
    t1: 'empty',
    t1gd: 'empty',
    t2: 'empty',
    flair: 'empty'
  });

  // Per-slot error messages
  const [slotErrors, setSlotErrors] = useState({
    t1: null,
    t1gd: null,
    t2: null,
    flair: null
  });

  // Per-slot verified metadata from backend
  const [slotMetadata, setSlotMetadata] = useState({
    t1: null,
    t1gd: null,
    t2: null,
    flair: null
  });

  // ─── Overall Dataset Validation State ──────────────────────────────────────
  // 'idle' | 'validating' | 'valid' | 'invalid'
  const [datasetValidationStatus, setDatasetValidationStatus] = useState('idle');
  const [datasetError, setDatasetError] = useState(null);
  const [datasetValidationResult, setDatasetValidationResult] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [suggestionBanner, setSuggestionBanner] = useState(null);

  const fileInputRefs = {
    t1: useRef(null),
    t1gd: useRef(null),
    t2: useRef(null),
    flair: useRef(null)
  };

  const abortControllerRef = useRef(null);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // ─── Sequence Selection & Pre-Flight ───────────────────────────────────────
  const handleAssignFile = (slotId, file) => {
    if (!file) return;

    setDatasetValidationStatus('idle');
    setDatasetError(null);
    setDatasetValidationResult(null);

    // 1. Client-Side Format and 1 GiB Size Guard
    const val = validateNiftiFile(file);
    if (!val.valid) {
      setSlotStates((prev) => ({ ...prev, [slotId]: 'invalid' }));
      setSlotErrors((prev) => ({ ...prev, [slotId]: val.error }));
      setFiles((prev) => ({ ...prev, [slotId]: file }));
      return;
    }

    // 2. Prevent duplicate file assignment across slots
    for (const [otherId, existing] of Object.entries(files)) {
      if (otherId !== slotId && existing && existing.name === file.name && existing.size === file.size) {
        const otherName = SEQUENCES.find((s) => s.id === otherId)?.fullName || otherId;
        setSlotStates((prev) => ({ ...prev, [slotId]: 'invalid' }));
        setSlotErrors((prev) => ({
          ...prev,
          [slotId]: `Duplicate scan: "${file.name}" is already assigned to ${otherName}. Each slot requires a distinct MRI modality.`
        }));
        setFiles((prev) => ({ ...prev, [slotId]: file }));
        return;
      }
    }

    setSlotErrors((prev) => ({ ...prev, [slotId]: null }));
    setSlotStates((prev) => ({ ...prev, [slotId]: 'selected' }));
    setFiles((prev) => ({ ...prev, [slotId]: file }));
  };

  const handleRemoveFile = (slotId, e) => {
    if (e) e.stopPropagation();
    setFiles((prev) => ({ ...prev, [slotId]: null }));
    setSlotStates((prev) => ({ ...prev, [slotId]: 'empty' }));
    setSlotErrors((prev) => ({ ...prev, [slotId]: null }));
    setSlotMetadata((prev) => ({ ...prev, [slotId]: null }));
    setDatasetValidationStatus('idle');
    setDatasetError(null);
    setDatasetValidationResult(null);
    if (fileInputRefs[slotId].current) {
      fileInputRefs[slotId].current.value = '';
    }
  };

  const handleBatchDrop = (fileList) => {
    const rawFiles = Array.from(fileList);
    const newAssignments = { ...files };
    const suggestions = [];
    const usedNames = new Set();

    rawFiles.forEach((file) => {
      const suggestion = suggestSequenceFromFilename(file.name);
      if (suggestion.slotId && !usedNames.has(file.name) && !newAssignments[suggestion.slotId]) {
        newAssignments[suggestion.slotId] = file;
        usedNames.add(file.name);
        suggestions.push({
          filename: file.name,
          slot: suggestion.slotId,
          confidence: suggestion.confidence
        });
      }
    });

    if (suggestions.length > 0) {
      Object.entries(newAssignments).forEach(([slotId, f]) => {
        if (f) handleAssignFile(slotId, f);
      });
      setSuggestionBanner(
        `Auto-detected ${suggestions.length} sequence(s) from filenames. You can verify or manually change any slot.`
      );
    } else {
      setSuggestionBanner('Could not auto-detect sequences from filenames. Please assign files to each slot individually.');
    }
  };

  const handleResetAll = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setFiles({ t1: null, t1gd: null, t2: null, flair: null });
    setSlotStates({ t1: 'empty', t1gd: 'empty', t2: 'empty', flair: 'empty' });
    setSlotErrors({ t1: null, t1gd: null, t2: null, flair: null });
    setSlotMetadata({ t1: null, t1gd: null, t2: null, flair: null });
    setDatasetValidationStatus('idle');
    setDatasetError(null);
    setDatasetValidationResult(null);
    setSuggestionBanner(null);
    Object.values(fileInputRefs).forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
  };

  // ─── Authoritative Backend Dataset Validation ──────────────────────────────
  const handleValidateDataset = async () => {
    const missing = SEQUENCES.filter((s) => !files[s.id]);
    if (missing.length > 0) {
      setDatasetError(`Please select all four required sequences (${missing.map((s) => s.name).join(', ')}).`);
      return;
    }

    setDatasetValidationStatus('validating');
    setDatasetError(null);
    setSlotStates({
      t1: 'validating',
      t1gd: 'validating',
      t2: 'validating',
      flair: 'validating'
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await validateMriDataset({
        t1: files.t1,
        t1gd: files.t1gd,
        t2: files.t2,
        flair: files.flair,
        patientId: 'BraTS2021_CASE',
        signal: controller.signal
      });

      setDatasetValidationResult(result);
      setDatasetValidationStatus('valid');

      const meta = result.sequences || {};
      setSlotMetadata(meta);
      setSlotStates({
        t1: 'valid',
        t1gd: 'valid',
        t2: 'valid',
        flair: 'valid'
      });
      setSlotErrors({ t1: null, t1gd: null, t2: null, flair: null });
    } catch (err) {
      if (err.name === 'AbortError') {
        setDatasetValidationStatus('idle');
        return;
      }

      setDatasetValidationStatus('invalid');
      const errorMsg = err.message || 'Dataset validation failed on the backend.';
      setDatasetError(errorMsg);

      const detail = err.detail || {};
      const targetSeq = detail.sequence || detail.target || null;

      if (targetSeq && slotStates[targetSeq]) {
        setSlotStates((prev) => ({ ...prev, [targetSeq]: 'invalid' }));
        setSlotErrors((prev) => ({ ...prev, [targetSeq]: errorMsg }));
      } else {
        setSlotStates((prev) => ({
          t1: prev.t1 === 'validating' ? 'selected' : prev.t1,
          t1gd: prev.t1gd === 'validating' ? 'selected' : prev.t1gd,
          t2: prev.t2 === 'validating' ? 'selected' : prev.t2,
          flair: prev.flair === 'validating' ? 'selected' : prev.flair
        }));
      }
    }
  };

  const handleContinueToViewer = () => {
    if (datasetValidationStatus !== 'valid') return;
    if (onInferenceSuccess) {
      onInferenceSuccess(null, files);
    }
  };

  const selectedCount = Object.values(files).filter(Boolean).length;
  const allSelected = selectedCount === 4;
  const isValidating = datasetValidationStatus === 'validating';
  const isFullyValid = datasetValidationStatus === 'valid';

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <section
      ref={workspaceRef}
      id="mri-workspace"
      className="relative w-full bg-[#E9DDD5] text-[#30252A] py-14 px-6 lg:px-12 border-t border-[#DDD0C8]"
    >
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ─── 1. Header: Editorial Branding + Step Tracker + Disclaimer ─── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#DDD0C8]">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-[#F3ECE7] text-[#6D263D] border border-[#DDD0C8] shadow-xs">
                MRI Ingestion & Geometric Integrity
              </span>
              <span className="text-xs text-[#6E5D65] font-mono">
                BraTS 2021 mpMRI Standard
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-[#30252A] font-serif leading-[1.06]">
              Prepare your MRI dataset.
            </h2>
            <p className="text-xs sm:text-sm text-[#56474E] max-w-2xl leading-relaxed pt-1 font-sans">
              Assign the four co-registered multi-parametric sequences (<span className="font-semibold text-[#6D263D]">T1</span>, <span className="font-semibold text-[#6D263D]">T1ce</span>, <span className="font-semibold text-[#6D263D]">T2</span>, <span className="font-semibold text-[#6D263D]">FLAIR</span>). Scans must be genuine 3D volumes in NIfTI format (<code className="text-[#30252A] font-mono text-xs">.nii</code> or <code className="text-[#30252A] font-mono text-xs">.nii.gz</code>, maximum 1 GiB per file).
            </p>
          </div>

          {/* Workflow Step Tracker */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-1.5 bg-[#F8F5F0] p-1.5 rounded-full border border-[#DDD0C8] text-xs font-sans shadow-xs">
              <span className={`px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors ${
                !isFullyValid
                  ? 'bg-[#6D263D] text-[#F8F5F0] font-semibold'
                  : 'text-[#6E5D65]'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#F8F5F0]" />
                <span>1. Upload</span>
              </span>
              <span className="text-[#DDD0C8]">→</span>
              <span className={`px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors ${
                isValidating
                  ? 'bg-[#8C485A] text-[#F8F5F0] font-semibold animate-pulse'
                  : isFullyValid
                  ? 'bg-emerald-700 text-[#F8F5F0] font-semibold'
                  : 'text-[#8C7C83]'
              }`}>
                {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : isFullyValid ? <Check className="w-3 h-3" /> : null}
                <span>2. Validate</span>
              </span>
              <span className="text-[#DDD0C8]">→</span>
              <span className="px-3 py-1 rounded-full text-[#8C7C83]">
                3. Inspect
              </span>
              <span className="text-[#DDD0C8]">→</span>
              <span className="px-3 py-1 rounded-full text-[#8C7C83]">
                4. Segment
              </span>
            </div>

            <div className="text-[11px] font-mono px-3 py-1.5 rounded-full bg-[#F3ECE7] border border-[#DDD0C8] text-[#6E5D65] shadow-xs">
              Guardrail: 1 GiB / file
            </div>
          </div>
        </div>

        {/* Suggestion Notification */}
        {suggestionBanner && (
          <div className="p-3.5 rounded-2xl bg-[#F8F5F0] border border-[#6D263D]/30 flex items-center justify-between text-xs text-[#30252A] shadow-sm animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-[#6D263D] flex-shrink-0" />
              <span className="font-sans leading-normal">{suggestionBanner}</span>
            </div>
            <button
              onClick={() => setSuggestionBanner(null)}
              className="p-1 rounded-full text-[#8C7C83] hover:text-[#30252A] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ─── 2. Main Grid: 4 Upload Slots (Left) + 3D Reference Model (Right) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Column (7 cols): 4 Sequence Upload Cards */}
          <div className="lg:col-span-7 space-y-4">

            {/* Batch Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSlot('batch');
              }}
              onDragLeave={() => setDragOverSlot(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverSlot(null);
                if (e.dataTransfer.files) handleBatchDrop(e.dataTransfer.files);
              }}
              onClick={() => document.getElementById('batch-multi-input')?.click()}
              className={`p-4 rounded-2xl border border-dashed transition-all cursor-pointer text-center group ${
                dragOverSlot === 'batch'
                  ? 'border-[#6D263D] bg-[#F8F5F0] shadow-md scale-[1.01]'
                  : 'border-[#DDD0C8] hover:border-[#6D263D]/60 bg-[#F8F5F0]/70 hover:bg-[#F8F5F0]'
              }`}
            >
              <input
                id="batch-multi-input"
                type="file"
                multiple
                accept=".nii,.nii.gz"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleBatchDrop(e.target.files);
                }}
              />
              <div className="flex items-center justify-center gap-2.5 text-xs text-[#56474E] group-hover:text-[#30252A] transition-colors">
                <UploadCloud className="w-4 h-4 text-[#6D263D] group-hover:scale-110 transition-transform" />
                <span className="font-medium">
                  Drop all 4 NIfTI files here for auto-detection, or assign each sequence individually below
                </span>
              </div>
            </div>

            {/* Four Discrete Sequence Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {SEQUENCES.map((seq) => {
                const file = files[seq.id];
                const state = slotStates[seq.id];
                const error = slotErrors[seq.id];
                const meta = slotMetadata[seq.id];
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
                      const dropped = e.dataTransfer.files?.[0];
                      if (dropped) handleAssignFile(seq.id, dropped);
                    }}
                    className={`relative rounded-2xl p-4 border transition-all duration-200 flex flex-col justify-between shadow-xs ${
                      state === 'valid'
                        ? 'bg-[#F8F5F0] border-emerald-500/60 shadow-sm'
                        : state === 'invalid'
                        ? 'bg-rose-50/70 border-rose-300 shadow-sm'
                        : state === 'validating'
                        ? 'bg-[#F8F5F0] border-[#6D263D]/50 animate-pulse'
                        : file
                        ? 'bg-[#F8F5F0] border-[#6D263D]/40'
                        : isDragTarget
                        ? 'bg-[#F8F5F0] border-[#6D263D] shadow-md scale-[1.01]'
                        : 'bg-[#F8F5F0] border-[#DDD0C8] hover:border-[#6D263D]/40'
                    }`}
                  >
                    {/* Hidden Native File Input */}
                    <input
                      ref={fileInputRefs[seq.id]}
                      type="file"
                      accept=".nii,.nii.gz"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleAssignFile(seq.id, e.target.files[0]);
                      }}
                    />

                    <div>
                      {/* Slot Header: Modality Tag + Name + Status Pill */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-[#EBE3DE]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#F3ECE7] text-[#6D263D] border border-[#DDD0C8]">
                            {seq.tag}
                          </span>
                          <span className="text-sm font-bold text-[#30252A] font-serif">
                            {seq.name}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {state === 'valid' && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              <span>Verified 3D</span>
                            </span>
                          )}
                          {state === 'validating' && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F3ECE7] text-[#6D263D] border border-[#6D263D]/30 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin text-[#6D263D]" />
                              <span>Validating</span>
                            </span>
                          )}
                          {state === 'invalid' && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 font-semibold">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>Invalid</span>
                            </span>
                          )}
                          {state === 'selected' && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EAE0D9] text-[#30252A] border border-[#DDD0C8]">
                              Selected
                            </span>
                          )}
                          {state === 'empty' && (
                            <span className="text-[10px] font-mono text-[#8C7C83]">
                              Empty slot
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-[11px] text-[#56474E] mt-2 line-clamp-1 leading-normal font-sans">
                        {seq.desc}
                      </p>

                      {/* File Details or Dropzone Callout */}
                      {file ? (
                        <div className="mt-3 p-2.5 rounded-xl bg-[#F3ECE7] border border-[#DDD0C8] space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span title={file.name} className="font-mono text-[#30252A] truncate max-w-[190px] text-[11px] font-semibold">
                              {file.name}
                            </span>
                            <span className="text-[10px] font-mono text-[#6E5D65] flex-shrink-0">
                              {formatBytes(file.size)}
                            </span>
                          </div>

                          {/* Verified Spatial Metadata (when validated) */}
                          {meta && (
                            <div className="pt-1 border-t border-[#DDD0C8] flex items-center justify-between text-[10px] font-mono text-[#6D263D]">
                              <span>Grid: {meta.dimensions?.join('×')}</span>
                              <span>{meta.orientation || 'RAS'} · {meta.voxel_spacing_mm?.[0]}mm</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRefs[seq.id].current?.click()}
                          className="mt-3 py-3.5 px-2 rounded-xl border border-dashed border-[#DDD0C8] hover:border-[#6D263D]/60 bg-[#F4ECE7]/50 hover:bg-[#F4ECE7] transition-all cursor-pointer text-center group"
                        >
                          <span className="text-xs text-[#6D263D] font-semibold group-hover:underline">
                            Choose NIfTI file
                          </span>
                          <span className="block text-[10px] text-[#8C7C83] mt-0.5 font-mono">
                            .nii or .nii.gz (≤ 1 GiB)
                          </span>
                        </div>
                      )}

                      {/* Error Message */}
                      {error && (
                        <div className="mt-2.5 p-2 rounded-xl bg-rose-100 border border-rose-300 text-[10px] text-rose-800 flex items-start gap-1.5 leading-snug">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-700 flex-shrink-0 mt-0.5" />
                          <span>{error}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions: Change / Remove */}
                    {file && (
                      <div className="mt-3 pt-2.5 border-t border-[#EBE3DE] flex items-center justify-between gap-2">
                        <button
                          onClick={() => fileInputRefs[seq.id].current?.click()}
                          disabled={isValidating}
                          className="px-3 py-1 rounded-full text-[11px] font-sans font-medium text-[#6D263D] bg-[#F3ECE7] hover:bg-[#EAE0D9] border border-[#DDD0C8] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Replace</span>
                        </button>
                        <button
                          onClick={(e) => handleRemoveFile(seq.id, e)}
                          disabled={isValidating}
                          className="p-1 rounded-full text-[#8C7C83] hover:text-[#991b1b] hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-40"
                          title="Remove file"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Validation Feedback & Dataset Level Errors */}
            {datasetError && (
              <div className="p-4 rounded-2xl bg-rose-100/90 border border-rose-300 flex items-start gap-3 text-xs text-rose-900 shadow-sm animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-700 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-rose-950 font-sans">Dataset Validation Invariant Failed</p>
                  <p className="text-[11px] text-rose-800 leading-relaxed font-sans">{datasetError}</p>
                </div>
              </div>
            )}

            {/* Validation Success Card */}
            {isFullyValid && datasetValidationResult && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-2.5 text-xs text-emerald-950 shadow-sm animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-emerald-900 text-sm font-sans">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Authoritative Backend Validation Succeeded</span>
                  </div>
                  <span className="font-mono text-[10px] text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">
                    HTTP 200 · Co-registered
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono text-[11px]">
                  <div className="p-2 rounded-xl bg-[#F8F5F0] border border-[#DDD0C8]">
                    <span className="text-[#6E5D65] text-[10px] block">Dimensions</span>
                    <span className="text-[#30252A] font-bold">
                      {datasetValidationResult.geometry?.dimensions?.join('×')}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F8F5F0] border border-[#DDD0C8]">
                    <span className="text-[#6E5D65] text-[10px] block">Voxel Spacing</span>
                    <span className="text-[#6D263D] font-bold">
                      {datasetValidationResult.geometry?.voxel_spacing_mm?.[0]} mm
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#F8F5F0] border border-[#DDD0C8]">
                    <span className="text-[#6E5D65] text-[10px] block">Orientation</span>
                    <span className="text-emerald-800 font-bold">
                      {datasetValidationResult.geometry?.orientation} (RAS+)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column (5 cols): 3D Anatomical Reference Atlas Panel */}
          <div className="lg:col-span-5 space-y-4">
            <div className="relative rounded-2xl bg-[#F8F5F0] border border-[#DDD0C8] overflow-hidden shadow-sm flex flex-col h-[480px]">

              {/* 3D Header with Mandatory Disclaimer Badge */}
              <div className="p-4 pb-2 z-10 flex items-start justify-between gap-2 border-b border-[#EBE3DE] bg-[#F8F5F0]/90 backdrop-blur-md">
                <div>
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#6D263D]" />
                    <h3 className="text-sm font-bold text-[#30252A] font-serif tracking-tight">
                      3D Anatomical Reference
                    </h3>
                  </div>
                  <p className="text-[10px] font-mono text-[#6E5D65] mt-0.5">
                    Cortical structural orientation atlas
                  </p>
                </div>

                {/* Explicit Disclaimer Label */}
                <div className="px-2.5 py-1 rounded-full bg-[#F3ECE7] border border-[#6D263D]/30 text-[9px] font-mono text-[#6D263D] font-bold uppercase tracking-wider text-right flex-shrink-0">
                  REFERENCE ANATOMY<br />NOT PATIENT DATA
                </div>
              </div>

              {/* Interactive Three.js Anatomical Brain */}
              <div className="relative flex-1 w-full bg-[#EAE0D9]/50 overflow-hidden">
                <Brain3D />

                {/* Subtle Sequence Legend Overlay */}
                <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-[#F8F5F0]/95 border border-[#DDD0C8] backdrop-blur-md z-10 shadow-sm">
                  <div className="text-[10px] font-mono text-[#6E5D65] uppercase tracking-wider font-semibold mb-1.5 flex items-center justify-between">
                    <span>mpMRI Modality Legend</span>
                    <span className="text-[9px] text-[#8C7C83]">4 Core Scans Required</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono">
                    <div className="flex items-center gap-1.5 text-[#30252A]">
                      <span className="w-2 h-2 rounded-full bg-[#6D263D]" />
                      <span>T1: Parenchyma Baseline</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#30252A]">
                      <span className="w-2 h-2 rounded-full bg-[#be123c]" />
                      <span>T1ce: Enhancing Margin</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#30252A]">
                      <span className="w-2 h-2 rounded-full bg-[#0d9488]" />
                      <span>T2: Bulk Fluid Lesion</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#30252A]">
                      <span className="w-2 h-2 rounded-full bg-[#d97706]" />
                      <span>FLAIR: Vasogenic Edema</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Hardware & Integrity Invariant Box */}
            <div className="p-4 rounded-2xl bg-[#F8F5F0] border border-[#DDD0C8] flex items-start gap-3 text-xs text-[#56474E] shadow-xs">
              <ShieldCheck className="w-4 h-4 text-[#6D263D] flex-shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed font-sans">
                <strong className="text-[#30252A]">Local Integrity Pipeline:</strong> Validation tests spatial dimensions, non-singular coordinate affines, and absence of non-finite voxels on your local FastAPI server before proceeding to the 3D viewer.
              </div>
            </div>
          </div>

        </div>

        {/* ─── 3. Bottom Action Bar & Validation Gating ─── */}
        <div className="p-5 rounded-2xl bg-[#F8F5F0] border border-[#DDD0C8] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="text-xs text-[#56474E] font-sans">
              Status: <span className="text-[#30252A] font-semibold">{selectedCount}/4 sequences assigned</span>
              {isFullyValid && (
                <span className="ml-2 text-emerald-800 font-bold">· Dataset Validated</span>
              )}
            </div>
            {selectedCount > 0 && (
              <button
                onClick={handleResetAll}
                disabled={isValidating}
                className="text-[11px] font-mono text-[#8C7C83] hover:text-[#6D263D] underline cursor-pointer disabled:opacity-40"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* 1. Authoritative Backend Validation Trigger */}
            <button
              onClick={handleValidateDataset}
              disabled={!allSelected || isValidating}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-sans font-medium text-xs sm:text-sm tracking-wide transition-all ${
                allSelected && !isValidating
                  ? 'bg-[#F3ECE7] hover:bg-[#EAE0D9] text-[#30252A] border border-[#DDD0C8] shadow-xs cursor-pointer'
                  : 'bg-[#F3ECE7]/50 text-[#8C7C83] border border-[#DDD0C8]/50 cursor-not-allowed opacity-60'
              }`}
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#6D263D]" />
                  <span>Validating Dataset...</span>
                </>
              ) : isFullyValid ? (
                <>
                  <Check className="w-4 h-4 text-emerald-700" />
                  <span>Re-Validate Dataset</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4 text-[#6D263D]" />
                  <span>Validate MRI Dataset</span>
                </>
              )}
            </button>

            {/* 2. Continue to Viewer (Gated strictly until validation passes) */}
            <button
              onClick={handleContinueToViewer}
              disabled={!isFullyValid || isValidating}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full font-sans font-medium text-xs sm:text-sm tracking-wide transition-all duration-300 ${
                isFullyValid && !isValidating
                  ? 'bg-[#6D263D] text-[#F8F5F0] hover:bg-[#581D30] shadow-[0_6px_20px_rgba(109,38,61,0.25)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer font-semibold'
                  : 'bg-[#DDD0C8] text-[#8C7C83] cursor-not-allowed opacity-60'
              }`}
            >
              <span>Continue to Viewer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── 4. Educational & Research Disclaimer ─── */}
        <div className="pt-2 text-center">
          <p className="text-[11px] font-mono text-[#8C7C83]">
            This prototype is for research and educational use only. It is not a diagnostic or clinical decision-making tool.
          </p>
        </div>

      </div>
    </section>
  );
}
