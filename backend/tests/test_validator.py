"""Unit tests for NIfTI sequence ingestion and validation engine.

Tests all clinical and engineering invariants:
- Four sequences present (t1, t1gd, t2, flair)
- 1 GiB file-size guard without allocating 1 GiB on disk
- Readable 3D NIfTI format & corrupted file rejection
- In-memory stream support (.nii and .nii.gz compressed)
- FastAPI / Starlette UploadFile compatibility
- Matching spatial dimensions (H x W x D)
- Affine coordinate registration & voxel spacing tolerance
- Rejection of non-finite voxels (NaN, Inf)
- Rejection of blank / zero-intensity scans
- Correct extraction of geometry metadata
"""

import gzip
import io
import tempfile
from typing import Dict
from unittest.mock import MagicMock

import nibabel as nib
import numpy as np
import pytest
from fastapi import UploadFile

from backend.app.exceptions import (
    CorruptedNiftiException,
    DuplicateSequenceAssignmentException,
    EmptyScanException,
    FileSizeExceededException,
    IncompatibleAffineException,
    IncompatibleDimensionsException,
    NonfiniteVoxelsException,
    UnsupportedFileExtensionException,
    ValidationException,
)
from backend.app.services.validator import (
    MAX_FILE_BYTES,
    OriginalGeometry,
    check_file_size,
    extract_geometry,
    validate_mpmri_sequences,
)


# ─── Fixtures & Helpers ───────────────────────────────────────────────────────

def create_synthetic_nifti(
    shape=(16, 16, 10),
    spacing=(1.0, 1.0, 1.0),
    fill_value=None,
    noise=True,
    orientation_signs=(1, 1, 1),
) -> nib.Nifti1Image:
    """Creates a lightweight in-memory NIfTI image for testing."""
    affine = np.diag([
        orientation_signs[0] * spacing[0],
        orientation_signs[1] * spacing[1],
        orientation_signs[2] * spacing[2],
        1.0,
    ])

    if fill_value is not None:
        data = np.full(shape, fill_value, dtype=np.float32)
    elif noise:
        # Realistic non-zero MRI brain voxel distribution
        rng = np.random.default_rng(seed=42)
        data = rng.uniform(10.0, 500.0, size=shape).astype(np.float32)
    else:
        data = np.zeros(shape, dtype=np.float32)

    return nib.Nifti1Image(data, affine)


def create_valid_sequence_set(
    shape=(16, 16, 10),
    spacing=(1.0, 1.0, 1.0),
) -> Dict[str, nib.Nifti1Image]:
    """Returns a valid 4-sequence set (t1, t1gd, t2, flair) with identical geometry and distinct contents."""
    # Ensure distinct non-blank voxel data across sequence modalities
    rng1 = np.random.default_rng(seed=101)
    rng2 = np.random.default_rng(seed=102)
    rng3 = np.random.default_rng(seed=103)
    rng4 = np.random.default_rng(seed=104)

    affine = np.diag([spacing[0], spacing[1], spacing[2], 1.0])

    return {
        "t1": nib.Nifti1Image(rng1.uniform(20.0, 300.0, size=shape).astype(np.float32), affine),
        "t1gd": nib.Nifti1Image(rng2.uniform(30.0, 400.0, size=shape).astype(np.float32), affine),
        "t2": nib.Nifti1Image(rng3.uniform(40.0, 500.0, size=shape).astype(np.float32), affine),
        "flair": nib.Nifti1Image(rng4.uniform(50.0, 600.0, size=shape).astype(np.float32), affine),
    }


def nifti_to_gzipped_bytes(img: nib.Nifti1Image) -> bytes:
    """Serializes a NIfTI image to compressed .nii.gz bytes."""
    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tf:
        nib.save(img, tf.name)
        with open(tf.name, "rb") as f:
            return f.read()


# ─── Test Cases ───────────────────────────────────────────────────────────────

def test_valid_four_sequences():
    """Verify that 4 valid, co-registered NIfTI scans pass validation and return geometry."""
    sequences = create_valid_sequence_set(shape=(20, 20, 12), spacing=(1.0, 1.0, 1.5))
    result = validate_mpmri_sequences(sequences)

    assert result.is_valid is True
    assert result.geometry.dimensions == [20, 20, 12]
    assert result.geometry.voxel_spacing_mm == [1.0, 1.0, 1.5]
    assert result.geometry.orientation == "RAS"
    assert "t1" in result.sequences
    assert "t1gd" in result.sequences
    assert "t2" in result.sequences
    assert "flair" in result.sequences


def test_valid_compressed_gzipped_streams():
    """Verify that in-memory .nii.gz compressed streams pass validation seamlessly."""
    raw_seqs = create_valid_sequence_set(shape=(12, 12, 8))
    # Convert all 4 to gzipped BytesIO streams
    stream_seqs = {
        k: io.BytesIO(nifti_to_gzipped_bytes(img))
        for k, img in raw_seqs.items()
    }
    result = validate_mpmri_sequences(stream_seqs)

    assert result.is_valid is True
    assert result.geometry.dimensions == [12, 12, 8]


def test_fastapi_uploadfile_compatibility():
    """Verify that FastAPI UploadFile instances are supported directly."""
    raw_seqs = create_valid_sequence_set(shape=(12, 12, 8))
    upload_files = {
        k: UploadFile(file=io.BytesIO(nifti_to_gzipped_bytes(img)), filename=f"{k}.nii.gz")
        for k, img in raw_seqs.items()
    }
    result = validate_mpmri_sequences(upload_files)

    assert result.is_valid is True
    assert result.geometry.dimensions == [12, 12, 8]


def test_missing_sequence_rejected():
    """Verify that omission of any of the 4 required sequences raises MISSING_SEQUENCE."""
    sequences = create_valid_sequence_set()
    del sequences["flair"]

    with pytest.raises(ValidationException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "MISSING_SEQUENCE"
    assert "flair" in exc_info.value.detail["missing_sequences"]


def test_mismatched_dimensions_rejected():
    """Verify that differing grid dimensions across sequences raise INCOMPATIBLE_SPATIAL_DIMENSIONS."""
    sequences = create_valid_sequence_set(shape=(16, 16, 10))
    # Modify T2 to have different axial slice count
    sequences["t2"] = create_synthetic_nifti(shape=(16, 16, 12))

    with pytest.raises(IncompatibleDimensionsException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_DIMENSIONS"
    assert "t2_shape" in exc_info.value.detail
    assert exc_info.value.detail["t2_shape"] == [16, 16, 12]
    assert exc_info.value.detail["t1_shape"] == [16, 16, 10]


def test_non_3d_volume_rejected():
    """Verify that a 4D image is rejected with an actionable 3D requirement error."""
    sequences = create_valid_sequence_set()
    # Create 4D array (e.g. fMRI or time series)
    data_4d = np.ones((16, 16, 10, 2), dtype=np.float32)
    sequences["flair"] = nib.Nifti1Image(data_4d, np.eye(4))

    with pytest.raises(IncompatibleDimensionsException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_DIMENSIONS"
    assert exc_info.value.detail["expected_dimensions"] == 3


def test_corrupted_nifti_rejected():
    """Verify that unparseable or corrupted bytes raise CORRUPTED_NIFTI_FILE."""
    sequences = create_valid_sequence_set()
    # Pass random uncompressed binary bytes
    junk_stream = io.BytesIO(b"NOT_A_NIFTI_HEADER_DATA_1234567890")
    sequences["t1"] = junk_stream

    with pytest.raises(CorruptedNiftiException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "CORRUPTED_NIFTI_FILE"
    assert exc_info.value.detail["filename"] == "t1"


def test_oversized_file_rejected_without_allocating_1gb():
    """Verify that 1 GiB guard triggers without physically allocating 1 GiB on disk."""
    # Use a mock object with size > MAX_FILE_BYTES
    mock_file = MagicMock()
    mock_file.size = MAX_FILE_BYTES + 1024  # 1 GiB + 1 KB

    with pytest.raises(FileSizeExceededException) as exc_info:
        check_file_size(mock_file, filename="oversized_scan.nii.gz")

    assert exc_info.value.error == "FILE_SIZE_EXCEEDED"
    assert exc_info.value.status_code == 413
    assert exc_info.value.detail["size_bytes"] == MAX_FILE_BYTES + 1024


def test_nonfinite_nan_voxels_rejected():
    """Verify that NaN voxel values in any sequence raise NONFINITE_VOXEL_VALUES."""
    sequences = create_valid_sequence_set()
    data = sequences["t1gd"].get_fdata(dtype=np.float32).copy()
    data[5, 5, 5] = np.nan
    sequences["t1gd"] = nib.Nifti1Image(data, sequences["t1gd"].affine)

    with pytest.raises(NonfiniteVoxelsException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "NONFINITE_VOXEL_VALUES"
    assert exc_info.value.detail["sequence"] == "t1gd"
    assert exc_info.value.detail["nan_count"] == 1


def test_nonfinite_inf_voxels_rejected():
    """Verify that Inf voxel values in any sequence raise NONFINITE_VOXEL_VALUES."""
    sequences = create_valid_sequence_set()
    data = sequences["flair"].get_fdata(dtype=np.float32).copy()
    data[2, 3, 4] = np.inf
    sequences["flair"] = nib.Nifti1Image(data, sequences["flair"].affine)

    with pytest.raises(NonfiniteVoxelsException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "NONFINITE_VOXEL_VALUES"
    assert exc_info.value.detail["sequence"] == "flair"
    assert exc_info.value.detail["inf_count"] == 1


def test_blank_empty_scan_rejected():
    """Verify that all-zero or constant scans raise EMPTY_SCAN_DATA."""
    sequences = create_valid_sequence_set()
    # Create all-zero FLAIR
    sequences["flair"] = create_synthetic_nifti(fill_value=0.0)

    with pytest.raises(EmptyScanException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "EMPTY_SCAN_DATA"
    assert exc_info.value.detail["sequence"] == "flair"


def test_constant_intensity_scan_rejected():
    """Verify that flat/constant non-zero scans (zero variance) raise EMPTY_SCAN_DATA."""
    sequences = create_valid_sequence_set()
    sequences["t1"] = create_synthetic_nifti(fill_value=42.0)

    with pytest.raises(EmptyScanException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "EMPTY_SCAN_DATA"
    assert exc_info.value.detail["sequence"] == "t1"


def test_affine_spacing_mismatch_rejected():
    """Verify that divergent voxel spacing across sequences raises INCOMPATIBLE_SPATIAL_AFFINE."""
    sequences = create_valid_sequence_set(spacing=(1.0, 1.0, 1.0))
    # T2 has 2.0mm slice thickness instead of 1.0mm
    sequences["t2"] = create_synthetic_nifti(spacing=(1.0, 1.0, 2.0))

    with pytest.raises(IncompatibleAffineException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_AFFINE"
    assert "t2_spacing" in exc_info.value.detail


def test_affine_orientation_mismatch_rejected():
    """Verify that differing spatial orientation axes raise INCOMPATIBLE_SPATIAL_AFFINE."""
    sequences = create_valid_sequence_set()
    # T1 in RAS, FLAIR with flipped X axis (LPS-style)
    sequences["flair"] = create_synthetic_nifti(orientation_signs=(-1, -1, 1))

    with pytest.raises(IncompatibleAffineException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_AFFINE"
    assert exc_info.value.detail["target"] == "flair"


def test_geometry_extraction_accuracy():
    """Verify that extract_geometry correctly calculates spacing, dimensions, and orientation."""
    img = create_synthetic_nifti(
        shape=(32, 28, 16),
        spacing=(0.9375, 0.9375, 3.0),
        orientation_signs=(1, 1, 1),
    )
    geom: OriginalGeometry = extract_geometry(img)

    assert geom.dimensions == [32, 28, 16]
    assert geom.voxel_spacing_mm == [0.9375, 0.9375, 3.0]
    assert geom.orientation == "RAS"
    assert geom.to_dict() == {
        "dimensions": [32, 28, 16],
        "voxel_spacing_mm": [0.9375, 0.9375, 3.0],
        "orientation": "RAS",
    }


def test_2d_volume_strictly_rejected():
    """Verify that 2D scans are rejected with an explicit 3D requirement error."""
    sequences = create_valid_sequence_set(shape=(16, 16, 10))
    # Replace T1 with 2D image
    data_2d = np.random.uniform(10.0, 50.0, size=(16, 16)).astype(np.float32)
    sequences["t1"] = nib.Nifti1Image(data_2d, np.eye(4))

    with pytest.raises(IncompatibleDimensionsException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_DIMENSIONS"
    assert exc_info.value.detail["expected_dimensions"] == 3
    assert exc_info.value.detail["dimensions_count"] == 2


def test_4d_volume_strictly_rejected_without_squeezing():
    """Verify that 4D multi-channel scans (H, W, D, 4) are rejected without silent squeezing."""
    sequences = create_valid_sequence_set(shape=(16, 16, 10))
    data_4d = np.ones((16, 16, 10, 4), dtype=np.float32) * 50.0
    sequences["t1"] = nib.Nifti1Image(data_4d, np.eye(4))

    with pytest.raises(IncompatibleDimensionsException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_DIMENSIONS"
    assert exc_info.value.detail["expected_dimensions"] == 3
    assert exc_info.value.detail["dimensions_count"] == 4


def test_4d_trailing_singleton_strictly_rejected():
    """Verify that 4D scans with trailing singleton (H, W, D, 1) are rejected without silent squeezing."""
    sequences = create_valid_sequence_set(shape=(16, 16, 10))
    flair_data = np.asanyarray(sequences["flair"].dataobj)[..., np.newaxis]
    sequences["flair"] = nib.Nifti1Image(flair_data, sequences["flair"].affine)

    with pytest.raises(IncompatibleDimensionsException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_DIMENSIONS"
    assert exc_info.value.detail["dimensions_count"] == 4


def test_nonfinite_affine_matrix_rejected():
    """Verify that affine matrix containing NaN or Inf is rejected."""
    sequences = create_valid_sequence_set(shape=(16, 16, 10))
    bad_affine = np.eye(4)
    bad_affine[0, 3] = np.nan
    sequences["t2"] = nib.Nifti1Image(sequences["t2"].get_fdata(), bad_affine)

    with pytest.raises(IncompatibleAffineException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_AFFINE"
    assert "non-finite values" in exc_info.value.message


def test_degenerate_singular_affine_rejected():
    """Verify that a singular/degenerate affine matrix (det ~ 0) is rejected."""
    sequences = create_valid_sequence_set(shape=(16, 16, 10))
    degenerate_affine = np.array([
        [1.0, 0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0, 0.0],  # Duplicate row -> determinant is 0
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ], dtype=np.float32)
    sequences["flair"]._affine = degenerate_affine

    with pytest.raises(IncompatibleAffineException) as exc_info:
        validate_mpmri_sequences(sequences)

    assert exc_info.value.error == "INCOMPATIBLE_SPATIAL_AFFINE"
    assert "singular or degenerate" in exc_info.value.message


def test_duplicate_sequence_assignment_rejected():
    """Verify that identical files assigned to multiple sequence slots are rejected."""
    raw_seqs = create_valid_sequence_set(shape=(12, 12, 8))
    shared_bytes = nifti_to_gzipped_bytes(raw_seqs["t1"])
    other_bytes = nifti_to_gzipped_bytes(raw_seqs["t2"])

    upload_files = {
        "t1": UploadFile(file=io.BytesIO(shared_bytes), filename="scan_t1.nii.gz"),
        "t1gd": UploadFile(file=io.BytesIO(shared_bytes), filename="scan_t1.nii.gz"),  # Duplicate!
        "t2": UploadFile(file=io.BytesIO(other_bytes), filename="scan_t2.nii.gz"),
        "flair": UploadFile(file=io.BytesIO(other_bytes), filename="scan_flair.nii.gz"),  # Duplicate!
    }

    with pytest.raises(DuplicateSequenceAssignmentException) as exc_info:
        validate_mpmri_sequences(upload_files)

    assert exc_info.value.error == "DUPLICATE_SEQUENCE_ASSIGNMENT"


def test_unsupported_file_extension_rejected():
    """Verify that files with unsupported extensions (.dcm, .txt) are rejected."""
    raw_seqs = create_valid_sequence_set(shape=(12, 12, 8))
    upload_files = {
        "t1": UploadFile(file=io.BytesIO(nifti_to_gzipped_bytes(raw_seqs["t1"])), filename="scan.dcm"),
        "t1gd": UploadFile(file=io.BytesIO(nifti_to_gzipped_bytes(raw_seqs["t1gd"])), filename="t1gd.nii.gz"),
        "t2": UploadFile(file=io.BytesIO(nifti_to_gzipped_bytes(raw_seqs["t2"])), filename="t2.nii.gz"),
        "flair": UploadFile(file=io.BytesIO(nifti_to_gzipped_bytes(raw_seqs["flair"])), filename="flair.nii.gz"),
    }

    with pytest.raises(UnsupportedFileExtensionException) as exc_info:
        validate_mpmri_sequences(upload_files)

    assert exc_info.value.error == "UNSUPPORTED_FILE_EXTENSION"
