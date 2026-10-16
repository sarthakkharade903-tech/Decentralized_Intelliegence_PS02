# Architecture Decision Records (ADR) Log

This document records the rationale, alternatives considered, and trade-offs for all major architectural and technical decisions made in **NeuroScope-3D**.

---

### ADR-001: Deep Learning Framework and Python Runtime

- **Date**: 2026-10-16
- **Status**: Accepted
- **Decision**: Use **Python 3.11**, **PyTorch 2.x with CUDA 12/13**, and **MONAI Core** for the backend inference pipeline.
- **Context**: The host machine has Python 3.14.4 as default and Python 3.11 available. PyTorch and MONAI do not yet have stable, prebuilt binary wheels for Python 3.14 on Windows.
- **Alternatives Considered**:
  - *Python 3.14*: Would require building PyTorch and C++ extensions from source, which is unstable and time-prohibitive for a 24-hour hackathon.
  - *ONNX Runtime*: Good for CPU inference, but converting 3D sliding-window MONAI models with dynamic spatial inputs adds unnecessary translation friction.
- **Consequences**: Backend virtual environment must strictly be created with `py -3.11 -m venv .venv`.

---

### ADR-002: Neuroimaging Web Viewer Selection

- **Date**: 2026-10-16
- **Status**: Accepted
- **Decision**: Select **[NiiVue](https://github.com/niivue/niivue)** wrapped inside a React 19 / Vite application for multi-planar and 3D volumetric visualization.
- **Context**: The hackathon requires linked axial, coronal, and sagittal viewports with synchronized crosshairs, volumetric 3D rendering, and tumor region overlays.
- **Alternatives Considered**:
  - *OHIF Viewer / Cornerstone.js*: The industry standard for enterprise PACS/DICOM, but extremely heavy, rigid, complex to customize in 24 hours, and geared towards 2D DICOM rather than raw 3D NIfTI overlays.
  - *Papaya Viewer*: Mature, but uses outdated HTML5/Canvas tech with poor high-DPI and WebGL rendering performance.
  - *VTK.js / ITK-Wasm*: Powerful 3D rendering, but requires substantial boilerplate for synchronized 2D multi-planar crosshair linking.
- **Consequences**: NiiVue provides native NIfTI parsing, GPU-accelerated WebGL2 rendering, built-in multi-planar synchronization, and custom colormaps out of the box with minimal code.

---

### ADR-003: BraTS 2021 Discrete Output Label Mapping

- **Date**: 2026-10-16
- **Status**: Accepted
- **Decision**: Reconstruct standard BraTS 2021 labels (`0, 1, 2, 4`) deterministically from the model's 3-channel sigmoid probabilities using hierarchical priority: $\text{ET} (4) \rightarrow \text{NETC} (1) \rightarrow \text{ED} (2) \rightarrow \text{Background} (0)$.
- **Context**: MONAI models trained on BraTS 2021 output multi-label sigmoid channels for Whole Tumor (WT), Tumor Core (TC), and Enhancing Tumor (ET), but the judging criteria require discrete multiclass NIfTI masks with labels `0, 1, 2, 4`.
- **Alternatives Considered**:
  - *Softmax multi-class output*: Fails to exploit the nested biological hierarchy of brain tumors (ET $\subset$ TC $\subset$ WT).
- **Consequences**: Clear, unambiguous vector translation in postprocessing prevents invalid label output.

---

### ADR-004: Exact Spatial Geometry & Affine Preservation

- **Date**: 2026-10-16
- **Status**: Accepted
- **Decision**: Invert spatial preprocessing transforms to resample the predicted mask back to the reference sequence's original grid and copy the original affine matrix and NIfTI header.
- **Context**: Deep learning models require normalized isotropic voxel grids (e.g. 1.0mm isotropic), but clinically valid evaluations require segmentations to overlay perfectly onto the original patient scan without displacement.
- **Alternatives Considered**:
  - *Returning predictions on the preprocessed 1.0mm isotropic grid*: Fails alignment checks against the raw patient scans and introduces metric penalties.
- **Consequences**: Requires a lightweight nearest-neighbor resampling step after inference.

---

### ADR-005: GitHub Collaboration Strategy

- **Date**: 2026-10-16
- **Status**: Accepted
- **Decision**: Implement a GitHub flow using a protected `main` branch, individual feature branches (`feature/<name>-<topic>`), and peer-reviewed Pull Requests.
- **Context**: A team of 3 developers working across backend, frontend, and evaluation during a 24-hour hackathon risks severe merge conflicts if working on the same branch or editing shared interfaces without agreement.
- **Consequences**: Small overhead of opening PRs, but eliminates lost work and broken demo builds.
