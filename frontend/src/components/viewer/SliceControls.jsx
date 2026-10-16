import React from 'react';
import {
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sun
} from 'lucide-react';

export default function SliceControls({
  sliceType = 'multiplanar',
  onChangeSliceType,
  axialSlice = 78,
  coronalSlice = 120,
  sagittalSlice = 120,
  maxAxial = 155,
  maxCoronal = 240,
  maxSagittal = 240,
  onChangeAxial,
  onChangeCoronal,
  onChangeSagittal,
  onResetView,
  brightness = 100,
  contrast = 100,
  onChangeBrightness,
  onChangeContrast,
  onResetWL
}) {
  const VIEW_MODES = [
    { id: 'multiplanar', label: 'Tri-Planar (MPR)', desc: 'Axial, Coronal & Sagittal simultaneous orthogonal views' },
    { id: 'axial', label: 'Axial (Z)', desc: 'Transverse anatomical view' },
    { id: 'coronal', label: 'Coronal (Y)', desc: 'Frontal plane view' },
    { id: 'sagittal', label: 'Sagittal (X)', desc: 'Lateral profile view' }
  ];

  return (
    <div className="space-y-3 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
      {/* Top Bar: Viewport Layout Modes & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-300 font-semibold">Viewport Mode:</span>
          <div className="flex items-center gap-1">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => onChangeSliceType?.(mode.id)}
                title={mode.desc}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  sliceType === mode.id
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/70 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 border border-slate-700/60'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onResetView?.()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Reset Orthogonal Center</span>
        </button>
      </div>

      {/* Middle: Orthogonal Plane Steppers & Scrubbers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Axial (Z) */}
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-semibold text-white">AXIAL (Z)</span>
            <span className="text-cyan-400">
              {axialSlice} <span className="text-slate-500">/ {maxAxial}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangeAxial?.(Math.max(0, axialSlice - 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Previous Axial Slice (Z-)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="0"
              max={maxAxial}
              value={axialSlice}
              onChange={(e) => onChangeAxial?.(parseInt(e.target.value, 10))}
              className="flex-1 accent-cyan-400 cursor-pointer"
            />
            <button
              onClick={() => onChangeAxial?.(Math.min(maxAxial, axialSlice + 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Next Axial Slice (Z+)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Coronal (Y) */}
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-semibold text-white">CORONAL (Y)</span>
            <span className="text-cyan-400">
              {coronalSlice} <span className="text-slate-500">/ {maxCoronal}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangeCoronal?.(Math.max(0, coronalSlice - 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Previous Coronal Slice (Y-)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="0"
              max={maxCoronal}
              value={coronalSlice}
              onChange={(e) => onChangeCoronal?.(parseInt(e.target.value, 10))}
              className="flex-1 accent-cyan-400 cursor-pointer"
            />
            <button
              onClick={() => onChangeCoronal?.(Math.min(maxCoronal, coronalSlice + 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Next Coronal Slice (Y+)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sagittal (X) */}
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-semibold text-white">SAGITTAL (X)</span>
            <span className="text-cyan-400">
              {sagittalSlice} <span className="text-slate-500">/ {maxSagittal}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangeSagittal?.(Math.max(0, sagittalSlice - 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Previous Sagittal Slice (X-)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="0"
              max={maxSagittal}
              value={sagittalSlice}
              onChange={(e) => onChangeSagittal?.(parseInt(e.target.value, 10))}
              className="flex-1 accent-cyan-400 cursor-pointer"
            />
            <button
              onClick={() => onChangeSagittal?.(Math.min(maxSagittal, sagittalSlice + 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Next Sagittal Slice (X+)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom: Window / Level (Contrast & Brightness) */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-slate-400 text-[11px]">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-slate-300 font-medium">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>Window/Level:</span>
          </span>

          <div className="flex items-center gap-2">
            <span>Brightness:</span>
            <input
              type="range"
              min="50"
              max="150"
              value={brightness}
              onChange={(e) => onChangeBrightness?.(parseInt(e.target.value, 10))}
              className="w-20 accent-amber-400 cursor-pointer"
            />
            <span className="w-8 text-right text-slate-300">{brightness}%</span>
          </div>

          <div className="flex items-center gap-2">
            <span>Contrast:</span>
            <input
              type="range"
              min="50"
              max="160"
              value={contrast}
              onChange={(e) => onChangeContrast?.(parseInt(e.target.value, 10))}
              className="w-20 accent-amber-400 cursor-pointer"
            />
            <span className="w-8 text-right text-slate-300">{contrast}%</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onResetWL?.()}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Reset W/L
          </button>
          <button
            onClick={() => {
              onChangeBrightness?.(125);
              onChangeContrast?.(135);
            }}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-colors"
          >
            High Contrast
          </button>
        </div>
      </div>
    </div>
  );
}
