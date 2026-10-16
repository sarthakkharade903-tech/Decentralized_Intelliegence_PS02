# NeuroVault: Brain MRI Anatomical Research & Tumor Segmentation Platform

[![Hackathon](https://img.shields.io/badge/Hackathon-Kurukshetra%2024h-blueviolet)](#)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![MONAI](https://img.shields.io/badge/MONAI-Core%20Medical-darkgreen.svg)](https://monai.io/)
[![Design System](https://img.shields.io/badge/Design-Warm%20Blush%20%26%20Oxblood-8B2646.svg)](#)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%208%20%2B%20Tailwind%20v4-61dafb.svg)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT%20%2F%20Research%20Only-lightgrey)](#)

> **Clinical Decision Support & Visualization Disclaimer**:
> This platform produces **model-predicted candidate tumor regions** intended strictly for research and hackathon demonstration. It is **not** a certified medical diagnostic device and is **not** a replacement for professional radiological evaluation. Never transmit identifiable patient health data.

---

## 1. Problem Statement & Design Vision

Developed for the **Kurukshetra Technical Inauguration & 24-Hour Hackathon**, **NeuroVault** combines high-level medical-imaging machine learning with an editorial anatomy atlas visual identity.

The interface is structured into two distinct, deliberate environments:
1. **World A: Warm Blush Anatomy Hero (`#E9DDD5`)**:
   - Editorial serif typography (*"Look deeper. See beyond."*).
   - Authentic annotated 2D human brain atlas illustration in lateral profile, featuring fine-line callouts for the **Frontal Lobe**, **Parietal Lobe**, **Temporal Lobe**, **Occipital Lobe**, and **Cerebellum**.
   - Classical anatomical views rail displaying superior, lateral, and ventral orientations with auto-cycling.
   - Primary call-to-action that smoothly transitions to the workspace.
2. **World B: Oxblood MRI Workspace (`#6D263D`)**:
   - Deep wine-tinted radiological workspace for sequence ingestion.
   - 4 dedicated upload cards for **T1**, **T1Gd**, **T2**, and **FLAIR** featuring real axial brain MRI slice thumbnails.
   - 100% browser-local NIfTI (`.nii`, `.nii.gz`) validation, drag-and-drop, and replacement.
   - Clear workflow step tracker (`Upload Scans` $\rightarrow$ `Process` $\rightarrow$ `View Results` $\rightarrow$ `Explore & Analyze`).

---

## 2. Current Implementation Status

| Component | Status | Details |
| :--- | :--- | :--- |
| **Top Navigation** | **Implemented & Verified** | Engraved brain icon, editorial wordmark, `Home`, `Workstation`, and conditional `Results` tabs, quick upload trigger, and `Research Preview` badge. |
| **Hero Copy & Editorial Typography** | **Implemented & Verified** | Cormorant Garamond serif headline, Plus Jakarta Sans body copy, and 4 modality chips. |
| **Annotated 2D Brain Illustration** | **Implemented & Verified** | Classical anatomy atlas engraving on `#E9DDD5` with SVG leader lines, hover-responsive pins, and educational functional labels. |
| **Anatomical Views Rail** | **Implemented & Verified** | Superior, lateral, and ventral reference thumbnails with auto-cycling and manual inspection. |
| **4-Sequence MRI Upload Workspace** | **Implemented & Verified** | Light cream upload cards with real axial MRI thumbnails, format validation, file size display, replace, and remove. |
| **Local Privacy Guarantee** | **Active** | Files remain strictly inside browser memory; zero cloud uploads or third-party tracking. |
| **Analysis CTA State** | **Active & Honest** | Disabled until all 4 sequences are loaded; triggers inference console and displays explicit notice that 3D inference runs once local FastAPI is connected. |
| **Clinical Workstation & Viewer** | **Implemented & Verified** | Multi-Planar Reconstruction (MPR) linked slice sliders, 3D WebGL mesh inspection, volume quantification, and diagnostic findings report. |
| **Python Backend & MONAI Pipeline** | **Planned (P1)** | FastAPI `/api/v1/segment/predict` with MONAI SegResNet sliding window inference. |

---

## 3. Running the Application

### Development Server
```bash
# From workspace root:
npm run dev

# Or from frontend/ directory:
cd frontend
npm run dev
```
Open **`http://localhost:5173/`** in your browser.

### Production Build & Lint Verification
```bash
cd frontend
npm run lint
npm run build
```

### Automated Unit Testing (NIfTI & API Contracts)
```bash
cd frontend
npm test
```

---

## 4. Repository Structure

```text
NeuroScope-3D/
├── package.json             # Root monorepo script runner (npm run dev/build)
├── .gitignore               # Strict exclusion of scans, checkpoints, and secrets
├── README.md                # Main project entry point (this file)
├── AGENTS.md                # Persistent AI pairing instructions & architectural invariants
├── docs/
│   ├── PROJECT_CONTEXT.md   # Hackathon rules, BraTS 2021 labels, judging metrics
│   ├── ARCHITECTURE.md      # Data pipeline, component responsibilities, API schema
│   ├── UI_DESIGN_RULES.md   # Design tokens (Warm Blush & Oxblood), typography, rules
│   ├── TEAM_WORKFLOW.md     # Branch naming, PR rules, merge conflict prevention
│   ├── DECISIONS.md         # Architecture Decision Records (ADRs)
│   ├── ONBOARDING.md        # Step-by-step setup guide for team members (Ayaz & Samir)
│   └── TASK_BOARD.md        # Prioritized task backlog (P0 to P3)
└── frontend/                # React 19 + Vite 8 + Tailwind CSS UI
    ├── public/
    │   ├── brain_atlas.jpg  # Anatomical illustration asset
    │   ├── draco/           # Draco WASM/JS decoders
    │   └── models/          # Bundled 3D anatomical brain model (brain.glb)
    ├── src/
    │   ├── assets/
    │   │   └── atlas/       # 2D brain atlas illustration, rail, and MRI slice thumbnails
    │   ├── components/
    │   │   ├── Navbar.jsx   # Editorial header with engraved icon, Home & Workstation links
    │   │   ├── Hero.jsx     # World A: Warm Blush hero with editorial copy & anatomical rail
    │   │   ├── AnnotatedBrain.jsx # 2D brain illustration with interactive SVG callouts
    │   │   ├── MriWorkspace.jsx   # World B: Oxblood MRI upload cards & workflow tracker
    │   │   ├── WorkstationPage.jsx # Clinical 2D MPR & 3D mesh review workstation
    │   │   └── UploadModal.jsx # Full ingestion console with batch drop, progress & volume metrics
    │   ├── services/
    │   │   └── api.js       # Client API service (POST /api/v1/segment/predict) & 1 GiB guard
    │   ├── App.jsx          # Root container assembling Hero, Workspace & Workstation
    │   ├── index.css        # Palette tokens, typography, and subtle float animation
    │   └── main.jsx         # Application entry
    ├── vite.config.js       # Vite configuration with @tailwindcss/vite
    └── package.json         # Lightweight frontend dependencies
```

---

## 5. Member 1 (Frontend & Viewer) Documentation & API Contract

### Frontend Architecture
* **Framework**: React 19 + Vite 8 + Tailwind CSS v4.
* **Design Identity**: Warm Blush (`#E9DDD5`) and Oxblood (`#6D263D` / `#542031`).
* **Icons**: Lucide React.
* **Linting**: Oxlint (`npm run lint` targets `src/`, verified 0 errors, 0 warnings).

### Existing Components & Services
1. `Navbar.jsx`: Editorial brand wordmark, active navigation pill, and quick "Upload Sequences" trigger.
2. `Hero.jsx`: Warm Blush landing hero with editorial typography, research disclaimer, 4 sequence chips, and multi-view anatomical switcher.
3. `AnnotatedBrain.jsx`: Classical anatomy atlas engraving with SVG leader lines, hover-responsive pins, and educational functional labels.
4. `MriWorkspace.jsx`: Oxblood radiological sequence ingestion workspace with 4 individual upload cards, axial slice thumbnails, format validation, and workflow tracker.
5. `UploadModal.jsx`: Full ingestion workstation supporting batch drag-and-drop auto-detection, optional 5th slot for BraTS ground truth, state machine progression, volume breakdown cards, and abortable requests.
6. `WorkstationPage.jsx`: Full-featured clinical workstation featuring 4 functional product views:
   * **2D Multi-Planar (MPR)**: Synchronized Axial, Coronal, and Sagittal viewports with BraTS overlays (NETC, ED, ET), modality switcher, slice sliders, and crosshairs.
   * **3D Tumor Surface**: Three.js WebGL 3D world-space surface inspection with orbit controls and region toggles.
   * **Clinical Volumetrics**: Physical volume quantification in mL, infiltration indices (ED/TC ratio), and surgical margin analytics.
   * **Diagnostic Report**: Printable radiological findings report with patient header and volumetric table.
7. `services/api.js`: Standardized HTTP/XHR bridge to Member 2's backend with upload progress callbacks, AbortSignal support, and RFC 7807 error unpacking.

### Upload Flow State Machine
The upload interface enforces 5 distinct, mutually exclusive states:
```
[idle] ──(Select all 4 files)──> [ready] ──(Click Submit)──> [uploading] (0-100% progress)
                                                                   │
                                                                   ▼
[error] ◄──(Network error / 4xx / 5xx)───────────────────── [inferring] (Sliding window 3D)
                                                                   │
                                                                   ▼
                                                            [success] (Volume metrics & mask URL)
```

### API Contract for Member 2 (FastAPI Backend)
* **Endpoint**: `POST /api/v1/segment/predict`
* **Content-Type**: `multipart/form-data`
* **Form Fields**:
  * `t1`: `.nii` / `.nii.gz` file (required, Native T1)
  * `t1gd`: `.nii` / `.nii.gz` file (required, Post-contrast T1, accepts `t1ce` alias)
  * `t2`: `.nii` / `.nii.gz` file (required, T2-weighted)
  * `flair`: `.nii` / `.nii.gz` file (required, FLAIR)
  * `expert_seg`: `.nii` / `.nii.gz` file (optional, BraTS ground truth labels `0, 1, 2, 4`)
  * `patient_id`: string (optional, default `"ANONYMOUS"`)
* **Operational Limits**:
  * Max file size: **1 GiB** ($1,073,741,824$ bytes) per file.
  * Inference timeout: **300 seconds (5 minutes)** for 3D sliding window inference.
  * Duplicate file detection: Blocks assigning the exact same file to multiple sequence slots.
  * Malformed response guard: Enforces complete `volumes_ml` object before accepting successful inference.
* **Success Payload Schema**:
  ```json
  {
    "status": "success",
    "patient_id": "BraTS2021_00001",
    "execution_time_seconds": 4.82,
    "hardware_device": "NVIDIA GeForce RTX 4050 Laptop GPU",
    "original_geometry": {
      "dimensions": [240, 240, 155],
      "voxel_spacing_mm": [1.0, 1.0, 1.0],
      "orientation": "RAS"
    },
    "volumes_ml": {
      "whole_tumor": 42.15,
      "tumor_core": 18.30,
      "enhancing_tumor": 9.45,
      "edema": 23.85,
      "necrotic_core": 8.85
    },
    "metrics": {
      "voxel_counts": { "wt_voxels": 42150, "tc_voxels": 18300, "et_voxels": 9450 },
      "dice": { "whole_tumor": 0.912, "tumor_core": 0.884, "enhancing_tumor": 0.845 }
    },
    "artifacts": {
      "segmentation_mask_url": "/api/v1/artifacts/BraTS2021_00001_seg.nii.gz",
      "report_summary_url": "/api/v1/artifacts/BraTS2021_00001_report.json"
    }
  }
  ```
* **Error Response Schema (RFC 7807)**:
  ```json
  {
    "error": "INCOMPATIBLE_SPATIAL_DIMENSIONS",
    "message": "Sequence dimensions do not match. T1 is [240, 240, 155] but T2 is [256, 256, 176].",
    "detail": { "t1_shape": [240, 240, 155], "t2_shape": [256, 256, 176] }
  }
  ```

### Development & Verification Commands
```bash
# Start frontend development server:
npm run dev

# Run oxlint across all source files:
npm run lint

# Build production bundle:
npm run build
```

### Current Status & Known Limitations
* **Completed**:
  * Merged and verified Sarthak's Warm Blush (`#E9DDD5`) & Oxblood (`#6D263D`) editorial design system.
  * Interactive 2D anatomical atlas (`AnnotatedBrain.jsx`) with multi-view orientation rail (`superior`, `lateral`, `ventral`).
  * Dedicated 4-sequence upload workspace (`MriWorkspace.jsx`) with real axial MRI thumbnails and NIfTI client format validation.
  * Embedded `WorkstationPage` with 2D Multi-Planar (MPR) slices, 3D tumor surface mesh inspection, and volumetrics quantification.
  * Complete API service (`services/api.js`) with 1 GiB file guard, duplicate file detection, progress tracking, and RFC 7807 error handling.
  * 12/12 unit tests passing cleanly.
* **Known Limitations (Pending Phase 2 & Backend)**:
  * Backend server (`uvicorn backend.main:app --reload`) must be running locally to receive uploads; UI presents a clear actionable banner when offline.
