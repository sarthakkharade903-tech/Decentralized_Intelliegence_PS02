"""MONAI SegResNet 3D Brain Tumour Inference Engine.

Implements deep-learning inference using the official MONAI Model Zoo BraTS bundle:
- Architecture: MONAI SegResNet (BraTS 2018/2021)
- Verified Input Channels (Strict Order):
    Channel 0: T1c / T1Gd
    Channel 1: T1 Native
    Channel 2: T2-Weighted
    Channel 3: FLAIR
- Verified Output Channels (Nested Probabilities):
    Channel 0: Tumor Core (TC)
    Channel 1: Whole Tumor (WT)
    Channel 2: Enhancing Tumor (ET)
- Post-processing:
    Nested sigmoid thresholding mapped to discrete BraTS 2021 labels (0, 1, 2, 4)
- Physical Volumetrics:
    Decomposition into WT, TC, ET, ED, NETC volumes in mL.
"""

import hashlib
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import nibabel as nib
import numpy as np
import torch
from monai.inferers import sliding_window_inference
from monai.networks.nets import SegResNet

from backend.app.exceptions import NeuroScopeException, ValidationException
from backend.app.services.postprocessing import map_nested_channels_to_discrete_labels
from backend.app.services.validator import OriginalGeometry, ValidationResult
from backend.app.services.volumetrics import VolumetricReport, compute_tumor_volumetrics

# ─── Model Weights & Checksum Constants ───────────────────────────────────────

OFFICIAL_WEIGHTS_URL: str = (
    "https://developer.download.nvidia.com/assets/Clara/monai/tutorials/model_zoo/model_brats_mri_segmentation.pt"
)
OFFICIAL_WEIGHTS_MD5: str = "870e677b782a5184cbc48db1456b78e8"
EXPECTED_WEIGHTS_SIZE_BYTES: int = 18_840_620  # ~17.97 MB

DEFAULT_WEIGHTS_DIR: Path = Path(__file__).resolve().parent.parent.parent / "models"
DEFAULT_WEIGHTS_PATH: Path = DEFAULT_WEIGHTS_DIR / "model.pt"

# Strict input channel order required by the trained SegResNet
INPUT_MODALITY_ORDER: List[str] = ["t1gd", "t1", "t2", "flair"]


# ─── Data Models ──────────────────────────────────────────────────────────────

@dataclass
class InferenceResult:
    """Complete output of a verified deep-learning inference run."""
    discrete_mask: np.ndarray
    original_geometry: OriginalGeometry
    volumetrics: VolumetricReport
    execution_time_seconds: float
    hardware_device: str
    reference_affine: np.ndarray

    def to_dict(self) -> Dict[str, Any]:
        vol_dict = self.volumetrics.to_dict()
        return {
            "status": "success",
            "execution_time_seconds": round(self.execution_time_seconds, 2),
            "hardware_device": self.hardware_device,
            "original_geometry": self.original_geometry.to_dict(),
            "volumes_ml": vol_dict["volumes_ml"],
            "metrics": vol_dict["metrics"],
        }


# ─── Checksum and Weight Management ───────────────────────────────────────────

def verify_file_md5(file_path: Union[str, Path], expected_md5: str) -> bool:
    """Verifies that the file at file_path matches expected_md5 checksum."""
    p = Path(file_path)
    if not p.exists():
        return False

    hasher = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)

    return hasher.hexdigest().lower() == expected_md5.lower()


def download_official_weights(
    destination: Union[str, Path] = DEFAULT_WEIGHTS_PATH,
    url: str = OFFICIAL_WEIGHTS_URL,
    expected_md5: str = OFFICIAL_WEIGHTS_MD5,
) -> Path:
    """Downloads official MONAI Model Zoo SegResNet weights and verifies MD5 checksum."""
    dest = Path(destination)
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists():
        if verify_file_md5(dest, expected_md5):
            return dest
        # If corrupt or incomplete, remove and re-download
        try:
            dest.unlink()
        except OSError:
            pass

    req = urllib.request.Request(url, headers={"User-Agent": "NeuroScope-3D/1.0"})
    with urllib.request.urlopen(req) as response, open(dest, "wb") as out_file:
        for chunk in iter(lambda: response.read(65536), b""):
            out_file.write(chunk)

    if not verify_file_md5(dest, expected_md5):
        try:
            dest.unlink()
        except OSError:
            pass
        raise NeuroScopeException(
            error="MODEL_WEIGHTS_CORRUPT",
            message=f"Downloaded weights failed MD5 checksum verification (expected: {expected_md5}).",
            status_code=500,
        )

    return dest


# ─── Model Construction ───────────────────────────────────────────────────────

def build_segresnet_model(
    device: torch.device,
    weights_path: Optional[Union[str, Path]] = None,
) -> torch.nn.Module:
    """Builds the official MONAI SegResNet architecture and loads weights."""
    model = SegResNet(
        spatial_dims=3,
        init_filters=16,
        in_channels=4,
        out_channels=3,
        dropout_prob=0.2,
        blocks_down=[1, 2, 2, 4],
        blocks_up=[1, 1, 1],
    )

    if weights_path is not None:
        p = Path(weights_path)
        if not p.exists():
            raise FileNotFoundError(f"Weights file not found at: {p}")

        state_dict = torch.load(str(p), map_location=device, weights_only=True)
        # Handle state_dict keys with or without 'state_dict' wrapper
        if "state_dict" in state_dict:
            state_dict = state_dict["state_dict"]

        model.load_state_dict(state_dict, strict=True)

    model.to(device)
    model.eval()
    return model


# ─── Preprocessing ───────────────────────────────────────────────────────────

def preprocess_multimodal_tensor(
    sequences: Dict[str, nib.spatialimages.SpatialImage],
    modality_order: List[str] = INPUT_MODALITY_ORDER,
) -> Tuple[torch.Tensor, OriginalGeometry, np.ndarray]:
    """Stacks and normalizes the 4 MRI modalities in the verified input order.

    Order: [t1gd, t1, t2, flair]
    Normalization: Z-score normalization on non-zero voxels for each sequence.
    """
    channel_arrays: List[np.ndarray] = []
    reference_affine: Optional[np.ndarray] = None
    ref_img = None

    for mod in modality_order:
        if mod not in sequences:
            raise ValidationException(
                error="MISSING_SEQUENCE",
                message=f"Modality '{mod}' is required for SegResNet inference.",
            )

        img = sequences[mod]
        if reference_affine is None:
            reference_affine = img.affine
            ref_img = img

        data = np.asanyarray(img.dataobj, dtype=np.float32)

        # Non-zero intensity normalization per modality channel
        mask = data > 0
        if np.any(mask):
            mean = float(np.mean(data[mask]))
            std = float(np.std(data[mask]))
            if std > 1e-7:
                data[mask] = (data[mask] - mean) / std
            else:
                data[mask] = 0.0

        channel_arrays.append(data)

    # Stack channels along channel dimension: [4, H, W, D]
    stacked = np.stack(channel_arrays, axis=0)
    # Add batch dimension: [1, 4, H, W, D]
    tensor = torch.from_numpy(stacked).unsqueeze(0)

    shape = list(ref_img.shape[:3])
    spacings = [float(round(s, 4)) for s in nib.affines.voxel_sizes(reference_affine)[:3]]
    try:
        orientation = "".join(nib.aff2axcodes(reference_affine))
    except Exception:
        orientation = "UNKNOWN"

    geometry = OriginalGeometry(
        dimensions=shape,
        voxel_spacing_mm=spacings,
        orientation=orientation,
    )

    return tensor, geometry, reference_affine


# ─── Core Inference Pipeline ──────────────────────────────────────────────────

def run_segmentation_inference(
    sequences: Dict[str, nib.spatialimages.SpatialImage],
    weights_path: Optional[Union[str, Path]] = None,
    device: Optional[torch.device] = None,
    roi_size: Tuple[int, int, int] = (128, 128, 128),
    sw_batch_size: int = 1,
    overlap: float = 0.5,
    threshold: float = 0.5,
) -> InferenceResult:
    """Executes end-to-end MONAI sliding window inference on multi-modal MRI scans.

    Never generates fake or random masks; runs real forward passes through SegResNet.
    """
    import time
    start_time = time.perf_counter()

    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # 1. Preprocess & stack input in verified order: [t1gd, t1, t2, flair]
    input_tensor, geometry, ref_affine = preprocess_multimodal_tensor(sequences)

    # 2. Build model and load weights
    model = build_segresnet_model(device=device, weights_path=weights_path)

    # 3. Execute sliding-window inference with no gradients
    input_tensor = input_tensor.to(device)
    with torch.no_grad():
        # Ensure roi_size does not exceed spatial dimensions of input
        spatial_dims = input_tensor.shape[2:]
        effective_roi = tuple(min(r, s) for r, s in zip(roi_size, spatial_dims))

        output_logits = sliding_window_inference(
            inputs=input_tensor,
            roi_size=effective_roi,
            sw_batch_size=sw_batch_size,
            predictor=model,
            overlap=overlap,
            mode="gaussian",
        )

    # 4. Map nested channels to discrete BraTS labels (0, 1, 2, 4)
    # Output logits shape: [1, 3, H, W, D]
    output_np = output_logits.squeeze(0).cpu().numpy()
    discrete_mask = map_nested_channels_to_discrete_labels(
        output_np,
        is_logits=True,
        threshold=threshold,
    )

    # 5. Calculate physical volumes in mL using original voxel spacing
    volumetrics = compute_tumor_volumetrics(
        discrete_mask=discrete_mask,
        voxel_spacing_mm=geometry.voxel_spacing_mm,
    )

    execution_time = time.perf_counter() - start_time
    device_name = (
        torch.cuda.get_device_name(0)
        if device.type == "cuda"
        else f"CPU ({os.cpu_count() or 'multi'}-core)"
    )

    return InferenceResult(
        discrete_mask=discrete_mask,
        original_geometry=geometry,
        volumetrics=volumetrics,
        execution_time_seconds=execution_time,
        hardware_device=device_name,
        reference_affine=ref_affine,
    )
