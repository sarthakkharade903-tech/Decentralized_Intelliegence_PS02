"""Unit tests for nested probability channel post-processing and discrete label mapping."""

import numpy as np
import pytest

from backend.app.services.postprocessing import (
    map_nested_channels_to_discrete_labels,
    sigmoid_array,
)


def test_sigmoid_numerical_stability():
    """Verify sigmoid function handles extreme negative and positive values without overflow."""
    x = np.array([-1000.0, -10.0, 0.0, 10.0, 1000.0], dtype=np.float32)
    s = sigmoid_array(x)

    assert np.all(np.isfinite(s))
    assert s[0] == 0.0
    assert np.isclose(s[2], 0.5)
    assert s[4] == 1.0


def test_discrete_label_mapping_hierarchy():
    """Verify exact priority conversion from nested probabilities to BraTS 2021 labels:

    Channel 0: TC (Tumor Core)
    Channel 1: WT (Whole Tumor)
    Channel 2: ET (Enhancing Tumor)

    Expected Mapping:
      - ET (C2 >= 0.5)               -> Label 4
      - TC \ ET (C0 >= 0.5, C2 < 0.5) -> Label 1 (NETC)
      - WT \ TC (C1 >= 0.5, C0 < 0.5) -> Label 2 (ED)
      - Background (all < 0.5)        -> Label 0
    """
    # Create 3-channel probability volume [3, 2, 2, 1]
    probs = np.zeros((3, 2, 2, 1), dtype=np.float32)

    # Pixel (0, 0): ET is active -> should be 4
    probs[0, 0, 0, 0] = 0.95  # TC
    probs[1, 0, 0, 0] = 0.99  # WT
    probs[2, 0, 0, 0] = 0.85  # ET

    # Pixel (0, 1): TC active, but not ET -> should be 1 (NETC)
    probs[0, 0, 1, 0] = 0.90  # TC
    probs[1, 0, 1, 0] = 0.95  # WT
    probs[2, 0, 1, 0] = 0.10  # ET

    # Pixel (1, 0): WT active, but neither TC nor ET -> should be 2 (ED)
    probs[0, 1, 0, 0] = 0.20  # TC
    probs[1, 1, 0, 0] = 0.85  # WT
    probs[2, 1, 0, 0] = 0.05  # ET

    # Pixel (1, 1): All below threshold -> should be 0 (Background)
    probs[0, 1, 1, 0] = 0.30  # TC
    probs[1, 1, 1, 0] = 0.40  # WT
    probs[2, 1, 1, 0] = 0.10  # ET

    discrete = map_nested_channels_to_discrete_labels(probs, is_logits=False, threshold=0.5)

    assert discrete.shape == (2, 2, 1)
    assert discrete.dtype == np.uint8
    assert discrete[0, 0, 0] == 4  # ET
    assert discrete[0, 1, 0] == 1  # NETC
    assert discrete[1, 0, 0] == 2  # ED
    assert discrete[1, 1, 0] == 0  # Background


def test_raw_logits_input():
    """Verify that raw model logits are activated via sigmoid before thresholding."""
    logits = np.zeros((3, 1, 1, 1), dtype=np.float32)
    # Logit +3.0 -> sigmoid ~0.95 (>= 0.5)
    # Logit -3.0 -> sigmoid ~0.05 (< 0.5)
    logits[0, 0, 0, 0] = 3.0   # TC active
    logits[1, 0, 0, 0] = 3.0   # WT active
    logits[2, 0, 0, 0] = -3.0  # ET inactive

    discrete = map_nested_channels_to_discrete_labels(logits, is_logits=True, threshold=0.5)
    # TC active without ET -> Label 1 (NETC)
    assert discrete[0, 0, 0] == 1


def test_batch_dimension_handling():
    """Verify that [1, 3, H, W, D] input is correctly squeezed to [H, W, D]."""
    probs_5d = np.zeros((1, 3, 4, 4, 4), dtype=np.float32)
    discrete = map_nested_channels_to_discrete_labels(probs_5d, is_logits=False)
    assert discrete.shape == (4, 4, 4)


def test_invalid_channel_shape_rejected():
    """Verify that non-3-channel arrays raise ValueError."""
    with pytest.raises(ValueError):
        map_nested_channels_to_discrete_labels(np.zeros((4, 8, 8, 8)), is_logits=False)

    with pytest.raises(ValueError):
        map_nested_channels_to_discrete_labels(np.zeros((8, 8, 8)), is_logits=False)


def test_topological_containment_nesting():
    """Verify that spurious ET or TC activations outside of WT are suppressed to 0 (Background).

    BraTS ground-truth invariant: ET <= TC <= WT.
    """
    probs = np.zeros((3, 2, 2, 2), dtype=np.float32)

    # Pixel (0, 0, 0): ET is 0.9, TC is 0.9, but WT is only 0.2 (below threshold 0.5)
    # Under topological containment, this cannot be an isolated tumor outside WT
    probs[0, 0, 0, 0] = 0.9  # TC
    probs[1, 0, 0, 0] = 0.2  # WT (inactive)
    probs[2, 0, 0, 0] = 0.9  # ET

    # Pixel (1, 1, 1): ET is 0.85, but TC is only 0.1 and WT is 0.95
    # Enhancing tumor cannot exist without tumor core
    probs[0, 1, 1, 1] = 0.1  # TC (inactive)
    probs[1, 1, 1, 1] = 0.95 # WT (active)
    probs[2, 1, 1, 1] = 0.85 # ET

    discrete = map_nested_channels_to_discrete_labels(probs, is_logits=False, threshold=0.5)

    # (0, 0, 0) must be suppressed to 0 (Background) because WT is not active
    assert discrete[0, 0, 0] == 0

    # (1, 1, 1) must fall back to Label 2 (ED) because WT is active, but TC is not
    assert discrete[1, 1, 1] == 2
