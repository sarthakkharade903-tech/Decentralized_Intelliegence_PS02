import React from 'react';
import { BarChart3, Info } from 'lucide-react';

/**
 * MetricsPanel — Phase 6
 *
 * Displays:
 *   - Per-region physical volumes (ET, TC, WT, NETC, ED) computed from the
 *     NIfTI affine (when available), or from the backend response.
 *   - Per-region segmentation quality metrics (Dice, Sensitivity, Precision,
 *     Specificity, HD95) when an expert reference segmentation is available.
 *   - Provenance block: patient ID, execution time, hardware, timestamp,
 *     SHA-256 hashes.
 *
 * Design:
 *   - Follows existing WorkstationPage dark-panel: bg-[#080D19]/90, border-cyan-500/25
 *   - Missing values displayed as "—" — NEVER as 0.
 *   - All metric numbers use font-mono.
 *   - "SYNTHETIC DATA" label injected if data source is synthetic.
 *
 * Props:
 *   regionVolumes  — { ET, TC, WT, NETC, ED } from computeRegionVolumes() or null
 *   metricsData    — { ET, TC, WT } from computeAllMetrics() or null (expert needed)
 *   hd95Data       — { ET, TC, WT } mm values or null
 *   predictionData — raw backend response object (volumes_ml fallback)
 *   provenance     — { patientId, modelVersion, timestamp, executionSec, hardware, fileHashes }
 *   isSynthetic    — boolean (show SYNTHETIC DATA warning)
 */
export default function MetricsPanel({
  regionVolumes = null,
  metricsData = null,
  hd95Data = null,
  predictionData = null,
  provenance = null,
  isSynthetic = false,
}) {
  // Resolve volumes: prefer computed (from NIfTI affine), fallback to backend response
  const vols = resolveVolumes(regionVolumes, predictionData);

  const hasMl = vols && Object.values(vols).some((v) => v?.ml != null);
  const hasMetrics = metricsData && Object.keys(metricsData).length > 0;

  return (
    <div className="space-y-4">
      {/* SYNTHETIC DATA warning */}
      {isSynthetic && (
        <div className="px-4 py-2 rounded-xl bg-amber-950/60 border border-amber-700/60 text-xs font-mono text-amber-300 flex items-center gap-2">
          <Info className="w-4 h-4 flex-shrink-0" />
          SYNTHETIC DATA — values below are from test fixtures, not a real patient case.
          Do not cite these numbers in clinical or research contexts.
        </div>
      )}

      {/* Volume Table */}
      <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Physical Tumor Volumes</h3>
            <p className="text-xs text-slate-400">
              Computed via NIfTI affine: V = N_voxels × |det(A₃ₓ₃)| / 1000 mL
              {regionVolumes ? '' : ' (backend response values)'}
            </p>
          </div>
        </div>

        {hasMl ? (
          <VolumeTable vols={vols} />
        ) : (
          <div className="py-6 text-center text-slate-500 text-sm font-mono">
            <p>Volume data unavailable.</p>
            <p className="text-xs mt-1">Upload a segmentation mask with a valid NIfTI affine to compute physical volumes.</p>
          </div>
        )}
      </div>

      {/* Segmentation Metrics Table */}
      <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Segmentation Quality Metrics</h3>
            <p className="text-xs text-slate-400">
              Requires expert reference segmentation — Dice, Sensitivity, Precision, Specificity, HD₉₅
            </p>
          </div>
          {!hasMetrics && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Expert mask not uploaded
            </span>
          )}
        </div>

        {hasMetrics ? (
          <MetricsTable metricsData={metricsData} hd95Data={hd95Data} />
        ) : (
          <div className="py-6 text-center text-slate-500 text-sm font-mono">
            <p>Upload an expert segmentation to compute evaluation metrics.</p>
            <p className="text-xs mt-1">
              Dice, Sensitivity, Precision, Specificity, and HD₉₅ will appear here.
            </p>
          </div>
        )}
      </div>

      {/* Provenance */}
      {provenance && (
        <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-3">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
            Provenance &amp; Reproducibility
          </h3>
          <ProvenanceBlock provenance={provenance} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Resolve volumes from computed affine data or backend response fallback. */
function resolveVolumes(regionVolumes, predictionData) {
  if (regionVolumes) return regionVolumes;
  const rv = predictionData?.volumes_ml;
  if (!rv) return null;

  // Map backend field names to internal schema with mL values only
  const toRegion = (ml) => (ml != null ? { voxels: null, mm3: null, ml } : null);
  const wt  = rv.whole_tumor ?? null;
  const tc  = rv.tumor_core  ?? null;
  const et  = rv.enhancing_tumor ?? null;
  const ed  = rv.edema  ?? null;
  const nc  = rv.necrotic_core ?? null;
  return {
    WT:   toRegion(wt),
    TC:   toRegion(tc),
    ET:   toRegion(et),
    ED:   toRegion(ed),
    NETC: toRegion(nc),
  };
}

/** Format a number with fixed decimal places, or "—" if null/undefined. */
function fmt(val, decimals = 2) {
  if (val == null || !isFinite(val)) return '—';
  return val.toFixed(decimals);
}

/** Format a metric percentage (0–1 → 0%–100%). */
function fmtPct(val) {
  if (val == null || !isFinite(val)) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

const REGION_META = [
  { key: 'WT',   label: 'Whole Tumor (WT)',              tag: 'Labels 1+2+4', color: 'text-white',   barColor: 'bg-cyan-400' },
  { key: 'TC',   label: 'Tumor Core (TC)',               tag: 'Labels 1+4',   color: 'text-cyan-300', barColor: 'bg-cyan-500' },
  { key: 'ET',   label: 'Enhancing Tumor (ET)',          tag: 'Label 4',      color: 'text-rose-400', barColor: 'bg-rose-500' },
  { key: 'ED',   label: 'Peritumoral Edema (ED)',        tag: 'Label 2',      color: 'text-amber-400',barColor: 'bg-amber-400' },
  { key: 'NETC', label: 'Necrotic Core (NETC)',          tag: 'Label 1',      color: 'text-cyan-200', barColor: 'bg-cyan-600' },
];

function VolumeTable({ vols }) {
  const wtMl = vols?.WT?.ml;

  return (
    <div className="space-y-2.5">
      {REGION_META.map(({ key, label, tag, color, barColor }) => {
        const r = vols?.[key];
        const ml = r?.ml;
        const voxels = r?.voxels;
        const pct = (wtMl && ml != null && wtMl > 0) ? (ml / wtMl) * 100 : null;

        return (
          <div key={key} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">{label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{tag}</span>
              </div>
              <div className="flex items-center gap-3">
                {voxels != null && (
                  <span className="text-slate-400 text-[11px]">{voxels.toLocaleString()} vox</span>
                )}
                <span className={`text-sm font-bold ${color}`}>
                  {fmt(ml)} mL
                </span>
              </div>
            </div>

            {pct != null && (
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            )}

            {pct != null && (
              <p className="text-[10px] text-slate-400">
                {pct.toFixed(1)}% of Whole Tumor
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetricsTable({ metricsData, hd95Data }) {
  const regions = ['ET', 'TC', 'WT'];
  const regionLabels = { ET: 'Enhancing Tumor (ET)', TC: 'Tumor Core (TC)', WT: 'Whole Tumor (WT)' };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <th className="py-2.5 px-3">Region</th>
            <th className="py-2.5 px-3 text-right" title="Sørensen–Dice Similarity Coefficient">Dice ↑</th>
            <th className="py-2.5 px-3 text-right" title="Sensitivity / True Positive Rate">Sensitivity ↑</th>
            <th className="py-2.5 px-3 text-right" title="Precision / Positive Predictive Value">Precision ↑</th>
            <th className="py-2.5 px-3 text-right" title="Specificity / True Negative Rate">Specificity ↑</th>
            <th className="py-2.5 px-3 text-right" title="95th Percentile Hausdorff Distance in mm">HD₉₅ (mm) ↓</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {regions.map((r) => {
            const m = metricsData?.[r];
            const hd = hd95Data?.[r];
            const diceVal = m?.dice;
            const diceColor =
              diceVal == null ? 'text-slate-400' :
              diceVal >= 0.85  ? 'text-emerald-400' :
              diceVal >= 0.70  ? 'text-amber-400' :
              'text-rose-400';

            return (
              <tr key={r} className="text-slate-200 hover:bg-slate-900/40 transition-colors">
                <td className="py-2.5 px-3 font-semibold text-white">{regionLabels[r]}</td>
                <td className={`py-2.5 px-3 text-right font-bold ${diceColor}`}>{fmt(diceVal, 3)}</td>
                <td className="py-2.5 px-3 text-right">{fmtPct(m?.sensitivity)}</td>
                <td className="py-2.5 px-3 text-right">{fmtPct(m?.precision)}</td>
                <td className="py-2.5 px-3 text-right">{fmtPct(m?.specificity)}</td>
                <td className="py-2.5 px-3 text-right text-cyan-300">
                  {hd != null ? fmt(hd, 2) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[10px] text-slate-500 mt-3 font-mono leading-relaxed">
        ↑ higher is better · ↓ lower is better ·
        Dice ≥ 0.85: <span className="text-emerald-400">■</span> excellent ·
        Dice 0.70–0.85: <span className="text-amber-400">■</span> acceptable ·
        Dice &lt; 0.70: <span className="text-rose-400">■</span> review required ·
        — = unavailable (denominator = 0 or mask empty)
      </p>
    </div>
  );
}

function ProvenanceBlock({ provenance }) {
  const fields = [
    { label: 'Patient / Case ID',    value: provenance.patientId ?? '—' },
    { label: 'Model Version',        value: provenance.modelVersion ?? '—' },
    { label: 'Inference Timestamp',  value: provenance.timestamp ?? '—' },
    { label: 'Execution Time',       value: provenance.executionSec != null ? `${Number(provenance.executionSec).toFixed(2)} s` : '—' },
    { label: 'Hardware',             value: provenance.hardware ?? '—' },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
        {fields.map(({ label, value }) => (
          <div key={label} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="text-slate-400">{label}: </span>
            <span className="text-slate-200 font-semibold">{value}</span>
          </div>
        ))}
      </div>

      {/* SHA-256 Hashes */}
      {provenance.fileHashes && Object.keys(provenance.fileHashes).length > 0 && (
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
          <span className="text-[11px] text-slate-400 font-mono uppercase font-semibold">
            SHA-256 File Provenance
          </span>
          {Object.entries(provenance.fileHashes).map(([key, hash]) => (
            <div key={key} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-slate-400 uppercase flex-shrink-0 w-16">{key}:</span>
              <span className="text-slate-300 break-all">{hash ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
