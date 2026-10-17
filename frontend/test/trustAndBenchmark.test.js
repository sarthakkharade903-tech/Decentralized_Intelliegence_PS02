/**
 * trustAndBenchmark.test.js — NeuroVault Phase 6 Trust Layer & Benchmark Tests
 *
 * Tests for frontend/src/lib/trustLayer.js and frontend/src/lib/benchmark.js
 * Runner: node --test (Node.js built-in test runner)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runTrustLayer } from '../src/lib/trustLayer.js';
import {
  runBenchmarkCase,
  aggregateBenchmark,
  exportBenchmarkJSON,
  validateCaseEligibility,
  runBenchmarkSuite,
} from '../src/lib/benchmark.js';

describe('Trust Layer: Input Integrity & Pre-Flight Checks', () => {
  test('returns N/A statuses when sessionFiles is null (demo / initial state)', async () => {
    const checks = await runTrustLayer(null, null, null);
    assert.ok(Array.isArray(checks));
    assert.equal(checks.length, 10);

    const modCheck = checks.find((c) => c.id === 'modalities_present');
    assert.equal(modCheck.status, 'na');

    const backendCheck = checks.find((c) => c.id === 'backend_response_valid');
    assert.equal(backendCheck.status, 'na');
  });

  test('detects missing core sequences when partial files are provided', async () => {
    const partialFiles = {
      t1: { size: 1000 },
      // t1gd missing
      t2: { size: 1000 },
      flair: { size: 1000 },
    };
    const checks = await runTrustLayer(partialFiles, null, null);
    const modCheck = checks.find((c) => c.id === 'modalities_present');
    assert.equal(modCheck.status, 'fail');
    assert.match(modCheck.message, /missing modalities: t1gd/i);
  });

  test('flags oversized files exceeding 1 GiB limit', async () => {
    const oversizedFiles = {
      t1: { size: 1024 * 1024 },
      t1gd: { size: 1024 * 1024 * 1024 + 10 }, // > 1 GiB
      t2: { size: 1024 * 1024 },
      flair: { size: 1024 * 1024 },
    };
    const checks = await runTrustLayer(oversizedFiles, null, null);
    const sizeCheck = checks.find((c) => c.id === 'file_sizes');
    assert.equal(sizeCheck.status, 'fail');
    assert.match(sizeCheck.message, /t1gd/i);
  });

  test('validates prediction volume labels matching BraTS 2021 convention', async () => {
    // Valid labels: {0, 1, 2, 4}
    const validVol = new Uint8Array([0, 1, 2, 4, 0, 1, 2, 4]);
    const parsedVolumes = {
      predVolume: validVol,
      predDims: [2, 2, 2],
    };
    const checks = await runTrustLayer(null, null, parsedVolumes);
    const labelCheck = checks.find((c) => c.id === 'pred_labels_valid');
    assert.equal(labelCheck.status, 'pass');
  });

  test('rejects deprecated label 3 or non-BraTS label values in prediction', async () => {
    // Label 3 is deprecated in BraTS 2021
    const invalidVol = new Uint8Array([0, 1, 2, 3, 4]);
    const parsedVolumes = {
      predVolume: invalidVol,
      predDims: [5, 1, 1],
    };
    const checks = await runTrustLayer(null, null, parsedVolumes);
    const labelCheck = checks.find((c) => c.id === 'pred_labels_valid');
    assert.equal(labelCheck.status, 'fail');
    assert.match(labelCheck.message, /unexpected label values/i);
  });

  test('validates backend response integrity and flags missing or negative volumes', async () => {
    // Valid backend response
    const validResponse = {
      patient_id: 'TEST_001',
      volumes_ml: {
        whole_tumor: 42.0,
        tumor_core: 18.0,
        enhancing_tumor: 9.0,
      },
    };
    const checksValid = await runTrustLayer(null, validResponse, null);
    const backendCheckValid = checksValid.find((c) => c.id === 'backend_response_valid');
    assert.equal(backendCheckValid.status, 'pass');

    // Missing required field
    const incompleteResponse = {
      patient_id: 'TEST_002',
      volumes_ml: {
        whole_tumor: 42.0,
        // tumor_core missing
        enhancing_tumor: 9.0,
      },
    };
    const checksIncomplete = await runTrustLayer(null, incompleteResponse, null);
    const backendCheckIncomplete = checksIncomplete.find((c) => c.id === 'backend_response_valid');
    assert.equal(backendCheckIncomplete.status, 'fail');

    // Negative volume
    const negativeResponse = {
      patient_id: 'TEST_003',
      volumes_ml: {
        whole_tumor: -5.0,
        tumor_core: 18.0,
        enhancing_tumor: 9.0,
      },
    };
    const checksNegative = await runTrustLayer(null, negativeResponse, null);
    const backendCheckNegative = checksNegative.find((c) => c.id === 'backend_response_valid');
    assert.equal(backendCheckNegative.status, 'warn');

    // Untrained live model weights (model_weights_present: false)
    const untrainedLiveResponse = {
      patient_id: 'TEST_UNTRAINED',
      isLiveInference: true,
      model_weights_present: false,
      volumes_ml: {
        whole_tumor: 13.19,
        tumor_core: 9.27,
        enhancing_tumor: 5.49,
      },
    };
    const checksUntrained = await runTrustLayer(null, untrainedLiveResponse, null);
    const backendCheckUntrained = checksUntrained.find((c) => c.id === 'backend_response_valid');
    assert.equal(backendCheckUntrained.status, 'warn');
    assert.match(backendCheckUntrained.message, /UNTRAINED model weights/i);
  });

  test('reports evidence-based statusLabel and category on all checks', async () => {
    const checks = await runTrustLayer(null, null, null);
    const validStatuses = new Set(['Passed', 'Warning', 'Failed', 'Not checked', 'Not available']);
    const validCategories = new Set(['Input validation', 'Prediction validation', 'Expert-mask alignment']);

    for (const check of checks) {
      assert.ok(validStatuses.has(check.statusLabel), `check ${check.id} has invalid statusLabel: ${check.statusLabel}`);
      assert.ok(validCategories.has(check.category), `check ${check.id} has invalid category: ${check.category}`);
    }
  });

  test('flags expert mask checks as "Not checked" when expert segmentation is not provided', async () => {
    const parsedVolumes = {
      predVolume: new Uint8Array([0, 1, 2, 4]),
      predDims: [2, 2, 1],
      refVolume: null, // No expert provided
    };
    const checks = await runTrustLayer(null, null, parsedVolumes);

    const expertLabels = checks.find((c) => c.id === 'expert_labels_valid');
    assert.equal(expertLabels.status, 'not_checked');
    assert.equal(expertLabels.statusLabel, 'Not checked');

    const expertAlignment = checks.find((c) => c.id === 'pred_expert_alignment');
    assert.equal(expertAlignment.status, 'not_checked');
    assert.equal(expertAlignment.statusLabel, 'Not checked');
  });

  test('detects prediction-expert spatial alignment mismatch when grids differ', async () => {
    const parsedVolumes = {
      predVolume: new Uint8Array(8),
      predDims: [2, 2, 2],
      predPixDims: [1.0, 1.0, 1.0],
      refVolume: new Uint8Array(12),
      refDims: [3, 2, 2], // Dimension mismatch!
      refPixDims: [1.0, 1.0, 1.0],
    };
    const checks = await runTrustLayer(null, null, parsedVolumes);
    const alignmentCheck = checks.find((c) => c.id === 'pred_expert_alignment');
    assert.equal(alignmentCheck.status, 'fail');
    assert.equal(alignmentCheck.statusLabel, 'Failed');
    assert.match(alignmentCheck.detail, /Incompatible spatial dimensions/);
  });

  test('validates prediction-expert spatial alignment when grids and affines match', async () => {
    const affine = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
    const parsedVolumes = {
      predVolume: new Uint8Array([0, 1, 2, 4]),
      predDims: [2, 2, 1],
      predPixDims: [1.0, 1.0, 1.0],
      predAffine: affine,
      refVolume: new Uint8Array([0, 1, 2, 4]),
      refDims: [2, 2, 1],
      refPixDims: [1.0, 1.0, 1.0],
      refAffine: affine,
    };
    const checks = await runTrustLayer(null, null, parsedVolumes);
    const alignmentCheck = checks.find((c) => c.id === 'pred_expert_alignment');
    assert.equal(alignmentCheck.status, 'pass');
    assert.equal(alignmentCheck.statusLabel, 'Passed');
  });

  test('transparently documents unverified live backend inference status', async () => {
    const candidateResponse = {
      patient_id: 'CANDIDATE_CASE',
      isLiveInference: false, // Server offline / candidate prototype
      volumes_ml: { whole_tumor: 40.0, tumor_core: 20.0, enhancing_tumor: 10.0 },
    };
    const checks = await runTrustLayer(null, candidateResponse, null);
    const backendCheck = checks.find((c) => c.id === 'backend_response_valid');
    assert.equal(backendCheck.status, 'pass');
    assert.match(backendCheck.message, /live inference unverified/i);
    assert.match(backendCheck.detail, /candidate research data/i);
  });
});

describe('Benchmark: Infrastructure, Aggregation, & Export', () => {
  const identityAffine = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  test('runBenchmarkCase computes full metrics for synthetic case', async () => {
    const pred = new Uint8Array([4, 4, 0, 0]);
    const ref  = new Uint8Array([4, 4, 0, 0]);
    const dims = [4, 1, 1];

    const result = await runBenchmarkCase(pred, ref, dims, identityAffine, 'CASE_001', { isSynthetic: true });
    assert.equal(result.caseId, 'CASE_001');
    assert.equal(result.isSynthetic, true);
    assert.equal(result.metrics.ET.dice, 1.0);
    assert.equal(result.metrics.WT.dice, 1.0);
    assert.equal(result.hd95_mm.ET, 0);
  });

  test('aggregateBenchmark flags preliminary status when real cases < 10', async () => {
    // Create 3 synthetic and 2 real cases
    const cases = [
      {
        caseId: 'SYNTH_1',
        isSynthetic: true,
        metrics: {
          ET: { dice: 0.90, sensitivity: 0.88, precision: 0.92 },
          TC: { dice: 0.85, sensitivity: 0.82, precision: 0.89 },
          WT: { dice: 0.92, sensitivity: 0.90, precision: 0.95 },
        },
        hd95_mm: { ET: 2.1, TC: 3.4, WT: 2.0 },
      },
      {
        caseId: 'REAL_1',
        isSynthetic: false,
        metrics: {
          ET: { dice: 0.88, sensitivity: 0.85, precision: 0.90 },
          TC: { dice: 0.82, sensitivity: 0.80, precision: 0.85 },
          WT: { dice: 0.91, sensitivity: 0.89, precision: 0.93 },
        },
        hd95_mm: { ET: 2.5, TC: 3.8, WT: 2.2 },
      },
      {
        caseId: 'REAL_2',
        isSynthetic: false,
        metrics: {
          ET: { dice: 0.92, sensitivity: 0.90, precision: 0.94 },
          TC: { dice: 0.86, sensitivity: 0.84, precision: 0.88 },
          WT: { dice: 0.94, sensitivity: 0.92, precision: 0.96 },
        },
        hd95_mm: { ET: 1.8, TC: 3.0, WT: 1.6 },
      },
    ];

    const summary = aggregateBenchmark(cases);
    assert.equal(summary.realCaseCount, 2);
    assert.equal(summary.syntheticCaseCount, 1);
    assert.equal(summary.isPreliminary, true);
    assert.match(summary.note, /preliminary/i);
    assert.match(summary.note, /2 real cases/i);

    // Verify statistical aggregation
    const wtDice = summary.perRegion.WT.dice;
    assert.equal(wtDice.n, 3);
    assert.ok(wtDice.mean > 0.90 && wtDice.mean < 0.93);
    assert.ok(wtDice.min <= wtDice.max);
  });

  test('exportBenchmarkJSON produces valid schema with metadata', () => {
    const mockData = {
      summary: {
        caseCount: 1,
        realCaseCount: 1,
        syntheticCaseCount: 0,
        isPreliminary: true,
        note: 'PRELIMINARY',
        excludedCount: 0,
        excludedCases: [],
        perRegion: {},
      },
      cases: [],
    };
    const jsonStr = exportBenchmarkJSON(mockData);
    const parsed = JSON.parse(jsonStr);

    assert.equal(parsed.schema_version, '1.0');
    assert.equal(parsed.tool, 'NeuroVault');
    assert.ok(parsed.exported_at);
    assert.ok(parsed.scientific_note.includes('research prototype'));
  });

  test('validateCaseEligibility accepts eligible cases and rejects incomplete/training cases', () => {
    // Valid case
    const valid = {
      caseId: 'CASE_001',
      modalities: { t1: true, t1gd: true, t2: true, flair: true },
      expertSeg: true,
      trainingExposure: 'held_out',
    };
    assert.equal(validateCaseEligibility(valid).eligible, true);

    // Missing sequence (flair missing)
    const missingMod = {
      caseId: 'CASE_002',
      modalities: { t1: true, t1gd: true, t2: true },
      expertSeg: true,
    };
    const resMod = validateCaseEligibility(missingMod);
    assert.equal(resMod.eligible, false);
    assert.match(resMod.reason, /missing FLAIR/i);

    // Missing expert mask
    const missingExpert = {
      caseId: 'CASE_003',
      modalities: { t1: true, t1gd: true, t2: true, flair: true },
    };
    const resExp = validateCaseEligibility(missingExpert);
    assert.equal(resExp.eligible, false);
    assert.match(resExp.reason, /expert reference segmentation missing/i);

    // Training exposure (data leakage prevention)
    const trainingCase = {
      caseId: 'CASE_TRAIN',
      modalities: { t1: true, t1gd: true, t2: true, flair: true },
      expertSeg: true,
      trainingExposure: 'training',
    };
    const resTrain = validateCaseEligibility(trainingCase);
    assert.equal(resTrain.eligible, false);
    assert.match(resTrain.reason, /data leakage/i);
  });

  test('runBenchmarkCase rejects spatially misaligned volumes when predGeo and refGeo differ', async () => {
    const pred = new Uint8Array([4, 4, 0, 0]);
    const ref  = new Uint8Array([4, 4, 0, 0]);
    const dims = [4, 1, 1];

    const predGeo = { dims: [4, 1, 1], pixDims: [1, 1, 1], affine: identityAffine };
    const mismatchGeo = { dims: [4, 1, 2], pixDims: [1, 1, 1], affine: identityAffine };

    const res = await runBenchmarkCase(pred, ref, dims, identityAffine, 'MISALIGNED_CASE', {
      isSynthetic: true,
      predGeo,
      refGeo: mismatchGeo,
    });

    assert.equal(res.caseId, 'MISALIGNED_CASE');
    assert.equal(res.metrics, null);
    assert.ok(res.error);
    assert.match(res.error, /incompatible spatial dimensions/i);
  });

  test('runBenchmarkSuite executes manifest, tracks exclusions, and marks blocked status when model is untrained and real cases < 10', async () => {
    const manifest = [
      {
        caseId: 'CASE_VALID_SYNTH',
        isSynthetic: true,
        modalities: { t1: true, t1gd: true, t2: true, flair: true },
        expertSeg: true,
      },
      {
        caseId: 'CASE_INELIGIBLE_LEAKAGE',
        modalities: { t1: true, t1gd: true, t2: true, flair: true },
        expertSeg: true,
        trainingExposure: 'training',
      },
    ];

    const evaluateCaseFn = async (c) => ({
      predVolume: new Uint8Array([4, 4, 0, 0]),
      refVolume: new Uint8Array([4, 4, 0, 0]),
      dims: [4, 1, 1],
      affine: identityAffine,
      predGeo: { dims: [4, 1, 1], pixDims: [1, 1, 1] },
      refGeo: { dims: [4, 1, 1], pixDims: [1, 1, 1] },
    });

    const suiteResult = await runBenchmarkSuite(manifest, {
      modelReadiness: 'UNTRAINED_WEIGHTS_MISSING',
      evaluateCaseFn,
    });

    assert.equal(suiteResult.totalManifestCases, 2);
    assert.equal(suiteResult.eligibleCaseCount, 1);
    assert.equal(suiteResult.excludedCaseCount, 1);
    assert.equal(suiteResult.exclusions[0].caseId, 'CASE_INELIGIBLE_LEAKAGE');
    assert.match(suiteResult.exclusions[0].reason, /data leakage/i);
    assert.equal(suiteResult.benchmarkStatus, 'FRAMEWORK_READY_BUT_MODEL_AND_DATA_BLOCKED');
  });
});
