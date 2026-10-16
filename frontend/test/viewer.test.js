import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  voxelToWorld,
  validateOverlayGeometry,
  createBraTSColormap
} from '../src/components/viewer/GeometryValidator.js';

describe('Viewer Geometry Validator: Affine Coordinate Transformation', () => {
  test('correctly transforms voxel index to world millimetres with isotropic identity affine', () => {
    // Identity 4x4 matrix with origin at [-120, -120, -78]
    const affine = [
      [1.0, 0.0, 0.0, -120.0],
      [0.0, 1.0, 0.0, -120.0],
      [0.0, 0.0, 1.0, -78.0],
      [0.0, 0.0, 0.0, 1.0]
    ];

    const voxel = [120, 120, 78];
    const world = voxelToWorld(affine, voxel);

    assert.equal(world[0], 0.0);
    assert.equal(world[1], 0.0);
    assert.equal(world[2], 0.0);
  });

  test('correctly applies anisotropic voxel spacing and orientation in affine transform', () => {
    // Anisotropic spacing: dx = 0.5mm, dy = 0.5mm, dz = 2.0mm, flipped Y axis
    const affine = [
      [0.5, 0.0, 0.0, 0.0],
      [0.0, -0.5, 0.0, 100.0],
      [0.0, 0.0, 2.0, -50.0],
      [0.0, 0.0, 0.0, 1.0]
    ];

    const voxel = [10, 20, 30];
    const world = voxelToWorld(affine, voxel);

    assert.equal(world[0], 5.0); // 10 * 0.5
    assert.equal(world[1], 90.0); // 100 - (20 * 0.5)
    assert.equal(world[2], 10.0); // -50 + (30 * 2.0)
  });

  test('falls back safely to raw voxel coordinates when affine is missing or invalid', () => {
    const voxel = [42, 84, 126];
    const worldA = voxelToWorld(null, voxel);
    const worldB = voxelToWorld([], voxel);

    assert.deepEqual(worldA, [42, 84, 126]);
    assert.deepEqual(worldB, [42, 84, 126]);
  });
});

describe('Viewer Geometry Validator: Overlay Geometry Validation', () => {
  test('accepts matching dimensions and voxel spacing within tolerance', () => {
    const baseVol = {
      dims: [3, 240, 240, 155],
      pixDims: [1, 1.0, 1.0, 1.0]
    };
    const maskVol = {
      dims: [3, 240, 240, 155],
      pixDims: [1, 1.0, 1.0, 1.0]
    };

    const result = validateOverlayGeometry(baseVol, maskVol);
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  test('accepts voxel spacing differences within 0.05mm numerical tolerance', () => {
    const baseVol = {
      dims: [3, 240, 240, 155],
      pixDims: [1, 1.0, 1.0, 1.0]
    };
    const maskVol = {
      dims: [3, 240, 240, 155],
      pixDims: [1, 1.02, 0.98, 1.01] // delta <= 0.02mm < 0.05mm
    };

    const result = validateOverlayGeometry(baseVol, maskVol);
    assert.equal(result.valid, true);
  });

  test('rejects grid dimension mismatch between MRI base and segmentation mask', () => {
    const baseVol = {
      dims: [3, 240, 240, 155],
      pixDims: [1, 1.0, 1.0, 1.0]
    };
    const mismatchedMask = {
      dims: [3, 128, 128, 64],
      pixDims: [1, 1.0, 1.0, 1.0]
    };

    const result = validateOverlayGeometry(baseVol, mismatchedMask);
    assert.equal(result.valid, false);
    assert.match(result.error, /Incompatible spatial dimensions/);
    assert.equal(result.details.baseDimensions.join(','), '240,240,155');
    assert.equal(result.details.maskDimensions.join(','), '128,128,64');
  });

  test('rejects voxel spacing mismatch exceeding 0.05mm tolerance', () => {
    const baseVol = {
      dims: [3, 240, 240, 155],
      pixDims: [1, 1.0, 1.0, 1.0]
    };
    const distortedMask = {
      dims: [3, 240, 240, 155],
      pixDims: [1, 1.0, 1.0, 1.5] // z-spacing 1.5 vs 1.0 exceeds tolerance!
    };

    const result = validateOverlayGeometry(baseVol, distortedMask);
    assert.equal(result.valid, false);
    assert.match(result.error, /Voxel spacing mismatch/);
  });

  test('rejects null or undefined volume inputs gracefully', () => {
    const validVol = { dims: [3, 240, 240, 155] };

    assert.equal(validateOverlayGeometry(null, validVol).valid, false);
    assert.equal(validateOverlayGeometry(validVol, null).valid, false);
    assert.match(validateOverlayGeometry(null, validVol).error, /Missing volume/);
  });
});

describe('Viewer Geometry Validator: BraTS 2021 Discrete Colormap', () => {
  test('generates valid discrete BraTS colormap with transparent background and vivid tissue colors', () => {
    const cmap = createBraTSColormap({ showNETC: true, showED: true, showET: true });

    assert.ok(Array.isArray(cmap.R));
    assert.ok(Array.isArray(cmap.G));
    assert.ok(Array.isArray(cmap.B));
    assert.ok(Array.isArray(cmap.A));
    assert.ok(Array.isArray(cmap.I));

    // Label 0: Background transparent
    assert.equal(cmap.I[0], 0);
    assert.equal(cmap.A[0], 0);

    // Label 1: NETC (Cyan)
    assert.equal(cmap.I[1], 1);
    assert.equal(cmap.R[1], 6);
    assert.equal(cmap.G[1], 182);
    assert.equal(cmap.B[1], 212);
    assert.equal(cmap.A[1], 255);

    // Label 2: ED (Yellow)
    assert.equal(cmap.I[2], 2);
    assert.equal(cmap.R[2], 234);
    assert.equal(cmap.G[2], 179);
    assert.equal(cmap.B[2], 8);
    assert.equal(cmap.A[2], 255);

    // Label 4: ET (Red)
    assert.equal(cmap.I[4], 4);
    assert.equal(cmap.R[4], 239);
    assert.equal(cmap.G[4], 68);
    assert.equal(cmap.B[4], 68);
    assert.equal(cmap.A[4], 255);
  });

  test('correctly toggles individual BraTS region visibility via alpha zeroing', () => {
    // Hide NETC (Label 1) and ET (Label 4), keep ED (Label 2) visible
    const cmap = createBraTSColormap({ showNETC: false, showED: true, showET: false });

    assert.equal(cmap.A[1], 0); // NETC hidden
    assert.equal(cmap.A[2], 255); // ED visible
    assert.equal(cmap.A[4], 0); // ET hidden
  });
});
