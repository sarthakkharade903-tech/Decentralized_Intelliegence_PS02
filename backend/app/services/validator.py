"""NIfTI Sequence Ingestion and Validation Engine.

Enforces clinical neuroimaging and hackathon constraints defined in:
- docs/PROJECT_CONTEXT.md §4 (Affine Matrix & Geometry Invariants)
- docs/ARCHITECTURE.md §2.B & §3 (Validation Engine & API Contract)
- AGENTS.md §2 (BraTS 2021 Spatial Geometry)
"""

import gzip
import io
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Optional, Tuple, Union

import nibabel as nib
import numpy as np

from backend.app.exceptions import (
    CorruptedNiftiException,
    EmptyScanException,
    FileSizeExceededException,
    IncompatibleAffineException,
    IncompatibleDimensionsException,
    NonfiniteVoxelsException,
    ValidationException,
)

# ─── Constants ────────────────────────────────────────────────────────────────

REQUIRED_SEQUENCES: List[str] = ["t1", "t1gd", "t2", "flair"]

# 1 GiB per-file limit (1,073,741,824 bytes) per hackathon challenge rules
MAX_FILE_BYTES: int = 1 * 1024 * 1024 * 1024

# Affine comparison tolerances (documented engineering standard):
# Direction cosines / rotation scaling tolerance: 1e-2 (allows minor floating precision rounding)
AFFINE_ROTATION_ATOL: float = 1e-2
# Translation / origin coordinate tolerance in millimeters: 0.5 mm
AFFINE_TRANSLATION_ATOL: float = 0.5
# Voxel spacing tolerance in millimeters: 1e-2 mm
SPACING_ATOL: float = 1e-2

# Minimum intensity range to distinguish genuine structural MRI from blank/sensor-noise scans
MIN_INTENSITY_RANGE: float = 1e-4


# ─── Data Models ──────────────────────────────────────────────────────────────

@dataclass
class OriginalGeometry:
    """Original reference coordinate space and grid dimensions."""
    dimensions: List[int]
    voxel_spacing_mm: List[float]
    orientation: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dimensions": self.dimensions,
            "voxel_spacing_mm": self.voxel_spacing_mm,
            "orientation": self.orientation,
        }


@dataclass
class ValidationResult:
    """Output of successful multi-sequence validation."""
    is_valid: bool
    sequences: Dict[str, nib.spatialimages.SpatialImage]
    geometry: OriginalGeometry
    reference_affine: np.ndarray

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "geometry": self.geometry.to_dict(),
        }


# ─── Validation Functions ─────────────────────────────────────────────────────

def check_file_size(
    file_or_path: Union[str, Path, BinaryIO, Any],
    filename: str = "upload",
    max_bytes: int = MAX_FILE_BYTES,
) -> int:
    """Validates that file does not exceed max_bytes without loading it entirely into memory."""
    size: Optional[int] = None

    if isinstance(file_or_path, (str, Path)):
        p = Path(file_or_path)
        if p.exists():
            size = p.stat().st_size
    else:
        # Check if wrapped in FastAPI/Starlette UploadFile
        underlying = getattr(file_or_path, "file", file_or_path)

        # Check .size attribute on wrapper or file if provided
        if hasattr(file_or_path, "size") and isinstance(file_or_path.size, int):
            size = file_or_path.size
        elif hasattr(underlying, "size") and isinstance(underlying.size, int):
            size = underlying.size
        elif hasattr(underlying, "seek") and hasattr(underlying, "tell"):
            current_pos = underlying.tell()
            underlying.seek(0, os.SEEK_END)
            size = underlying.tell()
            underlying.seek(current_pos, os.SEEK_SET)

    if size is not None and size > max_bytes:
        raise FileSizeExceededException(
            filename=filename,
            size_bytes=size,
            max_bytes=max_bytes,
        )

    return size if size is not None else 0


def load_nifti_image(
    file_or_path: Union[str, Path, BinaryIO, nib.spatialimages.SpatialImage, Any],
    sequence_name: str,
) -> nib.spatialimages.SpatialImage:
    """Loads a NIfTI image safely, catching parse and corrupted header errors.

    Supports:
    - Filesystem paths (str / Path)
    - In-memory Byte streams (BytesIO)
    - FastAPI / Starlette UploadFile
    - Pre-loaded SpatialImage instances
    - Both uncompressed (.nii) and compressed (.nii.gz) streams
    """
    if isinstance(file_or_path, nib.spatialimages.SpatialImage):
        return file_or_path

    try:
        if isinstance(file_or_path, (str, Path)):
            return nib.load(str(file_or_path))

        # Handle file-like stream or UploadFile
        underlying = getattr(file_or_path, "file", file_or_path)
        if hasattr(underlying, "read") and hasattr(underlying, "seek"):
            underlying.seek(0)
            magic = underlying.read(2)
            underlying.seek(0)

            # Check for Gzip header magic bytes: 0x1f 0x8b
            if magic == b"\x1f\x8b":
                with gzip.GzipFile(fileobj=underlying, mode="rb") as gz:
                    decompressed_bytes = gz.read()
                stream = io.BytesIO(decompressed_bytes)
            else:
                raw_bytes = underlying.read()
                underlying.seek(0)
                stream = io.BytesIO(raw_bytes)

            fh = nib.FileHolder(fileobj=stream)
            file_map = {"image": fh, "header": fh}
            return nib.Nifti1Image.from_file_map(file_map)

        raise ValueError(f"Unsupported file input type: {type(file_or_path)}")
    except Exception as e:
        raise CorruptedNiftiException(filename=sequence_name, reason=str(e))


def extract_geometry(img: nib.spatialimages.SpatialImage) -> OriginalGeometry:
    """Extracts standard anatomical geometry metadata from a NIfTI image."""
    shape = list(img.shape[:3])
    affine = img.affine
    spacings = [float(round(s, 4)) for s in nib.affines.voxel_sizes(affine)[:3]]

    try:
        axcodes = nib.aff2axcodes(affine)
        orientation = "".join(axcodes)
    except Exception:
        orientation = "UNKNOWN"

    return OriginalGeometry(
        dimensions=shape,
        voxel_spacing_mm=spacings,
        orientation=orientation,
    )


def validate_mpmri_sequences(
    sequences: Dict[str, Union[str, Path, BinaryIO, nib.spatialimages.SpatialImage, Any]],
    reference_key: str = "t1gd",
    max_bytes: int = MAX_FILE_BYTES,
) -> ValidationResult:
    """Performs end-to-end multi-parametric MRI ingestion and clinical invariant validation.

    Args:
        sequences: Dictionary mapping sequence names ('t1', 't1gd', 't2', 'flair')
                   to file paths, file-like streams, UploadFile, or loaded SpatialImages.
        reference_key: Sequence to use as the primary geometric reference (default: 't1gd').
        max_bytes: Per-file byte limit (default: 1 GiB).

    Returns:
        ValidationResult containing validated SpatialImages, geometry, and reference affine.

    Raises:
        ValidationException: Any RFC 7807 structured exception on validation failure.
    """
    # 1. Check all 4 sequences are provided
    missing = [seq for seq in REQUIRED_SEQUENCES if seq not in sequences or sequences[seq] is None]
    if missing:
        raise ValidationException(
            error="MISSING_SEQUENCE",
            message=f"Missing required sequence(s): {', '.join(missing)}.",
            detail={"missing_sequences": missing, "required": REQUIRED_SEQUENCES},
            status_code=400,
        )

    # 2. Check file size limits before full data ingestion
    for seq_key in REQUIRED_SEQUENCES:
        check_file_size(sequences[seq_key], filename=seq_key, max_bytes=max_bytes)

    # 3. Load NIfTI headers and images
    loaded_images: Dict[str, nib.spatialimages.SpatialImage] = {}
    for seq_key in REQUIRED_SEQUENCES:
        loaded_images[seq_key] = load_nifti_image(sequences[seq_key], sequence_name=seq_key)

    # 4. Validate 3D spatial dimensions
    shapes: Dict[str, List[int]] = {}
    for seq_key, img in loaded_images.items():
        if len(img.shape) != 3:
            raise IncompatibleDimensionsException(
                message=f"Sequence '{seq_key}' is not a 3D volume (shape: {list(img.shape)}).",
                detail={"sequence": seq_key, "shape": list(img.shape), "expected_dimensions": 3},
            )
        shapes[seq_key] = list(img.shape)

    ref_seq = reference_key if reference_key in loaded_images else REQUIRED_SEQUENCES[0]
    ref_shape = shapes[ref_seq]

    mismatches = {k: s for k, s in shapes.items() if s != ref_shape}
    if mismatches:
        mismatches_summary = ", ".join(f"{k} is {s}" for k, s in shapes.items())
        raise IncompatibleDimensionsException(
            message=f"Sequence dimensions do not match. {mismatches_summary}.",
            detail={f"{k}_shape": s for k, s in shapes.items()},
        )

    # 5. Validate affine matrices and coordinate registration
    ref_affine = loaded_images[ref_seq].affine
    ref_spacings = nib.affines.voxel_sizes(ref_affine)[:3]

    for seq_key, img in loaded_images.items():
        if seq_key == ref_seq:
            continue

        target_affine = img.affine
        target_spacings = nib.affines.voxel_sizes(target_affine)[:3]

        # Spacing check
        if not np.allclose(ref_spacings, target_spacings, atol=SPACING_ATOL):
            raise IncompatibleAffineException(
                message=f"Voxel spacing mismatch between '{ref_seq}' ({list(ref_spacings)}) and '{seq_key}' ({list(target_spacings)}).",
                detail={
                    f"{ref_seq}_spacing": [float(x) for x in ref_spacings],
                    f"{seq_key}_spacing": [float(x) for x in target_spacings],
                    "tolerance_mm": SPACING_ATOL,
                },
            )

        # Rotation/scaling matrix check
        if not np.allclose(ref_affine[:3, :3], target_affine[:3, :3], atol=AFFINE_ROTATION_ATOL):
            raise IncompatibleAffineException(
                message=f"Spatial orientation / rotation matrix of '{seq_key}' diverges from '{ref_seq}'. Scans must be co-registered.",
                detail={
                    "reference": ref_seq,
                    "target": seq_key,
                    "tolerance": AFFINE_ROTATION_ATOL,
                },
            )

        # Translation / origin check
        if not np.allclose(ref_affine[:3, 3], target_affine[:3, 3], atol=AFFINE_TRANSLATION_ATOL):
            raise IncompatibleAffineException(
                message=f"Spatial origin translation of '{seq_key}' diverges from '{ref_seq}'. Scans must be co-registered.",
                detail={
                    f"{ref_seq}_origin": [float(x) for x in ref_affine[:3, 3]],
                    f"{seq_key}_origin": [float(x) for x in target_affine[:3, 3]],
                    "tolerance_mm": AFFINE_TRANSLATION_ATOL,
                },
            )

    # 6. Validate voxel values (finite voxels & nonblank scans)
    # Load data array efficiently in single pass
    for seq_key, img in loaded_images.items():
        data = np.asanyarray(img.dataobj, dtype=np.float32)

        # Check finite
        if not np.all(np.isfinite(data)):
            nan_count = int(np.isnan(data).sum())
            inf_count = int(np.isinf(data).sum())
            raise NonfiniteVoxelsException(
                sequence_name=seq_key,
                nan_count=nan_count,
                inf_count=inf_count,
            )

        # Check nonblank / non-flat scan
        data_min = float(np.min(data))
        data_max = float(np.max(data))
        if (data_max - data_min) < MIN_INTENSITY_RANGE or np.std(data) == 0.0:
            raise EmptyScanException(sequence_name=seq_key)

    # 7. Extract reference geometry metadata
    geometry = extract_geometry(loaded_images[ref_seq])

    return ValidationResult(
        is_valid=True,
        sequences=loaded_images,
        geometry=geometry,
        reference_affine=ref_affine,
    )
