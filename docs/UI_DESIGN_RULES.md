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
| `surface-panel` | `#0D111A` / `#080D19` | Primary card panels, sidebar, header |
| `surface-panel-subtle` | `#0A1120` / `#161D2C` | Upload sequence slots, secondary cards |
| `surface-border` | `rgba(34, 211, 238, 0.25)` | Subtle cyan-accented container borders |

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

## 4. Real-Time 3D Brain & Visualization Frame

### 3D Anatomical Brain Guidelines
- Real anatomical human brain geometry (`brain.glb`) with verified provenance (Z-Anatomy / BodyParts3D CC BY-SA 4.0).
- **Lighting Model**:
  - Key front light: Surgical cool white (`#DCF8FF`, intensity 2.2).
  - Rim lighting: Vivid cyan (`#00F0FF`, intensity 4.8) on back-left, vivid teal (`#00FFC4`, intensity 3.6) on back-right to accentuate sulcal fissures and outer silhouette.
  - Accent light: Warm amber (`#FFDFBA`, intensity 1.2) for subtle tissue depth.
- **Neural Filaments & Synapses**: Delicately connected spline lines (`0x22D3EE` / `0x14B8A6`) and glowing node spheres conforming to cortical contours.
- **Particle Dust**: Sparse ambient particles drifting in a spherical aura.
- **Interaction**: Pointer-tracking parallax with smooth lerp easing (`0.05`) and slow organic rotation (`0.0018` rad/frame).
- **Fallback**: Immediate high-contrast static render if WebGL is unavailable.

### Scientific HUD Frame Specifications
- Rounded corners (`rounded-2xl`), cyan border (`border-cyan-500/30`), dark glassmorphism (`bg-[#060A12]/70 backdrop-blur-md`).
- Upper-left badge: `• 3D BRAIN VIEW` (pulsing cyan dot).
- Upper-right indicator: `1.0mm | ISOTROPIC`.
- Right border: Vertical ruler ticks for scale cues.
- Bottom-left indicator: `4 MRI SEQUENCES (T1, T1Gd, T2, FLAIR)`.
- Bottom-right badge: `• RESEARCH PREVIEW`.

---

## 5. 4-Sequence Upload Panel Rules
- Integrated below the hero content with slight layered overlap.
- Glassmorphic container (`bg-[#080D19]/80 border-cyan-500/25 backdrop-blur-xl`).
- 4 equal-width slots: **T1**, **T1Gd**, **T2**, **FLAIR**.
- Immediate client validation: Accepts strictly `.nii` and compound `.nii.gz`.
- Inline error messages for invalid formats.
- Smooth replace (`Change`) and removal (`X`) controls.
- Zero cloud transmission: files remain entirely in browser memory.
