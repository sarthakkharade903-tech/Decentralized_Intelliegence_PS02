"""Post-Processing and Multi-Channel Sigmoid to Discrete BraTS Label Mapping.

Implements the official MONAI Model Zoo `brats_mri_segmentation` postprocessing transform
defined in `configs/inference.json` and ADR-003 (`docs/DECISIONS.md`).

Verified Official Model Channel Semantics:
    Channel 0: Tumor Core (TC)
    Channel 1: Whole Tumor (WT)
    Channel 2: Enhancing Tumor (ET)

Discrete BraTS 2021 Output Labels:
    0: Background
    1: Necrotic and Non-Enhancing Tumor Core (NETC)
    2: Peritumoral Edema (ED)
    4: Enhancing Tumor (ET)
    (Label 3 is deprecated/unused)
"""

from typing import Union

import numpy as np
from scipy.special import expit as sigmoid_array


def map_nested_channels_to_discrete_labels(
    probabilities_or_logits: np.ndarray,
    is_logits: bool = True,
    threshold: float = 0.5,
) -> np.ndarray:
    """Converts a 3-channel probability/logit volume into a discrete BraTS 2021 label mask.

    Verified Transformation Rule:
        Step 1: If input is raw logits, apply sigmoid activation.
        Step 2: Binary threshold at tau = 0.5 for each channel:
            - is_et = Channel 2 (ET) >= tau
            - is_tc = Channel 0 (TC) >= tau
            - is_wt = Channel 1 (WT) >= tau
        Step 3: Hierarchical discrete priority assignment:
            discrete_mask = where(is_et, 4,
                            where(is_tc, 1,
                            where(is_wt, 2, 0)))

    Args:
        probabilities_or_logits: 3D or 4D array of shape [3, H, W, D] or [1, 3, H, W, D].
        is_logits: If True, applies sigmoid activation first (default: True).
        threshold: Sigmoid activation threshold tau (default: 0.5).

    Returns:
        3D numpy integer array of shape [H, W, D] with values in {0, 1, 2, 4} and dtype uint8.

    Raises:
        ValueError: If input tensor does not have 3 channels in the expected dimension.
    """
    arr = np.asanyarray(probabilities_or_logits, dtype=np.float32)

    # Handle optional batch dimension [1, 3, H, W, D] -> [3, H, W, D]
    if arr.ndim == 5:
        if arr.shape[0] != 1 or arr.shape[1] != 3:
            raise ValueError(f"Expected batch shape [1, 3, H, W, D], got {arr.shape}")
        arr = arr[0]
    elif arr.ndim == 4:
        if arr.shape[0] != 3:
            raise ValueError(f"Expected 3 channels [3, H, W, D], got shape {arr.shape}")
    else:
        raise ValueError(f"Expected 4D array [3, H, W, D], got {arr.ndim}D shape {arr.shape}")

    # Step 1: Apply sigmoid if raw model logits
    if is_logits:
        probs = sigmoid_array(arr)
    else:
        probs = arr

    # Step 2: Extract verified channels per MONAI Model Zoo bundle
    tc_prob = probs[0]  # Channel 0: Tumor Core
    wt_prob = probs[1]  # Channel 1: Whole Tumor
    et_prob = probs[2]  # Channel 2: Enhancing Tumor

    is_et = et_prob >= threshold
    is_tc = tc_prob >= threshold
    is_wt = wt_prob >= threshold

    # Step 3: Priority mapping matching configs/inference.json Lambdad transform:
    # lambda x: torch.where(x[2] > 0, 4, torch.where(x[0] > 0, 1, torch.where(x[1] > 0, 2, 0)))
    discrete_mask = np.zeros(arr.shape[1:], dtype=np.uint8)

    # 1. Edema (ED = WT \ TC) -> Label 2
    discrete_mask = np.where(is_wt, np.uint8(2), discrete_mask)
    # 2. Necrotic core (NETC = TC \ ET) -> Label 1
    discrete_mask = np.where(is_tc, np.uint8(1), discrete_mask)
    # 3. Enhancing tumor (ET) -> Label 4
    discrete_mask = np.where(is_et, np.uint8(4), discrete_mask)

    return discrete_mask
