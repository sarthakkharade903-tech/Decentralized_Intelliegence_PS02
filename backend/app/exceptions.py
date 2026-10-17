"""RFC 7807-compliant structured exceptions for the NeuroScope-3D API.

Contract defined in docs/ARCHITECTURE.md §3 and consumed by
frontend/src/services/api.js (lines 109-116).
"""

from typing import Any, Dict, Optional


class NeuroScopeException(Exception):
    """Base exception for all NeuroScope-3D backend domain errors."""

    def __init__(
        self,
        error: str,
        message: str,
        detail: Optional[Dict[str, Any]] = None,
        status_code: int = 400,
    ) -> None:
        super().__init__(message)
        self.error = error
        self.message = message
        self.detail = detail or {}
        self.status_code = status_code

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to RFC 7807-compatible error response payload."""
        return {
            "error": self.error,
            "message": self.message,
            "detail": self.detail,
        }


class ValidationException(NeuroScopeException):
    """Raised when an incoming MRI sequence fails validation rules."""

    def __init__(
        self,
        error: str,
        message: str,
        detail: Optional[Dict[str, Any]] = None,
        status_code: int = 400,
    ) -> None:
        super().__init__(
            error=error,
            message=message,
            detail=detail,
            status_code=status_code,
        )


class FileSizeExceededException(ValidationException):
    """Raised when an uploaded file exceeds the 1 GiB limit."""

    def __init__(
        self,
        filename: str,
        size_bytes: int,
        max_bytes: int = 1024 * 1024 * 1024,
    ) -> None:
        super().__init__(
            error="FILE_SIZE_EXCEEDED",
            message=f"File '{filename}' exceeds maximum allowed size of {max_bytes / (1024**3):.1f} GiB.",
            detail={
                "filename": filename,
                "size_bytes": size_bytes,
                "max_allowed_bytes": max_bytes,
            },
            status_code=413,
        )


class IncompatibleDimensionsException(ValidationException):
    """Raised when sequences do not share identical 3D spatial dimensions."""

    def __init__(self, message: str, detail: Dict[str, Any]) -> None:
        super().__init__(
            error="INCOMPATIBLE_SPATIAL_DIMENSIONS",
            message=message,
            detail=detail,
            status_code=400,
        )


class IncompatibleAffineException(ValidationException):
    """Raised when sequences have incompatible coordinate systems or voxel spacing."""

    def __init__(self, message: str, detail: Dict[str, Any]) -> None:
        super().__init__(
            error="INCOMPATIBLE_SPATIAL_AFFINE",
            message=message,
            detail=detail,
            status_code=400,
        )


class CorruptedNiftiException(ValidationException):
    """Raised when a file cannot be parsed as a valid NIfTI-1/2 image."""

    def __init__(self, filename: str, reason: str) -> None:
        super().__init__(
            error="CORRUPTED_NIFTI_FILE",
            message=f"Unable to parse NIfTI image for '{filename}': {reason}",
            detail={"filename": filename, "reason": reason},
            status_code=400,
        )


class NonfiniteVoxelsException(ValidationException):
    """Raised when a sequence contains NaN or Infinite voxel values."""

    def __init__(self, sequence_name: str, nan_count: int, inf_count: int) -> None:
        super().__init__(
            error="NONFINITE_VOXEL_VALUES",
            message=f"Sequence '{sequence_name}' contains non-finite voxels (NaN: {nan_count}, Inf: {inf_count}).",
            detail={
                "sequence": sequence_name,
                "nan_count": nan_count,
                "inf_count": inf_count,
            },
            status_code=422,
        )


class EmptyScanException(ValidationException):
    """Raised when a scan contains all zeros or zero variance."""

    def __init__(self, sequence_name: str) -> None:
        super().__init__(
            error="EMPTY_SCAN_DATA",
            message=f"Sequence '{sequence_name}' contains only zeros or constant intensity.",
            detail={"sequence": sequence_name},
            status_code=422,
        )
