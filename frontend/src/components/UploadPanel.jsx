import React, { useRef, useState } from 'react';
import { FilePlus, FileText, X, AlertCircle, RotateCcw, ArrowRight, ShieldCheck } from 'lucide-react';
import { validateNiftiFile } from '../services/api';

const SLOTS = [
  { id: 't1', name: 'T1', label: 'T1 Native' },
  { id: 't1gd', name: 'T1Gd', label: 'T1Gd Contrast' },
  { id: 't2', name: 'T2', label: 'T2-Weighted' },
  { id: 'flair', name: 'FLAIR', label: 'FLAIR Edema' }
];

export default function UploadPanel({ panelRef, onOpenModal }) {
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

  const fileInputRefs = {
    t1: useRef(null),
    t1gd: useRef(null),
    t2: useRef(null),
    flair: useRef(null)
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleFileChange = (slotId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateNiftiFile(file);
    if (!validation.valid) {
      setErrors((prev) => ({
        ...prev,
        [slotId]: validation.error
      }));
      return;
    }

    // Check for duplicate assignment across slots
    for (const [key, existingFile] of Object.entries(files)) {
      if (key !== slotId && existingFile && existingFile.name === file.name && existingFile.size === file.size) {
        const slotName = SLOTS.find((s) => s.id === key)?.name || key;
        setErrors((prev) => ({
          ...prev,
          [slotId]: `Already assigned to ${slotName}`
        }));
        return;
      }
    }

    setErrors((prev) => ({ ...prev, [slotId]: null }));
    setFiles((prev) => ({ ...prev, [slotId]: file }));
  };

  const handleRemove = (slotId, e) => {
    e.stopPropagation();
    setFiles((prev) => ({ ...prev, [slotId]: null }));
    setErrors((prev) => ({ ...prev, [slotId]: null }));
    if (fileInputRefs[slotId].current) {
      fileInputRefs[slotId].current.value = '';
    }
  };

  const handleReplace = (slotId, e) => {
    e.stopPropagation();
    fileInputRefs[slotId].current?.click();
  };

  const handleClearAll = () => {
    setFiles({ t1: null, t1gd: null, t2: null, flair: null });
    setErrors({ t1: null, t1gd: null, t2: null, flair: null });
    Object.values(fileInputRefs).forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
  };

  const readyCount = Object.values(files).filter(Boolean).length;

  return (
    <div
      ref={panelRef}
      id="upload-panel"
      className="relative z-20 w-full rounded-2xl bg-[#080d19]/80 border border-cyan-500/25 p-5 sm:p-6 backdrop-blur-xl shadow-[0_0_50px_-15px_rgba(6,182,212,0.18)] transition-all duration-300"
    >
      {/* Panel Header */}
      <div className="flex items-start justify-between gap-3.5 mb-5">
        <div className="flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
            <FilePlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight flex items-center gap-2">
              Upload MRI Scan
              {readyCount === 4 ? (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-normal">
                  ✓ 4/4 Ready to Ingest
                </span>
              ) : (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-normal">
                  {readyCount}/4 (Missing: {SLOTS.filter((s) => !files[s.id]).map((s) => s.name).join(', ')})
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Select the four co-registered MRI sequences (NIfTI format, max 1 GiB each).
            </p>
          </div>
        </div>

        {readyCount > 0 && (
          <button
            onClick={handleClearAll}
            className="text-[11px] font-mono text-slate-400 hover:text-slate-200 px-2 py-1 rounded transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* 4 Sequence Slots Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SLOTS.map((slot) => {
          const file = files[slot.id];
          const error = errors[slot.id];

          return (
            <div
              key={slot.id}
              className={`relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border transition-all duration-200 ${
                file
                  ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_-4px_rgba(34,211,238,0.25)]'
                  : error
                  ? 'bg-rose-950/20 border-rose-500/50'
                  : 'bg-[#0a1120]/70 border-slate-800/80 hover:border-cyan-500/40'
              }`}
            >
              {/* Hidden File Input */}
              <input
                ref={fileInputRefs[slot.id]}
                type="file"
                accept=".nii,.nii.gz"
                className="hidden"
                onChange={(e) => handleFileChange(slot.id, e)}
              />

              {/* Slot Content */}
              <div className="text-center space-y-2">
                {/* File Icon */}
                <div className="flex justify-center">
                  <div
                    className={`p-2 rounded-lg ${
                      file
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                  </div>
                </div>

                {/* Sequence Name */}
                <div>
                  <h4 className="text-sm font-bold text-white tracking-wide">
                    {slot.name}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                    .nii / .nii.gz
                  </p>
                </div>

                {/* Selected File Details */}
                {file && (
                  <div className="pt-1 text-left">
                    <p
                      title={file.name}
                      className="text-[11px] font-mono text-cyan-200 truncate"
                    >
                      {file.name}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="flex items-center gap-1 text-[10px] text-rose-300 bg-rose-950/50 px-2 py-1 rounded">
                    <AlertCircle className="w-3 h-3 flex-shrink-0 text-rose-400" />
                    <span className="truncate" title={error}>{error}</span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="mt-3 pt-2 border-t border-slate-800/60">
                {file ? (
                  <div className="flex items-center justify-between gap-1">
                    <button
                      onClick={(e) => handleReplace(slot.id, e)}
                      className="flex-1 py-1 rounded text-[11px] font-mono text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 transition-colors flex items-center justify-center gap-1"
                      title="Replace file"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Change</span>
                    </button>
                    <button
                      onClick={(e) => handleRemove(slot.id, e)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRefs[slot.id].current?.click()}
                    className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-slate-200 bg-slate-800/70 hover:bg-cyan-950/80 hover:text-cyan-300 hover:border-cyan-500/50 border border-slate-700/60 transition-all cursor-pointer"
                  >
                    Choose File
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Footer */}
      <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Local client-side validation · 1 GiB per-file limit</span>
        </div>

        <button
          onClick={onOpenModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-500/40 hover:bg-cyan-900/50 hover:border-cyan-400 hover:text-white transition-all cursor-pointer shadow-[0_0_12px_-2px_rgba(34,211,238,0.2)]"
        >
          <span>Open Full Ingestion Console</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
