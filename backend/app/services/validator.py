"""NIfTI Sequence Ingestion and Validation Engine.

Enforces clinical neuroimaging and hackathon constraints defined in:
- docs/PROJECT_CONTEXT.md §4 (Affine Matrix & Geometry Invariants)
- docs/ARCHITECTURE.md §2.B & §3 (Validation Engine & API Contract)
- AGENTS.md §2 (BraTS 2021 Spatial Geometry)
"""

import gzip
import hashlib
import io
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Optional, Tuple, Union

import nibabel as nib
import numpy as np

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

# ─── Constants ────────────────────────────────────────────────────────────────

REQUIRED_SEQUENCES: List[str] = ["t1", "t1gd", "t2", "flair"]

SUPPORTED_EXTENSIONS: Tuple[str, ...] = (".nii", ".nii.gz")

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
class SequenceMetadata:
    """Metadata for an individual validated sequence."""
    sequence_id: str
    dimensions: List[int]
    voxel_spacing_mm: List[float]
    orientation: str
    is_finite: bool
    intensity_range: Tuple[float, float]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sequence_id": self.sequence_id,
            "dimensions": self.dimensions,
            "voxel_spacing_mm": self.voxel_spacing_mm,
            "orientation": self.orientation,
            "is_finite": self.is_finite,
            "intensity_min": round(self.intensity_range[0], 2),
            "intensity_max": round(self.intensity_range[1], 2),
        }


@dataclass
class ValidationResult:
    """Output of authoritative multi-sequence validation."""
    is_valid: bool
    sequences: Dict[str, nib.spatialimages.SpatialImage]
    geometry: OriginalGeometry
    reference_affine: np.ndarray
    sequence_metadata: Dict[str, SequenceMetadata]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "status": "valid",
            "geometry": self.geometry.to_dict(),
            "sequences": {k: v.to_dict() for k, v in self.sequence_metadata.items()},
            "cross_sequence_checks": {
                "dimensions_match": True,
                "spacing_match": True,
                "affine_alignment_match": True,
            },
            "tolerances": {
                "spacing_atol_mm": SPACING_ATOL,
                "rotation_atol": AFFINE_ROTATION_ATOL,
                "translation_atol_mm": AFFINE_TRANSLATION_ATOL,
            },
        }


# ─── Validation Functions ─────────────────────────────────────────────────────

def check_file_extension(
    file_or_path: Union[str, Path, BinaryIO, Any],
    sequence_name: str,
) -> None:
    """Validates that file has a supported .nii or .nii.gz extension if filename is accessible."""
    filename: Optional[str] = None
    if isinstance(file_or_path, (str, Path)):
        filename = str(Path(file_or_path).name)
    elif hasattr(file_or_path, "filename") and file_or_path.filename:
        filename = file_or_path.filename

    if filename:
        lower = filename.lower()
        if not (lower.endswith(".nii") or lower.endswith(".nii.gz")):
            raise UnsupportedFileExtensionException(
                sequence_name=sequence_name,
                filename=filename,
            )


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
        underlying = getattr(file_or_path, "file", file_or_path)
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


def check_duplicate_sequences(
    sequences: Dict[str, Union[str, Path, BinaryIO, nib.spatialimages.SpatialImage, Any]],
) -> None:
    """Detects duplicate files assigned across slots by comparing file sizes and content hashes."""
    seen_fingerprints: Dict[str, str] = {}

    for seq_key in REQUIRED_SEQUENCES:
        file_obj = sequences.get(seq_key)
        if file_obj is None:
            continue

        fingerprint: Optional[str] = None
        filename: Optional[str] = None

        if isinstance(file_obj, (str, Path)):
            p = Path(file_obj)
            filename = p.name
            if p.exists():
                size = p.stat().st_size
                with open(p, "rb") as f:
                    head = f.read(65536)
                fingerprint = f"{size}_{hashlib.sha256(head).hexdigest()}"
        elif isinstance(file_obj, nib.spatialimages.SpatialImage):
            # In-memory spatial images: compare data object buffer pointer / id
            fingerprint = f"mem_obj_{id(file_obj.dataobj)}"
        else:
            filename = getattr(file_obj, "filename", None)
            underlying = getattr(file_obj, "file", file_obj)
            if hasattr(underlying, "seek") and hasattr(underlying, "read"):
                curr = underlying.tell()
                underlying.seek(0)
                head = underlying.read(65536)
                underlying.seek(0, os.SEEK_END)
                size = underlying.tell()
                underlying.seek(curr, os.SEEK_SET)
                fingerprint = f"{size}_{hashlib.sha256(head).hexdigest()}"

        if fingerprint:
            if fingerprint in seen_fingerprints:
                other_seq = seen_fingerprints[fingerprint]
                raise DuplicateSequenceAssignmentException(
                    sequence_a=other_seq,
                    sequence_b=seq_key,
                    filename=filename,
                )
            seen_fingerprints[fingerprint] = seq_key


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

    Enforces:
    1. All 4 core modalities provided (t1, t1gd, t2, flair)
    2. Supported extension (.nii or .nii.gz)
    3. Duplicate assignment prevention across sequence slots
    4. 1 GiB per-file limit without excessive memory allocation
    5. Safe decompression and valid NIfTI header parsing
    6. Strictly genuine 3D volumes (2D, 4D, and multi-channel rejected without silent squeezing)
    7. Finite voxel checks (rejects NaN, +Inf, -Inf)
    8. Non-constant scan checks (rejects all-zero or zero-variance scans)
    9. Spatial affine validity: finite matrix elements and non-singular determinant
    10. Identical 3D spatial dimensions across all sequences
    11. Co-registered affine coordinate alignment (spacing, orientation, and origin within tolerance)
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

    # 2. Check extensions and file size limits
    for seq_key in REQUIRED_SEQUENCES:
        check_file_extension(sequences[seq_key], sequence_name=seq_key)
        check_file_size(sequences[seq_key], filename=seq_key, max_bytes=max_bytes)

    # 3. Check for duplicate sequence assignment across slots
    check_duplicate_sequences(sequences)

    # 4. Load NIfTI headers and images
    loaded_images: Dict[str, nib.spatialimages.SpatialImage] = {}
    for seq_key in REQUIRED_SEQUENCES:
        loaded_images[seq_key] = load_nifti_image(sequences[seq_key], sequence_name=seq_key)

    # 5. Strict 3D spatial dimension validation (Reject 2D, 4D, no silent squeezing)
    shapes: Dict[str, List[int]] = {}
    for seq_key, img in loaded_images.items():
        dim_count = len(img.shape)
        if dim_count != 3:
            raise IncompatibleDimensionsException(
                message=f"Sequence '{seq_key}' is not a 3D volume (expected exactly 3 spatial dimensions; found {dim_count} with shape {list(img.shape)}).",
                detail={
                    "sequence": seq_key,
                    "shape": list(img.shape),
                    "dimensions_count": dim_count,
                    "expected_dimensions": 3,
                },
            )
        shapes[seq_key] = list(img.shape)

    ref_seq = reference_key if reference_key in loaded_images else REQUIRED_SEQUENCES[0]
    ref_shape = shapes[ref_seq]

    # Cross-sequence shape check
    mismatches = {k: s for k, s in shapes.items() if s != ref_shape}
    if mismatches:
        mismatches_summary = ", ".join(f"{k} is {s}" for k, s in shapes.items())
        raise IncompatibleDimensionsException(
            message=f"Sequence dimensions do not match. Reference '{ref_seq}' is {ref_shape}, but {mismatches_summary}.",
            detail={f"{k}_shape": s for k, s in shapes.items()},
        )

    # 6. Validate affine matrices and coordinate registration
    ref_affine = loaded_images[ref_seq].affine

    # Check reference affine finiteness and invertibility
    if not np.all(np.isfinite(ref_affine)):
        raise IncompatibleAffineException(
            message=f"Reference sequence '{ref_seq}' contains non-finite values (NaN or Inf) in its spatial affine matrix.",
            detail={"sequence": ref_seq, "affine": ref_affine.tolist()},
        )
    ref_det = float(np.linalg.det(ref_affine[:3, :3]))
    if not np.isfinite(ref_det) or abs(ref_det) < 1e-6:
        raise IncompatibleAffineException(
            message=f"Reference sequence '{ref_seq}' has a singular or degenerate spatial affine matrix (determinant: {ref_det:.6e}).",
            detail={"sequence": ref_seq, "determinant": ref_det},
        )

    ref_spacings = nib.affines.voxel_sizes(ref_affine)[:3]

    for seq_key, img in loaded_images.items():
        target_affine = img.affine

        # Finiteness check
        if not np.all(np.isfinite(target_affine)):
            raise IncompatibleAffineException(
                message=f"Sequence '{seq_key}' contains non-finite values (NaN or Inf) in its spatial affine matrix.",
                detail={"sequence": seq_key, "affine": target_affine.tolist()},
            )

        # Non-degenerate determinant check
        target_det = float(np.linalg.det(target_affine[:3, :3]))
        if not np.isfinite(target_det) or abs(target_det) < 1e-6:
            raise IncompatibleAffineException(
                message=f"Sequence '{seq_key}' has a singular or degenerate spatial affine matrix (determinant: {target_det:.6e}).",
                detail={"sequence": seq_key, "determinant": target_det},
            )

        if seq_key == ref_seq:
            continue

        target_spacings = nib.affines.voxel_sizes(target_affine)[:3]

        # Voxel spacing check within tolerance
        if not np.allclose(ref_spacings, target_spacings, atol=SPACING_ATOL):
            raise IncompatibleAffineException(
                message=f"Voxel spacing mismatch between reference '{ref_seq}' ({list(ref_spacings)}) and '{seq_key}' ({list(target_spacings)}). Difference exceeds tolerance ({SPACING_ATOL} mm).",
                detail={
                    f"{ref_seq}_spacing": [float(x) for x in ref_spacings],
                    f"{seq_key}_spacing": [float(x) for x in target_spacings],
                    "tolerance_mm": SPACING_ATOL,
                },
            )

        # Rotation/orientation matrix check within tolerance
        if not np.allclose(ref_affine[:3, :3], target_affine[:3, :3], atol=AFFINE_ROTATION_ATOL):
            raise IncompatibleAffineException(
                message=f"Spatial orientation / rotation matrix of '{seq_key}' diverges from reference '{ref_seq}'. Scans must be co-registered.",
                detail={
                    "reference": ref_seq,
                    "target": seq_key,
                    "tolerance": AFFINE_ROTATION_ATOL,
                },
            )

        # Translation / origin check within tolerance
        if not np.allclose(ref_affine[:3, 3], target_affine[:3, 3], atol=AFFINE_TRANSLATION_ATOL):
            raise IncompatibleAffineException(
                message=f"Spatial origin translation of '{seq_key}' diverges from reference '{ref_seq}'. Difference exceeds tolerance ({AFFINE_TRANSLATION_ATOL} mm).",
                detail={
                    f"{ref_seq}_origin": [float(x) for x in ref_affine[:3, 3]],
                    f"{seq_key}_origin": [float(x) for x in target_affine[:3, 3]],
                    "tolerance_mm": AFFINE_TRANSLATION_ATOL,
                },
            )

    # 7. Validate voxel values (finite voxels & non-constant scans)
    metadata_map: Dict[str, SequenceMetadata] = {}

    for seq_key, img in loaded_images.items():
        data = np.asanyarray(img.dataobj, dtype=np.float32)

        # Finite check
        if not np.all(np.isfinite(data)):
            nan_count = int(np.isnan(data).sum())
            inf_count = int(np.isinf(data).sum())
            raise NonfiniteVoxelsException(
                sequence_name=seq_key,
                nan_count=nan_count,
                inf_count=inf_count,
            )

        # Blank / zero variance check
        data_min = float(np.min(data))
        data_max = float(np.max(data))
        data_std = float(np.std(data))

        if (data_max - data_min) < MIN_INTENSITY_RANGE or data_std == 0.0:
            raise EmptyScanException(sequence_name=seq_key)

        seq_geom = extract_geometry(img)
        metadata_map[seq_key] = SequenceMetadata(
            sequence_id=seq_key,
            dimensions=seq_geom.dimensions,
            voxel_spacing_mm=seq_geom.voxel_spacing_mm,
            orientation=seq_geom.orientation,
            is_finite=True,
            intensity_range=(data_min, data_max),
        )

    # 8. Extract reference geometry metadata
    geometry = extract_geometry(loaded_images[ref_seq])

    return ValidationResult(
        is_valid=True,
        sequences=loaded_images,
        geometry=geometry,
        reference_affine=ref_affine,
        sequence_metadata=metadata_map,
    )
