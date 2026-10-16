# NeuroVault: Brain MRI Anatomical Research & Tumor Segmentation Platform

[![Hackathon](https://img.shields.io/badge/Hackathon-Kurukshetra%2024h-blueviolet)](#)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![MONAI](https://img.shields.io/badge/MONAI-Core%20Medical-darkgreen.svg)](https://monai.io/)
[![Design System](https://img.shields.io/badge/Design-Warm%20Blush%20%26%20Oxblood-8B2646.svg)](#)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%208%20%2B%20Tailwind%20v4-61dafb.svg)](https://vite.dev/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20%2B%20MONAI%20SegResNet-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests](https://img.shields.io/badge/Tests-41%20Backend%20%7C%207%20Frontend%20Passed-brightgreen.svg)](#)
[![License](https://img.shields.io/badge/License-MIT%20%2F%20Research%20Only-lightgrey)](#)

> **Clinical Decision Support & Visualization Disclaimer**:
> This platform produces **model-predicted candidate tumor regions** intended strictly for research and hackathon demonstration. It is **not** a certified medical diagnostic device and is **not** a replacement for professional radiological evaluation. Never transmit identifiable patient health data.

---

## 1. Problem Statement & Design Vision

Developed for the **Kurukshetra Technical Inauguration & 24-Hour Hackathon**, **NeuroVault** addresses the clinical challenge of segmenting and quantifying brain gliomas from multi-parametric magnetic resonance imaging (mpMRI), combining high-level medical AI with an editorial anatomy atlas visual identity.

Clinicians inspect four distinct MRI modalities to delineate distinct tumor compartments:
- **T1-weighted (T1)**: General anatomical reference.
- **T1-weighted Contrast-Enhanced / Gadolinium (T1Gd / T1ce)**: Highlights blood-brain barrier breakdown and active, vascularized enhancing tumor margins.
- **T2-weighted (T2)**: Delineates fluid and bulk lesion boundaries.
- **Fluid Attenuated Inversion Recovery (FLAIR)**: Suppresses pure cerebrospinal fluid (CSF) signals to highlight peritumoral vasogenic edema.

The interface is structured into two deliberate environments:
1. **World A: Warm Blush Anatomy Hero (`#E9DDD5`)**:
   - Editorial serif typography (*"Look deeper. See beyond."*).
   - Authentic annotated 2D human brain atlas illustration in lateral profile, featuring fine-line callouts for the **Frontal Lobe**, **Parietal Lobe**, **Temporal Lobe**, **Occipital Lobe**, and **Cerebellum**.
   - Classical anatomical views rail displaying superior, lateral, and ventral orientations.
   - Direct call-to-action to explore scans or launch the 3D Workstation.
2. **World B: Oxblood MRI Workspace (`#6D263D`)**:
   - Deep wine-tinted radiological workspace for sequence ingestion.
   - 4 dedicated upload cards for **T1**, **T1Gd**, **T2**, and **FLAIR** featuring real axial brain MRI slice thumbnails.
   - 100% browser-local NIfTI (`.nii`, `.nii.gz`) validation, drag-and-drop, and replacement.
   - Live upload progress bar, pre-flight guards, and honest error handling.

---

## 2. Current Implementation Status

| Component | Status | Details |
| :--- | :--- | :--- |
| **Top Navigation** | **Implemented & Verified** | Engraved brain icon, editorial wordmark, active `Home` and `3D Workstation` view switcher, and `Research Preview` badge. |
| **Hero Copy & Editorial Typography** | **Implemented & Verified** | Cormorant Garamond serif headline, Plus Jakarta Sans body copy, 4 modality chips, and direct actions to explore scans or open the 3D Workstation. |
| **Annotated 2D Brain Illustration** | **Implemented & Verified** | Classical anatomy atlas engraving on `#E9DDD5` with SVG leader lines, hover-responsive pins, and educational functional labels. |
| **Anatomical Views Rail** | **Implemented & Verified** | Superior, lateral, and ventral reference thumbnails. |
| **4-Sequence MRI Upload Workspace** | **Implemented & Verified** | Light cream upload cards with real axial MRI thumbnails, format validation, duplicate file detection, live upload progress bar (0–100%), and honest backend error handling. |
| **Client API & Validation Service** | **Implemented & Verified** | `frontend/src/services/api.js` client with pre-flight checks, duplicate sequence detection, XHR upload progress tracking, and automated unit test suite (`npm test`). |
| **3D & 2D Clinical Workstation** | **Implemented & Verified** | Linked 2D Multi-Planar Reconstruction (MPR) canvas, BraTS 2021 segmentations (NETC, ED, ET), Three.js 3D rotating tumor mesh, physical volumetrics (mL), and diagnostic report. |
| **NIfTI MRI Ingestion & Validation** | **Implemented & Verified** | Backend validator (`backend/app/services/validator.py`) enforcing 1 GiB limits, 3D shape matching, affine registration, finite voxel values, and non-blank scans. |
| **MONAI SegResNet Inference Engine** | **Implemented & Verified** | Pretrained MONAI Model Zoo SegResNet (`backend/app/services/inference.py`) with verified input channel order `[T1Gd, T1, T2, FLAIR]`, non-zero z-score normalization, and sliding-window inference. |
| **BraTS Label Post-Processing** | **Implemented & Verified** | Sigmoid thresholding and nested class decomposition (`backend/app/services/postprocessing.py`) producing discrete BraTS 2021 labels (0, 1, 2, 4). |
| **Physical Volumetric Calculations** | **Implemented & Verified** | Volume computation in mL ($\text{cm}^3$) for Whole Tumor (WT), Tumor Core (TC), Enhancing Tumor (ET), Edema (ED), and Necrotic Core (NETC) (`backend/app/services/volumetrics.py`). |
| **Artifact Generation & Delivery** | **Implemented & Verified** | Exports reference-aligned `.nii.gz` discrete masks and structured `.json` clinical summary reports with path-traversal security (`backend/app/services/artifacts.py`). |
| **FastAPI Backend Server** | **Implemented & Verified** | Asynchronous FastAPI app (`backend/app/main.py`) matching the frontend API contract with CORS, health checks, RFC 7807 error envelopes, and 41 automated tests. |
| **Local Privacy Guarantee** | **Active** | 100% local processing. No external cloud inference APIs, zero patient data transmission. |

---

## 3. Python Backend & AI Inference Pipeline

The backend is built with **Python 3.11**, **FastAPI**, **PyTorch**, and **MONAI**. It implements end-to-end multi-parametric MRI segmentation according to the BraTS 2021 benchmark specifications.

### A. Four Required MRI Input Modalities
The segmentation engine requires four co-registered 3D MRI sequences uploaded via multipart form data:
1. `t1gd`: T1-weighted contrast-enhanced / gadolinium (Channel 0)
2. `t1`: T1-weighted native baseline (Channel 1)
3. `t2`: T2-weighted structural (Channel 2)
4. `flair`: Fluid Attenuated Inversion Recovery (Channel 3)

**Validation Invariants Enforced**:
- Max file size: 1 GiB per sequence.
- File formats: Uncompressed `.nii` and compressed `.nii.gz`.
- Spatial grid: All four sequences must share identical 3D matrix dimensions.
- Spatial geometry: Affine rotation/scaling matrix within 0.01 tolerance; spatial origin translation within 0.5 mm tolerance; voxel spacing within 0.01 mm tolerance.
- Data integrity: Rejects scans containing `NaN` or `Inf` voxel values, or flat/blank scans with zero variance.

### B. MONAI SegResNet Architecture & Sliding Window Inference
- **Model Architecture**: MONAI `SegResNet` (`spatial_dims=3, init_filters=16, in_channels=4, out_channels=3, blocks_down=[1,2,2,4], blocks_up=[1,1,1], dropout_prob=0.2`).
- **Pretrained Weights**: Official MONAI Model Zoo BraTS bundle (`model.pt`, SHA-256/MD5 verified: `870e677b782a5184cbc48db1456b78e8`, Apache 2.0 license).
- **Preprocessing**: Channel-wise intensity z-score normalization on non-zero brain voxels.
- **Inference Mode**: `sliding_window_inference` with `roi_size=(128, 128, 128)`, `sw_batch_size=1`, `overlap=0.5`, `mode="gaussian"`. Automatic CPU execution with CUDA support when an NVIDIA GPU is available.

### C. Output Channels & BraTS 2021 Label Mapping
The model predicts three overlapping sigmoid channels:
- Channel 0: **Tumor Core (TC)**
- Channel 1: **Whole Tumor (WT)**
- Channel 2: **Enhancing Tumor (ET)**

These are mapped to standard discrete BraTS 2021 voxel labels via hierarchical thresholding:
- `0`: **Background** (healthy brain tissue & air)
- `1`: **Necrotic and Non-Enhancing Tumor Core (NETC)**
- `2`: **Peritumoral Edema (ED)**
- `4`: **Enhancing Tumor (ET)** *(Note: Label 3 is deprecated/unused in BraTS 2021)*

### D. Physical Volumetrics Calculation
Volumes are calculated directly from voxel counts and original physical voxel spacings:
$$\text{Volume (mL)} = \frac{\text{Voxel Count} \times (s_x \times s_y \times s_z)}{1000}$$

Reported biological compartments:
- **Whole Tumor (WT)**: $\text{NETC} (1) + \text{ED} (2) + \text{ET} (4)$
- **Tumor Core (TC)**: $\text{NETC} (1) + \text{ET} (4)$
- **Enhancing Tumor (ET)**: $\text{ET} (4)$
- **Peritumoral Edema (ED)**: $\text{ED} (2)$
- **Necrotic Core (NETC)**: $\text{NETC} (1)$

### E. Implemented API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` or `/api/v1/health` | Service health status, hardware device, model weight availability, and disclaimer. |
| `POST` | `/api/v1/segment/predict` | Multipart upload of `t1`, `t1gd`, `t2`, `flair`, and optional `patient_id` / `expert_seg`. Returns volumetrics, geometry, execution timing, and artifact URLs. |
| `GET` | `/api/v1/artifacts/{filename}` | Serves exported `.nii.gz` masks (`application/gzip`) and `.json` reports (`application/json`) with path-traversal protection. |

**Success Response Format**:
```json
{
  "status": "success",
  "patient_id": "PATIENT_001",
  "execution_time_seconds": 12.45,
  "hardware_device": "CPU (12-core)",
  "original_geometry": {
    "dimensions": [240, 240, 155],
    "voxel_spacing_mm": [1.0, 1.0, 1.0],
    "orientation": "RAS"
  },
  "volumes_ml": {
    "whole_tumor": 42.15,
    "tumor_core": 18.30,
    "enhancing_tumor": 11.20,
    "edema": 23.85,
    "necrotic_core": 7.10
  },
  "metrics": {
    "voxel_counts": {
      "wt_voxels": 42150,
      "tc_voxels": 18300,
      "et_voxels": 11200,
      "ed_voxels": 23850,
      "netc_voxels": 7100
    },
    "voxel_volume_mm3": 1.0
  },
  "artifacts": {
    "segmentation_mask_url": "/api/v1/artifacts/PATIENT_001_20261016_120000_a1b2c3d4_seg.nii.gz",
    "report_summary_url": "/api/v1/artifacts/PATIENT_001_20261016_120000_a1b2c3d4_report.json"
  },
  "disclaimer": "AI-predicted candidate tumor regions for research and educational purposes only. Not a clinical diagnostic device."
}
```

---

## 4. Running the Application

### A. Python Backend Setup & Execution

#### 1. Virtual Environment & Dependencies
```bash
# Create Python 3.11 virtual environment (do not use Python 3.14 on Windows)
py -3.11 -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# Windows (Command Prompt):
.\.venv\Scripts\activate.bat
# Linux / macOS:
source .venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
```

#### 2. Start the FastAPI Server
```bash
uvicorn backend.app.main:app --port 8000 --reload
```
- API Base URL: **`http://localhost:8000`**
- Interactive Swagger UI: **`http://localhost:8000/docs`**
- Alternative ReDoc: **`http://localhost:8000/redoc`**
- Health Check: **`http://localhost:8000/api/v1/health`**

#### 3. Run Backend Test Suite
```bash
python -m pytest backend/tests -v
```
All **41 automated tests** cover API routes, CORS headers, error mappings, NIfTI validation edge cases, SegResNet inference mechanics, postprocessing thresholds, physical volumetrics, and artifact path security.

### B. Frontend Setup & Execution

```bash
# From workspace root:
npm run dev

# Or from frontend/ directory:
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173/`** in your browser.

#### Run Frontend Tests & Build Verification
```bash
# Frontend Unit Tests (NIfTI & API Contracts)
cd frontend
npm test

# Production Build Verification
npm run build
```

---

## 5. Implementation Status & Verification Notes

- **Implemented & Verified (41 Backend + 7 Frontend Tests Passing)**:
  - Strict 4-sequence NIfTI ingestion with 1 GiB safety limit and affine tolerance checks.
  - MONAI SegResNet sliding-window inference pipeline with CPU fallback.
  - Discrete BraTS 2021 label decomposition into physical volumes (mL).
  - FastAPI server with CORS, RFC 7807 error envelopes, and path-traversal-protected artifact downloads.
  - Official model weights (`backend/models/model.pt`, MD5 verified).
  - Warm Blush anatomy landing page and full 3D/2D MPR multi-sequence Workstation.
- **Unverified / Research Note**:
  - The automated test suites verify end-to-end software pipeline mechanics using synthetic volumes.
  - Actual tumor segmentation quality must be evaluated on real, de-identified BraTS clinical benchmark cases prior to any research presentation.

---

## 6. Repository Structure

```text
NeuroScope-3D/
├── package.json                   # Monorepo script runner (npm run dev/build)
├── .gitignore                     # Exclusion of scans (*.nii*), weights (*.pt), .venv, outputs/
├── README.md                      # Project documentation (this file)
├── AGENTS.md                      # Persistent AI pairing instructions & architectural invariants
├── pytest.ini                     # Pytest configuration (pythonpath = .)
├── backend/                       # Python 3.11 + FastAPI + MONAI AI backend
│   ├── main.py                    # Re-exports backend application entry point
│   ├── requirements.txt           # Pinned dependencies (torch CPU, monai, fastapi, nibabel)
│   ├── models/                    # Model weights directory (model.pt gitignored)
│   ├── app/
│   │   ├── main.py                # FastAPI app, CORS, routes, RFC 7807 error handlers
│   │   ├── exceptions.py          # Domain exception hierarchy (RFC 7807)
│   │   └── services/
│   │       ├── validator.py       # 4-sequence NIfTI ingestion & geometry validation
│   │       ├── inference.py       # MONAI SegResNet sliding-window inference engine
│   │       ├── postprocessing.py  # Sigmoid thresholding & BraTS label hierarchy
│   │       ├── volumetrics.py     # Physical volume decomposition (WT, TC, ET in mL)
│   │       └── artifacts.py       # .nii.gz mask & .json report export and delivery
│   └── tests/                     # 41 unit and integration tests
│       ├── test_validator.py      # Validation rules, affine tolerances, file-size limits
│       ├── test_inference.py      # Model building, channel ordering, sliding window
│       ├── test_postprocessing.py # Sigmoid stability, channel-to-label mapping
│       ├── test_volumetrics.py    # Voxel counting and mL volume math
│       └── test_api.py            # FastAPI endpoints, CORS, errors, artifact downloads
├── docs/                          # Architectural and project documentation
│   ├── PROJECT_CONTEXT.md         # BraTS labels, physical volume formulas, rules
│   ├── ARCHITECTURE.md            # Data pipeline, component contracts, API schema
│   ├── UI_DESIGN_RULES.md         # Design tokens (Warm Blush & Oxblood), typography, rules
│   ├── TEAM_WORKFLOW.md           # Git branches, commit style, collaboration rules
│   ├── DECISIONS.md               # Architecture Decision Records (ADRs)
│   ├── ONBOARDING.md              # Team onboarding guide
│   └── TASK_BOARD.md              # Prioritized task backlog
└── frontend/                      # React 19 + Vite 8 + Three.js + Tailwind CSS UI
    ├── public/                    # Brain atlas and 3D models
    ├── src/
    │   ├── assets/atlas/          # 2D brain atlas illustration, rail, and MRI slice thumbnails
    │   ├── components/
    │   │   ├── Navbar.jsx         # Editorial header with Home / 3D Workstation switcher
    │   │   ├── Hero.jsx           # World A: Warm Blush hero with editorial copy & sidebar
    │   │   ├── AnnotatedBrain.jsx # 2D brain illustration with interactive SVG callouts
    │   │   ├── MriWorkspace.jsx   # World B: Oxblood MRI upload cards & live pipeline
    │   │   ├── WorkstationPage.jsx # Clinical 2D MPR + 3D Mesh + Volumetrics + Report
    │   │   └── UploadModal.jsx    # Standalone ingestion modal with progress tracking
    │   ├── services/api.js        # Client API: NIfTI validation, progress, predict endpoint
    │   ├── App.jsx                # Multi-page router connecting Landing and Workstation
    │   ├── index.css              # Palette tokens, typography, and subtle float animation
    │   └── main.jsx               # Application entry
    ├── test/
    │   └── api.test.js            # Unit tests for NIfTI validation and pre-flight guards
    ├── vite.config.js             # Vite configuration with @tailwindcss/vite
    └── package.json               # Frontend dependencies
```
