"""End-to-End API and Integration Tests for NeuroScope-3D FastAPI Server.

Tests:
- Health check endpoints (/health, /api/v1/health)
- CORS header policies
- Prediction endpoint (/api/v1/segment/predict)
- Structured RFC 7807 error responses
- Artifact export (.nii.gz, .json) and download (/api/v1/artifacts/{filename})
- Path traversal and security protections
"""

import gzip
import io
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import nibabel as nib
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.artifacts import (
    get_artifact_path,
    save_prediction_artifacts,
)
from backend.app.services.inference import InferenceResult
from backend.app.services.validator import OriginalGeometry
from backend.app.services.volumetrics import (
    PhysicalVolumesML,
    VolumetricReport,
    VoxelMetrics,
)

client = TestClient(app)


# ─── Test Helpers ─────────────────────────────────────────────────────────────

def make_dummy_nifti_bytes(shape=(12, 12, 8), fill_value=100.0) -> bytes:
    """Creates a valid compressed NIfTI image in memory as bytes."""
    data = np.full(shape, fill_value, dtype=np.float32)
    # Add minor noise to satisfy non-blank scan rule
    data[0, 0, 0] = 50.0
    affine = np.eye(4, dtype=np.float32)
    img = nib.Nifti1Image(data, affine=affine)

    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        img.to_stream(gz)
    return buf.getvalue()


def create_dummy_inference_result(shape=(12, 12, 8)) -> InferenceResult:
    """Creates a dummy InferenceResult object for mocking inference."""
    mask = np.zeros(shape, dtype=np.int64)
    mask[2:5, 2:5, 2:5] = 2  # Edema
    mask[5:7, 5:7, 3:6] = 1  # Necrotic
    mask[6, 6, 4] = 4        # Enhancing

    return InferenceResult(
        discrete_mask=mask,
        original_geometry=OriginalGeometry(
            dimensions=list(shape),
            voxel_spacing_mm=[1.0, 1.0, 1.0],
            orientation="RAS",
        ),
        volumetrics=VolumetricReport(
            volumes_ml=PhysicalVolumesML(
                whole_tumor=0.035,
                tumor_core=0.009,
                enhancing_tumor=0.001,
                edema=0.026,
                necrotic_core=0.008,
            ),
            voxel_counts=VoxelMetrics(
                wt_voxels=35,
                tc_voxels=9,
                et_voxels=1,
                ed_voxels=26,
                netc_voxels=8,
                total_lesion_voxels=35,
            ),
            voxel_volume_mm3=1.0,
        ),
        execution_time_seconds=0.42,
        hardware_device="CPU (Mocked Test Device)",
        reference_affine=np.eye(4, dtype=np.float32),
    )


# ─── Health Endpoint Tests ────────────────────────────────────────────────────

def test_health_check_endpoints():
    """Verify both /health and /api/v1/health endpoints return 200 with healthy status."""
    for path in ["/health", "/api/v1/health"]:
        response = client.get(path)
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "healthy"
        assert payload["service"] == "NeuroScope-3D API"
        assert "hardware_device" in payload
        assert "model_weights_present" in payload
        assert "disclaimer" in payload


# ─── CORS Middleware Tests ────────────────────────────────────────────────────

def test_cors_headers_present():
    """Verify CORS middleware responds with correct headers for allowed origins."""
    response = client.options(
        "/api/v1/segment/predict",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


# ─── Prediction Endpoint Tests ────────────────────────────────────────────────

def test_predict_endpoint_success():
    """Verify end-to-end multipart form submission and response payload structure."""
    t1_bytes = make_dummy_nifti_bytes()
    t1gd_bytes = make_dummy_nifti_bytes()
    t2_bytes = make_dummy_nifti_bytes()
    flair_bytes = make_dummy_nifti_bytes()

    dummy_result = create_dummy_inference_result()

    with patch("backend.app.main.run_segmentation_inference", return_value=dummy_result):
        files = {
            "t1": ("t1.nii.gz", t1_bytes, "application/gzip"),
            "t1gd": ("t1gd.nii.gz", t1gd_bytes, "application/gzip"),
            "t2": ("t2.nii.gz", t2_bytes, "application/gzip"),
            "flair": ("flair.nii.gz", flair_bytes, "application/gzip"),
        }
        data = {"patient_id": "TEST_PATIENT_001"}

        response = client.post("/api/v1/segment/predict", files=files, data=data)

        assert response.status_code == 200
        payload = response.json()

        # Check top-level contract keys expected by frontend/src/services/api.js
        assert payload["status"] == "success"
        assert payload["patient_id"] == "TEST_PATIENT_001"
        assert payload["execution_time_seconds"] == 0.42
        assert payload["hardware_device"] == "CPU (Mocked Test Device)"

        # Check geometry
        assert payload["original_geometry"]["dimensions"] == [12, 12, 8]
        assert payload["original_geometry"]["voxel_spacing_mm"] == [1.0, 1.0, 1.0]

        # Check volumes in mL
        assert payload["volumes_ml"]["whole_tumor"] == 0.035
        assert payload["volumes_ml"]["tumor_core"] == 0.009
        assert payload["volumes_ml"]["enhancing_tumor"] == 0.001

        # Check artifacts
        assert "artifacts" in payload
        assert "segmentation_mask_url" in payload["artifacts"]
        assert "report_summary_url" in payload["artifacts"]
        assert payload["artifacts"]["segmentation_mask_url"].startswith("/api/v1/artifacts/")
        assert payload["artifacts"]["report_summary_url"].startswith("/api/v1/artifacts/")

        # Verify artifacts can be fetched
        mask_url = payload["artifacts"]["segmentation_mask_url"]
        report_url = payload["artifacts"]["report_summary_url"]

        mask_resp = client.get(mask_url)
        assert mask_resp.status_code == 200
        assert mask_resp.headers["content-type"] in ["application/gzip", "application/x-gzip"]

        report_resp = client.get(report_url)
        assert report_resp.status_code == 200
        report_json = report_resp.json()
        assert report_json["patient_id"] == "TEST_PATIENT_001"
        assert "model_provenance" in report_json


def test_predict_endpoint_missing_sequence():
    """Verify omitting a required sequence returns RFC 7807 MISSING_SEQUENCE error."""
    t1_bytes = make_dummy_nifti_bytes()
    t1gd_bytes = make_dummy_nifti_bytes()
    t2_bytes = make_dummy_nifti_bytes()

    # Omit flair
    files = {
        "t1": ("t1.nii.gz", t1_bytes, "application/gzip"),
        "t1gd": ("t1gd.nii.gz", t1gd_bytes, "application/gzip"),
        "t2": ("t2.nii.gz", t2_bytes, "application/gzip"),
    }

    response = client.post("/api/v1/segment/predict", files=files)
    assert response.status_code == 400
    err = response.json()
    assert err["error"] == "MISSING_SEQUENCE"
    assert "flair" in str(err)


def test_predict_endpoint_corrupted_nifti():
    """Verify providing corrupted non-NIfTI content returns CORRUPTED_NIFTI_FILE."""
    t1_bytes = make_dummy_nifti_bytes()
    corrupt_bytes = b"this is completely invalid nifti content"

    files = {
        "t1": ("t1.nii.gz", t1_bytes, "application/gzip"),
        "t1gd": ("t1gd.nii.gz", corrupt_bytes, "application/gzip"),
        "t2": ("t2.nii.gz", t1_bytes, "application/gzip"),
        "flair": ("flair.nii.gz", t1_bytes, "application/gzip"),
    }

    response = client.post("/api/v1/segment/predict", files=files)
    assert response.status_code == 400
    err = response.json()
    assert err["error"] == "CORRUPTED_NIFTI_FILE"


def test_predict_endpoint_incompatible_dimensions():
    """Verify mismatched sequence grid sizes return INCOMPATIBLE_SPATIAL_DIMENSIONS."""
    t1_bytes = make_dummy_nifti_bytes(shape=(12, 12, 8))
    mismatched_bytes = make_dummy_nifti_bytes(shape=(12, 12, 16))

    files = {
        "t1": ("t1.nii.gz", t1_bytes, "application/gzip"),
        "t1gd": ("t1gd.nii.gz", t1_bytes, "application/gzip"),
        "t2": ("t2.nii.gz", mismatched_bytes, "application/gzip"),
        "flair": ("flair.nii.gz", t1_bytes, "application/gzip"),
    }

    response = client.post("/api/v1/segment/predict", files=files)
    assert response.status_code == 400
    err = response.json()
    assert err["error"] == "INCOMPATIBLE_SPATIAL_DIMENSIONS"


# ─── Artifacts Endpoint Security Tests ────────────────────────────────────────

def test_artifact_not_found():
    """Verify non-existent artifact returns 404 with ARTIFACT_NOT_FOUND."""
    response = client.get("/api/v1/artifacts/nonexistent_file_123.nii.gz")
    assert response.status_code == 404
    err = response.json()
    assert err["error"] == "ARTIFACT_NOT_FOUND"


def test_artifact_path_traversal_blocked():
    """Verify path traversal attempts are rejected with 400."""
    traversal_filenames = [
        "../secret.txt",
        "..\\secret.txt",
        "sub/../../secret.txt",
        "foo*bar.json",
    ]
    for fn in traversal_filenames:
        response = client.get(f"/api/v1/artifacts/{fn}")
        assert response.status_code in [400, 404]
        err = response.json()
        assert "error" in err


# ─── Artifacts Service Unit Tests ─────────────────────────────────────────────

def test_save_prediction_artifacts_creates_files():
    """Verify save_prediction_artifacts writes valid NIfTI and JSON files."""
    dummy_res = create_dummy_inference_result()
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        urls = save_prediction_artifacts(dummy_res, patient_id="PATIENT_XYZ", artifacts_dir=tmp_path)

        mask_file = Path(urls["segmentation_mask_path"])
        report_file = Path(urls["report_summary_path"])

        assert mask_file.exists()
        assert report_file.exists()

        # Load saved NIfTI and verify content
        saved_img = nib.load(str(mask_file))
        assert saved_img.shape == (12, 12, 8)
        assert np.array_equal(np.unique(saved_img.get_fdata()), [0, 1, 2, 4])

        # Load saved JSON report
        with open(report_file, "r") as f:
            data = json.load(f)
        assert data["patient_id"] == "PATIENT_XYZ"
        assert data["volumes_ml"]["whole_tumor"] == 0.035
