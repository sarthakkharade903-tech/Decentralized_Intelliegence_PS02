"""
Tests for scripts/inspect_and_split_mri.py
Validates dataset accessibility, metadata parsing, macOS file filtering,
and synthetic 4D to 3D modality de-stacking without requiring the 7GB external dataset.
"""

import json
from pathlib import Path
import nibabel as nib
import numpy as np
import pytest

from scripts.inspect_and_split_mri import (
    DEFAULT_MODALITY_MAP,
    check_dataset_accessibility,
    list_valid_nifti_files,
    load_dataset_metadata,
    inspect_mri_volume,
    split_4d_volume_to_3d_modalities,
)


@pytest.fixture
def synthetic_4d_case(tmp_path: Path):
    """Creates a temporary synthetic 4D NIfTI file with known channel values."""
    shape = (20, 20, 12, 4)
    # Distinct mean per channel for verification
    data = np.zeros(shape, dtype=np.float32)
    data[:, :, :, 0] = 10.0  # FLAIR
    data[:, :, :, 1] = 20.0  # T1
    data[:, :, :, 2] = 30.0  # T1Gd
    data[:, :, :, 3] = 40.0  # T2

    affine = np.diag([1.0, 1.0, 1.0, 1.0])
    img = nib.Nifti1Image(data, affine)
    img.header.set_zooms((1.0, 1.0, 1.0, 1.0))

    file_path = tmp_path / "SYNTH_001.nii.gz"
    nib.save(img, str(file_path))
    return file_path


def test_dataset_accessibility_nonexistent():
    ok, err = check_dataset_accessibility(Path("Z:/NonExistent/USB_Drive"))
    assert not ok
    assert "not found" in err.lower()


def test_dataset_accessibility_valid(tmp_path: Path):
    ok, err = check_dataset_accessibility(tmp_path)
    assert ok
    assert err is None


def test_list_valid_nifti_files_filters_macos_metadata(tmp_path: Path):
    # Create valid files and macOS metadata files
    (tmp_path / "BRATS_001.nii.gz").touch()
    (tmp_path / "BRATS_002.nii").touch()
    (tmp_path / "._BRATS_001.nii.gz").touch()
    (tmp_path / "notes.txt").touch()

    files = list_valid_nifti_files(tmp_path)
    file_names = [f.name for f in files]

    assert "BRATS_001.nii.gz" in file_names
    assert "BRATS_002.nii" in file_names
    assert "._BRATS_001.nii.gz" not in file_names
    assert "notes.txt" not in file_names


def test_split_4d_volume_to_3d(synthetic_4d_case: Path, tmp_path: Path):
    out_dir = tmp_path / "extracted"

    result = split_4d_volume_to_3d_modalities(
        input_path=synthetic_4d_case,
        output_dir=out_dir,
        modality_map=DEFAULT_MODALITY_MAP,
        case_id="SYNTH_001",
    )

    assert set(result.keys()) == {"flair", "t1", "t1gd", "t2"}

    # Verify each extracted 3D volume
    expected_means = {"flair": 10.0, "t1": 20.0, "t1gd": 30.0, "t2": 40.0}

    for mod, file_path in result.items():
        assert file_path.exists()
        loaded = nib.load(str(file_path))
        # Ensure 3D shape
        assert len(loaded.shape) == 3
        assert loaded.shape == (20, 20, 12)
        # Ensure correct channel data was extracted
        data = loaded.get_fdata()
        assert np.isclose(np.mean(data), expected_means[mod])
        # Ensure 3D voxel spacing
        assert loaded.header.get_zooms() == (1.0, 1.0, 1.0)


def test_split_rejects_3d_input(tmp_path: Path):
    # 3D volume should be rejected
    data = np.zeros((10, 10, 10), dtype=np.float32)
    img = nib.Nifti1Image(data, np.eye(4))
    file_path = tmp_path / "ALREADY_3D.nii.gz"
    nib.save(img, str(file_path))

    with pytest.raises(ValueError, match="Expected a 4D NIfTI volume"):
        split_4d_volume_to_3d_modalities(file_path, tmp_path / "out")
