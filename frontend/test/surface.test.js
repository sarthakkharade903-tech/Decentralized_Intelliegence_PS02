import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAffine,
  computeLabelBounds,
  computeTumorCentroid,
  extractLabelSurface,
  parseNiftiVolume
} from '../src/components/viewer/SurfaceExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Surface Extractor: Affine Coordinate Transformation', () => {
  test('correctly maps voxel index to physical millimetre space with identity affine', () => {
    const affine = [
      [1, 0, 0, 10],
      [0, 1, 0, 20],
      [0, 0, 1, 30],
      [0, 0, 0, 1]
    ];
    const voxel = [5, 10, 15];
    const world = applyAffine(affine, voxel);

    assert.equal(world[0], 15);
    assert.equal(world[1], 30);
    assert.equal(world[2], 45);
  });

  test('correctly handles anisotropic scale and flipped axes', () => {
    const affine = [
      [-2.0, 0.0, 0.0, 100.0],
      [0.0, 1.5, 0.0, -50.0],
      [0.0, 0.0, 3.0, 0.0],
      [0.0, 0.0, 0.0, 1.0]
    ];
    const voxel = [10, 20, 30];
    const world = applyAffine(affine, voxel);

    assert.equal(world[0], 80.0); // 100 - (10 * 2.0)
    assert.equal(world[1], -20.0); // -50 + (20 * 1.5)
    assert.equal(world[2], 90.0); // 30 * 3.0
  });

  test('falls back safely to raw voxel coordinate if affine is missing or malformed', () => {
    assert.deepEqual(applyAffine(null, [1, 2, 3]), [1, 2, 3]);
    assert.deepEqual(applyAffine([], [4, 5, 6]), [4, 5, 6]);
    assert.deepEqual(applyAffine('invalid', [7, 8, 9]), [7, 8, 9]);
  });
});

describe('Surface Extractor: 3D Label Bounding Box & Voxel Counts', () => {
  test('correctly identifies tight bounding box and count for target label', () => {
    // 4x4x4 synthetic volume
    const dims = [4, 4, 4];
    const volume = new Uint8Array(4 * 4 * 4);

    // Set label 1 (NETC) at (1, 1, 1) and (2, 2, 2)
    // index = z * 16 + y * 4 + x
    volume[1 * 16 + 1 * 4 + 1] = 1;
    volume[2 * 16 + 2 * 4 + 2] = 1;

    // Set label 2 (ED) at (3, 3, 3)
    volume[3 * 16 + 3 * 4 + 3] = 2;

    const netcBounds = computeLabelBounds(volume, dims, new Set([1]));
    assert.equal(netcBounds.count, 2);
    assert.equal(netcBounds.minX, 1);
    assert.equal(netcBounds.maxX, 2);
    assert.equal(netcBounds.minY, 1);
    assert.equal(netcBounds.maxY, 2);
    assert.equal(netcBounds.minZ, 1);
    assert.equal(netcBounds.maxZ, 2);

    const edBounds = computeLabelBounds(volume, dims, new Set([2]));
    assert.equal(edBounds.count, 1);
    assert.equal(edBounds.minX, 3);
    assert.equal(edBounds.maxX, 3);
  });

  test('returns count 0 when queried label does not exist in volume', () => {
    const dims = [3, 3, 3];
    const volume = new Uint8Array(27); // all zeros

    const bounds = computeLabelBounds(volume, dims, new Set([4]));
    assert.equal(bounds.count, 0);
  });
});

describe('Surface Extractor: Tumor Centroid Calculation', () => {
  test('calculates accurate world centroid from active tumor voxels', () => {
    const dims = [10, 10, 10];
    const volume = new Uint8Array(1000);
    const affine = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    // Place active label 1 at (2, 4, 3) and (6, 8, 7)
    // minX=2, maxX=6 -> midX=4
    // minY=4, maxY=8 -> midY=6
    // minZ=3, maxZ=7 -> midZ=5
    volume[3 * 100 + 4 * 10 + 2] = 1;
    volume[7 * 100 + 8 * 10 + 6] = 1;

    const centroid = computeTumorCentroid({ volume, dims, affine });
    assert.equal(centroid[0], 4);
    assert.equal(centroid[1], 6);
    assert.equal(centroid[2], 5);
  });

  test('falls back to volume geometric center when 0 tumor voxels exist', () => {
    const dims = [20, 40, 60];
    const volume = new Uint8Array(20 * 40 * 60);
    const affine = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    const centroid = computeTumorCentroid({ volume, dims, affine });
    assert.equal(centroid[0], 10);
    assert.equal(centroid[1], 20);
    assert.equal(centroid[2], 30);
  });
});

describe('Surface Extractor: Marching Cubes Isosurface Generation', () => {
  test('returns null when target label count is 0', () => {
    const dims = [5, 5, 5];
    const volume = new Uint8Array(125);
    const affine = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    const geometry = extractLabelSurface({
      volume,
      dims,
      pixDims: [1, 1, 1],
      affine,
      targetLabels: [1]
    });

    assert.equal(geometry, null);
  });

  test('generates valid THREE.BufferGeometry with smooth normals from solid label region', () => {
    // Construct a 6x6x6 volume with a 2x2x2 cube of label 1 in center
    const dims = [6, 6, 6];
    const volume = new Uint8Array(6 * 6 * 6);
    const affine = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    for (let z = 2; z <= 3; z++) {
      for (let y = 2; y <= 3; y++) {
        for (let x = 2; x <= 3; x++) {
          volume[z * 36 + y * 6 + x] = 1;
        }
      }
    }

    const geometry = extractLabelSurface({
      volume,
      dims,
      pixDims: [1, 1, 1],
      affine,
      targetLabels: [1],
      centerOffset: [2.5, 2.5, 2.5]
    });

    assert.ok(geometry != null, 'Geometry should not be null');
    assert.ok(geometry.isBufferGeometry, 'Should be a THREE.BufferGeometry');

    const posAttr = geometry.getAttribute('position');
    assert.ok(posAttr != null, 'Position attribute must exist');
    assert.ok(posAttr.count > 0, 'Vertices count should be greater than 0');

    const normAttr = geometry.getAttribute('normal');
    assert.ok(normAttr != null, 'Normal attribute must exist for shading');
    assert.equal(normAttr.count, posAttr.count, 'Normal count must match vertex count');
  });
});

describe('Surface Extractor: Real Patient NIfTI Segmentation Artifact Integration', () => {
  const artifactPath = path.resolve(
    __dirname,
    '../../outputs/artifacts/TEST_PATIENT_001_20261016_191400_1617406f_seg.nii.gz'
  );

  test('correctly parses genuine compressed MONAI prediction artifact (.nii.gz)', () => {
    assert.ok(fs.existsSync(artifactPath), 'Backend prediction artifact must exist');

    const fileBuffer = fs.readFileSync(artifactPath);
    // Convert Node Buffer to ArrayBuffer
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );

    const parsed = parseNiftiVolume(arrayBuffer);

    assert.ok(parsed != null);
    assert.ok(parsed.volume instanceof Uint8Array || parsed.volume instanceof Int16Array);
    assert.equal(parsed.dims.length, 3);
    assert.equal(parsed.dims[0], 12);
    assert.equal(parsed.dims[1], 12);
    assert.equal(parsed.dims[2], 8);

    assert.ok(Array.isArray(parsed.affine));
    assert.equal(parsed.affine.length, 4);
  });

  test('extracts genuine 3D polygonal surfaces from real patient prediction artifact', () => {
    const fileBuffer = fs.readFileSync(artifactPath);
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );

    const { volume, dims, pixDims, affine } = parseNiftiVolume(arrayBuffer);

    // Compute bounds and counts on real patient artifact
    const netcBounds = computeLabelBounds(volume, dims, new Set([1]));
    const edBounds = computeLabelBounds(volume, dims, new Set([2]));
    const etBounds = computeLabelBounds(volume, dims, new Set([4]));

    assert.ok(netcBounds.count > 0, 'Real artifact must contain NETC voxels');
    assert.ok(edBounds.count > 0, 'Real artifact must contain ED voxels');
    assert.ok(etBounds.count > 0, 'Real artifact must contain ET voxels');

    const centroid = computeTumorCentroid({ volume, dims, affine });
    assert.ok(Number.isFinite(centroid[0]));
    assert.ok(Number.isFinite(centroid[1]));
    assert.ok(Number.isFinite(centroid[2]));

    // Extract NETC surface mesh
    const netcGeo = extractLabelSurface({
      volume,
      dims,
      pixDims,
      affine,
      targetLabels: [1],
      centerOffset: centroid
    });
    assert.ok(netcGeo != null, 'NETC geometry extracted from real artifact');
    assert.ok(netcGeo.getAttribute('position').count > 0, 'NETC has triangles');

    // Extract ED surface mesh
    const edGeo = extractLabelSurface({
      volume,
      dims,
      pixDims,
      affine,
      targetLabels: [2],
      centerOffset: centroid
    });
    assert.ok(edGeo != null, 'ED geometry extracted from real artifact');
    assert.ok(edGeo.getAttribute('position').count > 0, 'ED has triangles');
  });
});
