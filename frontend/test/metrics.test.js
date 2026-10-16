/**
 * metrics.test.js — NeuroVault Phase 6 Core Metrics Engine Tests
 *
 * Tests for frontend/src/lib/metrics.js
 * Runner: node --test (Node.js built-in test runner)
 *
 * Synthetic fixtures are labeled as such below.
 * No real patient data is included.
 *
 * BraTS 2021 label convention (AGENTS.md):
 *   0 = Background
 *   1 = NETC (Necrotic + Non-Enhancing Tumor Core)
 *   2 = ED  (Peritumoral Edema)
 *   4 = ET  (Enhancing Tumor) — Label 3 deprecated/unused
 *
 * WT = {1, 2, 4} | TC = {1, 4} | ET = {4}
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVoxelVolume,
  computeRegionVolumes,
  computeRegionMask,
  confusionMatrix,
  dice,
  sensitivity,
  precision,
  specificity,
  computeAllMetrics,
  hd95,
  sha256ArrayBuffer,
  BRATS_REGIONS,
  computeErrorVolume,
} from '../src/lib/metrics.js';
import { createErrorColormap } from '../src/components/viewer/GeometryValidator.js';

// ---------------------------------------------------------------------------
// SYNTHETIC TEST FIXTURES
// ---------------------------------------------------------------------------

/** 3×3×3 all-zero volume (background only). */
function makeZeroVolume(n = 27) {
  return new Uint8Array(n);
}

/** Create a tiny [4×4×4] volume with a specific label pattern.
 *  Layout: label 1 fills voxels 0–7, label 2 fills 8–15, label 4 fills 16–23, rest 0.
 */
function makeMixedVolume() {
  const vol = new Uint8Array(64); // 4×4×4
  for (let i = 0;  i < 8;  i++) vol[i]  = 1;
  for (let i = 8;  i < 16; i++) vol[i]  = 2;
  for (let i = 16; i < 24; i++) vol[i]  = 4;
  return vol;
}

/** Identity affine (1 mm isotropic). */
function identityAffine() {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

/** Anisotropic affine: spacing 1×1×3 mm. */
function anisotropicAffine() {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 3, 0],
    [0, 0, 0, 1],
  ];
}

/** Rotated affine: 90° around z-axis with 1mm spacing. */
function rotatedAffine() {
  return [
    [0, -1, 0, 0],
    [1,  0, 0, 0],
    [0,  0, 1, 0],
    [0,  0, 0, 1],
  ];
}

// ---------------------------------------------------------------------------
// 1. computeVoxelVolume
// ---------------------------------------------------------------------------
describe('Metrics: computeVoxelVolume', () => {
  test('identity affine → voxel volume = 1 mm³', () => {
    const v = computeVoxelVolume(identityAffine());
    assert.equal(v, 1.0);
  });

  test('anisotropic 1×1×3 affine → voxel volume = 3 mm³', () => {
    const v = computeVoxelVolume(anisotropicAffine());
    assert.ok(Math.abs(v - 3.0) < 1e-9, `Expected 3.0 mm³, got ${v}`);
  });

  test('rotated affine (90° around z) → |det| = 1 mm³', () => {
    const v = computeVoxelVolume(rotatedAffine());
    assert.ok(Math.abs(v - 1.0) < 1e-9, `Expected 1.0 mm³, got ${v}`);
  });

  test('2×2×2 mm isotropic → voxel volume = 8 mm³', () => {
    const affine = [
      [2, 0, 0, 0],
      [0, 2, 0, 0],
      [0, 0, 2, 0],
      [0, 0, 0, 1],
    ];
    const v = computeVoxelVolume(affine);
    assert.ok(Math.abs(v - 8.0) < 1e-9, `Expected 8.0 mm³, got ${v}`);
  });

  test('null affine → returns NaN', () => {
    assert.ok(isNaN(computeVoxelVolume(null)));
  });

  test('empty array affine → returns NaN', () => {
    assert.ok(isNaN(computeVoxelVolume([])));
  });

  test('non-invertible (zero) affine → det = 0', () => {
    const affine = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,1]];
    const v = computeVoxelVolume(affine);
    assert.equal(v, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. computeRegionVolumes
// ---------------------------------------------------------------------------
describe('Metrics: computeRegionVolumes (SYNTHETIC fixtures)', () => {
  test('mixed label volume: correct voxel counts per region', () => {
    const vol = makeMixedVolume(); // 8 NETC, 8 ED, 8 ET, 40 BG in [4,4,4]
    const dims = [4, 4, 4];
    const result = computeRegionVolumes(vol, dims, identityAffine());

    assert.equal(result.NETC.voxels, 8,  'NETC voxel count');
    assert.equal(result.ED.voxels,   8,  'ED voxel count');
    assert.equal(result.ET.voxels,   8,  'ET voxel count');
    assert.equal(result.TC.voxels,   16, 'TC = NETC + ET');
    assert.equal(result.WT.voxels,   24, 'WT = NETC + ED + ET');
  });

  test('identity affine: physical volumes are voxel_count / 1000 mL', () => {
    const vol = makeMixedVolume();
    const dims = [4, 4, 4];
    const result = computeRegionVolumes(vol, dims, identityAffine());
    // 1 mm³ per voxel → mL = voxels / 1000
    assert.ok(Math.abs(result.NETC.ml - 0.008) < 1e-9, `NETC ml: expected 0.008, got ${result.NETC.ml}`);
    assert.ok(Math.abs(result.WT.ml  - 0.024) < 1e-9,  `WT ml: expected 0.024, got ${result.WT.ml}`);
  });

  test('anisotropic 1×1×3 affine: physical volumes scale correctly', () => {
    const vol = makeMixedVolume();
    const dims = [4, 4, 4];
    const result = computeRegionVolumes(vol, dims, anisotropicAffine());
    // 3 mm³ per voxel, 8 NETC voxels → 0.024 mL
    assert.ok(Math.abs(result.NETC.ml - 0.024) < 1e-9, `NETC ml: expected 0.024, got ${result.NETC.ml}`);
  });

  test('all-background volume: all regions have 0 voxels', () => {
    const vol = makeZeroVolume(64);
    const dims = [4, 4, 4];
    const result = computeRegionVolumes(vol, dims, identityAffine());
    assert.equal(result.ET.voxels,   0);
    assert.equal(result.TC.voxels,   0);
    assert.equal(result.WT.voxels,   0);
    assert.equal(result.NETC.voxels, 0);
    assert.equal(result.ED.voxels,   0);
  });

  test('null affine: ml values are null (cannot compute physical volume)', () => {
    const vol = makeMixedVolume();
    const dims = [4, 4, 4];
    const result = computeRegionVolumes(vol, dims, null);
    assert.equal(result.ET.ml, null);
    assert.equal(result.WT.ml, null);
  });
});

// ---------------------------------------------------------------------------
// 3. computeRegionMask
// ---------------------------------------------------------------------------
describe('Metrics: computeRegionMask', () => {
  test('WT mask includes labels 1, 2, and 4', () => {
    const vol = makeMixedVolume(); // 8 each of 1,2,4
    const mask = computeRegionMask(vol, [4, 4, 4], BRATS_REGIONS.WT);
    const oneCount = Array.from(mask).filter((v) => v === 1).length;
    assert.equal(oneCount, 24, 'WT mask should have 24 ones (all tumor voxels)');
  });

  test('ET mask includes only label 4', () => {
    const vol = makeMixedVolume();
    const mask = computeRegionMask(vol, [4, 4, 4], BRATS_REGIONS.ET);
    const oneCount = Array.from(mask).filter((v) => v === 1).length;
    assert.equal(oneCount, 8, 'ET mask should have exactly 8 ones');
  });

  test('TC mask includes labels 1 and 4 only', () => {
    const vol = makeMixedVolume();
    const mask = computeRegionMask(vol, [4, 4, 4], BRATS_REGIONS.TC);
    const oneCount = Array.from(mask).filter((v) => v === 1).length;
    assert.equal(oneCount, 16, 'TC = NETC(8) + ET(8) = 16 voxels');
  });
});

// ---------------------------------------------------------------------------
// 4. confusionMatrix
// ---------------------------------------------------------------------------
describe('Metrics: confusionMatrix', () => {
  test('identical masks: all TPs', () => {
    const mask = new Uint8Array([1, 1, 0, 0]);
    const { TP, FP, FN, TN } = confusionMatrix(mask, mask);
    assert.equal(TP, 2); assert.equal(FP, 0);
    assert.equal(FN, 0); assert.equal(TN, 2);
  });

  test('no overlap: all FPs and FNs', () => {
    const pred = new Uint8Array([1, 1, 0, 0]);
    const ref  = new Uint8Array([0, 0, 1, 1]);
    const { TP, FP, FN, TN } = confusionMatrix(pred, ref);
    assert.equal(TP, 0); assert.equal(FP, 2);
    assert.equal(FN, 2); assert.equal(TN, 0);
  });

  test('partial overlap: correct TP/FP/FN/TN counts', () => {
    // pred: [1,1,0,0], ref: [1,0,1,0]  → TP=1, FP=1, FN=1, TN=1
    const pred = new Uint8Array([1, 1, 0, 0]);
    const ref  = new Uint8Array([1, 0, 1, 0]);
    const { TP, FP, FN, TN } = confusionMatrix(pred, ref);
    assert.equal(TP, 1); assert.equal(FP, 1);
    assert.equal(FN, 1); assert.equal(TN, 1);
  });

  test('mismatched lengths: throws error', () => {
    const a = new Uint8Array([1, 0]);
    const b = new Uint8Array([1, 0, 1]);
    assert.throws(() => confusionMatrix(a, b), /length mismatch/i);
  });
});

// ---------------------------------------------------------------------------
// 5. dice / sensitivity / precision / specificity
// ---------------------------------------------------------------------------
describe('Metrics: Dice coefficient', () => {
  test('perfect overlap: Dice = 1.0', () => {
    assert.equal(dice(10, 0, 0), 1.0);
  });

  test('no overlap: Dice = 0.0', () => {
    assert.equal(dice(0, 5, 5), 0.0);
  });

  test('partial overlap: Dice = 2TP / (2TP + FP + FN)', () => {
    // 2*6 / (12 + 2 + 4) = 12/18 = 0.666...
    const d = dice(6, 2, 4);
    assert.ok(Math.abs(d - (12/18)) < 1e-10);
  });

  test('both masks empty: Dice = 1.0 (documented policy)', () => {
    assert.equal(dice(0, 0, 0), 1.0, 'Dice(∅, ∅) = 1.0 per codebase convention');
  });

  test('only prediction empty (FN > 0): Dice = 0.0', () => {
    assert.equal(dice(0, 0, 5), 0.0);
  });

  test('only reference empty (FP > 0): Dice = 0.0', () => {
    assert.equal(dice(0, 5, 0), 0.0);
  });
});

describe('Metrics: Sensitivity, Precision, Specificity', () => {
  test('sensitivity = TP/(TP+FN), both present', () => {
    assert.ok(Math.abs(sensitivity(8, 2) - 0.8) < 1e-10);
  });

  test('sensitivity = null when TP+FN = 0 (reference empty)', () => {
    assert.equal(sensitivity(0, 0), null);
  });

  test('perfect sensitivity: TP=10, FN=0 → 1.0', () => {
    assert.equal(sensitivity(10, 0), 1.0);
  });

  test('precision = TP/(TP+FP), both present', () => {
    assert.ok(Math.abs(precision(8, 2) - 0.8) < 1e-10);
  });

  test('precision = null when TP+FP = 0 (prediction empty)', () => {
    assert.equal(precision(0, 0), null);
  });

  test('specificity = TN/(TN+FP)', () => {
    assert.ok(Math.abs(specificity(9, 1) - 0.9) < 1e-10);
  });

  test('specificity = null when TN+FP = 0', () => {
    assert.equal(specificity(0, 0), null);
  });
});

// ---------------------------------------------------------------------------
// 6. computeAllMetrics
// ---------------------------------------------------------------------------
describe('Metrics: computeAllMetrics (SYNTHETIC fixtures)', () => {
  test('identical prediction and reference: all Dice = 1.0', () => {
    const vol = makeMixedVolume();
    const dims = [4, 4, 4];
    const result = computeAllMetrics(vol, vol, dims, identityAffine());
    assert.ok(Math.abs(result.ET.dice - 1.0) < 1e-10, `ET dice: ${result.ET.dice}`);
    assert.ok(Math.abs(result.TC.dice - 1.0) < 1e-10, `TC dice: ${result.TC.dice}`);
    assert.ok(Math.abs(result.WT.dice - 1.0) < 1e-10, `WT dice: ${result.WT.dice}`);
  });

  test('spatially disjoint ET predictions: Dice = 0.0', () => {
    // 4-voxel [4,1,1] volume
    // pred: label 4 at voxels [0,1] → ET mask = [1,1,0,0]
    // ref:  label 4 at voxels [2,3] → ET mask = [0,0,1,1]
    // No spatial overlap → TP=0, FP=2, FN=2 → Dice=0.0
    const pred = new Uint8Array([4, 4, 0, 0]);
    const ref  = new Uint8Array([0, 0, 4, 4]);
    const dims = [4, 1, 1];
    const result = computeAllMetrics(pred, ref, dims, identityAffine());
    assert.equal(result.ET.dice, 0.0, 'ET dice should be 0.0 (disjoint ET regions)');
    assert.equal(result.ET.TP, 0);
    assert.equal(result.ET.FP, 2);
    assert.equal(result.ET.FN, 2);
    assert.equal(result.TC.dice, 0.0, 'TC dice should be 0.0 (disjoint TC regions)');
  });

  test('cross-region fixture: NETC-only pred vs ED-only ref → WT Dice = 0.0, ET Dice = 1.0 (both empty)', () => {
    // pred: all label 1 (NETC), ref: all label 2 (ED)
    // WT mask: both volumes cover ALL voxels → TP=8, Dice=1.0 (same spatial coverage)
    // ET mask: both empty → Dice=1.0 per convention
    // TC mask: pred has TC (label 1), ref has no TC (label 2 not in TC) → Dice=0.0
    const pred = new Uint8Array(8).fill(1);
    const ref  = new Uint8Array(8).fill(2);
    const dims = [2, 2, 2];
    const result = computeAllMetrics(pred, ref, dims, identityAffine());
    assert.equal(result.ET.dice, 1.0, 'ET dice(∅,∅) = 1.0 per convention');
    assert.equal(result.TC.dice, 0.0, 'TC dice should be 0.0 (pred has TC, ref does not)');
    // WT: pred has labels {1} (in WT), ref has labels {2} (in WT) → same 8 voxels → TP=8 → Dice=1.0
    assert.equal(result.WT.dice, 1.0, 'WT dice = 1.0 (same voxel positions, different sub-labels)');
  });

  test('mismatched sizes: throws error', () => {
    const a = new Uint8Array(8);
    const b = new Uint8Array(16);
    assert.throws(() => computeAllMetrics(a, b, [2,2,2], null), /size.*match/i);
  });
});

// ---------------------------------------------------------------------------
// 7. hd95 (SYNTHETIC fixtures)
// ---------------------------------------------------------------------------
describe('Metrics: hd95 — 95th-percentile Hausdorff Distance (SYNTHETIC fixtures)', () => {
  test('identical non-empty masks: HD95 = 0', () => {
    // 2×2×2 solid cube with label 1
    const mask = new Uint8Array(8).fill(1);
    const dims = [2, 2, 2];
    const result = hd95(mask, mask, dims, identityAffine());
    assert.equal(result, 0, `HD95 of identical masks should be 0, got ${result}`);
  });

  test('both masks empty: returns null', () => {
    const mask = new Uint8Array(8); // all zeros
    const dims = [2, 2, 2];
    const result = hd95(mask, mask, dims, identityAffine());
    assert.equal(result, null, 'HD95 is undefined when both masks are empty');
  });

  test('pred non-empty, ref empty: returns null', () => {
    const pred = new Uint8Array(8).fill(1);
    const ref  = new Uint8Array(8);
    const dims = [2, 2, 2];
    const result = hd95(pred, ref, dims, identityAffine());
    assert.equal(result, null, 'HD95 is undefined when reference mask is empty');
  });

  test('ref non-empty, pred empty: returns null', () => {
    const pred = new Uint8Array(8);
    const ref  = new Uint8Array(8).fill(1);
    const dims = [2, 2, 2];
    const result = hd95(pred, ref, dims, identityAffine());
    assert.equal(result, null, 'HD95 is undefined when prediction mask is empty');
  });

  test('adjacent single-voxel masks: HD95 = 1 mm (1mm isotropic)', () => {
    // pred voxel at [0,0,0], ref voxel at [1,0,0] in a [3,1,1] volume
    const pred = new Uint8Array(3); pred[0] = 1;
    const ref  = new Uint8Array(3); ref[1]  = 1;
    const dims = [3, 1, 1];
    const result = hd95(pred, ref, dims, identityAffine());
    // Distance between surface voxels [0,0,0] and [1,0,0] = 1mm
    assert.ok(result != null, 'HD95 should be a number');
    assert.ok(Math.abs(result - 1.0) < 1e-9, `Expected HD95 ≈ 1mm, got ${result}`);
  });

  test('anisotropic spacing: HD95 respects physical mm', () => {
    // 1×1×3mm anisotropic: voxel [0,0,0] → ref [0,0,1] = 3mm physical distance
    const pred = new Uint8Array(3); pred[0] = 1;
    const ref  = new Uint8Array(3); ref[2]  = 1;
    const dims = [1, 1, 3];
    const result = hd95(pred, ref, dims, anisotropicAffine());
    assert.ok(result != null);
    assert.ok(Math.abs(result - 6.0) < 1e-9, `Expected HD95 ≈ 6mm (2 voxels × 3mm), got ${result}`);
  });
});

// ---------------------------------------------------------------------------
// 8. sha256ArrayBuffer
// ---------------------------------------------------------------------------
describe('Metrics: sha256ArrayBuffer', () => {
  test('empty buffer: returns known SHA-256 hex', async () => {
    const empty = new ArrayBuffer(0);
    const hex = await sha256ArrayBuffer(empty);
    // SHA-256 of empty string is a well-known constant
    assert.equal(hex, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('returns 64-character lowercase hex string', async () => {
    const buf = new TextEncoder().encode('NeuroVault').buffer;
    const hex = await sha256ArrayBuffer(buf);
    assert.match(hex, /^[0-9a-f]{64}$/, 'Expected 64 hex chars');
  });

  test('different inputs produce different hashes', async () => {
    const a = new TextEncoder().encode('hello').buffer;
    const b = new TextEncoder().encode('world').buffer;
    const ha = await sha256ArrayBuffer(a);
    const hb = await sha256ArrayBuffer(b);
    assert.notEqual(ha, hb, 'Different inputs must produce different hashes');
  });

  test('same input always produces same hash (deterministic)', async () => {
    const buf = new TextEncoder().encode('BraTS2021').buffer;
    const h1 = await sha256ArrayBuffer(buf);
    const h2 = await sha256ArrayBuffer(buf);
    assert.equal(h1, h2, 'SHA-256 must be deterministic');
  });
});

// ---------------------------------------------------------------------------
// 9. BRATS_REGIONS export
// ---------------------------------------------------------------------------
describe('Metrics: BRATS_REGIONS label sets (AGENTS.md invariant)', () => {
  test('ET region contains only label 4', () => {
    assert.ok(BRATS_REGIONS.ET.has(4), 'ET must include label 4');
    assert.equal(BRATS_REGIONS.ET.size, 1, 'ET contains only one label');
    assert.ok(!BRATS_REGIONS.ET.has(3), 'Label 3 is deprecated — must not be in ET');
  });

  test('TC region contains labels 1 and 4', () => {
    assert.ok(BRATS_REGIONS.TC.has(1), 'TC must include label 1 (NETC)');
    assert.ok(BRATS_REGIONS.TC.has(4), 'TC must include label 4 (ET)');
    assert.equal(BRATS_REGIONS.TC.size, 2);
  });

  test('WT region contains labels 1, 2, and 4', () => {
    assert.ok(BRATS_REGIONS.WT.has(1), 'WT must include label 1 (NETC)');
    assert.ok(BRATS_REGIONS.WT.has(2), 'WT must include label 2 (ED)');
    assert.ok(BRATS_REGIONS.WT.has(4), 'WT must include label 4 (ET)');
    assert.equal(BRATS_REGIONS.WT.size, 3);
    assert.ok(!BRATS_REGIONS.WT.has(3), 'Label 3 is deprecated — must not be in WT');
  });
});

// ---------------------------------------------------------------------------
// 10. computeErrorVolume & createErrorColormap (Error Overlay)
// ---------------------------------------------------------------------------
describe('Metrics: Error Overlay & Colormap (TP/FP/FN)', () => {
  test('correctly categorizes TP (1), FP (2), FN (3), TN (0) voxels', () => {
    // 4 voxels:
    // voxel 0: pred=4 (WT), ref=4 (WT) -> TP (1)
    // voxel 1: pred=4 (WT), ref=0 (BG) -> FP (2)
    // voxel 2: pred=0 (BG), ref=1 (WT) -> FN (3)
    // voxel 3: pred=0 (BG), ref=0 (BG) -> TN (0)
    const pred = new Uint8Array([4, 4, 0, 0]);
    const ref  = new Uint8Array([4, 0, 1, 0]);

    const errorVol = computeErrorVolume(pred, ref, 'WT');
    assert.equal(errorVol[0], 1, 'voxel 0 should be TP (1)');
    assert.equal(errorVol[1], 2, 'voxel 1 should be FP (2)');
    assert.equal(errorVol[2], 3, 'voxel 2 should be FN (3)');
    assert.equal(errorVol[3], 0, 'voxel 3 should be TN (0)');
  });

  test('computeErrorVolume throws on volume length mismatch', () => {
    const p = new Uint8Array(4);
    const r = new Uint8Array(8);
    assert.throws(() => computeErrorVolume(p, r, 'WT'), /length mismatch/i);
  });

  test('createErrorColormap produces valid RGBA colormap structure', () => {
    const cmap = createErrorColormap();
    assert.ok(Array.isArray(cmap.R) && cmap.R.length === 4);
    assert.ok(Array.isArray(cmap.G) && cmap.G.length === 4);
    assert.ok(Array.isArray(cmap.B) && cmap.B.length === 4);
    assert.ok(Array.isArray(cmap.A) && cmap.A.length === 4);
    assert.deepEqual(cmap.I, [0, 1, 2, 3]);

    // Background is transparent
    assert.equal(cmap.A[0], 0);

    // TP is lime green #22C55E (R:34, G:197, B:94)
    assert.equal(cmap.R[1], 34);
    assert.equal(cmap.G[1], 197);
    assert.equal(cmap.B[1], 94);
    assert.equal(cmap.A[1], 255);

    // FP is rose red #EF4444 (R:239, G:68, B:68)
    assert.equal(cmap.R[2], 239);
    assert.equal(cmap.G[2], 68);
    assert.equal(cmap.B[2], 68);

    // FN is sky blue #38BDF8 (R:56, G:189, B:248)
    assert.equal(cmap.R[3], 56);
    assert.equal(cmap.G[3], 189);
    assert.equal(cmap.B[3], 248);
  });

  test('createErrorColormap toggles visibility of individual error categories', () => {
    const cmap = createErrorColormap({ showTP: false, showFP: true, showFN: false });
    assert.equal(cmap.A[1], 0, 'TP should be hidden');
    assert.equal(cmap.A[2], 255, 'FP should be visible');
    assert.equal(cmap.A[3], 0, 'FN should be hidden');
  });
});
