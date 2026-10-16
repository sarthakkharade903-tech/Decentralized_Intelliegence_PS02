# NeuroScope-3D: Brain MRI Tumor Segmentation & Multi-Planar Viewer

[![Hackathon](https://img.shields.io/badge/Hackathon-Kurukshetra%2024h-blueviolet)](#)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.x%20%7C%20CUDA-ee4c2c.svg)](https://pytorch.org/)
[![MONAI](https://img.shields.io/badge/MONAI-Core%20Medical-darkgreen.svg)](https://monai.io/)
[![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite%20%2B%20NiiVue-61dafb.svg)](https://niivue.github.io/niivue/)
[![License](https://img.shields.io/badge/License-MIT%20%2F%20Research%20Only-lightgrey)](#)

> **Clinical Decision Support & Visualization Disclaimer**:
> This platform produces **model-predicted candidate tumor regions** intended strictly for research and hackathon demonstration. It is **not** a certified medical diagnostic device and is **not** a replacement for professional radiological evaluation. Never transmit identifiable patient health data.

---

## 1. Problem Statement & Hackathon Context

Developed for the **Kurukshetra Technical Inauguration & 24-Hour Hackathon**, **NeuroScope-3D** addresses the critical clinical challenge of segmenting and quantifying brain gliomas from multi-parametric magnetic resonance imaging (mpMRI).

Glioma boundary delineation is notoriously complex due to diffuse infiltration and heterogeneous tissue contrast across sequences. Clinicians routinely inspect four distinct MRI modalities to delineate distinct tumor compartments:
- **T1-weighted (T1)**: General brain anatomy.
- **T1-weighted Contrast-Enhanced / Gadolinium (T1Gd)**: Highlights blood-brain barrier breakdown and active, vascularized enhancing tumor margins.
- **T2-weighted (T2)**: Delineates fluid and bulk lesion boundaries.
- **Fluid Attenuated Inversion Recovery (FLAIR)**: Suppresses pure cerebrospinal fluid (CSF) signals to highlight peritumoral vasogenic edema.

NeuroScope-3D ingests these 4 co-registered NIfTI sequences, runs automated 3D deep-learning segmentation via MONAI, recovers the original spatial affine geometry, calculates physical tumor volumes in millilitres, and provides a synchronized 3D multi-planar viewport.

---

## 2. Core Capabilities & Target Deliverables

- **4-Sequence Ingestion & Validation**: Validates existence, matrix size, and orientation across T1, T1Gd, T2, and FLAIR.
- **Pretrained 3D Medical Segmentation**: Utilizes a verified 3D MONAI model (SegResNet architecture) trained on BraTS 2021.
- **Multi-Region Segmentation**: Delineates Whole Tumor (WT), Tumor Core (TC), and Enhancing Tumor (ET).
- **Exact BraTS 2021 Discrete Output**: Maps probability regions to discrete labels:
  - `0`: Background
  - `1`: Necrotic & Non-Enhancing Tumor Core (NETC)
  - `2`: Peritumoral Edema (ED)
  - `4`: Enhancing Tumor (ET)
- **Geometry & Affine Preservation**: Restores spatial affine matrices, voxel dimensions, and image orientation (`RAS`) to guarantee exact voxel-for-voxel correspondence with raw patient scans.
- **Interactive Web-Based Multi-Planar Viewer**: Linked axial, coronal, sagittal viewports with synchronized crosshairs, volumetric 3D rendering, and label colormap toggles using NiiVue.
- **Volumetric Analysis**: Calculates physical volumes in millilitres ($\text{mL} = \text{voxel count} \times \prod \text{voxel dimensions} / 1000$).
- **Structured Reporting & Evaluation**: Patient summary report export and Dice/Sensitivity validation metrics against ground-truth segmentations.

---

## 3. Technology Stack

| Tier | Technologies |
| :--- | :--- |
| **Backend Core** | Python 3.11, FastAPI, Uvicorn, Pydantic |
| **Medical Imaging & ML** | MONAI Core, PyTorch (CUDA 12/13), NiBabel, NumPy, SciPy |
| **Frontend UI** | React 19 / Vite, Tailwind CSS, Lucide Icons |
| **Neuroimaging Canvas** | [NiiVue](https://github.com/niivue/niivue) (WebGL2 / WebGPU NIfTI Rendering) |
| **Deployment / Local** | Windows 11 / Linux laptop-ready runtime |

---

## 4. Current Status

| Component | Status | Notes |
| :--- | :--- | :--- |
| Repository & Collaboration Setup | **In Progress** | Git repo initialized, branching & contracts active |
| Architecture & UI Design System | **Documented** | Detailed specifications in `docs/` |
| Python 3.11 & Backend Environment | **Ready for bootstrap** | System supports Python 3.11 and CUDA 6GB |
| Model Inference Pipeline | Planned (P0) | SegResNet sliding window inference |
| Discrete BraTS 2021 Label Mapping | Planned (P1) | Rule set verified and documented |
| Geometry & Affine Restoration | Planned (P1) | Nearest-neighbor grid resampler specified |
| Multi-Planar Viewer Interface | Planned (P2) | NiiVue React component design ready |
| Volume Calculation & Report Export | Planned (P2) | Formula and schema standardized |

---

## 5. Repository Structure

```text
NeuroScope-3D/
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
├── backend/                 # FastAPI backend, MONAI inference pipeline (planned)
└── frontend/                # React + Vite + NiiVue user interface (planned)
```

---

## 6. Team & Collaboration Workflow

- **Team Members**: Project Owner (Sarthak), Ayaz, Samir.
- **Workflow Rules**: See [docs/TEAM_WORKFLOW.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/TEAM_WORKFLOW.md)
  - All development occurs on dedicated feature branches (`feature/<name>-<topic>`).
  - `main` branch is strictly stable and demo-ready.
  - No direct pushes or force-pushes to `main`.
- **Developer Onboarding**: See [docs/ONBOARDING.md](file:///d:/Visual%20Studio%20Code/Medical%20Brain/docs/ONBOARDING.md) for quickstart instructions.
