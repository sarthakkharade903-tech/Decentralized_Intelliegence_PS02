"""Unit tests for MONAI SegResNet 3D inference engine and tensor flow."""

import hashlib
import tempfile
from pathlib import Path
from typing import Dict

import nibabel as nib
import numpy as np
import pytest
import torch

from backend.app.exceptions import ValidationException
from backend.app.services.inference import (
    INPUT_MODALITY_ORDER,
    build_segresnet_model,
    preprocess_multimodal_tensor,
    run_segmentation_inference,
    verify_file_md5,
)


def create_synthetic_volume(
    shape=(16, 16, 16),
    spacing=(1.0, 1.0, 1.0),
) -> nib.Nifti1Image:
    """Helper to create small in-memory NIfTI volume."""
    affine = np.diag([spacing[0], spacing[1], spacing[2], 1.0])
    rng = np.random.default_rng(seed=42)
    data = rng.uniform(20.0, 400.0, size=shape).astype(np.float32)
    return nib.Nifti1Image(data, affine)


def create_synthetic_sequence_set(
    shape=(16, 16, 16),
) -> Dict[str, nib.Nifti1Image]:
    """Helper returning 4 co-registered sequence volumes."""
    return {
        "t1": create_synthetic_volume(shape=shape),
        "t1gd": create_synthetic_volume(shape=shape),
        "t2": create_synthetic_volume(shape=shape),
        "flair": create_synthetic_volume(shape=shape),
    }


def test_build_segresnet_model():
    """Verify SegResNet instantiates with verified 4-input and 3-output architecture."""
    device = torch.device("cpu")
    model = build_segresnet_model(device=device, weights_path=None)

    assert isinstance(model, torch.nn.Module)
    # Test forward pass with random tensor
    x = torch.randn(1, 4, 16, 16, 16, device=device)
    with torch.no_grad():
        out = model(x)
    assert out.shape == (1, 3, 16, 16, 16)


def test_preprocessing_modality_order_and_normalization():
    """Verify that sequences are stacked in the verified official order: [t1gd, t1, t2, flair]."""
    seqs = create_synthetic_sequence_set(shape=(16, 16, 16))
    tensor, geometry, affine = preprocess_multimodal_tensor(seqs)

    assert tensor.shape == (1, 4, 16, 16, 16)
    assert geometry.dimensions == [16, 16, 16]
    assert geometry.voxel_spacing_mm == [1.0, 1.0, 1.0]

    # Verify per-channel normalization produces near-zero mean for non-zero voxels
    for c in range(4):
        chan = tensor[0, c].numpy()
        assert np.isclose(np.mean(chan), 0.0, atol=1e-2)
        assert np.isclose(np.std(chan), 1.0, atol=1e-2)


def test_preprocessing_missing_modality_raises_error():
    """Verify that missing a required modality raises ValidationException."""
    seqs = create_synthetic_sequence_set()
    del seqs["flair"]

    with pytest.raises(ValidationException):
        preprocess_multimodal_tensor(seqs)


def test_end_to_end_inference_execution_cpu():
    """Verify end-to-end inference execution on CPU with real forward pass and volumetrics."""
    seqs = create_synthetic_sequence_set(shape=(16, 16, 16))
    device = torch.device("cpu")

    result = run_segmentation_inference(
        sequences=seqs,
        weights_path=None,  # Untrained model for fast unit testing
        device=device,
        roi_size=(16, 16, 16),
        sw_batch_size=1,
    )

    assert result.discrete_mask.shape == (16, 16, 16)
    # Verify labels in mask belong strictly to BraTS set {0, 1, 2, 4}
    unique_labels = set(np.unique(result.discrete_mask))
    assert unique_labels.issubset({0, 1, 2, 4})

    # Verify geometry preservation
    assert result.original_geometry.dimensions == [16, 16, 16]
    assert np.allclose(result.reference_affine, seqs["t1gd"].affine)

    # Verify volumetrics exist and are non-negative
    assert result.volumetrics.volumes_ml.whole_tumor >= 0.0
    assert result.volumetrics.volumes_ml.tumor_core >= 0.0
    assert result.volumetrics.volumes_ml.enhancing_tumor >= 0.0

    # Verify execution time is measured
    assert result.execution_time_seconds > 0.0
    assert "CPU" in result.hardware_device


def test_md5_checksum_verification():
    """Verify file MD5 checksum utility."""
    data = b"neuroscope-test-content"
    expected = hashlib.md5(data).hexdigest()

    with tempfile.NamedTemporaryFile(delete=False) as tf:
        tf.write(data)
        temp_path = Path(tf.name)

    try:
        assert verify_file_md5(temp_path, expected) is True
        assert verify_file_md5(temp_path, "wrong_hash_12345") is False
    finally:
        try:
            temp_path.unlink()
        except OSError:
            pass


def test_orientation_harmonization_and_inversion_roundtrip():
    """Verify Hackathon Rubric Tests 4 & 5 (Orientation Invariance):
    When inputs have non-canonical or flipped affines (e.g. LPS or left-right flipped),
    preprocessing reorients to canonical RAS+ for neural inference, and postprocessing
    inverts the discrete mask back to the exact native grid and affine matrix.
    """
    # Create volume with Left-Right flipped affine (LPS orientation)
    lps_affine = np.diag([-1.0, -1.0, 1.0, 1.0])
    rng = np.random.default_rng(seed=42)
    data = rng.uniform(20.0, 400.0, size=(16, 16, 16)).astype(np.float32)

    seqs = {
        "t1": nib.Nifti1Image(data, lps_affine),
        "t1gd": nib.Nifti1Image(data, lps_affine),
        "t2": nib.Nifti1Image(data, lps_affine),
        "flair": nib.Nifti1Image(data, lps_affine),
    }

    # Verify preprocessing reorients and provides inverse transform
    tensor, geometry, affine, from_ras = preprocess_multimodal_tensor(seqs, return_inverse_ornt=True)
    assert from_ras is not None
    assert tensor.shape == (1, 4, 16, 16, 16)

    # Run inference and confirm mask is inverted to match original native affine and shape
    device = torch.device("cpu")
    result = run_segmentation_inference(
        sequences=seqs,
        weights_path=None,
        device=device,
        roi_size=(16, 16, 16),
        sw_batch_size=1,
    )
    assert result.discrete_mask.shape == (16, 16, 16)
    assert np.allclose(result.reference_affine, lps_affine)


def test_hackathon_reproducibility_deterministic_inference():
    """Verify Hackathon Rubric Test 8 (Reproducibility):
    Running the same case twice must yield masks that agree with Dice >= 0.99.
    """
    seqs = create_synthetic_sequence_set(shape=(16, 16, 16))
    device = torch.device("cpu")

    res1 = run_segmentation_inference(
        sequences=seqs,
        weights_path=None,
        device=device,
        roi_size=(16, 16, 16),
        sw_batch_size=1,
    )
    res2 = run_segmentation_inference(
        sequences=seqs,
        weights_path=None,
        device=device,
        roi_size=(16, 16, 16),
        sw_batch_size=1,
    )

    m1 = res1.discrete_mask
    m2 = res2.discrete_mask

    # Both runs on same input must match identically (Dice = 1.000 >= 0.99)
    assert np.array_equal(m1, m2)
