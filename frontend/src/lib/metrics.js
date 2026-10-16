/**
 * metrics.js — NeuroVault Phase 6 Core Measurement Engine
 *
 * Pure, testable, no React, no DOM dependencies.
 *
 * BraTS 2021 label convention (AGENTS.md):
 *   0 = Background
 *   1 = NETC (Necrotic + Non-Enhancing Tumor Core)
 *   2 = ED  (Peritumoral Edema)
 *   4 = ET  (Enhancing Tumor)   — Label 3 is deprecated/unused
 *
 * Region compositions:
 *   WT = {1, 2, 4}
 *   TC = {1, 4}
 *   ET = {4}
 *
 * Physical volume formula (AGENTS.md):
 *   V_voxel_mm3 = |det(A_3x3)|  where A_3x3 = top-left 3×3 of NIfTI affine
 *   V_region_ml = count × V_voxel_mm3 / 1000
 *
 * Dice zero-denominator policy (both-empty case):
 *   Dice(∅, ∅) = 1.0  — perfect agreement on empty region.
 *   Documented here as the explicit convention for this codebase.
 *   If only one side is empty, Dice = 0.0.
 *
 * Sensitivity / Precision when denominator is 0:
 *   Returns null — never display as 0, show "—" in UI.
 *
 * HD95 when either mask is empty:
 *   Returns null — display as "unavailable", never as 0.
 *
 * All distances reported in physical millimetres.
 */

// ---------------------------------------------------------------------------
// 1. Physical Volume
// ---------------------------------------------------------------------------

/**
 * Compute the physical volume of one voxel in mm³.
 * Uses |det(A_3x3)| of the NIfTI affine matrix.
 *
 * @param {number[][] | null} affine - 4×4 row-major affine array, or null
 * @returns {number} voxel volume in mm³, or NaN if affine is invalid
 */
export function computeVoxelVolume(affine) {
  if (!affine || !Array.isArray(affine) || affine.length < 4) return NaN;

  // Extract top-left 3×3
  const [r0, r1, r2] = [affine[0], affine[1], affine[2]];
  if (!r0 || !r1 || !r2 || r0.length < 3 || r1.length < 3 || r2.length < 3) return NaN;

  const a = r0[0], b = r0[1], c = r0[2];
  const d = r1[0], e = r1[1], f = r1[2];
  const g = r2[0], h = r2[1], k = r2[2];

  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  if (!isFinite(det)) return NaN;
  return Math.abs(det);
}

/**
 * Compute per-region voxel counts and physical volumes for a segmentation volume.
 *
 * @param {Uint8Array|Int16Array|Int32Array|Float32Array} volume - flat label array
 * @param {number[]} dims - [nx, ny, nz]
 * @param {number[][] | null} affine - 4×4 affine
 * @returns {{ ET: RegionStats, TC: RegionStats, WT: RegionStats, NETC: RegionStats, ED: RegionStats }}
 *
 * @typedef {{ voxels: number, mm3: number, ml: number }} RegionStats
 */
export function computeRegionVolumes(volume, dims, affine) {
  if (!volume || !dims) throw new Error('computeRegionVolumes: volume and dims are required');

  const voxelMm3 = computeVoxelVolume(affine);
  const usePhysical = isFinite(voxelMm3) && voxelMm3 > 0;

  // Count voxels per label
  let netcCount = 0; // label 1
  let edCount = 0;   // label 2
  let etCount = 0;   // label 4

  const n = dims[0] * dims[1] * dims[2];
  for (let i = 0; i < n; i++) {
    const v = volume[i];
    if (v === 1) netcCount++;
    else if (v === 2) edCount++;
    else if (v === 4) etCount++;
  }

  const tcCount = netcCount + etCount;
  const wtCount = netcCount + edCount + etCount;

  const toMl = (c) => usePhysical ? (c * voxelMm3) / 1000 : null;
  const toMm3 = (c) => usePhysical ? c * voxelMm3 : null;

  return {
    ET:   { voxels: etCount,   mm3: toMm3(etCount),   ml: toMl(etCount) },
    TC:   { voxels: tcCount,   mm3: toMm3(tcCount),   ml: toMl(tcCount) },
    WT:   { voxels: wtCount,   mm3: toMm3(wtCount),   ml: toMl(wtCount) },
    NETC: { voxels: netcCount, mm3: toMm3(netcCount), ml: toMl(netcCount) },
    ED:   { voxels: edCount,   mm3: toMm3(edCount),   ml: toMl(edCount) },
  };
}

// ---------------------------------------------------------------------------
// 2. Binary Region Masks
// ---------------------------------------------------------------------------

/**
 * Extract a binary mask (Uint8Array) for a given set of label values.
 *
 * @param {TypedArray} volume - flat label array
 * @param {number[]} _dims - [nx, ny, nz] (unused but kept for API consistency)
 * @param {Set<number>} regionLabels - set of label values belonging to this region
 * @returns {Uint8Array}
 */
export function computeRegionMask(volume, _dims, regionLabels) {
  const n = volume.length;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (regionLabels.has(volume[i])) mask[i] = 1;
  }
  return mask;
}

// BraTS region label sets
export const BRATS_REGIONS = {
  ET: new Set([4]),
  TC: new Set([1, 4]),
  WT: new Set([1, 2, 4]),
};

// ---------------------------------------------------------------------------
// 3. Confusion Matrix
// ---------------------------------------------------------------------------

/**
 * Compute confusion matrix between prediction and reference binary masks.
 *
 * @param {Uint8Array} predMask
 * @param {Uint8Array} refMask
 * @returns {{ TP: number, FP: number, FN: number, TN: number }}
 */
export function confusionMatrix(predMask, refMask) {
  if (predMask.length !== refMask.length) {
    throw new Error(`confusionMatrix: mask length mismatch (pred=${predMask.length}, ref=${refMask.length})`);
  }
  let TP = 0, FP = 0, FN = 0, TN = 0;
  const n = predMask.length;
  for (let i = 0; i < n; i++) {
    const p = predMask[i];
    const r = refMask[i];
    if (p === 1 && r === 1) TP++;
    else if (p === 1 && r === 0) FP++;
    else if (p === 0 && r === 1) FN++;
    else TN++;
  }
  return { TP, FP, FN, TN };
}

// ---------------------------------------------------------------------------
// 4. Segmentation Metrics
// ---------------------------------------------------------------------------

/**
 * Sørensen–Dice Similarity Coefficient.
 * Convention: Dice(∅, ∅) = 1.0 (documented policy above).
 *
 * @param {number} TP
 * @param {number} FP
 * @param {number} FN
 * @returns {number} Dice coefficient [0, 1]
 */
export function dice(TP, FP, FN) {
  const denom = 2 * TP + FP + FN;
  if (denom === 0) return 1.0; // both masks empty — perfect agreement
  return (2 * TP) / denom;
}

/**
 * Sensitivity (Recall / True Positive Rate).
 * Returns null when denominator is 0 (reference is empty).
 *
 * @param {number} TP
 * @param {number} FN
 * @returns {number | null}
 */
export function sensitivity(TP, FN) {
  const denom = TP + FN;
  if (denom === 0) return null;
  return TP / denom;
}

/**
 * Precision (Positive Predictive Value).
 * Returns null when denominator is 0 (prediction is empty).
 *
 * @param {number} TP
 * @param {number} FP
 * @returns {number | null}
 */
export function precision(TP, FP) {
  const denom = TP + FP;
  if (denom === 0) return null;
  return TP / denom;
}

/**
 * Specificity (True Negative Rate).
 * Returns null when denominator is 0.
 *
 * @param {number} TN
 * @param {number} FP
 * @returns {number | null}
 */
export function specificity(TN, FP) {
  const denom = TN + FP;
  if (denom === 0) return null;
  return TN / denom;
}

/**
 * Compute all per-region segmentation metrics between prediction and reference.
 *
 * @param {TypedArray} predVolume - flat label array for prediction
 * @param {TypedArray} refVolume  - flat label array for reference/expert
 * @param {number[]} dims - [nx, ny, nz]
 * @param {number[][] | null} affine
 * @returns {{ ET: RegionMetrics, TC: RegionMetrics, WT: RegionMetrics }}
 *
 * @typedef {{
 *   dice: number,
 *   sensitivity: number | null,
 *   precision: number | null,
 *   specificity: number | null,
 *   TP: number, FP: number, FN: number, TN: number
 * }} RegionMetrics
 */
export function computeAllMetrics(predVolume, refVolume, dims, _affine) {
  if (predVolume.length !== refVolume.length) {
    throw new Error('computeAllMetrics: prediction and reference volume sizes must match');
  }

  const results = {};
  for (const [regionName, labelSet] of Object.entries(BRATS_REGIONS)) {
    const predMask = computeRegionMask(predVolume, dims, labelSet);
    const refMask  = computeRegionMask(refVolume,  dims, labelSet);
    const cm = confusionMatrix(predMask, refMask);
    results[regionName] = {
      dice:        dice(cm.TP, cm.FP, cm.FN),
      sensitivity: sensitivity(cm.TP, cm.FN),
      precision:   precision(cm.TP, cm.FP),
      specificity: specificity(cm.TN, cm.FP),
      TP: cm.TP, FP: cm.FP, FN: cm.FN, TN: cm.TN,
    };
  }
  return results;
}

// ---------------------------------------------------------------------------
// 5. HD95 — 95th-Percentile Hausdorff Distance (pure JS, physical mm)
// ---------------------------------------------------------------------------

/**
 * Collect surface voxel indices from a binary mask.
 * A voxel is a surface voxel if it is 1 and has at least one 6-connected neighbor that is 0.
 *
 * @param {Uint8Array} mask
 * @param {number[]} dims - [nx, ny, nz]
 * @returns {Array<[number,number,number]>} list of [i, j, k] surface voxel positions
 */
function extractSurface(mask, dims) {
  const [nx, ny, nz] = dims;
  const surface = [];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = i + nx * (j + ny * k);
        if (mask[idx] !== 1) continue;
        // Check 6-connectivity
        const isSurface =
          (i === 0 || mask[(i-1) + nx * (j + ny * k)] === 0) ||
          (i === nx-1 || mask[(i+1) + nx * (j + ny * k)] === 0) ||
          (j === 0 || mask[i + nx * ((j-1) + ny * k)] === 0) ||
          (j === ny-1 || mask[i + nx * ((j+1) + ny * k)] === 0) ||
          (k === 0 || mask[i + nx * (j + ny * (k-1))] === 0) ||
          (k === nz-1 || mask[i + nx * (j + ny * (k+1))] === 0);
        if (isSurface) surface.push([i, j, k]);
      }
    }
  }
  return surface;
}

/**
 * Compute physical distance in mm between two voxel positions using affine spacing.
 * Falls back to Euclidean voxel distance if affine is missing.
 *
 * @param {[number,number,number]} a - [i,j,k]
 * @param {[number,number,number]} b - [i,j,k]
 * @param {number[]} spacing - [sx, sy, sz] in mm
 * @returns {number}
 */
function physicalDistance(a, b, spacing) {
  const dx = (a[0] - b[0]) * spacing[0];
  const dy = (a[1] - b[1]) * spacing[1];
  const dz = (a[2] - b[2]) * spacing[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

/**
 * Extract voxel spacing (sx, sy, sz) from the NIfTI affine.
 * Spacing = column norms of the top-left 3×3.
 *
 * @param {number[][] | null} affine
 * @returns {number[]} [sx, sy, sz], falls back to [1, 1, 1]
 */
function spacingFromAffine(affine) {
  if (!affine || affine.length < 3) return [1, 1, 1];
  const sx = Math.sqrt(affine[0][0]**2 + affine[1][0]**2 + affine[2][0]**2);
  const sy = Math.sqrt(affine[0][1]**2 + affine[1][1]**2 + affine[2][1]**2);
  const sz = Math.sqrt(affine[0][2]**2 + affine[1][2]**2 + affine[2][2]**2);
  return [
    isFinite(sx) && sx > 0 ? sx : 1,
    isFinite(sy) && sy > 0 ? sy : 1,
    isFinite(sz) && sz > 0 ? sz : 1,
  ];
}

/**
 * Compute 95th-percentile Hausdorff Distance in physical millimetres.
 *
 * Algorithm:
 *   1. Extract surface voxels from both masks (6-connected boundary detection).
 *   2. For each surface voxel in A, find minimum distance to any surface voxel in B.
 *   3. For each surface voxel in B, find minimum distance to any surface voxel in A.
 *   4. Pool both directed distance sets, sort, return 95th percentile.
 *
 * Returns null if either mask is empty (undefined surface).
 *
 * NOTE: O(|A_surf| × |B_surf|) — suitable for small/medium structures.
 * For clinical volumes with thousands of surface voxels, this may be slow.
 * A production implementation would use BFS/distance-transform.
 *
 * @param {Uint8Array} predMask
 * @param {Uint8Array} refMask
 * @param {number[]} dims - [nx, ny, nz]
 * @param {number[][] | null} affine
 * @returns {number | null} HD95 in mm, or null if unavailable
 */
export function hd95(predMask, refMask, dims, affine) {
  const spacing = spacingFromAffine(affine);

  const predSurf = extractSurface(predMask, dims);
  const refSurf  = extractSurface(refMask,  dims);

  // If either surface is empty, HD95 is undefined
  if (predSurf.length === 0 || refSurf.length === 0) return null;

  // Directed distances: pred → ref
  const dPredToRef = predSurf.map((p) => {
    let minD = Infinity;
    for (const r of refSurf) {
      const d = physicalDistance(p, r, spacing);
      if (d < minD) minD = d;
    }
    return minD;
  });

  // Directed distances: ref → pred
  const dRefToPred = refSurf.map((r) => {
    let minD = Infinity;
    for (const p of predSurf) {
      const d = physicalDistance(r, p, spacing);
      if (d < minD) minD = d;
    }
    return minD;
  });

  // Pool and sort
  const all = [...dPredToRef, ...dRefToPred].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * all.length) - 1;
  return all[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// 6. SHA-256 Hash (Web Crypto API — browser + Node.js 18+)
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hex digest of an ArrayBuffer.
 * Uses SubtleCrypto (browser) or Node.js crypto module.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} lowercase hex string
 */
export async function sha256ArrayBuffer(buffer) {
  // Standard Web Crypto API (supported in all modern browsers and Node 18+)
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(hashBuffer);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for environments without globalThis.crypto.subtle
  const nodeCrypto = await import(/* @vite-ignore */ 'crypto');
  const hash = nodeCrypto.createHash('sha256');
  hash.update(Buffer.from(buffer));
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// 7. Error Volume Map (Prediction vs Expert Ground Truth)
// ---------------------------------------------------------------------------

/**
 * Compute error classification volume:
 *   0: Background / True Negative
 *   1: True Positive (TP: both pred and ref in region)
 *   2: False Positive (FP: pred in region, ref NOT in region)
 *   3: False Negative (FN: pred NOT in region, ref in region)
 *
 * @param {TypedArray} predVolume
 * @param {TypedArray} refVolume
 * @param {string} [region='WT'] - 'WT' | 'TC' | 'ET'
 * @returns {Uint8Array}
 */
export function computeErrorVolume(predVolume, refVolume, region = 'WT') {
  if (!predVolume || !refVolume || predVolume.length !== refVolume.length) {
    throw new Error('computeErrorVolume: volume length mismatch or missing volumes');
  }
  const labelSet = BRATS_REGIONS[region] || BRATS_REGIONS.WT;
  const n = predVolume.length;
  const errorVol = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = labelSet.has(predVolume[i]);
    const r = labelSet.has(refVolume[i]);
    if (p && r) errorVol[i] = 1; // TP
    else if (p && !r) errorVol[i] = 2; // FP
    else if (!p && r) errorVol[i] = 3; // FN
  }
  return errorVol;
}

