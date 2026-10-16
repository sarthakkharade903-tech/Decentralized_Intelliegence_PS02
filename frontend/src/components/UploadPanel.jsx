import React, { useRef, useState } from 'react';
import { FilePlus, FileText, X, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

const SLOTS = [
  { id: 't1', name: 'T1', label: 'T1 Native' },
  { id: 't1gd', name: 'T1Gd', label: 'T1Gd Contrast' },
  { id: 't2', name: 'T2', label: 'T2-Weighted' },
  { id: 'flair', name: 'FLAIR', label: 'FLAIR Edema' }
];

export default function UploadPanel({ panelRef }) {
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

  const validateNifti = (filename) => {
    const lower = filename.toLowerCase();
    return lower.endsWith('.nii') || lower.endsWith('.nii.gz');
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

    if (!validateNifti(file.name)) {
      setErrors((prev) => ({
        ...prev,
        [slotId]: 'Unsupported format. Requires .nii or .nii.gz'
      }));
      return;
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

  return (
    <div
      ref={panelRef}
      id="upload-panel"
      className="relative z-20 w-full rounded-2xl bg-[#080d19]/80 border border-cyan-500/25 p-5 sm:p-6 backdrop-blur-xl shadow-[0_0_50px_-15px_rgba(6,182,212,0.18)] transition-all duration-300"
    >
      {/* Panel Header */}
      <div className="flex items-start gap-3.5 mb-5">
        <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
          <FilePlus className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">
            Upload MRI Scan
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select the four MRI sequences (NIfTI format) to get started.
          </p>
        </div>
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
                    <span className="truncate">{error}</span>
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
    </div>
  );
}
