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
| **Top Navigation** | **Implemented & Verified** | Engraved brain icon, editorial wordmark, active `Home` indicator, and `Research Preview` badge. |
| **Hero Copy & Editorial Typography** | **Implemented & Verified** | Cormorant Garamond serif headline, Plus Jakarta Sans body copy, and 4 modality chips. |
| **Annotated 2D Brain Illustration** | **Implemented & Verified** | Classical anatomy atlas engraving on `#E9DDD5` with SVG leader lines, hover-responsive pins, and educational functional labels. |
| **Anatomical Views Rail** | **Implemented & Verified** | Superior, lateral, and ventral reference thumbnails. |
| **4-Sequence MRI Upload Workspace** | **Implemented & Verified** | Light cream upload cards with real axial MRI thumbnails, format validation, file size display, replace, and remove. |
| **Local Privacy Guarantee** | **Active** | Files remain strictly inside browser memory; zero cloud uploads or third-party tracking. |
| **Analysis CTA State** | **Active & Honest** | Disabled until all 4 sequences are loaded; displays explicit notice that 3D inference runs once local FastAPI is connected. |
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
    │   │   ├── Navbar.jsx   # Editorial header with engraved icon and Home link
    │   │   ├── Hero.jsx     # World A: Warm Blush hero with editorial copy & sidebar
    │   │   ├── AnnotatedBrain.jsx # 2D brain illustration with interactive SVG callouts
    │   │   └── MriWorkspace.jsx   # World B: Oxblood MRI upload cards & workflow tracker
    │   ├── App.jsx          # Root container assembling Hero and Workspace
    │   ├── index.css        # Palette tokens, typography, and subtle float animation
    │   └── main.jsx         # Application entry
    ├── vite.config.js       # Vite configuration with @tailwindcss/vite
    └── package.json         # Lightweight frontend dependencies
```
