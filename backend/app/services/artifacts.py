"""Artifact generation and delivery service for NeuroScope-3D.

Handles saving discrete NIfTI segmentation masks and structured JSON reports
with zero cloud data leakage, preserving original spatial geometry.
"""

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

import nibabel as nib
import numpy as np

from backend.app.exceptions import NeuroScopeException
from backend.app.services.inference import InferenceResult

# Root output directory for artifacts (strictly gitignored via outputs/)
DEFAULT_ARTIFACTS_DIR: Path = (
    Path(__file__).resolve().parents[3] / "outputs" / "artifacts"
)

RESEARCH_DISCLAIMER: str = (
    "AI-predicted candidate tumor regions for research and educational purposes only. "
    "Not a clinical diagnostic device. Not for treatment planning without board-certified "
    "radiologist review."
)


def sanitize_identifier(identifier: str, default: str = "ANONYMOUS") -> str:
    """Sanitizes user-provided patient or study identifiers for safe filesystem usage."""
    if not identifier or not identifier.strip():
        return default
    sanitized = re.sub(r"[^a-zA-Z0-9_\-]", "_", identifier.strip())
    # Limit length and strip trailing/leading underscores
    sanitized = sanitized[:64].strip("_")
    return sanitized or default


def save_prediction_artifacts(
    result: InferenceResult,
    patient_id: str = "ANONYMOUS",
    artifacts_dir: Optional[Path] = None,
) -> Dict[str, str]:
    """Exports segmentation mask as compressed NIfTI (.nii.gz) and structured JSON summary.

    Args:
        result: InferenceResult from SegResNet execution.
        patient_id: Subject identifier for reporting.
        artifacts_dir: Directory where files will be stored (defaults to DEFAULT_ARTIFACTS_DIR).

    Returns:
        Dictionary mapping artifact keys to their relative API URLs.
    """
    target_dir = artifacts_dir or DEFAULT_ARTIFACTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    safe_id = sanitize_identifier(patient_id)
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    unique_suffix = uuid.uuid4().hex[:8]
    base_stem = f"{safe_id}_{timestamp_str}_{unique_suffix}"

    mask_filename = f"{base_stem}_seg.nii.gz"
    report_filename = f"{base_stem}_report.json"

    mask_path = target_dir / mask_filename
    report_path = target_dir / report_filename

    # 1. Export 3D discrete segmentation mask with original affine matrix
    mask_uint8 = result.discrete_mask.astype(np.uint8)
    nii_img = nib.Nifti1Image(mask_uint8, affine=result.reference_affine)
    nib.save(nii_img, str(mask_path))

    # 2. Export clinical report summary JSON
    vol_dict = result.volumetrics.to_dict()
    report_payload: Dict[str, Any] = {
        "status": "success",
        "patient_id": patient_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "execution_time_seconds": round(result.execution_time_seconds, 2),
        "hardware_device": result.hardware_device,
        "original_geometry": result.original_geometry.to_dict(),
        "volumes_ml": vol_dict["volumes_ml"],
        "metrics": vol_dict["metrics"],
        "model_provenance": {
            "model_architecture": "MONAI SegResNet (BraTS 2021)",
            "input_modalities_order": ["t1gd", "t1", "t2", "flair"],
            "labels": {
                "0": "Background",
                "1": "Necrotic and Non-Enhancing Tumor Core (NETC)",
                "2": "Peritumoral Edema (ED)",
                "4": "Enhancing Tumor (ET)",
            },
        },
        "disclaimer": RESEARCH_DISCLAIMER,
    }

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report_payload, f, indent=2)

    return {
        "segmentation_mask_url": f"/api/v1/artifacts/{mask_filename}",
        "report_summary_url": f"/api/v1/artifacts/{report_filename}",
        "segmentation_mask_path": str(mask_path),
        "report_summary_path": str(report_path),
    }


def get_artifact_path(
    filename: str,
    artifacts_dir: Optional[Path] = None,
) -> Tuple[Path, str]:
    """Validates filename against path-traversal attacks and returns safe path with media type.

    Args:
        filename: Requested artifact basename.
        artifacts_dir: Root directory for artifact lookup.

    Returns:
        Tuple of (resolved_path, media_type)

    Raises:
        NeuroScopeException: If filename is malformed or file does not exist.
    """
    target_dir = (artifacts_dir or DEFAULT_ARTIFACTS_DIR).resolve()

    if (
        not filename
        or "/" in filename
        or "\\" in filename
        or ".." in filename
        or any(char in filename for char in [":", "*", "?", '"', "<", ">", "|"])
    ):
        raise NeuroScopeException(
            error="INVALID_ARTIFACT_FILENAME",
            message=f"Requested artifact filename contains invalid or forbidden characters.",
            detail={"filename": filename},
            status_code=400,
        )

    resolved_path = (target_dir / filename).resolve()

    # Path traversal guard: must be strictly inside target_dir
    try:
        resolved_path.relative_to(target_dir)
    except ValueError:
        raise NeuroScopeException(
            error="ACCESS_DENIED",
            message="Access to the requested file path is forbidden.",
            detail={"filename": filename},
            status_code=403,
        )

    if not resolved_path.is_file():
        raise NeuroScopeException(
            error="ARTIFACT_NOT_FOUND",
            message=f"Artifact '{filename}' was not found on the server.",
            detail={"filename": filename},
            status_code=404,
        )

    # Determine media type
    lower = filename.lower()
    if lower.endswith(".nii.gz"):
        media_type = "application/gzip"
    elif lower.endswith(".nii"):
        media_type = "application/octet-stream"
    elif lower.endswith(".json"):
        media_type = "application/json"
    else:
        media_type = "application/octet-stream"

    return resolved_path, media_type
