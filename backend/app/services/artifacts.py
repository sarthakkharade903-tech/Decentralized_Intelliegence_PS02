"""Artifact generation and delivery service for NeuroScope-3D.

Handles saving discrete NIfTI segmentation masks and structured JSON reports
with zero cloud data leakage, preserving original spatial geometry.
"""

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

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


def generate_tumor_surface_mesh(
    discrete_mask: np.ndarray,
    voxel_spacing: Optional[Union[List[float], Tuple[float, ...]]] = None,
    step_size: int = 2,
    reference_scan: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """Generates real 3D triangle meshes using Marching Cubes for each BraTS region and brain envelope.

    Args:
        discrete_mask: 3D uint8 array with BraTS labels (0, 1, 2, 4).
        voxel_spacing: Voxel spacing in mm [sx, sy, sz].
        step_size: Marching cubes step size (2 is balanced for high detail and speed).
        reference_scan: Optional 3D intensity array for brain envelope extraction.

    Returns:
        Structured dictionary containing mesh vertices, faces, and normals scaled for Three.js.
    """
    try:
        from skimage.measure import marching_cubes
    except ImportError:
        marching_cubes = None
    import scipy.ndimage as ndi

    spacing = list(voxel_spacing) if voxel_spacing else [1.0, 1.0, 1.0]
    shape = discrete_mask.shape
    vol_center = np.array(shape, dtype=np.float32) / 2.0

    mesh_payload: Dict[str, Any] = {
        "metadata": {
            "dimensions": list(shape),
            "voxel_spacing_mm": spacing,
        },
        "regions": {},
    }

    # Bounding box & center calculation for tumor
    tumor_voxels = np.argwhere(discrete_mask > 0)
    if len(tumor_voxels) > 0:
        tumor_min = tumor_voxels.min(axis=0).tolist()
        tumor_max = tumor_voxels.max(axis=0).tolist()
        tumor_center = tumor_voxels.mean(axis=0).tolist()
        dimensions_mm = [
            round((tumor_max[i] - tumor_min[i] + 1) * spacing[i], 1)
            for i in range(3)
        ]
        mesh_payload["metadata"]["tumor_center_voxel"] = [round(c, 1) for c in tumor_center]
        mesh_payload["metadata"]["tumor_dimensions_mm"] = {
            "axial_x": dimensions_mm[0],
            "coronal_y": dimensions_mm[1],
            "sagittal_z": dimensions_mm[2],
            "max_diameter": max(dimensions_mm),
        }
    else:
        mesh_payload["metadata"]["tumor_center_voxel"] = [round(c, 1) for c in vol_center]
        mesh_payload["metadata"]["tumor_dimensions_mm"] = {
            "axial_x": 0.0,
            "coronal_y": 0.0,
            "sagittal_z": 0.0,
            "max_diameter": 0.0,
        }

    # Scale factor: 80 mm per Three.js world unit gives clean framing with camera at z=4.0
    scale_factor = 80.0
    center_offset = vol_center * np.array(spacing, dtype=np.float32)

    # Adapt step size to mask dimensions
    # If marching_cubes is not installed, return structured metadata gracefully
    if marching_cubes is None:
        return mesh_payload

    # 1. Extract BraTS Tumor Sub-regions
    region_specs = [
        ("netc", 1, "Necrotic Core", "#06B6D4"),
        ("ed", 2, "Peritumoral Edema", "#EAB308"),
        ("et", 4, "Enhancing Tumor", "#EF4444"),
    ]

    for key, label_val, name, hex_color in region_specs:
        binary_mask = (discrete_mask == label_val)
        voxel_count = int(np.sum(binary_mask))
        if voxel_count < 4:
            continue

        try:
            # Gaussian curvature smoothing to eliminate voxel staircases while preserving boundaries
            if voxel_count >= 16:
                eval_vol = ndi.gaussian_filter(binary_mask.astype(np.float32), sigma=0.85)
            else:
                eval_vol = binary_mask.astype(np.float32)

            verts, faces, normals, _ = marching_cubes(
                eval_vol,
                level=0.5,
                step_size=effective_step,
                spacing=tuple(spacing),
            )
            centered_verts = (verts - center_offset) / scale_factor

            mesh_payload["regions"][key] = {
                "name": name,
                "label": label_val,
                "color": hex_color,
                "voxel_count": voxel_count,
                "volume_ml": round(voxel_count * (spacing[0] * spacing[1] * spacing[2]) / 1000.0, 2),
                "vertex_count": len(verts),
                "triangle_count": len(faces),
                "vertices": centered_verts.flatten().round(4).tolist(),
                "faces": faces.flatten().tolist(),
                "normals": normals.flatten().round(4).tolist(),
            }
        except Exception:
            pass

    # 2. Extract Smooth Anatomical Brain Envelope
    brain_source = reference_scan if reference_scan is not None else (discrete_mask > 0)
    try:
        if reference_scan is not None:
            pos_vals = brain_source[brain_source > 0]
            thresh = np.percentile(pos_vals, 15) if len(pos_vals) > 100 else 0.0
            brain_binary = (brain_source > thresh).astype(np.float32)
        else:
            brain_binary = (brain_source > 0).astype(np.float32)

        if np.sum(brain_binary) > 100:
            # Smooth anatomical cortex field via Gaussian filter on subsampled grid
            smooth_brain = ndi.gaussian_filter(brain_binary[::2, ::2, ::2], sigma=1.6)
            b_verts, b_faces, b_normals, _ = marching_cubes(
                smooth_brain,
                level=0.5,
                step_size=1,
                spacing=(spacing[0] * 2.0, spacing[1] * 2.0, spacing[2] * 2.0),
            )
            b_centered = (b_verts - center_offset) / scale_factor
            mesh_payload["regions"]["brain"] = {
                "name": "Brain Envelope",
                "label": 0,
                "color": "#F472B6",
                "vertex_count": len(b_verts),
                "triangle_count": len(b_faces),
                "vertices": b_centered.flatten().round(4).tolist(),
                "faces": b_faces.flatten().tolist(),
                "normals": b_normals.flatten().round(4).tolist(),
            }
    except Exception:
        pass

    return mesh_payload


def save_prediction_artifacts(
    result: InferenceResult,
    patient_id: str = "ANONYMOUS",
    artifacts_dir: Optional[Path] = None,
    reference_scan: Optional[Union[nib.spatialimages.SpatialImage, np.ndarray]] = None,
) -> Dict[str, str]:
    """Exports segmentation mask as compressed NIfTI (.nii.gz), JSON report, and 3D surface mesh.

    Args:
        result: InferenceResult from SegResNet execution.
        patient_id: Subject identifier for reporting.
        artifacts_dir: Directory where files will be stored (defaults to DEFAULT_ARTIFACTS_DIR).
        reference_scan: Optional reference image/array for brain envelope mesh extraction.

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
    mesh_filename = f"{base_stem}_mesh.json"

    mask_path = target_dir / mask_filename
    report_path = target_dir / report_filename
    mesh_path = target_dir / mesh_filename

    # 1. Export 3D discrete segmentation mask with original affine matrix
    mask_uint8 = result.discrete_mask.astype(np.uint8)
    nii_img = nib.Nifti1Image(mask_uint8, affine=result.reference_affine)
    nib.save(nii_img, str(mask_path))

    # 2. Extract and export real 3D surface mesh using Marching Cubes
    ref_arr = None
    if reference_scan is not None:
        ref_arr = np.asanyarray(reference_scan.dataobj if hasattr(reference_scan, "dataobj") else reference_scan)

    mesh_data = generate_tumor_surface_mesh(
        discrete_mask=mask_uint8,
        voxel_spacing=result.original_geometry.voxel_spacing_mm,
        reference_scan=ref_arr,
    )
    with open(mesh_path, "w", encoding="utf-8") as f:
        json.dump(mesh_data, f)

    # 3. Export clinical report summary JSON
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
        "mesh_metadata": mesh_data.get("metadata", {}),
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
        "mesh_url": f"/api/v1/artifacts/{mesh_filename}",
        "segmentation_mask_path": str(mask_path),
        "report_summary_path": str(report_path),
        "mesh_path": str(mesh_path),
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
