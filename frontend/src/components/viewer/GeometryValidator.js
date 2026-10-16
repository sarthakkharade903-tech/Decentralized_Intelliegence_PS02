/**
 * NeuroVault Geometry & Medical Image Invariant Validator
 * --------------------------------------------------------
 * Ensures spatial correctness, affine orientation consistency, and voxel grid
 * alignment between background MRI sequences and BraTS segmentation masks.
 * Reference: docs/ARCHITECTURE.md §2 (Clinical Invariants) & AGENTS.md §2
 */

/**
 * Multiplies a 4x4 affine matrix by a 3D voxel coordinate [i, j, k] to compute
 * the physical world-space coordinate in millimetres [x_mm, y_mm, z_mm].
 *
 * @param {number[][]} affine - 4x4 affine transformation matrix (Row-major or standard array)
 * @param {[number, number, number]} voxel - [i, j, k] zero-indexed voxel indices
 * @returns {[number, number, number]} Physical world coordinates in millimetres
 */
export function voxelToWorld(affine, voxel) {
  if (!affine || affine.length < 3) {
    return [voxel[0], voxel[1], voxel[2]];
  }

  const [i, j, k] = voxel;

  // Handle flat 16-element array (column-major or row-major) or 4x4 2D array
  if (affine.length === 16) {
    // NiiVue mat4 is 16 elements (column-major standard in WebGL)
    const x = affine[0] * i + affine[4] * j + affine[8] * k + affine[12];
    const y = affine[1] * i + affine[5] * j + affine[9] * k + affine[13];
    const z = affine[2] * i + affine[6] * j + affine[10] * k + affine[14];
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100];
  }

  // Standard 2D 4x4 array
  const x = affine[0][0] * i + affine[0][1] * j + affine[0][2] * k + affine[0][3];
  const y = affine[1][0] * i + affine[1][1] * j + affine[1][2] * k + affine[1][3];
  const z = affine[2][0] * i + affine[2][1] * j + affine[2][2] * k + affine[2][3];

  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100];
}

function extract3D(arr) {
  if (!arr || !Array.isArray(arr)) return null;
  if (arr.length >= 4) return [arr[1], arr[2], arr[3]];
  if (arr.length === 3) return [arr[0], arr[1], arr[2]];
  return null;
}

function normalizeAffine4x4(affine) {
  if (!affine) return null;
  if (Array.isArray(affine) && affine.length >= 4 && Array.isArray(affine[0])) {
    return [
      [affine[0][0], affine[0][1], affine[0][2], affine[0][3] ?? 0],
      [affine[1][0], affine[1][1], affine[1][2], affine[1][3] ?? 0],
      [affine[2][0], affine[2][1], affine[2][2], affine[2][3] ?? 0],
      [affine[3]?.[0] ?? 0, affine[3]?.[1] ?? 0, affine[3]?.[2] ?? 0, affine[3]?.[3] ?? 1]
    ];
  }
  if ((Array.isArray(affine) || ArrayBuffer.isView(affine)) && affine.length === 16) {
    // Column-major (NiiVue / WebGL standard)
    return [
      [affine[0], affine[4], affine[8], affine[12]],
      [affine[1], affine[5], affine[9], affine[13]],
      [affine[2], affine[6], affine[10], affine[14]],
      [affine[3], affine[7], affine[11], affine[15]]
    ];
  }
  return null;
}

/**
 * Validates that an overlay segmentation mask matches the reference background MRI's
 * spatial grid, dimensions, voxel spacing, and affine orientation.
 *
 * @param {object} baseVol - Base background MRI volume metadata { dims, pixDims, affine }
 * @param {object} maskVol - Overlay mask volume metadata { dims, pixDims, affine }
 * @returns {{ valid: boolean, error?: string, details?: object, warning?: string }}
 */
export function validateOverlayGeometry(baseVol, maskVol) {
  if (!baseVol || !maskVol) {
    return {
      valid: false,
      error: 'Missing volume metadata for spatial geometry validation.'
    };
  }

  // 1. Check spatial grid dimensions [dimX, dimY, dimZ]
  const baseDims = extract3D(baseVol.dims) || baseVol.dimensions;
  const maskDims = extract3D(maskVol.dims) || maskVol.dimensions;

  if (baseDims && maskDims) {
    const dimsMatch =
      baseDims[0] === maskDims[0] &&
      baseDims[1] === maskDims[1] &&
      baseDims[2] === maskDims[2];

    if (!dimsMatch) {
      const msg = `Incompatible spatial dimensions: reference MRI is [${baseDims.join(', ')}] but segmentation mask is [${maskDims.join(', ')}].`;
      return {
        valid: false,
        compatible: false,
        error: msg,
        reason: msg,
        details: { baseDimensions: baseDims, maskDimensions: maskDims }
      };
    }
  }

  // 2. Check voxel spacing in millimetres (tolerance: 0.05mm)
  const baseSpacing = extract3D(baseVol.pixDims) || baseVol.voxelSpacing;
  const maskSpacing = extract3D(maskVol.pixDims) || maskVol.voxelSpacing;

  if (baseSpacing && maskSpacing) {
    const tolerance = 0.05;
    const spacingMismatch =
      Math.abs(baseSpacing[0] - maskSpacing[0]) > tolerance ||
      Math.abs(baseSpacing[1] - maskSpacing[1]) > tolerance ||
      Math.abs(baseSpacing[2] - maskSpacing[2]) > tolerance;

    if (spacingMismatch) {
      const msg = `Voxel spacing mismatch: reference spacing is [${baseSpacing.map(s => s.toFixed(2)).join(', ')}] mm but mask is [${maskSpacing.map(s => s.toFixed(2)).join(', ')}] mm.`;
      return {
        valid: false,
        compatible: false,
        error: msg,
        reason: msg,
        details: { baseSpacing, maskSpacing }
      };
    }
  }

  // 3. Check spatial affine alignment (if affines are provided on both)
  let affineWarning = null;
  if (baseVol.affine && maskVol.affine) {
    const normBase = normalizeAffine4x4(baseVol.affine);
    const normMask = normalizeAffine4x4(maskVol.affine);
    if (normBase && normMask) {
      // Origin translation tolerance: 0.5 mm
      const origMismatch =
        Math.abs(normBase[0][3] - normMask[0][3]) > 0.5 ||
        Math.abs(normBase[1][3] - normMask[1][3]) > 0.5 ||
        Math.abs(normBase[2][3] - normMask[2][3]) > 0.5;

      // Rotation & scaling tolerance: 0.05
      let rotMismatch = false;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (Math.abs(normBase[r][c] - normMask[r][c]) > 0.05) {
            rotMismatch = true;
            break;
          }
        }
      }

      if (origMismatch || rotMismatch) {
        const msg = 'Spatial affine orientation or origin mismatch between reference MRI and overlay. Equal dimensions do not prove affine alignment.';
        return {
          valid: false,
          compatible: false,
          error: msg,
          reason: msg,
          details: { origMismatch, rotMismatch }
        };
      }
    }
  } else if (!baseVol.affine || !maskVol.affine) {
    affineWarning = 'Spatial affine matrix missing on one or more volumes; verified dimensions and spacing only.';
  }

  return { valid: true, compatible: true, warning: affineWarning };
}

/**
 * Generates the discrete BraTS 2021 NiiVue colormap definition.
 * Labels:
 *   0: Background (Alpha = 0, Transparent)
 *   1: Necrotic & Non-Enhancing Tumor Core (NETC, Cyan #06B6D4)
 *   2: Peritumoral Vasogenic Edema (ED, Yellow #EAB308)
 *   4: Enhancing Tumor (ET, Red #EF4444)
 *
 * @param {object} options
 * @param {boolean} [options.showNETC=true]
 * @param {boolean} [options.showED=true]
 * @param {boolean} [options.showET=true]
 * @returns {object} NiiVue colormap structure { R, G, B, A, I }
 */
export function createBraTSColormap({
  showNETC = true,
  showED = true,
  showET = true
} = {}) {
  return {
    R: [0, 6, 234, 0, 239],
    G: [0, 182, 179, 0, 68],
    B: [0, 212, 8, 0, 68],
    A: [
      0,
      showNETC ? 255 : 0,
      showED ? 255 : 0,
      0,
      showET ? 255 : 0
    ],
    I: [0, 1, 2, 3, 4]
  };
}

/**
 * Generates the Phase 6 Prediction-vs-Expert Error Colormap for NiiVue.
 * Labels:
 *   0: Background (Transparent)
 *   1: True Positive (TP: Lime green #22C55E)
 *   2: False Positive (FP: Rose red #EF4444)
 *   3: False Negative (FN: Sky blue #38BDF8)
 *
 * @param {object} options
 * @param {boolean} [options.showTP=true]
 * @param {boolean} [options.showFP=true]
 * @param {boolean} [options.showFN=true]
 * @returns {object} NiiVue colormap structure { R, G, B, A, I }
 */
export function createErrorColormap({
  showTP = true,
  showFP = true,
  showFN = true
} = {}) {
  return {
    R: [0, 34, 239, 56],
    G: [0, 197, 68, 189],
    B: [0, 94, 68, 248],
    A: [
      0,
      showTP ? 255 : 0,
      showFP ? 255 : 0,
      showFN ? 255 : 0
    ],
    I: [0, 1, 2, 3]
  };
}
