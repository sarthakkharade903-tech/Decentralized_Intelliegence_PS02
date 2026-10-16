# Hackathon Engineering Task Board

This backlog organizes the project into prioritized phases for the 24-hour sprint.

---

## Priority Legend
- **P0 (Critical Path / Foundations)**: Baseline runnable system and data validity.
- **P1 (Core Clinical Correctness)**: Model inference, discrete BraTS mapping, affine geometry restoration, volume validation.
- **P2 (User Experience & Deliverables)**: Multi-planar viewer, linked crosshairs, 3D volume rendering, structured reporting.
- **P3 (Hardening & Hackathon Polish)**: Edge-case stress tests, performance optimization, model card, presentation slide prep.

---

## Phase 0: Repository & Environment Setup (P0)

- [x] **Task 0.1**: Inspect development environment, verify Python 3.11, CUDA, and Node.js.
- [x] **Task 0.2**: Initialize Git repository and link to remote `sarthakkharade903-tech/NeuroScope-3D`.
- [x] **Task 0.3**: Establish `.gitignore` to prevent leaks of NIfTI scans, weights, and secrets.
- [x] **Task 0.4**: Establish comprehensive architecture, UI rules, team workflow, and onboarding documentation.
- [x] **Task 0.5**: Bootstrap `frontend/` with Vite 8 + React 19 + Tailwind CSS v4 + Lucide React.
- [x] **Task 0.6**: Build NeuroVault Landing Hero Page with 3D anatomical brain visual, scanline laser sweep, editorial typography, and local privacy statement.
- [x] **Task 0.7**: Build 4-Sequence Upload Modal (T1, T1Gd, T2, FLAIR) with `.nii` / `.nii.gz` local browser validation, batch drop detection, and backend standby notices.
- [ ] **Task 0.8**: Create Python 3.11 virtual environment (`.venv`) and define initial `backend/requirements.txt` with PyTorch, MONAI, and FastAPI.

---

## Phase 1: Core Inference Pipeline & Geometric Inversion (P1)

- [ ] **Task 1.1**: Pretrained MONAI Model Integration (SegResNet BraTS21 weights download and inference runner).
- [ ] **Task 1.2**: Sequence Ingestion & Input Validation (Check shape consistency, 4 sequences present, valid NIfTI headers).
- [ ] **Task 1.3**: Sliding Window Inference with Mixed Precision (`sw_batch_size=1`, AMP `fp16`) to fit within 6GB VRAM.
- [ ] **Task 1.4**: Discrete BraTS 2021 Label Mapping (Convert multi-channel sigmoid probabilities into labels `0, 1, 2, 4`).
- [ ] **Task 1.5**: Spatial Geometry & Affine Restoration (Invert preprocessing transforms back to raw reference grid via nearest-neighbor resampling).
- [ ] **Task 1.6**: Physical Volume Calculation in mL (WT, TC, ET volume computation based on voxel spacing).

---

## Phase 2: Interactive Viewer & Reporting (P2)

- [ ] **Task 2.1**: NiiVue Integration in React (Axial, Coronal, Sagittal, and 3D linked canvas).
- [ ] **Task 2.2**: Synchronized Crosshair and Slice Navigation.
- [ ] **Task 2.3**: Tumor Sub-Region Overlay Controls (Visibility toggles and opacity sliders for NETC, ED, ET).
- [ ] **Task 2.4**: Patient Metrics & Volume Breakdown Card (Displaying volumes in mL with status indicators).
- [ ] **Task 2.5**: Clinical Decision Support Summary Report Export (PDF/JSON printable summary with model provenance and disclaimer).

---

## Phase 3: Stress-Testing, Optimization & Pitch Prep (P3)

- [ ] **Task 3.1**: Robustness & Error Handling (Graceful UI alerts for corrupted NIfTI, mismatched sequences, or out-of-memory).
- [ ] **Task 3.2**: Benchmark Evaluation (Compute Dice and Sensitivity metrics on validation case).
- [ ] **Task 3.3**: Model Card Creation (Document architecture, training data source, licenses, and limitations).
- [ ] **Task 3.4**: 5-Minute Pitch Deck & Demo Walkthrough Script.
