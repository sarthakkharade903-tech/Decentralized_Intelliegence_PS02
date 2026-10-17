import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateNiftiFile, predictSegmentation, validatePredictionResponse } from '../src/services/api.js';

describe('API Service: NIfTI File Validation', () => {
  test('accepts valid .nii file within 1 GiB limit', () => {
    const fakeFile = {
      name: 'BraTS2021_00001_t1.nii',
      size: 50 * 1024 * 1024 // 50 MiB
    };
    const result = validateNiftiFile(fakeFile);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  test('accepts valid compressed .nii.gz file within 1 GiB limit', () => {
    const fakeFile = {
      name: 'BraTS2021_00001_flair.nii.gz',
      size: 25 * 1024 * 1024 // 25 MiB
    };
    const result = validateNiftiFile(fakeFile);
    assert.equal(result.valid, true);
  });

  test('rejects non-NIfTI files (.dcm, .png, .txt)', () => {
    const dcmFile = { name: 'scan.dcm', size: 1024 };
    const pngFile = { name: 'mri.png', size: 1024 };
    const txtFile = { name: 'notes.txt', size: 1024 };

    assert.equal(validateNiftiFile(dcmFile).valid, false);
    assert.equal(validateNiftiFile(pngFile).valid, false);
    assert.equal(validateNiftiFile(txtFile).valid, false);
    assert.match(validateNiftiFile(dcmFile).error, /Must be \.nii or \.nii\.gz/);
  });

  test('rejects files exceeding 1 GiB guardrail', () => {
    const largeFile = {
      name: 'huge_volume.nii.gz',
      size: 1.2 * 1024 * 1024 * 1024 // 1.2 GiB
    };
    const result = validateNiftiFile(largeFile);
    assert.equal(result.valid, false);
    assert.match(result.error, /exceeds the 1 GiB size limit/);
  });

  test('rejects 0-byte empty files', () => {
    const emptyFile = {
      name: 'corrupt_empty.nii',
      size: 0
    };
    const result = validateNiftiFile(emptyFile);
    assert.equal(result.valid, false);
    assert.match(result.error, /is empty/);
  });
});

describe('API Service: Client-Side Pre-Flight Checks in predictSegmentation', () => {
  test('rejects if any of the 4 core sequences is missing', async () => {
    const t1 = { name: 't1.nii.gz', size: 1000 };
    const t1gd = { name: 't1gd.nii.gz', size: 1000 };
    const t2 = { name: 't2.nii.gz', size: 1000 };
    // flair is null

    await assert.rejects(
      async () => {
        await predictSegmentation({ t1, t1gd, t2, flair: null });
      },
      {
        name: 'Error',
        message: /Missing required sequence: FLAIR Edema/
      }
    );
  });

  test('rejects duplicate file assignment across slots', async () => {
    const sharedFile = { name: 'duplicate_scan.nii.gz', size: 5000000 };
    const otherFileA = { name: 't2_scan.nii.gz', size: 6000000 };
    const otherFileB = { name: 'flair_scan.nii.gz', size: 7000000 };

    await assert.rejects(
      async () => {
        await predictSegmentation({
          t1: sharedFile,
          t1gd: sharedFile, // duplicate!
          t2: otherFileA,
          flair: otherFileB
        });
      },
      {
        name: 'Error',
        message: /Duplicate file detected/
      }
    );
  });
});

describe('API Service: Response Validation (Prevent Malformed Outputs Mistaken for Success)', () => {
  test('accepts valid, complete segmentation response payload', () => {
    const validPayload = {
      status: 'success',
      patient_id: 'BraTS2021_00001',
      volumes_ml: {
        whole_tumor: 42.15,
        tumor_core: 18.30,
        enhancing_tumor: 9.45
      }
    };
    const check = validatePredictionResponse(validPayload);
    assert.equal(check.valid, true);
  });

  test('rejects empty or null response payloads', () => {
    assert.equal(validatePredictionResponse(null).valid, false);
    assert.equal(validatePredictionResponse(undefined).valid, false);
    assert.match(validatePredictionResponse(null).error, /empty or non-JSON/);
  });

  test('rejects response payload declaring error despite HTTP 200', () => {
    const errorPayload = {
      status: 'error',
      message: 'Inference OOM on GPU'
    };
    const check = validatePredictionResponse(errorPayload);
    assert.equal(check.valid, false);
    assert.match(check.error, /Inference OOM on GPU/);
  });

  test('rejects response payload missing volumes_ml quantification', () => {
    const missingVolumes = {
      status: 'success',
      patient_id: 'BraTS2021_00001'
      // missing volumes_ml
    };
    const check = validatePredictionResponse(missingVolumes);
    assert.equal(check.valid, false);
    assert.match(check.error, /missing required "volumes_ml"/);
  });

  test('rejects incomplete volumes_ml (missing WT, TC, or ET)', () => {
    const incompleteVolumes = {
      status: 'success',
      volumes_ml: {
        whole_tumor: 42.15
        // missing tumor_core and enhancing_tumor
      }
    };
    const check = validatePredictionResponse(incompleteVolumes);
    assert.equal(check.valid, false);
    assert.match(check.error, /incomplete volume metrics/);
  });
});

