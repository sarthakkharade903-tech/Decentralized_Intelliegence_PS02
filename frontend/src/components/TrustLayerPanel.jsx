import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

/**
 * TrustLayerPanel — Phase 6
 *
 * Renders the results of runTrustLayer() in the Workstation design system.
 * Follows the existing dark-panel pattern: bg-[#080D19]/90, border-cyan-500/25.
 *
 * Props:
 *   checks   — TrustCheck[] from runTrustLayer()
 *   loading  — boolean (running checks)
 *   onRerun  — () => void
 */
export default function TrustLayerPanel({ checks = [], loading = false, onRerun }) {
  const passCt        = checks.filter((c) => c.status === 'pass' || c.status === 'passed').length;
  const warnCt        = checks.filter((c) => c.status === 'warn' || c.status === 'warning').length;
  const failCt        = checks.filter((c) => c.status === 'fail' || c.status === 'failed').length;
  const notCheckedCt  = checks.filter((c) => c.status === 'not_checked').length;
  const naCt          = checks.filter((c) => c.status === 'na' || c.status === 'not_available').length;
  const total         = checks.length;

  const overallStatus =
    failCt > 0 ? 'fail' :
    warnCt > 0 ? 'warn' :
    total === 0 ? 'na' :
    passCt > 0 ? 'pass' : 'na';

  return (
    <div className="p-6 rounded-2xl bg-[#080D19]/90 border border-cyan-500/25 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Input Integrity &amp; Trust Layer</h3>
            <p className="text-xs text-slate-400">
              Automated pre-analysis checks — verify inputs before any measurement is displayed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Summary badges */}
          {total > 0 && (
            <div className="flex items-center gap-2 text-xs font-mono">
              {passCt > 0 && (
                <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                  {passCt} Passed
                </span>
              )}
              {warnCt > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
                  {warnCt} Warning
                </span>
              )}
              {failCt > 0 && (
                <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60">
                  {failCt} Failed
                </span>
              )}
              {notCheckedCt > 0 && (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                  {notCheckedCt} Not checked
                </span>
              )}
              {naCt > 0 && (
                <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60">
                  {naCt} Not available
                </span>
              )}
            </div>
          )}

          {onRerun && (
            <button
              onClick={onRerun}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-300 border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50 transition-all cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Running…' : 'Re-run Checks'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Overall status banner */}
      {!loading && total > 0 && (
        <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-mono font-semibold border ${
          overallStatus === 'pass'
            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
            : overallStatus === 'warn'
            ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
            : overallStatus === 'fail'
            ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
            : 'bg-slate-900/60 text-slate-400 border-slate-700/60'
        }`}>
          {overallStatus === 'pass' && <CheckCircle2 className="w-4 h-4" />}
          {overallStatus === 'warn' && <AlertTriangle className="w-4 h-4" />}
          {overallStatus === 'fail' && <XCircle className="w-4 h-4" />}
          {overallStatus === 'na'   && <MinusCircle className="w-4 h-4" />}
          <span>
            {overallStatus === 'pass' && `${passCt} check${passCt > 1 ? 's' : ''} passed — inputs verified valid`}
            {overallStatus === 'warn' && `${warnCt} warning${warnCt > 1 ? 's' : ''} — review flagged items below`}
            {overallStatus === 'fail' && `${failCt} check${failCt > 1 ? 's' : ''} failed — metrics may be unreliable`}
            {overallStatus === 'na'   && 'No checks evaluated yet — upload files to begin verification'}
          </span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 text-sm font-mono text-slate-400 py-4">
          <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Running integrity checks…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && total === 0 && (
        <div className="py-8 text-center text-slate-500 text-sm font-mono">
          <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-700" />
          <p>No checks have been run yet.</p>
          <p className="text-xs mt-1">Upload MRI sequences and run inference to activate Trust Layer.</p>
        </div>
      )}

      {/* Check list */}
      {!loading && total > 0 && (
        <div className="space-y-2">
          {checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      {total > 0 && (
        <p className="text-[10px] text-slate-500 font-mono border-t border-slate-800 pt-3">
          ⚠ Trust Layer checks are automated heuristics — they do not replace clinical review.
          All metrics are candidate outputs from a research AI prototype.
        </p>
      )}
    </div>
  );
}

/** A single check row with status icon, label, message, and collapsible detail. */
function CheckRow({ check }) {
  const [open, setOpen] = React.useState(false);

  const statusConfig = {
    pass: {
      Icon: CheckCircle2,
      iconCls: 'text-emerald-400',
      rowCls:  'border-emerald-800/30 bg-emerald-950/20',
      badge:   'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
      text:    'Passed',
    },
    passed: {
      Icon: CheckCircle2,
      iconCls: 'text-emerald-400',
      rowCls:  'border-emerald-800/30 bg-emerald-950/20',
      badge:   'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
      text:    'Passed',
    },
    warn: {
      Icon: AlertTriangle,
      iconCls: 'text-amber-400',
      rowCls:  'border-amber-800/30 bg-amber-950/20',
      badge:   'bg-amber-950/80 text-amber-300 border-amber-800/60',
      text:    'Warning',
    },
    warning: {
      Icon: AlertTriangle,
      iconCls: 'text-amber-400',
      rowCls:  'border-amber-800/30 bg-amber-950/20',
      badge:   'bg-amber-950/80 text-amber-300 border-amber-800/60',
      text:    'Warning',
    },
    fail: {
      Icon: XCircle,
      iconCls: 'text-rose-400',
      rowCls:  'border-rose-800/30 bg-rose-950/20',
      badge:   'bg-rose-950/80 text-rose-300 border-rose-800/60',
      text:    'Failed',
    },
    failed: {
      Icon: XCircle,
      iconCls: 'text-rose-400',
      rowCls:  'border-rose-800/30 bg-rose-950/20',
      badge:   'bg-rose-950/80 text-rose-300 border-rose-800/60',
      text:    'Failed',
    },
    not_checked: {
      Icon: MinusCircle,
      iconCls: 'text-slate-400',
      rowCls:  'border-slate-800/40 bg-slate-900/40',
      badge:   'bg-slate-800 text-slate-300 border-slate-700/60',
      text:    'Not checked',
    },
    na: {
      Icon: MinusCircle,
      iconCls: 'text-slate-500',
      rowCls:  'border-slate-800/30 bg-slate-900/25',
      badge:   'bg-slate-800/80 text-slate-400 border-slate-700/60',
      text:    'Not available',
    },
    not_available: {
      Icon: MinusCircle,
      iconCls: 'text-slate-500',
      rowCls:  'border-slate-800/30 bg-slate-900/25',
      badge:   'bg-slate-800/80 text-slate-400 border-slate-700/60',
      text:    'Not available',
    },
  };

  const cfg = statusConfig[check.status] ?? statusConfig.na;
  const { Icon } = cfg;
  const badgeText = check.statusLabel || cfg.text;

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cfg.rowCls} transition-all`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.iconCls}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {check.category && (
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700/50">
                  {check.category}
                </span>
              )}
              <span className="text-xs font-mono font-semibold text-slate-200 truncate">{check.label}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{check.message}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${cfg.badge}`}>
            {badgeText}
          </span>
          {check.detail && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer underline"
            >
              {open ? 'hide' : 'detail'}
            </button>
          )}
        </div>
      </div>

      {open && check.detail && (
        <div className="mt-2 pl-6 text-[11px] font-mono text-slate-400 leading-relaxed border-l border-slate-700">
          {check.detail}
        </div>
      )}
    </div>
  );
}
