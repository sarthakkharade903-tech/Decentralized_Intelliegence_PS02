# NeuroScope-3D / NeuroVault: Brain MRI Tumor Segmentation & Multi-Planar Viewer

[![Hackathon](https://img.shields.io/badge/Hackathon-Kurukshetra%2024h-blueviolet)](#)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.x%20%7C%20CUDA-ee4c2c.svg)](https://pytorch.org/)
[![MONAI](https://img.shields.io/badge/MONAI-Core%20Medical-darkgreen.svg)](https://monai.io/)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%20%2B%20Tailwind%20v4-61dafb.svg)](https://vite.dev/)
[![License](https://img.shields.io/badge/License-MIT%20%2F%20Research%20Only-lightgrey)](#)

> **Clinical Decision Support & Visualization Disclaimer**:
> This platform produces **model-predicted candidate tumor regions** intended strictly for research and hackathon demonstration. It is **not** a certified medical diagnostic device and is **not** a replacement for professional radiological evaluation. Never transmit identifiable patient health data.

---

## 1. Problem Statement & Hackathon Context

Developed for the **Kurukshetra Technical Inauguration & 24-Hour Hackathon**, **NeuroScope-3D (NeuroVault)** addresses the clinical challenge of segmenting and quantifying brain gliomas from multi-parametric magnetic resonance imaging (mpMRI).

Clinicians inspect four distinct MRI modalities to delineate distinct tumor compartments:
- **T1-weighted (T1)**: General anatomical reference.
- **T1-weighted Contrast-Enhanced / Gadolinium (T1Gd)**: Highlights blood-brain barrier breakdown and active, vascularized enhancing tumor margins.
- **T2-weighted (T2)**: Delineates fluid and bulk lesion boundaries.
- **Fluid Attenuated Inversion Recovery (FLAIR)**: Suppresses pure cerebrospinal fluid (CSF) signals to highlight peritumoral vasogenic edema.

NeuroVault ingests these 4 co-registered NIfTI sequences, prepares them for automated 3D deep-learning segmentation via MONAI, recovers the original spatial affine geometry, calculates physical tumor volumes in millilitres, and presents an interactive multi-planar viewport.

---

## 2. Current Implementation Status

| Component | Status | Details |
| :--- | :--- | :--- |
| **Landing Hero Page** | **Implemented & Verified** | Minimal obsidian aesthetic (`#06080D`), 3D anatomical brain visual with ambient floating & axial scanline laser sweep, typography, and privacy statements. |
| **Sequence Upload Modal** | **Implemented & Verified** | Ingests 4 sequences (T1, T1Gd, T2, FLAIR). Supports `.nii` / `.nii.gz`, single or batch drop auto-assignment, file size display, and removal. |
| **Local Privacy Guard** | **Active** | 100% browser-local handling. No cloud APIs, no external transmissions, zero data leakage. |
| **Python Backend & MONAI** | **Planned (P1)** | FastAPI `/api/v1/segment/predict` with MONAI SegResNet 3D sliding window inference. |
| **Discrete BraTS 2021 Mapping** | **Planned (P1)** | Multi-channel sigmoid to labels `0, 1, 2, 4` reconstruction. |
| **Geometry Restoration** | **Planned (P1)** | Nearest-neighbor grid resampler to preserve original affine matrix and voxel spacing. |
| **NiiVue Multi-Planar Viewer** | **Planned (P2)** | WebGL2 linked axial, coronal, sagittal viewports and 3D volume rendering. |
| **Report Generation** | **Planned (P2)** | PDF/JSON clinical decision support summary export. |

---

## 3. Running the Frontend

The project is structured with a root proxy so you can run the frontend from either the workspace root or the `frontend/` directory.

### Quickstart (from project root)
```bash
# Start development server
npm run dev

# Or build for production
npm run build
```

### Alternatively (from `frontend/` directory)
```bash
cd frontend
npm install
npm run dev
```
The Vite development server will start at `http://localhost:5173/`.

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
│   ├── UI_DESIGN_RULES.md   # Single source of truth for UI, colors, viewports, typography
│   ├── TEAM_WORKFLOW.md     # Branch naming, PR rules, merge conflict prevention
│   ├── DECISIONS.md         # Architecture Decision Records (ADRs)
│   ├── ONBOARDING.md        # Step-by-step setup guide for team members (Ayaz & Samir)
│   └── TASK_BOARD.md        # Prioritized task backlog (P0 to P3)
└── frontend/                # React 19 + Vite + Tailwind CSS UI
    ├── src/
    │   ├── assets/          # 3D brain visual asset (brain-hero.jpg)
    │   ├── components/
    │   │   ├── Navbar.jsx   # NeuroVault wordmark and minimal indicators
    │   │   ├── Hero.jsx     # Editorial hero with animated 3D brain and CTA
    │   │   └── UploadModal.jsx # 4-sequence NIfTI uploader with local validation
    │   ├── App.jsx          # Main application container
    │   ├── index.css        # Tailwind v4 import and atmospheric animations
    │   └── main.jsx         # React application entry point
    ├── vite.config.js       # Vite configuration with @tailwindcss/vite
    └── package.json         # Frontend dependencies (React 19, Lucide, Tailwind v4)
```

---

## 5. Team & Collaboration Workflow

- **Team Members**: Project Owner (Sarthak), Ayaz, Samir.
- **Workflow Rules**: See [docs/TEAM_WORKFLOW.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/TEAM_WORKFLOW.md)
  - All development occurs on dedicated feature branches (`feature/<name>-<topic>`).
  - `main` branch is strictly stable and demo-ready.
  - No direct pushes or force-pushes to `main`.
- **Developer Onboarding**: See [docs/ONBOARDING.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/ONBOARDING.md) for quickstart instructions.
