# NeuroScope-3D: UI Design Rules & Medical Diagnostic Guidelines

This document serves as the **single source of truth** for visual design, layout patterns, and user experience across the NeuroScope-3D application.

> **CRITICAL TEAM POLICY**:
> Sarthak, Ayaz, and Samir must **not** independently redesign pages or invent new styling paradigms. All developers must use the shared Tailwind design tokens, typography, and component primitives defined in this document. Any proposed change to the visual language must be discussed, agreed upon, and recorded here first.

---

## 1. Visual Theme & Philosophy
- **Aesthetic**: Modern Clinical Diagnostic Workstation.
- **Base Theme**: Dark Mode by default (`#0B0F19` deep space slate background). Dark mode reduces eye fatigue in low-light radiological reading environments and maximizes contrast against grayscale MRI sequences.
- **Tone**: Precise, authoritative, distraction-free, accessible.

---

## 2. Color Palette & Semantic Tokens

### Workstation Surfaces
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `surface-bg` | `#0B0F19` | Root viewport canvas background |
| `surface-panel` | `#111827` | Primary card panels, sidebar, header |
| `surface-panel-subtle` | `#1F2937` | Secondary cards, inactive tabs, input backgrounds |
| `surface-border` | `#374151` | Subtle container borders and separators |

### Text & Accents
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `text-primary` | `#F9FAFB` | Headings, primary metrics, active values |
| `text-secondary` | `#9CA3AF` | Supporting labels, descriptions, metadata |
| `accent-primary` | `#3B82F6` | Primary action buttons, active navigation, focus rings |
| `accent-hover` | `#2563EB` | Button hover state |
| `status-success` | `#10B981` | Validation passed, inference complete |
| `status-warning` | `#F59E0B` | Incomplete sequences, low-confidence boundaries |
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
  - Numbers & Metrics: JetBrains Mono, monospace (`font-mono`) for volumetric measurements, coordinates, and voxel counts.
- **Hierarchy**:
  - Page Title: `text-xl font-bold tracking-tight text-white`
  - Section Headers: `text-sm font-semibold uppercase tracking-wider text-gray-400`
  - Body Text: `text-sm text-gray-300 leading-relaxed`
  - Microcopy / Units: `text-xs font-mono text-gray-400`

---

## 4. Multi-Planar Viewport Specifications
The MRI viewer is the centerpiece of the interface:
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

---

## 5. UI States & Feedback

1. **Empty State**:
   - Clean drag-and-drop zone with clear indicators for the 4 expected sequences (T1, T1Gd, T2, FLAIR).
   - Guidance text specifying `.nii` or `.nii.gz` format.
2. **Uploading & Validating State**:
   - Progress bar with sequence-by-sequence validation badges (Green checkmark for valid dimensions, red badge for mismatch).
3. **Inference / Processing State**:
   - Animated spinner or indeterminate pulse bar.
   - Stage indicators: `"Loading Models..."` $\rightarrow$ `"Running 3D Sliding Window..."` $\rightarrow$ `"Restoring Geometry..."`.
4. **Error & Fallback State**:
   - Clear banner with error code, explanation, and remedy. No raw uncaught stack traces.
