/**
 * trustLayer.js — NeuroVault Phase 6 Trust Layer Check Runner
 *
 * Runs a battery of input-integrity and consistency checks before
 * any metric or visualization is shown to the user.
 *
 * Each check returns:
 *   { id, label, status: 'pass'|'warn'|'fail'|'na', message, detail }
 *
 * Checks never throw — all errors are caught and reported as 'fail'.
 * No DOM, no React.
 */

import { parseNiftiVolume } from '../components/viewer/SurfaceExtractor.js';
import { validateOverlayGeometry } from '../components/viewer/GeometryValidator.js';
import { computeVoxelVolume } from './metrics.js';

const ONE_GIB = 1024 * 1024 * 1024;

// BraTS 2021 valid label set (AGENTS.md — label 3 deprecated/unused)
const VALID_BRATS_LABELS = new Set([0, 1, 2, 4]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeStatus(status) {
  if (status === 'pass' || status === 'passed') return { status: 'pass', statusLabel: 'Passed' };
  if (status === 'warn' || status === 'warning') return { status: 'warn', statusLabel: 'Warning' };
  if (status === 'fail' || status === 'failed') return { status: 'fail', statusLabel: 'Failed' };
  if (status === 'not_checked') return { status: 'not_checked', statusLabel: 'Not checked' };
  return { status: 'na', statusLabel: 'Not available' };
}

/** Run an async check and catch any thrown error as a fail result. */
async function safeCheck(id, label, category, fn) {
  try {
    const result = await fn();
    const norm = normalizeStatus(result.status);
    return { id, label, category, ...result, status: norm.status, statusLabel: norm.statusLabel };
  } catch (err) {
    return {
      id,
      label,
      category,
      status: 'fail',
      statusLabel: 'Failed',
      message: 'Check threw unexpected error',
      detail: String(err?.message ?? err),
    };
  }
}

/** Parse a File's ArrayBuffer and return nifti volume info, or null on error. */
async function tryParse(file) {
  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseNiftiVolume(buffer);
    return { buffer, parsed };
  } catch {
    return null;
  }
}

/** Check whether a typed array is 3-D (all dims ≥ 1), finite, and non-constant. */
function isUsableVolume(volume, dims) {
  if (!volume || !dims) return { ok: false, reason: 'missing volume or dims' };
  if (dims.length < 3 || dims[0] < 1 || dims[1] < 1 || dims[2] < 1) {
    return { ok: false, reason: `degenerate dims: [${dims.join(',')}]` };
  }
  let hasFinite = false;
  let min = Infinity, max = -Infinity;
  const n = Math.min(volume.length, 1_000_000); // sample up to 1M voxels
  for (let i = 0; i < n; i++) {
    const v = volume[i];
    if (!isFinite(v)) return { ok: false, reason: 'volume contains non-finite value' };
    hasFinite = true;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!hasFinite) return { ok: false, reason: 'volume is empty' };
  if (min === max) return { ok: false, reason: `volume is constant (all voxels = ${min})` };
  return { ok: true };
}

/** Scan a label volume for any value not in validSet (sampling up to 5M voxels). */
function findUnexpectedLabels(volume, validSet) {
  const unexpected = new Set();
  const n = Math.min(volume.length, 5_000_000);
  for (let i = 0; i < n; i++) {
    const v = volume[i];
    if (!validSet.has(v)) unexpected.add(v);
    if (unexpected.size > 5) break; // enough evidence
  }
  return [...unexpected];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all Trust Layer checks for a segmentation session.
 *
 * @param {Object|null} sessionFiles - { t1: File, t1gd: File, t2: File, flair: File, expertSeg?: File }
 * @param {Object|null} predictionData - backend response object
 * @param {{ predVolume, predDims, predAffine, refVolume?, refDims? }|null} parsedVolumes
 * @returns {Promise<TrustCheck[]>}
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   status: 'pass'|'warn'|'fail'|'na',
 *   message: string,
 *   detail?: string
 * }} TrustCheck
 */
export async function runTrustLayer(sessionFiles, predictionData, parsedVolumes) {
  const checks = [];
  const modalityKeys = ['t1', 't1gd', 't2', 'flair'];

  // ------------------------------------------------------------------
  // CHECK 1: All 4 required modalities present
  // ------------------------------------------------------------------
  checks.push(await safeCheck('modalities_present', 'All 4 MRI modalities present', 'Input validation', async () => {
    if (!sessionFiles) {
      return { status: 'na', message: 'No session files available (demo mode)', detail: null };
    }
    const missing = modalityKeys.filter((k) => !sessionFiles[k]);
    if (missing.length === 0) {
      return { status: 'pass', message: 'T1, T1Gd, T2, FLAIR all uploaded', detail: null };
    }
    return {
      status: 'fail',
      message: `Missing modalities: ${missing.join(', ')}`,
      detail: 'All 4 sequences are required for the SegResNet BraTS prediction pipeline.',
    };
  }));

  // ------------------------------------------------------------------
  // CHECK 2: File sizes within 1 GiB each
  // ------------------------------------------------------------------
  checks.push(await safeCheck('file_sizes', 'File sizes within 1 GiB limit', 'Input validation', async () => {
    if (!sessionFiles) return { status: 'na', message: 'No session files (demo mode)', detail: null };
    const oversized = modalityKeys.filter((k) => sessionFiles[k]?.size > ONE_GIB);
    if (oversized.length === 0) {
      return { status: 'pass', message: 'All files within 1 GiB per-file guardrail', detail: null };
    }
    return {
      status: 'fail',
      message: `Oversized files: ${oversized.join(', ')}`,
      detail: `Files exceed the 1 GiB (${ONE_GIB.toLocaleString()} byte) per-file limit.`,
    };
  }));

  // ------------------------------------------------------------------
  // CHECK 3: Files parse as valid NIfTI-1 / NIfTI-2
  // ------------------------------------------------------------------
  const parsedModalities = {};
  checks.push(await safeCheck('nifti_valid', 'Files parseable as NIfTI-1/2', 'Input validation', async () => {
    if (!sessionFiles) return { status: 'na', message: 'No session files (demo mode)', detail: null };
    const failed = [];
    for (const key of modalityKeys) {
      const file = sessionFiles[key];
      if (!file) continue;
      const r = await tryParse(file);
      if (!r) { failed.push(key); continue; }
      parsedModalities[key] = r.parsed;
    }
    if (failed.length === 0) {
      return { status: 'pass', message: 'All modality files parse successfully', detail: null };
    }
    return {
      status: 'fail',
      message: `NIfTI parse failed for: ${failed.join(', ')}`,
      detail: 'Ensure files are valid .nii or .nii.gz (NIfTI-1 or NIfTI-2).',
    };
  }));

  // ------------------------------------------------------------------
  // CHECK 4: Volumes are 3-D, finite, and non-constant
  // ------------------------------------------------------------------
  checks.push(await safeCheck('volume_sanity', 'Volumes are 3-D, finite, and non-constant', 'Input validation', async () => {
    if (!sessionFiles || Object.keys(parsedModalities).length === 0) {
      return { status: 'na', message: 'No parsed modalities available', detail: null };
    }
    const problems = [];
    for (const [key, parsed] of Object.entries(parsedModalities)) {
      if (!parsed) { problems.push(`${key}: not parsed`); continue; }
      const check = isUsableVolume(parsed.volume, parsed.dims);
      if (!check.ok) problems.push(`${key}: ${check.reason}`);
    }
    if (problems.length === 0) {
      return { status: 'pass', message: 'All volumes are 3-D, finite, and non-constant', detail: null };
    }
    return {
      status: 'fail',
      message: 'Volume sanity check failed',
      detail: problems.join(' | '),
    };
  }));

  // ------------------------------------------------------------------
  // CHECK 5: Modality grid dimensions & spatial units
  // ------------------------------------------------------------------
  checks.push(await safeCheck('geometry_compatible', 'Modality grids and spatial units are compatible', 'Input validation', async () => {
    const parsed = Object.values(parsedModalities).filter(Boolean);
    if (parsed.length < 2) {
      return { status: 'na', message: 'Need ≥2 parsed modalities to compare', detail: null };
    }

    // Spatial units check: ensure voxel spacing is within typical MRI range in mm (0.05 - 10 mm)
    for (const [key, p] of Object.entries(parsedModalities)) {
      if (p?.pixDims) {
        const [sx, sy, sz] = p.pixDims;
        if (sx < 0.05 || sy < 0.05 || sz < 0.05) {
          return {
            status: 'warn',
            message: `Modality ${key} has unusually small voxel spacing (<0.05 mm)`,
            detail: 'Check whether spatial units are declared in meters instead of millimetres.'
          };
        }
      }
    }

    const ref = parsed[0];
    for (let i = 1; i < parsed.length; i++) {
      const r = validateOverlayGeometry(ref, parsed[i]);
      const isValid = Boolean(r.valid ?? r.compatible);
      if (!isValid) {
        return {
          status: 'fail',
          message: 'Modality dimension, spacing, or affine mismatch',
          detail: r.error ?? r.reason,
        };
      }
    }
    return { status: 'pass', message: 'All modality grids and spatial spacings are compatible (mm)', detail: null };
  }));

  // ------------------------------------------------------------------
  // CHECK 6: Affine is valid (finite, non-degenerate determinant)
  // ------------------------------------------------------------------
  checks.push(await safeCheck('affine_valid', 'NIfTI affine is valid and non-degenerate', 'Prediction validation', async () => {
    const parsed = Object.values(parsedModalities).filter(Boolean);
    if (parsed.length === 0) {
      // Try parsedVolumes fallback
      if (parsedVolumes?.predAffine) {
        const v = computeVoxelVolume(parsedVolumes.predAffine);
        if (!isFinite(v) || v <= 0) {
          return { status: 'fail', message: 'Prediction affine is degenerate', detail: `|det(A)| = ${v}` };
        }
        return { status: 'pass', message: `Voxel volume = ${v.toFixed(4)} mm³ (affine valid)`, detail: null };
      }
      return { status: 'na', message: 'No parsed volumes to check affine', detail: null };
    }
    const problems = [];
    for (const [key, p] of Object.entries(parsedModalities)) {
      if (!p?.affine) { problems.push(`${key}: no affine`); continue; }
      const v = computeVoxelVolume(p.affine);
      if (!isFinite(v) || v <= 0) problems.push(`${key}: degenerate affine (|det|=${v})`);
    }
    if (problems.length === 0) {
      const sampleAffine = Object.values(parsedModalities).find((p) => p?.affine)?.affine;
      const v = sampleAffine ? computeVoxelVolume(sampleAffine) : null;
      return {
        status: 'pass',
        message: v ? `Affine valid. Voxel volume ≈ ${v.toFixed(4)} mm³` : 'Affines valid',
        detail: null,
      };
    }
    return { status: 'warn', message: 'Affine issues detected', detail: problems.join(' | ') };
  }));

  // ------------------------------------------------------------------
  // CHECK 7: Prediction label set matches BraTS {0, 1, 2, 4}
  // ------------------------------------------------------------------
  checks.push(await safeCheck('pred_labels_valid', 'Prediction labels match BraTS 2021 convention {0,1,2,4}', 'Prediction validation', async () => {
    if (!parsedVolumes?.predVolume) {
      return { status: 'na', message: 'No parsed prediction volume available', detail: null };
    }
    const unexpected = findUnexpectedLabels(parsedVolumes.predVolume, VALID_BRATS_LABELS);
    if (unexpected.length === 0) {
      return { status: 'pass', message: 'All prediction labels are valid BraTS 2021 values', detail: null };
    }
    return {
      status: 'fail',
      message: `Unexpected label values in prediction: [${unexpected.join(', ')}]`,
      detail: 'Valid BraTS 2021 labels: 0 (BG), 1 (NETC), 2 (ED), 4 (ET). Label 3 is deprecated.',
    };
  }));

  // ------------------------------------------------------------------
  // CHECK 8: Expert mask label set matches BraTS {0, 1, 2, 4} (if provided)
  // ------------------------------------------------------------------
  checks.push(await safeCheck('expert_labels_valid', 'Expert mask labels match BraTS 2021 convention (if provided)', 'Expert-mask alignment', async () => {
    if (!parsedVolumes?.refVolume) {
      return { status: 'not_checked', message: 'Expert segmentation not provided — check not run', detail: null };
    }
    const unexpected = findUnexpectedLabels(parsedVolumes.refVolume, VALID_BRATS_LABELS);
    if (unexpected.length === 0) {
      return { status: 'pass', message: 'All expert mask labels are valid BraTS 2021 values', detail: null };
    }
    return {
      status: 'fail',
      message: `Unexpected label values in expert mask: [${unexpected.join(', ')}]`,
      detail: 'Expert mask should use same BraTS 2021 label convention as the prediction.',
    };
  }));

  // ------------------------------------------------------------------
  // CHECK 9: Prediction–expert spatial grid alignment (if expert provided)
  // ------------------------------------------------------------------
  checks.push(await safeCheck('pred_expert_alignment', 'Prediction and expert mask grids are aligned', 'Expert-mask alignment', async () => {
    if (!parsedVolumes?.predDims || !parsedVolumes?.refDims || !parsedVolumes?.refVolume) {
      return { status: 'not_checked', message: 'Expert segmentation not provided — alignment check skipped', detail: null };
    }
    // Build geometry objects with dims, pixDims, and affines for validateOverlayGeometry
    const predGeo = {
      dims: parsedVolumes.predDims,
      pixDims: parsedVolumes.predPixDims ?? null,
      affine: parsedVolumes.predAffine ?? null
    };
    const refGeo = {
      dims: parsedVolumes.refDims,
      pixDims: parsedVolumes.refPixDims ?? null,
      affine: parsedVolumes.refAffine ?? null
    };
    const r = validateOverlayGeometry(predGeo, refGeo);
    const isValid = Boolean(r.valid ?? r.compatible);
    if (isValid) {
      const warnMsg = r.warning ? ` (${r.warning})` : '';
      return { status: 'pass', message: `Prediction and expert grids are spatially aligned${warnMsg}`, detail: r.warning ?? null };
    }
    return { status: 'fail', message: 'Prediction–expert grid mismatch', detail: r.error ?? r.reason };
  }));

  // ------------------------------------------------------------------
  // CHECK 10: Backend response integrity & inference status
  // ------------------------------------------------------------------
  checks.push(await safeCheck('backend_response_valid', 'Backend response integrity and inference status', 'Prediction validation', async () => {
    if (!predictionData) {
      return { status: 'na', message: 'No prediction response available (no inference run yet)', detail: null };
    }
    const vol = predictionData.volumes_ml;
    if (!vol) {
      return { status: 'fail', message: 'Response missing volumes_ml field', detail: JSON.stringify(predictionData).slice(0, 200) };
    }
    const missing = ['whole_tumor', 'tumor_core', 'enhancing_tumor'].filter((k) => !(k in vol) || vol[k] == null);
    if (missing.length > 0) {
      return { status: 'fail', message: `volumes_ml missing: ${missing.join(', ')}`, detail: null };
    }
    const negatives = ['whole_tumor', 'tumor_core', 'enhancing_tumor'].filter((k) => vol[k] < 0);
    if (negatives.length > 0) {
      return { status: 'warn', message: `Negative volume values detected: ${negatives.join(', ')}`, detail: 'Volumes should be ≥ 0 mL.' };
    }
    const isLive = predictionData.isLiveInference === true;
    const weightsPresent = predictionData.model_weights_present ?? predictionData.weights_present ?? null;

    if (isLive && weightsPresent === false) {
      return {
        status: 'warn',
        message: 'Live inference executed with UNTRAINED model weights (checkpoint missing)',
        detail: 'Backend reported model_weights_present: false. Pretrained checkpoint model.pt is missing from backend/models/. Predictions are generated by a randomly initialized SegResNet architecture and cannot be used for clinical or scientific assessment.'
      };
    }

    const msg = isLive
      ? 'Backend response is complete and verified from live inference'
      : 'Backend response is complete (candidate research prototype; live inference unverified)';
    const detail = isLive
      ? null
      : 'Live inference server is currently offline or unverified. Displayed metrics are candidate research data.';
    return { status: 'pass', message: msg, detail };
  }));

  return checks;
}
