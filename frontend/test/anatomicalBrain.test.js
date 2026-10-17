import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ANATOMICAL_CATEGORIES,
  categorizeAnatomicalMesh,
  createAnatomicalTransformMatrix,
  computeAnatomicalSector,
  calculateTumorResectionIndices,
  formatTumorVolumetrics
} from '../src/components/viewer/AnatomicalBrainLoader.js';

describe('Anatomical Brain Loader: Categories and Mesh Classification', () => {
  test('contains all 10 core anatomical categories with valid visual properties', () => {
    const requiredCats = [
      'cortex',
      'deep_grey',
      'white_matter',
      'tracts',
      'ventricles',
      'cerebellum',
      'brainstem',
      'arteries',
      'veins_sinuses',
      'cranial_nerves'
    ];

    requiredCats.forEach((cat) => {
      assert.ok(ANATOMICAL_CATEGORIES[cat], `Missing category: ${cat}`);
      assert.ok(typeof ANATOMICAL_CATEGORIES[cat].color === 'number');
      assert.ok(typeof ANATOMICAL_CATEGORIES[cat].opacity === 'number');
      assert.ok(typeof ANATOMICAL_CATEGORIES[cat].label === 'string');
    });
  });

  test('correctly categorizes meshes by embedded bx_cat metadata', () => {
    const cortexMesh = { userData: { extras: { bx_cat: 'cortex' } } };
    assert.equal(categorizeAnatomicalMesh(cortexMesh), 'cortex');

    const ventricleMesh = { userData: { extras: { bx_cat: 'ventricles' } } };
    assert.equal(categorizeAnatomicalMesh(ventricleMesh), 'ventricles');

    const tractMesh = { userData: { extras: { bx_cat: 'tracts' } } };
    assert.equal(categorizeAnatomicalMesh(tractMesh), 'tracts');

    const arteryMesh = { userData: { extras: { bx_cat: 'arteries' } } };
    assert.equal(categorizeAnatomicalMesh(arteryMesh), 'arteries');
  });

  test('correctly falls back to name matching when extras are absent', () => {
    const gyrusMesh = { name: 'Superior frontal gyrus.l' };
    assert.equal(categorizeAnatomicalMesh(gyrusMesh), 'cortex');

    const veinMesh = { name: 'Superior sagittal sinus' };
    assert.equal(categorizeAnatomicalMesh(veinMesh), 'veins_sinuses');

    const thalamusMesh = { name: 'Anterior thalamic radiation.r' };
    assert.equal(categorizeAnatomicalMesh(thalamusMesh), 'tracts');

    const ponsMesh = { name: 'Pons' };
    assert.equal(categorizeAnatomicalMesh(ponsMesh), 'brainstem');
  });
});

describe('Anatomical Brain Loader: Coordinate Transform Matrix', () => {
  test('has determinant equal to +1.0 (pure SO(3) rotation without parity inversion)', () => {
    const matrix = createAnatomicalTransformMatrix(1);
    const elements = matrix.elements;

    // Construct 3x3 rotational submatrix
    const m00 = elements[0], m01 = elements[4], m02 = elements[8];
    const m10 = elements[1], m11 = elements[5], m12 = elements[9];
    const m20 = elements[2], m21 = elements[6], m22 = elements[10];

    const det =
      m00 * (m11 * m22 - m12 * m21) -
      m01 * (m10 * m22 - m12 * m20) +
      m02 * (m10 * m21 - m11 * m20);

    assert.equal(Math.round(det), 1, 'Determinant must be +1 for proper orientation');
  });

  test('correctly maps model coordinates (meters) to RAS+ physical millimeters', () => {
    const matrix = createAnatomicalTransformMatrix(1000);

    // Test Point: Patient Right (-0.05m), Superior (+1.65m), Anterior (+0.04m)
    const modelPoint = new THREE.Vector3(-0.05, 1.65, 0.04);
    modelPoint.applyMatrix4(matrix);

    // Expected RAS+ in mm:
    // X (Right): -1000 * (-0.05) = +50 mm
    // Y (Anterior): +1000 * (0.04) = +40 mm
    // Z (Superior): +1000 * (1.65) = +1650 mm
    assert.equal(Math.round(modelPoint.x), 50);
    assert.equal(Math.round(modelPoint.y), 40);
    assert.equal(Math.round(modelPoint.z), 1650);
  });
});

describe('Anatomical Brain Loader: Sector Localization', () => {
  test('identifies Right Frontal tumor centroid', () => {
    const sector = computeAnatomicalSector([35.0, 30.0, 20.0], [0, 0, 0]);
    assert.equal(sector.hemisphere, 'Right');
    assert.ok(sector.sectorLabel.includes('Right Frontal'));
  });

  test('identifies Left Temporo-occipital tumor centroid', () => {
    const sector = computeAnatomicalSector([-40.0, -25.0, -5.0], [0, 0, 0]);
    assert.equal(sector.hemisphere, 'Left');
    assert.ok(sector.sectorLabel.includes('Left Temporo-occipital'));
  });

  test('identifies Deep Midline Paraventricular lesion', () => {
    const sector = computeAnatomicalSector([1.0, 2.0, 5.0], [0, 0, 0]);
    assert.equal(sector.hemisphere, 'Midline');
    assert.equal(sector.depth, 'Deep Paraventricular');
  });
});

describe('Anatomical Brain Loader: Surgical Resection Indices & Volume Calculations', () => {
  test('calculates accurate infiltration ratio and active fraction', () => {
    // Case: WT = 42.15 mL, TC = 18.30 mL, ET = 9.45 mL, ED = 23.85 mL, NETC = 8.85 mL
    const indices = calculateTumorResectionIndices({
      wt: 42.15,
      tc: 18.30,
      et: 9.45,
      ed: 23.85,
      netc: 8.85
    });

    // Infiltration Index: ED / TC = 23.85 / 18.30 = 1.30
    assert.equal(indices.infiltrationRatio, 1.3);
    assert.ok(indices.infiltrationCategory.includes('Marked Infiltration'));

    // Active Fraction: ET / TC = (9.45 / 18.30) * 100 = 51.6%
    assert.equal(indices.activeFractionPercent, 51.6);
    assert.ok(indices.activeFractionCategory.includes('Moderate Angiogenesis'));
  });

  test('converts voxel count to physical volume in mL using spacing formula (AGENTS.md invariant)', () => {
    // 42,150 voxels at 1x1x1 mm spacing = 42.15 mL
    const result = formatTumorVolumetrics({
      metrics: {
        wtVoxels: 42150,
        tcVoxels: 18300,
        etVoxels: 9450,
        edVoxels: 23850,
        netcVoxels: 8850,
        dimensionsMm: [44.0, 36.0, 32.0],
        centroidMm: [28.4, 18.2, 14.6]
      },
      voxelSpacing: [1.0, 1.0, 1.0]
    });

    assert.equal(result.volumesMl.wt, 42.15);
    assert.equal(result.volumesMl.tc, 18.30);
    assert.equal(result.volumesMl.et, 9.45);
    assert.equal(result.volumesMl.ed, 23.85);
    assert.equal(result.volumesMl.netc, 8.85);
    assert.equal(result.ranoProductMm2, 1584.0); // 44.0 * 36.0
  });

  test('handles anisotropic voxel spacing correctly (e.g. 0.5 x 0.5 x 2.0 mm)', () => {
    // Voxel volume = 0.5 * 0.5 * 2.0 = 0.5 mm3
    // 10,000 voxels * 0.5 mm3 / 1000 = 5.0 mL
    const result = formatTumorVolumetrics({
      metrics: {
        wtVoxels: 10000,
        tcVoxels: 4000,
        etVoxels: 2000,
        edVoxels: 6000,
        netcVoxels: 2000,
        dimensionsMm: [20.0, 20.0, 25.0],
        centroidMm: [10.0, 10.0, 12.5]
      },
      voxelSpacing: [0.5, 0.5, 2.0]
    });

    assert.equal(result.volumesMl.wt, 5.0);
    assert.equal(result.volumesMl.tc, 2.0);
    assert.equal(result.volumesMl.et, 1.0);
    assert.equal(result.volumesMl.ed, 3.0);
    assert.equal(result.volumesMl.netc, 1.0);
  });
});
