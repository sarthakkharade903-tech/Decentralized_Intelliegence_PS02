# NeuroScope-3D / NeuroVault: UI Design Rules & Medical Diagnostic Guidelines

This document serves as the **single source of truth** for visual design, layout patterns, and user experience across the NeuroScope-3D / NeuroVault application.

> **CRITICAL TEAM POLICY**:
> Sarthak, Ayaz, and Samir must **not** independently redesign pages or invent new styling paradigms. All developers must use the shared Tailwind design tokens, typography, and component primitives defined in this document. Any proposed change to the visual language must be discussed, agreed upon, and recorded here first.

---

## 1. Visual Theme & Philosophy
- **Aesthetic**: Minimal Scientific Visualization & Medical Diagnostic Workstation.
- **Base Theme**: Deep Obsidian Black (`#06080D` root canvas). Dark mode reduces eye fatigue in low-light radiological environments and highlights grayscale MRI sequences and neon tumor masks.
- **Tone**: Precise, authoritative, distraction-free, accessible, privacy-first.

---

## 2. Color Palette & Semantic Tokens

### Workstation Surfaces
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `surface-bg-obsidian` | `#06080D` | Root canvas background |
| `surface-panel` | `#0D111A` / `#111827` | Primary card panels, sidebar, header |
| `surface-panel-subtle` | `#161D2C` / `#1F2937` | Secondary cards, inactive tabs, input backgrounds |
| `surface-border` | `rgba(30, 41, 59, 0.6)` | Subtle container borders and separators |

### Text & Accents
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `text-primary` | `#F8FAFC` | Headings, primary metrics, active values |
| `text-secondary` | `#94A3B8` | Supporting labels, descriptions, metadata |
| `accent-cyan` | `#22D3EE` | Primary action glow, active tabs, focus rings |
| `accent-teal` | `#14B8A6` | Gradients, secondary highlights |
| `status-success` | `#10B981` | Validation passed, sequence loaded |
| `status-warning` | `#F59E0B` | Incomplete sequences, missing modality |
| `status-error` | `#EF4444` | Invalid file format, dimension mismatch, GPU error |

### Standard Tumor Colormap (BraTS Standard)
Color overlays must be uniform across all viewports:
| Sub-Region | BraTS Label | Display Color | Hex | Default Opacity |
| :--- | :--- | :--- | :--- | :--- |
| **Necrotic Core (NETC)** | 1 | Electric Cyan / Blue | `#06B6D4` | 0.65 |
| **Peritumoral Edema (ED)** | 2 | Amber / Vivid Yellow | `#EAB308` | 0.50 |
| **Enhancing Tumor (ET)** | 4 | Vivid Crimson / Red | `#EF4444` | 0.75 |

---

## 3. Typography & Spacing
- **Font Family**:
  - UI & Body: Inter, system-ui, sans-serif (`font-sans`)
  - Numbers & Metrics: JetBrains Mono / monospace (`font-mono`) for volumetric measurements, coordinates, and sequence tags.
- **Hierarchy**:
  - Page Hero Headline: `text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white`
  - Section Headers: `text-sm font-semibold uppercase tracking-wider text-gray-400`
  - Body Text: `text-sm sm:text-base text-gray-300 leading-relaxed`
  - Microcopy / Badges: `text-[10px] sm:text-xs font-mono text-cyan-300`

---

## 4. Landing Hero & Upload Interaction Guidelines

### Hero Presentation
- The 3D anatomical brain rendering is the centerpiece visual.
- Wrapped in a dark glass stage (`bg-slate-900/60`, `border-slate-800/80`) with ambient radial glow (`animate-pulse-glow`) and vertical MRI axial scanning slice simulation (`animate-scan-sweep`).
- Clear distinction between real-world inputs (`RAS+`, `1.0mm isotropic`) and model tasks.

### Upload Modal Standards
- Backdrop blur: `backdrop-blur-md bg-black/85`.
- 4 explicit sequence slots: T1, T1Gd, T2, FLAIR.
- Immediate client validation: Accepts only `.nii` and `.nii.gz`.
- Local browser state: Files remain strictly in browser memory during this phase. No uploads to external clouds or third-party APIs.
- Explicit standby state: Explains that segmentation becomes active when the local backend service (`/api/v1/segment/predict`) is running. No fake tumor predictions or fabricated metrics.

---

## 5. Multi-Planar Viewport Specifications (Planned for P2)
- **Layout Grid**: 2x2 multi-planar grid or 3-pane linked slice layout:
  - **Pane 1**: Axial view (Transverse slice)
  - **Pane 2**: Coronal view (Frontal slice)
  - **Pane 3**: Sagittal view (Lateral slice)
  - **Pane 4**: 3D Volume Render or Interactive Histogram/Profile
- **Interactions**:
  - **Linked Crosshair**: Clicking on any voxel in one view automatically updates the other two views to the identical physical coordinate $(x, y, z)$.
  - **Scroll Wheel**: Scrolls through slices along the active axis.
  - **Window/Level (Brightness/Contrast)**: Right-click drag controls window width and level.
  - **Overlay Toggle**: Individual checkboxes to toggle WT, TC, and ET visibility and adjust opacity.
