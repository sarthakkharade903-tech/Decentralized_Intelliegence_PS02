"""Unit tests for tumour volumetric calculations and clinical region decomposition."""

import numpy as np
import pytest

from backend.app.services.volumetrics import (
    compute_tumor_volumetrics,
    compute_voxel_volume_mm3,
)


def test_voxel_volume_computation_isotropic():
    """Verify voxel volume calculation for 1.0mm isotropic grid."""
    vol = compute_voxel_volume_mm3([1.0, 1.0, 1.0])
    assert vol == 1.0


def test_voxel_volume_computation_anisotropic():
    """Verify voxel volume calculation for anisotropic grid (0.5 x 0.5 x 2.0 = 0.5 mm³)."""
    vol = compute_voxel_volume_mm3([0.5, 0.5, 2.0])
    assert vol == 0.5


def test_voxel_volume_from_affine_matrix():
    """Verify voxel volume calculation from full 4x4 affine transform."""
    affine = np.diag([2.0, 2.0, 3.0, 1.0])
    vol = compute_voxel_volume_mm3(affine)
    assert vol == 12.0


def test_invalid_spacing_rejected():
    """Verify that non-positive spacing raises ValueError."""
    with pytest.raises(ValueError):
        compute_voxel_volume_mm3([1.0, -1.0, 1.0])
    with pytest.raises(ValueError):
        compute_voxel_volume_mm3([0.0, 1.0, 1.0])


def test_exact_physical_volume_and_region_decomposition():
    """Verify that clinical BraTS regions are correctly decomposed and volume in mL is exact.

    Setup:
      - 100 voxels of Label 1 (NETC)
      - 200 voxels of Label 2 (ED)
      - 300 voxels of Label 4 (ET)
      - Remainder Label 0 (Background)
      - Voxel Spacing: [1.0, 1.0, 1.0] mm -> 1 voxel = 0.001 mL
    """
    mask = np.zeros((20, 20, 20), dtype=np.uint8)
    mask[0:10, 0:10, 0:1] = 1   # 100 voxels of NETC
    mask[0:10, 0:10, 1:3] = 2   # 200 voxels of ED
    mask[0:10, 0:10, 3:6] = 4   # 300 voxels of ET

    report = compute_tumor_volumetrics(mask, voxel_spacing_mm=[1.0, 1.0, 1.0])

    # Check exact voxel counts
    assert report.voxel_counts.netc_voxels == 100
    assert report.voxel_counts.ed_voxels == 200
    assert report.voxel_counts.et_voxels == 300
    assert report.voxel_counts.tc_voxels == 400   # NETC (100) + ET (300)
    assert report.voxel_counts.wt_voxels == 600   # NETC (100) + ED (200) + ET (300)

    # Check exact physical volumes in mL
    # 600 * 1.0 / 1000 = 0.60 mL
    assert report.volumes_ml.whole_tumor == 0.60
    # 400 * 1.0 / 1000 = 0.40 mL
    assert report.volumes_ml.tumor_core == 0.40
    # 300 * 1.0 / 1000 = 0.30 mL
    assert report.volumes_ml.enhancing_tumor == 0.30
    # 200 * 1.0 / 1000 = 0.20 mL
    assert report.volumes_ml.edema == 0.20
    # 100 * 1.0 / 1000 = 0.10 mL
    assert report.volumes_ml.necrotic_core == 0.10


def test_zero_tumor_all_background():
    """Verify that an all-zero mask produces 0.0 mL for all tumor compartments."""
    mask = np.zeros((10, 10, 10), dtype=np.uint8)
    report = compute_tumor_volumetrics(mask, voxel_spacing_mm=[1.0, 1.0, 1.0])

    assert report.volumes_ml.whole_tumor == 0.0
    assert report.volumes_ml.tumor_core == 0.0
    assert report.volumes_ml.enhancing_tumor == 0.0
    assert report.voxel_counts.total_lesion_voxels == 0


def test_invalid_mask_dimensions_rejected():
    """Verify that non-3D masks raise ValueError."""
    mask_2d = np.zeros((10, 10), dtype=np.uint8)
    with pytest.raises(ValueError):
        compute_tumor_volumetrics(mask_2d, voxel_spacing_mm=[1.0, 1.0, 1.0])
