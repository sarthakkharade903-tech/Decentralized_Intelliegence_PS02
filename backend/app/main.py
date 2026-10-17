"""NeuroScope-3D / NeuroVault FastAPI Application.

Implements the clinical research segmentation API contract:
- docs/ARCHITECTURE.md §3 (API Contract Schema)
- docs/PROJECT_CONTEXT.md (Research & Educational Prototype Guardrails)
- docs/UI_DESIGN_RULES.md (Integration with React frontend)
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, Optional

import torch
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.exceptions import ModelNotReadyException, NeuroScopeException
from backend.app.services.artifacts import (
    DEFAULT_ARTIFACTS_DIR,
    RESEARCH_DISCLAIMER,
    get_artifact_path,
    save_prediction_artifacts,
)
from backend.app.services.inference import (
    DEFAULT_WEIGHTS_PATH,
    InferenceResult,
    get_model_readiness,
    run_segmentation_inference,
)
from backend.app.services.validator import validate_mpmri_sequences


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context for resource verification."""
    # Ensure artifacts directory exists
    DEFAULT_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    # Warm up and verify trained model weights in memory on startup
    try:
        readiness = get_model_readiness()
        if readiness["model_ready"]:
            sha = readiness.get("checkpoint_sha256") or ""
            print(f"NeuroScope-3D: Verified model ready in memory (SHA256: {sha[:16]}...)")
        else:
            print(f"NeuroScope-3D WARNING: Model not ready: {readiness.get('error') or 'Weights missing'}")
    except Exception as e:
        print(f"NeuroScope-3D WARNING: Startup model verification failed: {e}")
    yield


app = FastAPI(
    title="NeuroScope-3D Segmentation API",
    description="Multi-parametric MRI 3D Brain Tumor Segmentation using MONAI SegResNet",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS Middleware Configuration ───────────────────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Exception Handlers (RFC 7807) ───────────────────────────────────────────

@app.exception_handler(NeuroScopeException)
async def handle_neuroscope_exception(request: Request, exc: NeuroScopeException) -> JSONResponse:
    """Handles all structured NeuroScope domain and validation errors."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict(),
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Maps Starlette/FastAPI request validation errors to the RFC 7807 contract."""
    errors = exc.errors()
    missing_fields = [
        str(err["loc"][-1]) for err in errors if err.get("type") == "missing"
    ]
    is_missing_sequence = any(f in ["t1", "t1gd", "t2", "flair"] for f in missing_fields)

    error_code = "MISSING_SEQUENCE" if is_missing_sequence else "INVALID_REQUEST_PARAMETERS"
    message = (
        f"Missing required sequence(s): {', '.join(missing_fields)}"
        if is_missing_sequence
        else "Request validation failed."
    )

    return JSONResponse(
        status_code=400,
        content={
            "error": error_code,
            "message": message,
            "detail": {"missing": missing_fields, "errors": errors},
        },
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Ensures framework HTTP exceptions conform to RFC 7807 error shape."""
    error_code = "RESOURCE_NOT_FOUND" if exc.status_code == 404 else f"HTTP_{exc.status_code}"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": error_code,
            "message": exc.detail if isinstance(exc.detail, str) else "HTTP error encountered.",
            "detail": {"status_code": exc.status_code},
        },
    )


@app.exception_handler(Exception)
async def handle_generic_exception(request: Request, exc: Exception) -> JSONResponse:
    """Fallback handler for uncaught server errors returning RFC 7807 format."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected server error occurred during processing.",
            "detail": {"exception_type": type(exc).__name__, "message": str(exc)},
        },
    )


# ─── Health Check Endpoints ──────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
async def health_check() -> Dict[str, Any]:
    """Health check endpoint reporting API readiness and inference environment."""
    readiness = get_model_readiness()

    return {
        "status": "healthy" if readiness["model_ready"] else "degraded",
        "service": "NeuroScope-3D API",
        "version": "1.0.0",
        "hardware_device": readiness["hardware_device"],
        "model_ready": readiness["model_ready"],
        "model_weights_present": readiness["weights_present"],
        "weights_present": readiness["weights_present"],
        "checkpoint_path": readiness["checkpoint_path"],
        "checkpoint_sha256": readiness["checkpoint_sha256"],
        "disclaimer": RESEARCH_DISCLAIMER,
    }


# ─── Dataset Validation Endpoint ──────────────────────────────────────────────

@app.post("/api/v1/segment/validate", tags=["Validation"])
@app.post("/api/v1/validate", tags=["Validation"])
async def validate_mri_dataset(
    t1: UploadFile = File(..., description="T1 Native MRI scan (.nii or .nii.gz)"),
    t1gd: UploadFile = File(..., description="T1-Gd Contrast MRI scan (.nii or .nii.gz)"),
    t2: UploadFile = File(..., description="T2-Weighted MRI scan (.nii or .nii.gz)"),
    flair: UploadFile = File(..., description="FLAIR MRI scan (.nii or .nii.gz)"),
    patient_id: str = Form("ANONYMOUS", description="Optional patient or case identifier"),
) -> Dict[str, Any]:
    """Authoritative NIfTI dataset validation endpoint.

    Validates that:
    - Exactly 4 supported NIfTI sequences (.nii or .nii.gz) are provided
    - File sizes are within the 1 GiB limit
    - Scans are strictly 3D spatial volumes (2D/4D rejected)
    - Voxel values are finite (no NaN or Inf)
    - Volumes are non-constant and non-zero
    - Affine matrices are non-singular, finite, and co-registered within tolerances
    """
    raw_uploads = {"t1": t1, "t1gd": t1gd, "t2": t2, "flair": flair}
    validation_result = await run_in_threadpool(validate_mpmri_sequences, raw_uploads)
    res_dict = validation_result.to_dict()
    res_dict["patient_id"] = patient_id
    res_dict["disclaimer"] = RESEARCH_DISCLAIMER
    return res_dict


# ─── Inference Prediction Endpoint ────────────────────────────────────────────

@app.post("/api/v1/segment/predict", tags=["Segmentation"])
async def predict_segmentation(
    t1: UploadFile = File(..., description="T1 Native MRI scan (.nii or .nii.gz)"),
    t1gd: UploadFile = File(..., description="T1-Gd Contrast MRI scan (.nii or .nii.gz)"),
    t2: UploadFile = File(..., description="T2-Weighted MRI scan (.nii or .nii.gz)"),
    flair: UploadFile = File(..., description="FLAIR MRI scan (.nii or .nii.gz)"),
    patient_id: str = Form("ANONYMOUS", description="Optional patient or case identifier"),
    expert_seg: Optional[UploadFile] = File(None, description="Optional ground-truth mask for evaluation"),
) -> Dict[str, Any]:
    """End-to-end multi-parametric MRI segmentation endpoint.

    Validates 4 co-registered NIfTI modalities, executes MONAI SegResNet 3D
    sliding-window inference, computes clinical tumor volumetrics, exports
    segmentation artifacts, and returns structured results matching the frontend contract.
    """
    raw_uploads = {"t1": t1, "t1gd": t1gd, "t2": t2, "flair": flair}

    # 1. Ingestion and Clinical Invariant Validation
    # UploadFiles are read synchronously within validate_mpmri_sequences
    validation_result = validate_mpmri_sequences(raw_uploads)

    # 2. Strict Model Readiness Check (Fail-Closed)
    readiness = get_model_readiness()
    if not readiness["model_ready"]:
        raise ModelNotReadyException(
            message=(
                "Inference model weights are unavailable or failed verification. "
                "Prediction cannot proceed without verified trained weights."
            ),
            detail={
                "checkpoint_path": readiness["checkpoint_path"],
                "reason": readiness.get("error") or "Weights file missing or unverified",
            },
        )

    # 3. Sliding Window 3D Inference Execution (Offloaded to worker thread)
    inference_result: InferenceResult = await run_in_threadpool(
        run_segmentation_inference,
        sequences=validation_result.sequences,
        weights_path=Path(readiness["checkpoint_path"]),
        allow_untrained=False,
    )

    # 4. Generate and Export Artifacts (.nii.gz mask + .json report)
    artifacts = await run_in_threadpool(
        save_prediction_artifacts,
        result=inference_result,
        patient_id=patient_id,
    )

    # 5. Build Final Response matching frontend/src/services/api.js contract
    vol_dict = inference_result.volumetrics.to_dict()

    return {
        "status": "success",
        "patient_id": patient_id,
        "execution_time_seconds": round(inference_result.execution_time_seconds, 2),
        "hardware_device": inference_result.hardware_device,
        "original_geometry": inference_result.original_geometry.to_dict(),
        "volumes_ml": vol_dict["volumes_ml"],
        "metrics": vol_dict["metrics"],
        "artifacts": {
            "segmentation_mask_url": artifacts["segmentation_mask_url"],
            "report_summary_url": artifacts["report_summary_url"],
        },
        "disclaimer": RESEARCH_DISCLAIMER,
    }


# ─── Artifact Delivery Endpoint ───────────────────────────────────────────────

@app.get("/api/v1/artifacts/{filename:path}", tags=["Artifacts"])
async def get_artifact(filename: str):
    """Delivers generated segmentation mask NIfTI files and JSON reports."""
    file_path, media_type = get_artifact_path(filename)
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename,
    )
