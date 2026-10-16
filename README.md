# NeuroVault: Brain MRI Tumor Segmentation & 3D Interactive Platform

[![Hackathon](https://img.shields.io/badge/Hackathon-Kurukshetra%2024h-blueviolet)](#)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![Three.js](https://img.shields.io/badge/3D%20Graphics-Three.js%20r183-black.svg)](https://threejs.org/)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%208%20%2B%20Tailwind%20v4-61dafb.svg)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT%20%2F%20Research%20Only-lightgrey)](#)

> **Clinical Decision Support & Visualization Disclaimer**:
> This platform produces **model-predicted candidate tumor regions** intended strictly for research and hackathon demonstration. It is **not** a certified medical diagnostic device and is **not** a replacement for professional radiological evaluation. Never transmit identifiable patient health data.

---

## 1. Problem Statement & Hackathon Context

Developed for the **Kurukshetra Technical Inauguration & 24-Hour Hackathon**, **NeuroVault** addresses the clinical challenge of segmenting and quantifying brain gliomas from multi-parametric magnetic resonance imaging (mpMRI).

Clinicians inspect four distinct MRI modalities to delineate distinct tumor compartments:
- **T1-weighted (T1)**: General anatomical reference.
- **T1-weighted Contrast-Enhanced / Gadolinium (T1Gd)**: Highlights blood-brain barrier breakdown and active, vascularized enhancing tumor margins.
- **T2-weighted (T2)**: Delineates fluid and bulk lesion boundaries.
- **Fluid Attenuated Inversion Recovery (FLAIR)**: Suppresses pure cerebrospinal fluid (CSF) signals to highlight peritumoral vasogenic edema.

NeuroVault provides a cinematic, real-time 3D anatomical visualization of the brain, coupled with local NIfTI ingestion across all 4 sequences, preparing scans for automated 3D deep-learning segmentation via MONAI.

---

## 2. Current Implementation Status

| Component | Status | Details |
| :--- | :--- | :--- |
| **Header** | **Implemented & Verified** | Minimal design with brain outline icon, `NeuroVault` wordmark, and singular active `Home` link with cyan glow. |
| **Hero Copy & Typography** | **Implemented & Verified** | Bold *"Look deeper. See beyond."* headline, concise supporting copy, and 4 modality chips (`T1 Native`, `T1Gd Contrast`, `T2-Weighted`, `FLAIR Edema`). |
| **Real-Time 3D Brain** | **Implemented & Verified** | Interactive Three.js anatomical human brain model (`brain.glb`) with cyan/teal rim lighting, warm amber accents, neural filaments, glowing synapse nodes, particle dust, and smooth pointer tracking. |
| **Framed 3D Brain View** | **Implemented & Verified** | Scientific HUD frame with `3D BRAIN VIEW`, `1.0mm \| ISOTROPIC`, measurement scale ticks, `4 MRI SEQUENCES`, and `RESEARCH PREVIEW`. |
| **4-Sequence Upload Panel** | **Implemented & Verified** | Glassmorphic panel with individual slots for T1, T1Gd, T2, and FLAIR. Strictly client-side `.nii` / `.nii.gz` validation, filename display, replace, and removal. |
| **CTA Smooth-Scroll Interaction** | **Implemented & Verified** | Clicking *"Upload MRI Scan"* smoothly scrolls and highlights the upload panel. |
| **Local Privacy Guarantee** | **Active** | 100% browser-local handling. No cloud APIs, zero patient data leakage. |
| **Python Backend & MONAI** | **Planned (P1)** | FastAPI `/api/v1/segment/predict` with MONAI SegResNet 3D sliding window inference. |

---

## 3. 3D Model Provenance & Licensing

- **Asset Path**: `frontend/public/models/brain.glb`
- **Origin**: Open-source 3D Brain Atlas (`itayinbarr/brainproject`)
- **Underlying Sources**: Anatomically registered meshes derived from **Z-Anatomy contributors** and **BodyParts3D / DBCLS** (Database Center for Life Science, Japan).
- **License**: **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**.
- **Attribution**: Derived from the Z-Anatomy and BodyParts3D neuroanatomical open projects.

---

## 4. Running the Application

### Development Server
```bash
# From project root:
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

## 5. Repository Structure

```text
NeuroScope-3D/
├── package.json             # Root monorepo script runner (npm run dev/build)
├── .gitignore               # Strict exclusion of scans, checkpoints, and secrets
├── README.md                # Main project entry point (this file)
├── AGENTS.md                # Persistent AI pairing instructions & architectural invariants
├── docs/
│   ├── PROJECT_CONTEXT.md   # Hackathon rules, BraTS 2021 labels, judging metrics
│   ├── ARCHITECTURE.md      # Data pipeline, component responsibilities, API schema
│   ├── UI_DESIGN_RULES.md   # Single source of truth for UI, colors, viewports, typography
│   ├── TEAM_WORKFLOW.md     # Branch naming, PR rules, merge conflict prevention
│   ├── DECISIONS.md         # Architecture Decision Records (ADRs)
│   ├── ONBOARDING.md        # Step-by-step setup guide for team members (Ayaz & Samir)
│   └── TASK_BOARD.md        # Prioritized task backlog (P0 to P3)
└── frontend/                # React 19 + Vite 8 + Three.js + Tailwind CSS UI
    ├── public/
    │   ├── draco/           # Draco WASM/JS decoders
    │   └── models/          # Bundled 3D anatomical brain model (brain.glb)
    ├── src/
    │   ├── assets/          # Static fallback renders (brain-hero.jpg)
    │   ├── components/
    │   │   ├── Navbar.jsx   # Minimal header with brain icon, Home link & Upload trigger
    │   │   ├── Hero.jsx     # Two-column hero with framed 3D view and CTA
    │   │   ├── Brain3D.jsx  # Real-time Three.js canvas with filaments & pointer parallax
    │   │   ├── UploadPanel.jsx # 4-sequence NIfTI selection panel with inline validation
    │   │   └── UploadModal.jsx # Full ingestion console with batch drop, progress & volume metrics
    │   ├── services/
    │   │   └── api.js       # Client API service (POST /api/v1/segment/predict) & 1 GiB guard
    │   ├── App.jsx          # Root container with modal orchestration
    │   ├── index.css        # Tailwind v4 import and custom effects
    │   └── main.jsx         # Application entry
    ├── vite.config.js       # Vite configuration with @tailwindcss/vite
    └── package.json         # Dependencies (three, lucide-react, react 19, tailwind v4)
```

---

## 6. Member 1 (Frontend & Viewer) Documentation & API Contract

### Frontend Architecture
* **Framework**: React 19 + Vite 8 + Tailwind CSS v4.
* **3D Graphics**: Three.js (r186) with procedural anatomical brain fallback + Draco-compressed GLTF loader (`/models/brain.glb`).
* **Icons**: Lucide React.
* **Linting**: Oxlint (`npm run lint` targets `src/`, verified 0 errors, 0 warnings).

### Existing Components & Services
1. `Navbar.jsx`: Brand wordmark, active navigation pill, and quick "Upload Sequences" trigger.
2. `Hero.jsx`: Two-column layout pairing editorial copy, visible research disclaimer, 3 core capabilities, and framed 3D interactive viewport.
3. `Brain3D.jsx`: GPU-accelerated WebGL canvas with ACESFilmic tone mapping, rim lighting, 42-node synaptic network, 180 dust particles, continuous levitation, and pointer parallax.
4. `UploadPanel.jsx`: Compact, inline 4-sequence slot selector directly under the hero with client-side format & 1 GiB size validation.
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
  * 3D interactive anatomical brain with procedural fallback and Draco loader.
  * Embedded `UploadPanel` and full `UploadModal` stabilized with 5-stage state machine.
  * `services/api.js` client integrated with 1 GiB guard and AbortController.
  * Zero lint errors, zero warnings (`oxlint src` in 42ms).
  * Fast production build (1.41s).
* **Known Limitations (Pending Phase 2 & Backend)**:
  * Backend server (`uvicorn backend.main:app --reload`) must be running locally to receive uploads; UI presents a clear actionable banner when offline.
  * Multi-planar linked NiiVue viewer (Axial, Coronal, Sagittal) will be wired to real segmentation mask artifacts in Phase 2.

