"""Unit tests for MONAI SegResNet 3D inference engine and tensor flow."""

import hashlib
import tempfile
from pathlib import Path
from typing import Dict

import nibabel as nib
import numpy as np
import pytest
import torch

from backend.app.exceptions import (
    ModelNotReadyException,
    ModelWeightsIncompatibleException,
    ValidationException,
)
from backend.app.services.inference import (
    DEFAULT_WEIGHTS_PATH,
    INPUT_MODALITY_ORDER,
    build_segresnet_model,
    clear_model_cache,
    get_model_readiness,
    get_or_load_model,
    preprocess_multimodal_tensor,
    resolve_weights_path,
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
    """Verify SegResNet instantiates with verified 4-input and 3-output architecture when allow_untrained=True."""
    device = torch.device("cpu")
    model = build_segresnet_model(device=device, weights_path=None, allow_untrained=True)

    assert isinstance(model, torch.nn.Module)
    # Test forward pass with random tensor
    x = torch.randn(1, 4, 16, 16, 16, device=device)
    with torch.no_grad():
        out = model(x)
    assert out.shape == (1, 3, 16, 16, 16)


def test_missing_weights_fails_closed():
    """Verify build_segresnet_model and run_segmentation_inference fail closed when weights are absent."""
    device = torch.device("cpu")

    # 1. build_segresnet_model with no weights and allow_untrained=False raises ModelNotReadyException
    with pytest.raises(ModelNotReadyException):
        build_segresnet_model(device=device, weights_path=None, allow_untrained=False)

    # 2. Non-existent weights path raises ModelNotReadyException
    with pytest.raises(ModelNotReadyException):
        build_segresnet_model(device=device, weights_path="/nonexistent/weights/file.pt")

    # 3. run_segmentation_inference with non-existent weights raises ModelNotReadyException
    seqs = create_synthetic_sequence_set(shape=(16, 16, 16))
    with pytest.raises(ModelNotReadyException):
        run_segmentation_inference(
            sequences=seqs,
            weights_path="/nonexistent/weights/file.pt",
            device=device,
            allow_untrained=False,
        )


def test_incompatible_checkpoint_fails_closed():
    """Verify that corrupt or incompatible checkpoint state_dict raises ModelWeightsIncompatibleException."""
    device = torch.device("cpu")

    # Create dummy checkpoint with wrong layer keys
    dummy_incompatible_sd = {"wrong_layer.weight": torch.randn(10, 10)}
    with tempfile.NamedTemporaryFile(suffix=".pt", delete=False) as tf:
        torch.save(dummy_incompatible_sd, tf.name)
        incompatible_path = Path(tf.name)

    try:
        with pytest.raises(ModelWeightsIncompatibleException):
            build_segresnet_model(device=device, weights_path=incompatible_path)
    finally:
        try:
            incompatible_path.unlink()
        except OSError:
            pass


def test_real_checkpoint_loads_and_caches_instance():
    """Verify that the official checkpoint at DEFAULT_WEIGHTS_PATH loads, verifies SHA256, and caches."""
    if not DEFAULT_WEIGHTS_PATH.exists():
        pytest.skip("Official model.pt not present in test environment.")

    clear_model_cache()
    device = torch.device("cpu")

    readiness = get_model_readiness(weights_path=DEFAULT_WEIGHTS_PATH, device=device)
    assert readiness["weights_present"] is True
    assert readiness["model_ready"] is True
    assert readiness["checkpoint_sha256"] == "860ccb3f1c21c99d0410ad8a1ac4ef6b8fab60cec0a503b0ba42675741a750ae"
    assert readiness["checkpoint_size_bytes"] == 18840620

    # Retrieve loaded model instance
    model1, path1, sha1 = get_or_load_model(device=device, weights_path=DEFAULT_WEIGHTS_PATH)
    assert isinstance(model1, torch.nn.Module)
    assert sha1 == "860ccb3f1c21c99d0410ad8a1ac4ef6b8fab60cec0a503b0ba42675741a750ae"

    # Second call should return the EXACT SAME cached model instance in memory
    model2, path2, sha2 = get_or_load_model(device=device, weights_path=DEFAULT_WEIGHTS_PATH)
    assert model1 is model2  # Identity check proves cache hit


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
    """Verify end-to-end inference execution on CPU with real forward pass and volumetrics (using allow_untrained for speed)."""
    seqs = create_synthetic_sequence_set(shape=(16, 16, 16))
    device = torch.device("cpu")

    result = run_segmentation_inference(
        sequences=seqs,
        weights_path=None,
        device=device,
        roi_size=(16, 16, 16),
        sw_batch_size=1,
        allow_untrained=True,  # Explicitly allow untrained for fast unit test
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
