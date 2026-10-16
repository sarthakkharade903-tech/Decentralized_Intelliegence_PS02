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

### Production Build Verification
```bash
npm run build
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
    │   └── models/          # Bundled 3D anatomical brain model (brain.glb)
    ├── src/
    │   ├── assets/          # Static fallback renders (brain-hero.jpg)
    │   ├── components/
    │   │   ├── Navbar.jsx   # Minimal header with brain icon and Home link
    │   │   ├── Hero.jsx     # Two-column hero with framed 3D view and CTA
    │   │   ├── Brain3D.jsx  # Real-time Three.js canvas with filaments & pointer parallax
    │   │   └── UploadPanel.jsx # 4-sequence NIfTI selection panel with inline validation
    │   ├── App.jsx          # Root container
    │   ├── index.css        # Tailwind v4 import and custom effects
    │   └── main.jsx         # Application entry
    ├── vite.config.js       # Vite configuration with @tailwindcss/vite
    └── package.json         # Dependencies (three, lucide-react, react 19, tailwind v4)
```
