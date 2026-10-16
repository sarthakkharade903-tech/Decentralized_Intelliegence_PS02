"""Tumour Physical Volumetric and Voxel Decomposition Engine.

Implements clinical volumetric formulas according to:
- AGENTS.md §2 (BraTS 2021 Invariants & Physical Volume Calculation)
- docs/PROJECT_CONTEXT.md §3 & §5 (Region Definitions & Volume Formula)
- docs/ARCHITECTURE.md §3 (API Contract Schema)
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Sequence, Tuple, Union

import numpy as np


@dataclass
class VoxelMetrics:
    """Exact voxel counts for each biological compartment."""
    wt_voxels: int
    tc_voxels: int
    et_voxels: int
    ed_voxels: int
    netc_voxels: int
    total_lesion_voxels: int

    def to_dict(self) -> Dict[str, int]:
        return {
            "wt_voxels": self.wt_voxels,
            "tc_voxels": self.tc_voxels,
            "et_voxels": self.et_voxels,
            "ed_voxels": self.ed_voxels,
            "netc_voxels": self.netc_voxels,
        }


@dataclass
class PhysicalVolumesML:
    """Calculated physical volumes in millilitres (mL = cm³)."""
    whole_tumor: float
    tumor_core: float
    enhancing_tumor: float
    edema: float
    necrotic_core: float

    def to_dict(self) -> Dict[str, float]:
        return {
            "whole_tumor": self.whole_tumor,
            "tumor_core": self.tumor_core,
            "enhancing_tumor": self.enhancing_tumor,
            "edema": self.edema,
            "necrotic_core": self.necrotic_core,
        }


@dataclass
class VolumetricReport:
    """Complete volumetric breakdown for API and reporting."""
    volumes_ml: PhysicalVolumesML
    voxel_counts: VoxelMetrics
    voxel_volume_mm3: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "volumes_ml": self.volumes_ml.to_dict(),
            "metrics": {
                "voxel_counts": self.voxel_counts.to_dict(),
                "voxel_volume_mm3": round(self.voxel_volume_mm3, 4),
            },
        }


def compute_voxel_volume_mm3(
    spacing_or_affine: Union[Sequence[float], np.ndarray]
) -> float:
    """Computes voxel volume in mm³ from either spacing vector (dx, dy, dz) or 4x4 affine matrix."""
    if isinstance(spacing_or_affine, np.ndarray) and spacing_or_affine.shape == (4, 4):
        # Determinant of upper-left 3x3 gives exact volume of skewed/rotated voxel
        vol = float(abs(np.linalg.det(spacing_or_affine[:3, :3])))
    else:
        spacings = list(spacing_or_affine)[:3]
        if len(spacings) != 3 or any(s <= 0 for s in spacings):
            raise ValueError(f"Voxel spacings must contain 3 positive numbers, got: {spacings}")
        vol = float(spacings[0] * spacings[1] * spacings[2])

    if vol <= 0:
        raise ValueError(f"Calculated voxel volume must be positive, got: {vol}")
    return vol


def compute_tumor_volumetrics(
    discrete_mask: np.ndarray,
    voxel_spacing_mm: Union[Sequence[float], np.ndarray],
    round_decimals: int = 2,
) -> VolumetricReport:
    """Decomposes a discrete BraTS 2021 segmentation mask into physical volumes.

    BraTS 2021 Labels:
        0: Background
        1: Necrotic and Non-Enhancing Tumor Core (NETC)
        2: Peritumoral Edema (ED)
        4: Enhancing Tumor (ET)
        (Label 3 is deprecated/unused)

    Clinical Sub-regions:
        Whole Tumor (WT) = Labels 1 + 2 + 4
        Tumor Core (TC)  = Labels 1 + 4
        Enhancing (ET)   = Label 4
        Edema (ED)       = Label 2
        Necrotic (NETC)  = Label 1

    Physical Formula:
        Volume (mL) = (Voxel Count * Voxel Spacing mm³) / 1000

    Args:
        discrete_mask: 3D integer array of BraTS 2021 labels (0, 1, 2, 4).
        voxel_spacing_mm: 3-element voxel spacing [dx, dy, dz] or 4x4 affine matrix.
        round_decimals: Decimal places for volume reporting (default: 2).

    Returns:
        VolumetricReport containing volumes in mL and exact voxel counts.
    """
    if discrete_mask.ndim != 3:
        raise ValueError(f"Mask must be 3-dimensional, got shape {discrete_mask.shape}")

    voxel_vol_mm3 = compute_voxel_volume_mm3(voxel_spacing_mm)

    # 1. Compute exact voxel counts for each constituent label
    count_et = int(np.sum(discrete_mask == 4))
    count_ed = int(np.sum(discrete_mask == 2))
    count_netc = int(np.sum(discrete_mask == 1))

    # 2. Decompose into composite clinical regions
    # Whole Tumor (WT) = NETC (1) + ED (2) + ET (4)
    count_wt = count_netc + count_ed + count_et
    # Tumor Core (TC) = NETC (1) + ET (4)
    count_tc = count_netc + count_et

    voxel_metrics = VoxelMetrics(
        wt_voxels=count_wt,
        tc_voxels=count_tc,
        et_voxels=count_et,
        ed_voxels=count_ed,
        netc_voxels=count_netc,
        total_lesion_voxels=count_wt,
    )

    # 3. Convert voxel counts to physical volume in mL (1 mL = 1000 mm³)
    factor = voxel_vol_mm3 / 1000.0

    volumes_ml = PhysicalVolumesML(
        whole_tumor=round(count_wt * factor, round_decimals),
        tumor_core=round(count_tc * factor, round_decimals),
        enhancing_tumor=round(count_et * factor, round_decimals),
        edema=round(count_ed * factor, round_decimals),
        necrotic_core=round(count_netc * factor, round_decimals),
    )

    return VolumetricReport(
        volumes_ml=volumes_ml,
        voxel_counts=voxel_metrics,
        voxel_volume_mm3=voxel_vol_mm3,
    )
