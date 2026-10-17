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

from backend.app.exceptions import NeuroScopeException
from backend.app.services.artifacts import (
    DEFAULT_ARTIFACTS_DIR,
    RESEARCH_DISCLAIMER,
    get_artifact_path,
    save_prediction_artifacts,
)
from backend.app.services.inference import (
    DEFAULT_WEIGHTS_PATH,
    InferenceResult,
    run_segmentation_inference,
)
from backend.app.services.validator import validate_mpmri_sequences


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context for resource verification."""
    # Ensure artifacts directory exists
    DEFAULT_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
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
    "http://localhost:5175",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r".*",
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
    device = "cuda" if torch.cuda.is_available() else "cpu"
    weights_path = Path(os.getenv("NEUROSCOPE_WEIGHTS_PATH", str(DEFAULT_WEIGHTS_PATH)))
    weights_available = weights_path.exists()

    return {
        "status": "healthy",
        "service": "NeuroScope-3D API",
        "version": "1.0.0",
        "hardware_device": device,
        "model_weights_present": weights_available,
        "disclaimer": RESEARCH_DISCLAIMER,
    }


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

    # 2. Model Weights Resolution
    configured_weights = os.getenv("NEUROSCOPE_WEIGHTS_PATH")
    weights_path = Path(configured_weights) if configured_weights else DEFAULT_WEIGHTS_PATH
    actual_weights = weights_path if weights_path.exists() else None

    # 3. Sliding Window 3D Inference Execution (Offloaded to worker thread)
    inference_result: InferenceResult = await run_in_threadpool(
        run_segmentation_inference,
        sequences=validation_result.sequences,
        weights_path=actual_weights,
    )

    # 4. Generate and Export Artifacts (.nii.gz mask + .json report + .json 3D mesh)
    ref_scan = validation_result.sequences.get("t1gd") or validation_result.sequences.get("flair")
    artifacts = await run_in_threadpool(
        save_prediction_artifacts,
        result=inference_result,
        patient_id=patient_id,
        reference_scan=ref_scan,
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
            "mesh_url": artifacts.get("mesh_url", ""),
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
