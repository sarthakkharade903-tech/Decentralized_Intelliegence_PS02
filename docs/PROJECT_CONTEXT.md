# Project Context & Hackathon Specifications

## 1. Hackathon Details
- **Event**: Kurukshetra Technical Inauguration + 24-Hour Hackathon
- **Project Title**: NeuroScope-3D: Brain MRI Tumor Segmentation and Visualization Platform
- **Team**: Sarthak (Project Owner), Ayaz, Samir

---

## 2. Problem Statement & Clinical Objective
Gliomas are among the most aggressive primary brain tumors. Radiologists and neuro-oncologists rely on multi-parametric MRI (mpMRI) scans to evaluate tumor boundaries, plan surgical resections, and monitor treatment response. Delineating these boundaries manually slice-by-slice across 3D volumes is time-consuming and subjective.

NeuroScope-3D ingests four core MRI sequences:
1. **T1** (Native T1-weighted)
2. **T1Gd** (T1-weighted Contrast Enhanced / Gadolinium)
3. **T2** (T2-weighted)
4. **FLAIR** (Fluid Attenuated Inversion Recovery)

The system automatically produces:
- 3D segmentations of the 3 clinically critical tumor sub-regions:
  - **Whole Tumor (WT)**: The entire lesion, including edema.
  - **Tumor Core (TC)**: The active tumor bulk (enhancing + necrotic).
  - **Enhancing Tumor (ET)**: The hyper-intense, actively vascularized tissue.
- Standard discrete BraTS 2021 multiclass NIfTI mask (`0, 1, 2, 4`).
- Synchronized multi-planar visualization (axial, coronal, sagittal) + 3D rendering.
- Accurate physical volume calculations in millilitres (mL).
- Comprehensive PDF/JSON summary report with model provenance.

---

## 3. Strict BraTS 2021 Label Mapping Reference

In standard BraTS 2021 benchmark data, labels represent specific histological sub-regions:

| Label ID | Name | Clinical Description | Associated Region |
| :--- | :--- | :--- | :--- |
| **0** | Background | Healthy brain parenchyma or non-brain background | None |
| **1** | NETC | Necrotic and Non-Enhancing Tumor Core | TC, WT |
| **2** | ED | Peritumoral Edema / Infiltrating tissue | WT |
| **4** | ET | GD-Enhancing Tumor Margin | ET, TC, WT |

*(Note: Label 3 was eliminated in the BraTS 2017 challenge and is not used in BraTS 2021).*

### Region Definitions
- **Whole Tumor (WT)** = Labels $1 + 2 + 4$
- **Tumor Core (TC)** = Labels $1 + 4$
- **Enhancing Tumor (ET)** = Label $4$

### Multi-Channel Sigmoid to Discrete Multiclass Conversion
Pretrained models (e.g. MONAI SegResNet) output three probability channels $(C_0, C_1, C_2)$ corresponding to the nested regions WT, TC, and ET after sigmoid activation (threshold $\tau = 0.5$):

$$\text{DiscreteLabel}(x, y, z) = 
\begin{cases} 
4, & \text{if } C_2(x, y, z) \ge 0.5 \quad (\text{ET}) \\ 
1, & \text{else if } C_1(x, y, z) \ge 0.5 \quad (\text{TC} \setminus \text{ET}) \\ 
2, & \text{else if } C_0(x, y, z) \ge 0.5 \quad (\text{WT} \setminus \text{TC}) \\ 
0, & \text{otherwise} 
\end{cases}$$

---

## 4. Affine Matrix & Geometry Invariants
Medical NIfTI files contain an affine transform ($4 \times 4$ matrix) encoding:
- Voxel spacing ($\Delta x, \Delta y, \Delta z$ in mm).
- Direction cosines (spatial orientation, e.g. `RAS`, `LPS`).
- Origin in real-world patient coordinate space (mm).

### Mandatory Invariant:
1. **Never alter the reference geometry.** The reference grid (typically the co-registered T1Gd scan) dictates the coordinate space.
2. If preprocessing scales the volume (e.g. resampling from $0.5 \times 0.5 \times 5.0\text{ mm}$ to $1.0 \times 1.0 \times 1.0\text{ mm}$ isotropic):
   - The predicted segmentation must be **resampled back to the original grid** using nearest-neighbor interpolation.
   - The output NIfTI file must copy the exact `affine` and `header` from the raw input scan.

---

## 5. Physical Volume Calculation
Volume in medical imaging is never represented merely in voxels. It must be computed in **millilitres (mL)** or cubic centimetres ($\text{cm}^3$, where $1\text{ mL} = 1\text{ cm}^3 = 1000\text{ mm}^3$):

$$\text{Voxel Volume (mm}^3) = |\det(\text{affine}_{3\times3})| \approx \Delta x \times \Delta y \times \Delta z$$

$$\text{Volume}_{\text{region}} (\text{mL}) = \frac{\sum \mathbf{1}_{\{ \text{voxel} \in \text{region} \}} \times \text{Voxel Volume (mm}^3)}{1000}$$

---

## 6. Regulatory & Hackathon Constraints
- **De-identified Data Only**: Only public research datasets (BraTS, TCIA, Decathlon) may be loaded. No personal or proprietary clinical scans.
- **Data Privacy**: No MRI scans, image slices, or medical metadata may be transmitted over external APIs or to LLM services. All inference and calculations must execute locally or within self-hosted backend infrastructure.
- **Model Provenance**: Any pretrained model used must have explicit licensing documented (e.g. MONAI Model Zoo Apache 2.0).
- **Disclaimer**: All system outputs must be labeled as "Candidate Tumor Predictions (AI-Assisted)" and include a clear clinical disclaimer.
