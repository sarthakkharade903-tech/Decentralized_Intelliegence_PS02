import React from 'react';
import { Compass, Target, Activity, HardDrive } from 'lucide-react';

export default function CoordinatePanel({
  voxelCoords = [0, 0, 0],
  worldCoords = [0, 0, 0],
  orientation = 'RAS+',
  mriIntensity = null,
  labelValue = null,
  dimensions = [240, 240, 155],
  voxelSpacing = [1.0, 1.0, 1.0]
}) {
  const getLabelInfo = (val) => {
    switch (val) {
      case 1:
        return {
          name: 'Necrotic & Non-Enhancing Core (NETC)',
          color: 'text-cyan-400',
          bg: 'bg-cyan-950/80 border-cyan-800'
        };
      case 2:
        return {
          name: 'Peritumoral Vasogenic Edema (ED)',
          color: 'text-amber-400',
          bg: 'bg-amber-950/80 border-amber-800'
        };
      case 4:
        return {
          name: 'Enhancing Active Tumor Margin (ET)',
          color: 'text-rose-400',
          bg: 'bg-rose-950/80 border-rose-800'
        };
      case 0:
        return {
          name: 'Normal Brain Parenchyma / Background',
          color: 'text-slate-400',
          bg: 'bg-slate-900 border-slate-800'
        };
      default:
        return null;
    }
  };

  const labelInfo = labelValue != null ? getLabelInfo(labelValue) : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
      {/* Voxel Index Coordinates */}
      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Voxel Index (i, j, k)</span>
          <div className="text-white font-bold text-sm tracking-wide mt-0.5">
            [{voxelCoords[0] ?? 0}, {voxelCoords[1] ?? 0}, {voxelCoords[2] ?? 0}]
          </div>
        </div>
        <Target className="w-4 h-4 text-cyan-400/80" />
      </div>

      {/* World Coordinates (RAS+ mm) */}
      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
            World Space ({orientation || 'RAS+'})
          </span>
          <div className="text-cyan-300 font-bold text-sm tracking-wide mt-0.5">
            {worldCoords[0]?.toFixed?.(1) ?? '0.0'}, {worldCoords[1]?.toFixed?.(1) ?? '0.0'},{' '}
            {worldCoords[2]?.toFixed?.(1) ?? '0.0'} <span className="text-[10px] font-normal text-slate-400">mm</span>
          </div>
        </div>
        <Compass className="w-4 h-4 text-cyan-400/80" />
      </div>

      {/* Target Voxel Intensity & Segmentation Label */}
      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Intensity / Label</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-white font-bold text-sm">
              {mriIntensity != null ? Math.round(mriIntensity) : '—'}
            </span>
            {labelInfo ? (
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${labelInfo.bg} ${labelInfo.color}`}>
                Label {labelValue}
              </span>
            ) : null}
          </div>
        </div>
        <Activity className="w-4 h-4 text-cyan-400/80" />
      </div>

      {/* Spatial Grid & Spacing */}
      <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Grid & Voxel Spacing</span>
          <div className="text-slate-300 font-medium text-xs mt-0.5 truncate">
            {dimensions?.join?.('×') || '240×240×155'} ·{' '}
            <span className="text-cyan-400">
              {voxelSpacing?.[0]?.toFixed?.(1) || '1.0'}mm
            </span>
          </div>
        </div>
        <HardDrive className="w-4 h-4 text-slate-500" />
      </div>
    </div>
  );
}
