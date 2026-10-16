# Persistent AI Agent Guidelines (AGENTS.md)

This file contains mandatory instructions for all AI coding assistants (including Antigravity, Claude, Copilot, etc.) working on the **NeuroScope-3D** repository.

---

## 1. Golden Rules for All AI Assistants

1. **Read Before Writing**:
   Always read `README.md`, `docs/PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/UI_DESIGN_RULES.md`, and `docs/TEAM_WORKFLOW.md` before making architectural decisions or substantial changes.
2. **Never Fabricate Reality**:
   - Never claim a component or test is working unless you have executed it and verified the terminal output.
   - Always clearly distinguish between **Implemented**, **Planned**, and **Unverified** code.
3. **Medical Data & Secrets Privacy (STRICT)**:
   - **Never** upload, commit, or send medical MRI data (`.nii`, `.nii.gz`, `.dcm`, etc.) or patient metadata to any external LLM or cloud API.
   - **Never** commit API tokens, passwords, `.env` files, or private keys.
4. **Inspect Existing Code & Reuse**:
   - Inspect files thoroughly before editing.
   - Reuse existing utilities, design tokens, and components instead of adding redundant libraries or writing duplicate helper functions.
5. **Preserve Contracts & Visual Consistency**:
   - Adhere strictly to the established API contracts in `docs/ARCHITECTURE.md`.
   - Adhere strictly to the design system defined in `docs/UI_DESIGN_RULES.md`. Do not introduce new color palettes, fonts, or styling paradigms on a whim.
6. **Git Discipline**:
   - Never force-push (`git push --force`).
   - Do not make commits directly to `main` without explicit confirmation.
   - Create focused commits with clear semantic commit messages (e.g. `feat: ...`, `fix: ...`, `docs: ...`).
7. **Document As You Build**:
   - Whenever an architectural contract, UI rule, or technical decision changes, update the relevant file in `docs/`.
   - Update `docs/DECISIONS.md` with an Architecture Decision Record (ADR) for major technical pivots.

---

## 2. Domain & Medical Imaging Invariants

- **BraTS 2021 Label Mapping**:
  - `0`: Background
  - `1`: Necrotic and Non-Enhancing Tumor Core (NETC)
  - `2`: Peritumoral Edema (ED)
  - `4`: Enhancing Tumor (ET)
  - *Note: Label 3 is deprecated/unused in BraTS 2021.*
- **Region Composition**:
  - Whole Tumor (WT) = `NETC (1) + ED (2) + ET (4)`
  - Tumor Core (TC) = `NETC (1) + ET (4)`
  - Enhancing Tumor (ET) = `ET (4)`
- **Spatial Geometry**:
  - Never discard the reference image's affine matrix or orientation.
  - All output segmentations must match the original grid, voxel spacing, and spatial orientation (`RAS`/`LPS`) of the input NIfTI.
- **Physical Volume Calculation**:
  - $\text{Volume (mL)} = \frac{\text{Voxel Count} \times (\text{Spacing}_x \times \text{Spacing}_y \times \text{Spacing}_z)}{1000}$
  - Never report volume purely in voxel counts.

---

## 3. Technology Guardrails

- **Python Runtime**: Use **Python 3.11** (`py -3.11`). Do **not** attempt to run PyTorch or MONAI builds under Python 3.14 on Windows due to lack of stable binary wheels.
- **Inference Hardware**: Target local inference on the RTX 3050 (6 GB VRAM) using MONAI's sliding window inference (`sw_batch_size=1`, AMP `fp16`) with automatic fallback to CPU.
- **Frontend Stack**: Vite + React + Tailwind CSS + NiiVue.
