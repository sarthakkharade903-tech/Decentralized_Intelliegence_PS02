# NeuroVault: UI Design Rules & Editorial Anatomy Guidelines

This document serves as the **single source of truth** for visual design, layout patterns, and user experience across the NeuroVault platform.

---

## 1. Visual Theme: Dual Worlds Philosophy

NeuroVault departs from generic dark cyber-SaaS aesthetics in favor of a **classical scientific anatomy atlas** aesthetic inspired by Frank Netter and Gray's Anatomy. The interface is composed of two deliberate, visually distinct environments:

### World A: Warm Blush Anatomy Hero
- **Primary Background**: `#E9DDD5` (Warm Blush / soft parchment pink-beige)
- **Primary Text**: `#30252A` (Deep plum)
- **Supporting Accents**: `#6D263D` (Oxblood / burgundy)
- **Neutral Muted**: `#6E5D65` (Warm muted plum)
- **Elements**: Editorial serif typography, annotated 2D brain illustration with leader lines, anatomical reference rail.

### World B: Oxblood MRI Workspace
- **Primary Background**: `#6D263D` (Rich Oxblood)
- **Container Surfaces**: `#F8F5F0` (Light cream parchment cards)
- **Accent Wine Surfaces**: `#542031` / `#441A27` (Requirement box, step badges)
- **Text on Cards**: `#30252A` (Deep plum)
- **Text on Oxblood**: `#F8F5F0` (Cream / off-white)
- **Elements**: 4 sequence upload cards (T1, T1Gd, T2, FLAIR) with real axial MRI thumbnails, 4-step workflow tracker, honest analysis CTA.

---

## 2. Typography Hierarchy

- **Headings & Editorial Titles**:
  - Font Family: `Cormorant Garamond, Georgia, serif`
  - Headline Size: `text-5xl sm:text-6xl lg:text-7xl font-normal leading-[1.02]`
  - Workspace Headline: `text-4xl sm:text-5xl font-normal leading-[1.08]`
- **Body & Controls**:
  - Font Family: `Plus Jakarta Sans, system-ui, sans-serif`
  - Body Text: `text-sm sm:text-base text-[#56474E] leading-relaxed`
  - Labels & Modality Chips: `text-xs font-medium`
  - Modality Subtitle / Format: `text-[10px] font-mono text-[#8C7C83]`

---

## 3. Annotated 2D Brain Illustration Guidelines

1. **Artwork**: Pure classical medical atlas engraving in lateral profile with realistic sulci and gyri, cerebellum, and brainstem.
2. **Callout Pins**: Circular dual-ring pins (`w-3.5 h-3.5 rounded-full border border-[#8C485A] bg-[#F8F5F0] with inner dot`) positioned precisely over the:
   - **Frontal Lobe**
   - **Parietal Lobe**
   - **Temporal Lobe**
   - **Occipital Lobe**
   - **Cerebellum**
3. **Leader Lines**: Fine SVG elbow lines connecting anchor pins to educational functional labels outside the brain silhouette.
4. **Motion**: Subtle gentle floating levitation (`animate-subtle-float`). No 3D WebGL rotation or particle fields.

---

## 4. MRI Upload Workspace Rules

1. **Card Architecture**: Light cream parchment cards (`bg-[#F8F5F0] rounded-2xl p-4 text-[#30252A] shadow-md`).
2. **Real MRI Thumbnails**: Each card includes an authentic axial brain MRI slice icon corresponding to the modality (T1, T1Gd, T2, FLAIR).
3. **Sequence Selection**:
   - Native file inputs accept `.nii` and compound `.nii.gz`.
   - Drag-and-drop enabled on all cards.
   - Selected file display includes file name, formatted size in KB/MB, checkmark, and quick `Remove` (`X`).
4. **Analysis CTA Behavior**:
   - Disabled when fewer than 4 sequences are assigned.
   - When all 4 sequences are loaded, transitions to an active state and displays an honest notice regarding local backend connectivity.
