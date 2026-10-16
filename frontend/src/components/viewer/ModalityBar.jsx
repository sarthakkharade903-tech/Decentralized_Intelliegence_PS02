import React from 'react';
import { Layers } from 'lucide-react';

const MODALITIES = [
  {
    id: 't1',
    label: 'T1 Native',
    shortCode: 'T1',
    description: 'Anatomical reference & gray/white matter differentiation'
  },
  {
    id: 't1gd',
    label: 'T1Gd (CE)',
    shortCode: 'T1-CE',
    description: 'Gadolinium contrast — reveals active enhancing tumor margin & necrosis'
  },
  {
    id: 't2',
    label: 'T2 TSE',
    shortCode: 'T2',
    description: 'Fluid-sensitive sequence highlighting edema and hyperintensities'
  },
  {
    id: 'flair',
    label: 'FLAIR',
    shortCode: 'FLAIR',
    description: 'T2 with CSF suppression — delineates infiltrative peritumoral edema'
  }
];

export default function ModalityBar({
  activeModality = 't1gd',
  onSelectModality,
  availableModalities = {}
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono">
      <div className="flex items-center gap-2 text-slate-300">
        <Layers className="w-4 h-4 text-cyan-400" />
        <span className="font-semibold tracking-wide text-slate-200">MRI Modality:</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {MODALITIES.map((mod) => {
          const isActive = activeModality === mod.id;
          const isAvailable = availableModalities[mod.id] !== false;

          return (
            <button
              key={mod.id}
              onClick={() => onSelectModality && onSelectModality(mod.id)}
              disabled={!isAvailable}
              title={`${mod.label}: ${mod.description}${!isAvailable ? ' (Not uploaded in this session)' : ''}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-cyan-950 text-cyan-200 border border-cyan-500/70 shadow-[0_0_10px_rgba(6,182,212,0.35)]'
                  : isAvailable
                  ? 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60'
                  : 'bg-slate-900/40 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-50'
              }`}
            >
              <span>{mod.shortCode}</span>
              {isAvailable ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              )}
            </button>
          );
        })}
      </div>

      <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-400">
        <span className="text-cyan-300 font-medium">
          {MODALITIES.find((m) => m.id === activeModality)?.label}
        </span>
        <span className="text-slate-600">·</span>
        <span className="truncate max-w-xs text-slate-400">
          {MODALITIES.find((m) => m.id === activeModality)?.description}
        </span>
      </div>
    </div>
  );
}
