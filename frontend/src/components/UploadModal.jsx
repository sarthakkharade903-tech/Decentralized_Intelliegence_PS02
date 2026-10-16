import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileCheck, AlertCircle, Info, Shield, Trash2, CheckCircle2 } from 'lucide-react';

const SEQUENCES = [
  {
    id: 't1',
    name: 'T1 Native',
    tag: 'T1',
    description: 'Anatomical reference & structural baseline',
    color: 'from-blue-500/20 to-blue-600/5',
    border: 'border-blue-500/30'
  },
  {
    id: 't1gd',
    name: 'T1Gd (Gadolinium)',
    tag: 'T1CE',
    description: 'Vascular breakdown & active tumor margin (ET)',
    color: 'from-cyan-500/20 to-cyan-600/5',
    border: 'border-cyan-500/30'
  },
  {
    id: 't2',
    name: 'T2-Weighted',
    tag: 'T2',
    description: 'Bulk hyperintense lesions & fluid content',
    color: 'from-teal-500/20 to-teal-600/5',
    border: 'border-teal-500/30'
  },
  {
    id: 'flair',
    name: 'FLAIR',
    tag: 'FLAIR',
    description: 'Fluid-suppressed vasogenic peritumoral edema (ED)',
    color: 'from-amber-500/20 to-amber-600/5',
    border: 'border-amber-500/30'
  }
];

export default function UploadModal({ isOpen, onClose }) {
  const [files, setFiles] = useState({
    t1: null,
    t1gd: null,
    t2: null,
    flair: null
  });
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRefs = {
    t1: useRef(null),
    t1gd: useRef(null),
    t2: useRef(null),
    flair: useRef(null),
    batch: useRef(null)
  };

  if (!isOpen) return null;

  const isValidExtension = (fileName) => {
    const lower = fileName.toLowerCase();
    return lower.endsWith('.nii') || lower.endsWith('.nii.gz');
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSelectFile = (seqId, file) => {
    if (!file) return;
    if (!isValidExtension(file.name)) {
      setErrorMsg(`Invalid file "${file.name}". Only .nii and .nii.gz NIfTI files are accepted.`);
      return;
    }
    setErrorMsg(null);
    setFiles((prev) => ({ ...prev, [seqId]: file }));
  };

  const handleRemoveFile = (seqId) => {
    setFiles((prev) => ({ ...prev, [seqId]: null }));
    if (fileInputRefs[seqId]?.current) {
      fileInputRefs[seqId].current.value = '';
    }
  };

  const handleClearAll = () => {
    setFiles({ t1: null, t1gd: null, t2: null, flair: null });
    Object.values(fileInputRefs).forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
    setErrorMsg(null);
  };

  // Batch auto-assignment based on standard BraTS filename conventions
  const handleBatchFiles = (uploadedFiles) => {
    setErrorMsg(null);
    const updated = { ...files };
    let assignedCount = 0;

    Array.from(uploadedFiles).forEach((file) => {
      if (!isValidExtension(file.name)) return;
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

    if (assignedCount === 0) {
      setErrorMsg('Could not auto-detect sequence types from filenames. Please assign each sequence individually.');
    } else {
      setFiles(updated);
    }
  };

  const uploadedCount = Object.values(files).filter(Boolean).length;

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
                  {uploadedCount}/4 Ready
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Assign co-registered NIfTI scans (<span className="text-cyan-300">.nii</span> or <span className="text-cyan-300">.nii.gz</span>) for 3D BraTS segmentation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-center gap-3 text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Batch Drop / Quick Select */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) handleBatchFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRefs.batch.current?.click()}
            className="group cursor-pointer p-4 rounded-xl border border-dashed border-slate-700/80 hover:border-cyan-500/60 bg-slate-900/30 hover:bg-cyan-950/20 transition-all text-center"
          >
            <input
              ref={fileInputRefs.batch}
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

          {/* 4 Sequence Slots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {SEQUENCES.map((seq) => {
              const file = files[seq.id];
              return (
                <div
                  key={seq.id}
                  className={`relative p-4 rounded-xl border transition-all ${
                    file
                      ? 'border-cyan-500/50 bg-cyan-950/20 shadow-[0_0_15px_-3px_rgba(34,211,238,0.1)]'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                  }`}
                >
                  <input
                    ref={fileInputRefs[seq.id]}
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
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => fileInputRefs[seq.id].current?.click()}
                        className="px-2.5 py-1 rounded text-[11px] font-mono text-cyan-400 border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 hover:border-cyan-400 transition-colors"
                      >
                        Select
                      </button>
                    )}
                  </div>

                  {/* Selected File Details */}
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
                      <span>Awaiting .nii / .nii.gz</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Frontend-Only Standby Notification (Honest & Explicit) */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3 text-xs text-slate-300">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-200">
                Local Frontend Stage · AI Inference Standby
              </p>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Selected files are kept strictly within your local browser sandbox. Once the local backend server (<code className="text-cyan-300 font-mono">/api/v1/segment/predict</code>) is launched, these scans will be forwarded to the MONAI SegResNet 3D inference engine. No fake predictions or synthetic metrics are displayed.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero-cloud transmission</span>
          </div>

          <div className="flex items-center gap-3">
            {uploadedCount > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear All
              </button>
            )}
            <button
              disabled={uploadedCount < 4}
              title={
                uploadedCount < 4
                  ? 'Please select all 4 sequences'
                  : 'Backend pipeline will connect in next phase'
              }
              className={`px-5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                uploadedCount === 4
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 font-bold hover:shadow-[0_0_20px_-3px_rgba(34,211,238,0.5)] cursor-pointer'
                  : 'bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              {uploadedCount === 4 ? 'Connect Backend to Segment' : `Assign All 4 Sequences (${uploadedCount}/4)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
