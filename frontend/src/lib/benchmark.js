/**
 * benchmark.js — NeuroVault Phase 6 Reproducible Benchmark Infrastructure
 *
 * Provides:
 *   - runBenchmarkCase(predVolume, refVolume, dims, affine, caseId) → per-case metrics
 *   - aggregateBenchmark(cases) → mean, median, SD, IQR per metric
 *   - exportBenchmarkJSON(results) → machine-readable JSON string
 *
 * Scientific integrity rules:
 *   - Never fabricate metrics; return null if data is missing.
 *   - If fewer than 10 real cases, clearly label results as PRELIMINARY.
 *   - Never mix synthetic fixture values with real patient data.
 *   - All volumes in mL, all distances in mm.
 */

import {
  computeRegionVolumes,
  computeAllMetrics,
  hd95,
  computeRegionMask,
  BRATS_REGIONS,
} from './metrics.js';

// ---------------------------------------------------------------------------
// 1. Per-Case Benchmark Runner
// ---------------------------------------------------------------------------

/**
 * Run full per-case metrics for a prediction/reference pair.
 *
 * @param {TypedArray} predVolume - flat label array
 * @param {TypedArray} refVolume  - flat reference label array
 * @param {number[]} dims - [nx, ny, nz]
 * @param {number[][] | null} affine
 * @param {string} caseId - unique identifier for this case
 * @param {{ isSynthetic?: boolean }} [opts]
 * @returns {BenchmarkCase}
 *
 * @typedef {{
 *   caseId: string,
 *   isSynthetic: boolean,
 *   timestamp: string,
 *   dims: number[],
 *   predVolumes: Object,
 *   refVolumes: Object,
 *   metrics: { ET: RegionMetrics, TC: RegionMetrics, WT: RegionMetrics },
 *   hd95_mm: { ET: number|null, TC: number|null, WT: number|null },
 *   error?: string
 * }} BenchmarkCase
 */
export async function runBenchmarkCase(predVolume, refVolume, dims, affine, caseId, opts = {}) {
  const isSynthetic = Boolean(opts.isSynthetic);
  const timestamp = new Date().toISOString();

  try {
    if (!predVolume || !refVolume) throw new Error('predVolume and refVolume are required');
    if (predVolume.length !== refVolume.length) {
      throw new Error(`Size mismatch: pred=${predVolume.length}, ref=${refVolume.length}`);
    }

    // Volumetrics
    const predVolumes = computeRegionVolumes(predVolume, dims, affine);
    const refVolumes  = computeRegionVolumes(refVolume,  dims, affine);

    // Overlap metrics per region
    const metrics = computeAllMetrics(predVolume, refVolume, dims, affine);

    // HD95 per region (async, may return null)
    const hd95Results = {};
    for (const [regionName, labelSet] of Object.entries(BRATS_REGIONS)) {
      const pMask = computeRegionMask(predVolume, dims, labelSet);
      const rMask = computeRegionMask(refVolume,  dims, labelSet);
      hd95Results[regionName] = hd95(pMask, rMask, dims, affine);
    }

    return {
      caseId,
      isSynthetic,
      timestamp,
      dims,
      predVolumes,
      refVolumes,
      metrics,
      hd95_mm: hd95Results,
    };
  } catch (err) {
    return {
      caseId,
      isSynthetic,
      timestamp,
      dims: dims ?? [],
      predVolumes: null,
      refVolumes: null,
      metrics: null,
      hd95_mm: null,
      error: String(err?.message ?? err),
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Statistical Aggregation
// ---------------------------------------------------------------------------

/**
 * Compute percentile of a sorted array.
 * @param {number[]} sorted - ascending sorted array
 * @param {number} p - percentile [0, 1]
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Compute mean of an array (ignoring null/NaN).
 * @param {(number|null)[]} arr
 */
function mean(arr) {
  const valid = arr.filter((v) => v != null && isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

/**
 * Compute standard deviation (population) of an array (ignoring null/NaN).
 * @param {(number|null)[]} arr
 */
function stddev(arr) {
  const valid = arr.filter((v) => v != null && isFinite(v));
  if (valid.length < 2) return null;
  const m = valid.reduce((s, v) => s + v, 0) / valid.length;
  const variance = valid.reduce((s, v) => s + (v - m) ** 2, 0) / valid.length;
  return Math.sqrt(variance);
}

/**
 * Aggregate per-case benchmark results into summary statistics.
 *
 * @param {BenchmarkCase[]} cases - array of per-case results from runBenchmarkCase
 * @returns {BenchmarkSummary}
 *
 * @typedef {{
 *   caseCount: number,
 *   realCaseCount: number,
 *   syntheticCaseCount: number,
 *   isPreliminary: boolean,
 *   note: string,
 *   excludedCount: number,
 *   excludedCases: string[],
 *   perRegion: { [region: string]: RegionSummary }
 * }} BenchmarkSummary
 *
 * @typedef {{
 *   dice:        StatSummary,
 *   sensitivity: StatSummary,
 *   precision:   StatSummary,
 *   hd95_mm:     StatSummary,
 * }} RegionSummary
 *
 * @typedef {{
 *   n: number,
 *   mean: number|null,
 *   median: number|null,
 *   sd: number|null,
 *   p25: number|null,
 *   p75: number|null,
 *   min: number|null,
 *   max: number|null,
 * }} StatSummary
 */
export function aggregateBenchmark(cases) {
  // Exclude failed cases
  const failed = cases.filter((c) => c.error || !c.metrics);
  const valid  = cases.filter((c) => !c.error && c.metrics);

  const realCount      = valid.filter((c) => !c.isSynthetic).length;
  const syntheticCount = valid.filter((c) =>  c.isSynthetic).length;
  const isPreliminary  = realCount < 10;

  const note = isPreliminary
    ? `PRELIMINARY: Only ${realCount} real case${realCount !== 1 ? 's' : ''} included. ` +
      `≥10 real held-out cases required for publishable benchmark. ` +
      (syntheticCount > 0 ? `${syntheticCount} synthetic fixture(s) excluded from real statistics.` : '')
    : `${realCount} real held-out cases included.`;

  const regions = ['ET', 'TC', 'WT'];
  const perRegion = {};

  for (const region of regions) {
    const diceVals        = valid.map((c) => c.metrics?.[region]?.dice ?? null);
    const sensitivityVals = valid.map((c) => c.metrics?.[region]?.sensitivity ?? null);
    const precisionVals   = valid.map((c) => c.metrics?.[region]?.precision ?? null);
    const hd95Vals        = valid.map((c) => c.hd95_mm?.[region] ?? null);

    perRegion[region] = {
      dice:        computeStatSummary(diceVals),
      sensitivity: computeStatSummary(sensitivityVals),
      precision:   computeStatSummary(precisionVals),
      hd95_mm:     computeStatSummary(hd95Vals),
    };
  }

  return {
    caseCount:         cases.length,
    realCaseCount:     realCount,
    syntheticCaseCount: syntheticCount,
    isPreliminary,
    note,
    excludedCount:     failed.length,
    excludedCases:     failed.map((c) => c.caseId),
    perRegion,
  };
}

/**
 * Compute stat summary for a list of values (nulls excluded).
 * @param {(number|null)[]} values
 * @returns {StatSummary}
 */
function computeStatSummary(values) {
  const valid = values.filter((v) => v != null && isFinite(v)).sort((a, b) => a - b);
  const n = valid.length;
  if (n === 0) {
    return { n: 0, mean: null, median: null, sd: null, p25: null, p75: null, min: null, max: null };
  }
  return {
    n,
    mean:   mean(valid),
    median: percentile(valid, 0.5),
    sd:     stddev(valid),
    p25:    percentile(valid, 0.25),
    p75:    percentile(valid, 0.75),
    min:    valid[0],
    max:    valid[n - 1],
  };
}

// ---------------------------------------------------------------------------
// 3. JSON Export
// ---------------------------------------------------------------------------

/**
 * Export benchmark results as a formatted JSON string.
 * Suitable for machine-readable archiving or download.
 *
 * @param {{ summary: BenchmarkSummary, cases: BenchmarkCase[] }} results
 * @returns {string} pretty-printed JSON
 */
export function exportBenchmarkJSON(results) {
  return JSON.stringify(
    {
      schema_version: '1.0',
      tool: 'NeuroVault',
      protocol: 'BraTS 2021 Multi-Parametric MRI Segmentation',
      exported_at: new Date().toISOString(),
      scientific_note:
        'All metrics are computed on candidate AI segmentations. ' +
        'This is a research prototype — not a certified diagnostic device. ' +
        'Synthetic fixtures are labeled isSynthetic=true and must not be cited as clinical results.',
      ...results,
    },
    null,
    2
  );
}
