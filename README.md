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
   - Classical anatomical views rail displaying superior, lateral, and ventral orientations.
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
| **Top Navigation** | **Implemented & Verified** | Engraved brain icon, editorial wordmark, active `Home` and `3D Workstation` view switcher, and `Research Preview` badge. |
| **Hero Copy & Editorial Typography** | **Implemented & Verified** | Cormorant Garamond serif headline, Plus Jakarta Sans body copy, 4 modality chips, and direct actions to explore scans or open the 3D Workstation. |
| **Annotated 2D Brain Illustration** | **Implemented & Verified** | Classical anatomy atlas engraving on `#E9DDD5` with SVG leader lines, hover-responsive pins, and educational functional labels. |
| **Anatomical Views Rail** | **Implemented & Verified** | Superior, lateral, and ventral reference thumbnails. |
| **4-Sequence MRI Upload Workspace** | **Implemented & Verified** | Light cream upload cards with real axial MRI thumbnails, format validation, duplicate file detection, live upload progress bar (0–100%), and honest backend error handling. |
| **Client API & Validation Service** | **Implemented & Verified** | `api.js` client with pre-flight checks, duplicate sequence detection, XHR upload progress tracking, and automated unit test suite (`npm test`). |
| **3D & 2D Clinical Workstation** | **Implemented & Verified** | Linked 2D Multi-Planar Reconstruction (MPR) canvas, BraTS 2021 segmentations (NETC, ED, ET), Three.js 3D rotating tumor mesh, physical volumetrics (mL), and diagnostic report. |
| **Local Privacy Guarantee** | **Active** | Files remain strictly inside browser memory; zero cloud uploads or third-party tracking. |
| **Python FastAPI Backend** | **Foundation Active** | FastAPI backend with CORS middleware for Vite (port 5173), `/api/v1/health` probe, and Python 3.11 medical ML dependencies (`backend/requirements.txt`). |

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

### Unit Tests
```bash
cd frontend
npm test
```

### Production Build
```bash
npm run build
```

---

## 4. Repository Structure

```text
NeuroScope-3D/
├── package.json             # Root monorepo script runner (npm run dev/build)
├── .gitignore               # Strict exclusion of scans, checkpoints, and secrets
├── README.md                # Main project entry point (this file)
├── AGENTS.md                # Persistent AI pairing instructions & architectural invariants
├── backend/                 # FastAPI Python 3.11 Backend
│   ├── __init__.py
│   ├── main.py              # FastAPI app with CORS & /api/v1/health probe
│   └── requirements.txt     # Python 3.11 pinned dependencies (MONAI, Torch CUDA 12, NiBabel)
├── docs/
│   ├── PROJECT_CONTEXT.md   # Hackathon rules, BraTS 2021 labels, judging metrics
│   ├── ARCHITECTURE.md      # Data pipeline, component responsibilities, API schema
│   ├── UI_DESIGN_RULES.md   # Design tokens (Warm Blush & Oxblood), typography, rules
│   ├── TEAM_WORKFLOW.md     # Branch naming, PR rules, merge conflict prevention
│   ├── DECISIONS.md         # Architecture Decision Records (ADRs)
│   ├── ONBOARDING.md        # Step-by-step setup guide for team members (Ayaz & Samir)
│   └── TASK_BOARD.md        # Prioritized task backlog (P0 to P3)
└── frontend/                # React 19 + Vite 8 + Tailwind CSS UI
    ├── src/
    │   ├── assets/
    │   │   └── atlas/       # 2D brain atlas illustration, rail, and MRI slice thumbnails
    │   ├── components/
    │   │   ├── Navbar.jsx   # Editorial header with Home / 3D Workstation switcher
    │   │   ├── Hero.jsx     # World A: Warm Blush hero with editorial copy & sidebar
    │   │   ├── AnnotatedBrain.jsx # 2D brain illustration with interactive SVG callouts
    │   │   ├── MriWorkspace.jsx   # World B: Oxblood MRI upload cards & live pipeline
    │   │   ├── WorkstationPage.jsx # Clinical 2D MPR + 3D Mesh + Volumetrics + Report
    │   │   └── UploadModal.jsx    # Standalone ingestion modal with progress tracking
    │   ├── services/
    │   │   └── api.js       # Client API: NIfTI validation, progress, predict endpoint
    │   ├── App.jsx          # Multi-page router connecting Landing and Workstation
    │   ├── index.css        # Palette tokens, typography, and subtle float animation
    │   └── main.jsx         # Application entry
    ├── test/
    │   └── api.test.js      # Unit tests for NIfTI validation and pre-flight guards
    ├── vite.config.js       # Vite configuration with @tailwindcss/vite
    └── package.json         # Lightweight frontend dependencies
```
