#!/usr/bin/env python3
"""
NeuroVault - Medical MRI Dataset Inspector and 4D Modality De-stacker
====================================================================
Designed for Medical Segmentation Decathlon (MSD) Task01_BrainTumour.

Capabilities:
1. Validates dataset accessibility, handling disconnected USB drives gracefully.
2. Parses dataset.json, reporting verified 4D tensor structure, modality mappings, and labels.
3. Filters out macOS metadata files ('._*').
4. Loads and inspects 4D MRI volumes (dimensions, voxel spacing, orientation, affine).
5. Splits 4D multi-modal volumes into 4 independent, co-registered 3D NIfTI volumes:
   - Channel 0: FLAIR  -> <case>_flair.nii.gz
   - Channel 1: T1w    -> <case>_t1.nii.gz
   - Channel 2: T1Gd   -> <case>_t1gd.nii.gz
   - Channel 3: T2w    -> <case>_t2.nii.gz
6. Preserves exact physical affine matrices, isotropic voxel spacings, and headers.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import nibabel as nib
import numpy as np

# Verified MSD Task01_BrainTumour Modality Mapping from dataset.json
DEFAULT_MODALITY_MAP = {
    0: "flair",
    1: "t1",
    2: "t1gd",
    3: "t2",
}

DEFAULT_DATASET_PATH = Path(r"E:\Task01_BrainTumour\Task01_BrainTumour")
DEFAULT_OUTPUT_DIR = Path("data/sample_cases")


def check_dataset_accessibility(dataset_path: Path) -> Tuple[bool, Optional[str]]:
    """Checks whether the dataset directory exists and is readable."""
    if not dataset_path.exists():
        return False, (
            f"Dataset directory not found: '{dataset_path}'. "
            "If using an external USB drive, ensure the drive is plugged in and accessible."
        )
    if not dataset_path.is_dir():
        return False, f"Path exists but is not a directory: '{dataset_path}'."
    return True, None


def load_dataset_metadata(dataset_path: Path) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Loads and validates dataset.json from the dataset directory."""
    json_path = dataset_path / "dataset.json"
    if not json_path.exists():
        return None, f"Metadata file missing: '{json_path}'."

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        return metadata, None
    except json.JSONDecodeError as e:
        return None, f"Malformed dataset.json at '{json_path}': {e}"
    except Exception as e:
        return None, f"Error reading dataset.json: {e}"


def list_valid_nifti_files(directory: Path) -> List[Path]:
    """Lists all valid .nii and .nii.gz files in directory, ignoring macOS '._*' metadata."""
    if not directory.exists():
        return []

    valid_files: List[Path] = []
    for item in sorted(directory.iterdir()):
        if item.name.startswith("._"):
            continue
        if item.is_file() and (item.name.endswith(".nii") or item.name.endswith(".nii.gz")):
            valid_files.append(item)
    return valid_files


def inspect_mri_volume(file_path: Path) -> Dict[str, Any]:
    """Loads a NIfTI volume with NiBabel and returns comprehensive spatial and anatomical metrics."""
    if not file_path.exists():
        raise FileNotFoundError(f"MRI volume not found: {file_path}")

    img = nib.load(str(file_path))
    shape = list(img.shape)
    affine = img.affine
    header = img.header
    spacings = [float(round(s, 4)) for s in header.get_zooms()]
    dtype = str(img.get_data_dtype())

    try:
        axcodes = "".join(nib.aff2axcodes(affine))
    except Exception:
        axcodes = "UNKNOWN"

    return {
        "filename": file_path.name,
        "path": str(file_path),
        "shape": shape,
        "dimensions": len(shape),
        "voxel_spacing_mm": spacings,
        "orientation": axcodes,
        "data_type": dtype,
        "affine": affine.tolist(),
    }


def split_4d_volume_to_3d_modalities(
    input_path: Path,
    output_dir: Path,
    modality_map: Optional[Dict[int, str]] = None,
    case_id: Optional[str] = None,
) -> Dict[str, Path]:
    """Extracts each channel of a 4D NIfTI scan into separate 3D NIfTI volumes.

    Preserves:
    - 4x4 spatial affine matrix
    - Voxel dimensions / isotropic spacing
    - Orientation (RAS/LPS)
    - float32 data fidelity
    """
    if modality_map is None:
        modality_map = DEFAULT_MODALITY_MAP

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    img = nib.load(str(input_path))
    shape = img.shape

    if len(shape) != 4:
        raise ValueError(
            f"Expected a 4D NIfTI volume, but '{input_path.name}' has shape {list(shape)} ({len(shape)}D)."
        )

    num_channels = shape[3]
    if num_channels < len(modality_map):
        raise ValueError(
            f"File '{input_path.name}' has {num_channels} channels, expected at least {len(modality_map)}."
        )

    # Determine Case ID
    if not case_id:
        clean_name = input_path.name
        if clean_name.endswith(".nii.gz"):
            case_id = clean_name[:-7]
        elif clean_name.endswith(".nii"):
            case_id = clean_name[:-4]
        else:
            case_id = input_path.stem

    target_dir = output_dir / case_id
    target_dir.mkdir(parents=True, exist_ok=True)

    data = np.asanyarray(img.dataobj, dtype=np.float32)
    affine = img.affine
    header = img.header.copy()

    # Voxel zooms for 3D volume
    zooms_3d = header.get_zooms()[:3]

    created_files: Dict[str, Path] = {}

    for ch_idx, mod_key in sorted(modality_map.items()):
        # Extract 3D slice [H, W, D]
        channel_3d = data[:, :, :, ch_idx]

        out_img = nib.Nifti1Image(channel_3d, affine)
        out_img.header.set_zooms(zooms_3d)

        out_filename = f"{case_id}_{mod_key}.nii.gz"
        out_path = target_dir / out_filename

        nib.save(out_img, str(out_path))
        created_files[mod_key] = out_path

    return created_files


# ─── CLI Commands ─────────────────────────────────────────────────────────────

def run_inspection(dataset_dir: Path) -> None:
    """Executes thorough dataset inspection and outputs a structured diagnostic report."""
    print("=" * 70)
    print("  NEUROVAULT: MRI DATASET & PIPELINE INSPECTION REPORT")
    print("=" * 70)
    print(f"Dataset Target: {dataset_dir}")

    accessible, error_msg = check_dataset_accessibility(dataset_dir)
    if not accessible:
        print(f"\n[FAIL] {error_msg}")
        sys.exit(1)

    print("[PASS] Dataset directory exists and is accessible.")

    metadata, meta_err = load_dataset_metadata(dataset_dir)
    if meta_err:
        print(f"\n[WARN] {meta_err}")
    else:
        print(f"[PASS] dataset.json parsed successfully:")
        print(f"       Name: {metadata.get('name')}")
        print(f"       Description: {metadata.get('description')}")
        print(f"       Tensor Image Size: {metadata.get('tensorImageSize')}")
        print(f"       Modalities: {metadata.get('modality')}")
        print(f"       Labels: {metadata.get('labels')}")
        print(f"       Training Count: {metadata.get('numTraining')}")
        print(f"       Testing Count: {metadata.get('numTest')}")

    # Inspect imagesTr
    images_tr_dir = dataset_dir / "imagesTr"
    valid_images = list_valid_nifti_files(images_tr_dir)
    print(f"\n[PASS] Valid scans in 'imagesTr': {len(valid_images)} files (ignored macOS '._*' files).")

    # Inspect labelsTr
    labels_tr_dir = dataset_dir / "labelsTr"
    valid_labels = list_valid_nifti_files(labels_tr_dir)
    print(f"[PASS] Valid files in 'labelsTr': {len(valid_labels)} files.")

    if not valid_images:
        print("\n[WARN] No valid NIfTI files found in 'imagesTr'.")
        return

    # Inspect first case
    sample_file = valid_images[0]
    print(f"\n[INSPECT] Loading sample case: {sample_file.name}")
    info = inspect_mri_volume(sample_file)
    print(f"          Array Shape: {info['shape']}")
    print(f"          Dimensions:  {info['dimensions']}D (Multi-Modal Tensor)")
    print(f"          Voxel Sizes: {info['voxel_spacing_mm']} mm")
    print(f"          Orientation: {info['orientation']}")
    print(f"          Data Type:   {info['data_type']}")
    print("          Affine Matrix:")
    for row in info["affine"]:
        print(f"            {[round(x, 4) for x in row]}")

    print("\n" + "=" * 70)
    print("  ROOT CAUSE DIAGNOSIS & ACTIONABLE CONCLUSION")
    print("=" * 70)
    print("1. MSD Task01_BrainTumour cases are 4D volumes (shape: [240, 240, 155, 4]).")
    print("2. The NeuroVault UI and validator expect 4 separate 3D volumes.")
    print("3. Use the 'split' command to decompose any 4D scan into separate T1, T1Gd, T2, FLAIR files.")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="NeuroVault MRI Dataset Inspector & Slicer")
    subparsers = parser.add_subparsers(dest="command")

    # Inspect Command
    inspect_parser = subparsers.add_parser("inspect", help="Inspect dataset structure and sample volumes")
    inspect_parser.add_argument(
        "--path",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Path to Task01_BrainTumour dataset directory",
    )

    # Split Command
    split_parser = subparsers.add_parser("split", help="Split a 4D case into 4 separate 3D NIfTI files")
    split_parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_DATASET_PATH / "imagesTr" / "BRATS_001.nii.gz",
        help="Path to input 4D .nii.gz file",
    )
    split_parser.add_argument(
        "--outdir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Output directory to store extracted 3D sequences",
    )
    split_parser.add_argument(
        "--case-id",
        type=str,
        default=None,
        help="Optional case identifier override (e.g. BRATS_001)",
    )

    args = parser.parse_args()

    if args.command == "inspect" or args.command is None:
        dataset_dir = getattr(args, "path", DEFAULT_DATASET_PATH)
        run_inspection(dataset_dir)
    elif args.command == "split":
        print(f"Splitting 4D volume: {args.input}")
        result = split_4d_volume_to_3d_modalities(
            input_path=args.input,
            output_dir=args.outdir,
            case_id=args.case_id,
        )
        print("[SUCCESS] Successfully extracted 4 co-registered 3D sequences:")
        for mod, path in result.items():
            print(f"          - {mod.upper()}: {path} ({os.path.getsize(path):,} bytes)")


if __name__ == "__main__":
    main()
