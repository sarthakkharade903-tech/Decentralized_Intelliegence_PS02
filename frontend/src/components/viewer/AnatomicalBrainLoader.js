import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Anatomical Brain Model Category Colormap & Visual Shading Profiles
 * Derived from Z-Anatomy / Brain Project (Itay Inbar) anatomical taxonomy.
 */
export const ANATOMICAL_CATEGORIES = {
  cortex: {
    id: 'cortex',
    label: 'Cerebral Cortex',
    color: 0xE7DEC9, // Cream/bone cortical surface
    emissive: 0x222222,
    opacity: 1.0,
    roughness: 0.75,
    metalness: 0.05,
    transparent: true,
    depthWrite: true,
    renderOrder: 1
  },
  cerebellum: {
    id: 'cerebellum',
    label: 'Cerebellar Hemispheres',
    color: 0xF0894E, // Warm apricot/coral
    emissive: 0x332010,
    opacity: 1.0,
    roughness: 0.75,
    metalness: 0.05,
    transparent: true,
    depthWrite: true,
    renderOrder: 1
  },
  brainstem: {
    id: 'brainstem',
    label: 'Brainstem (Midbrain, Pons, Medulla)',
    color: 0xE8B24A, // Warm golden stone
    emissive: 0x332810,
    opacity: 1.0,
    roughness: 0.7,
    metalness: 0.05,
    transparent: true,
    depthWrite: true,
    renderOrder: 2
  },
  deep_grey: {
    id: 'deep_grey',
    label: 'Deep Grey / Basal Ganglia',
    color: 0xB57BE0, // Purple / violet
    emissive: 0x4a1d6e,
    opacity: 0.95,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    depthWrite: true,
    renderOrder: 3
  },
  diencephalon: {
    id: 'diencephalon',
    label: 'Diencephalon (Thalamus, Hypothalamus)',
    color: 0x7E8CF2, // Periwinkle / indigo
    emissive: 0x27348b,
    opacity: 0.95,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    depthWrite: true,
    renderOrder: 3
  },
  white_matter: {
    id: 'white_matter',
    label: 'White Matter & Commissures',
    color: 0xD7DDE8, // Silver / grey-white
    emissive: 0x2a3140,
    opacity: 0.9,
    roughness: 0.4,
    metalness: 0.05,
    transparent: true,
    depthWrite: true,
    renderOrder: 2
  },
  tracts: {
    id: 'tracts',
    label: 'White-Matter Tracts (Pathways)',
    color: 0x5FB6C9, // Teal / turquoise
    emissive: 0x114e5a,
    opacity: 0.9,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    depthWrite: true,
    renderOrder: 3
  },
  ventricles: {
    id: 'ventricles',
    label: 'Ventricular System (CSF)',
    color: 0x3FC8D6, // Bright cyan / sapphire
    emissive: 0x09525c,
    opacity: 0.85,
    roughness: 0.15,
    metalness: 0.3,
    transparent: true,
    depthWrite: true,
    renderOrder: 2
  },
  arteries: {
    id: 'arteries',
    label: 'Arteries (Circle of Willis)',
    color: 0xF05068, // Red / rose
    emissive: 0x6e1220,
    opacity: 0.95,
    roughness: 0.3,
    metalness: 0.2,
    transparent: true,
    depthWrite: true,
    renderOrder: 4
  },
  veins_sinuses: {
    id: 'veins_sinuses',
    label: 'Dural Venous Sinuses & Veins',
    color: 0x5078E8, // Cobalt blue
    emissive: 0x12276e,
    opacity: 0.9,
    roughness: 0.3,
    metalness: 0.2,
    transparent: true,
    depthWrite: true,
    renderOrder: 4
  },
  cranial_nerves: {
    id: 'cranial_nerves',
    label: 'Cranial Nerves (I–XII)',
    color: 0xD9D24A, // Golden yellow
    emissive: 0x575312,
    opacity: 0.95,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    depthWrite: true,
    renderOrder: 4
  },
  meninges_dura: {
    id: 'meninges_dura',
    label: 'Meninges & Dura (Falx, Tentorium)',
    color: 0xCC63CC, // Magenta
    emissive: 0x471647,
    opacity: 0.35,
    roughness: 0.45,
    metalness: 0.05,
    transparent: true,
    depthWrite: false,
    renderOrder: 1
  }
};

/**
 * Categorize a GLTF mesh into one of the core anatomical functional groups
 * based on its embedded extras or naming hierarchy.
 *
 * @param {THREE.Mesh} mesh
 * @returns {string} Category key in ANATOMICAL_CATEGORIES
 */
export function categorizeAnatomicalMesh(mesh) {
  const extras = mesh?.userData?.extras || {};
  const rawCat = (extras.bx_cat || '').toLowerCase();
  const name = (mesh?.name || extras.bx_label || '').toLowerCase();

  if (rawCat === 'cortex' || name.includes('gyrus') || name.includes('sulcus') || name.includes('pole')) {
    return 'cortex';
  }
  if (rawCat === 'ventricles' || name.includes('ventricle') || name.includes('aqueduct')) {
    return 'ventricles';
  }
  if (rawCat === 'tracts' || name.includes('tract') || name.includes('fasciculus') || name.includes('radiation')) {
    return 'tracts';
  }
  if (rawCat === 'deep_grey' || rawCat === 'diencephalon' || name.includes('thalam') || name.includes('caudate') || name.includes('putamen') || name.includes('hippocampus') || name.includes('amygdala')) {
    return 'deep_grey';
  }
  if (rawCat === 'white_matter' || name.includes('callosum') || name.includes('fornix') || name.includes('internal capsule')) {
    return 'white_matter';
  }
  if (rawCat === 'arteries' || name.includes('artery') || name.includes('arterial') || name.includes('carotid')) {
    return 'arteries';
  }
  if (rawCat === 'veins_sinuses' || name.includes('sinus') || name.includes('vein') || name.includes('venous')) {
    return 'veins_sinuses';
  }
  if (rawCat === 'cranial_nerves' || name.includes('nerve') || name.includes('chiasm')) {
    return 'cranial_nerves';
  }
  if (rawCat === 'cerebellum' || name.includes('cerebell') || name.includes('vermis') || name.includes('folia')) {
    return 'cerebellum';
  }
  if (rawCat === 'brainstem' || name.includes('pons') || name.includes('medulla') || name.includes('midbrain') || name.includes('peduncle')) {
    return 'brainstem';
  }

  // Fallback to cortex if unspecified
  return 'cortex';
}

/**
 * Creates the SO(3) 3D coordinate transformation matrix that converts
 * the Z-Anatomy / Brain Project coordinate space (meters) directly into
 * medical RAS+ space (physical millimeters).
 *
 * Model coordinates:
 * - Model X: Left (+X), Right (-X) [meters]
 * - Model Y: Superior (+Y) [meters]
 * - Model Z: Anterior (+Z) [meters]
 *
 * RAS+ Scene coordinates:
 * - Scene X: Right (+X), Left (-X) [mm]  => -1000 * Model X
 * - Scene Y: Anterior (+Y) [mm]         => +1000 * Model Z
 * - Scene Z: Superior (+Z) [mm]         => +1000 * Model Y
 *
 * Note: Determinant = (-1) * (0 - 1) = +1 (Pure proper rotation, no parity inversion).
 *
 * @param {number} scale Scale multiplier (default 1000 to convert meters to mm)
 * @returns {THREE.Matrix4}
 */
export function createAnatomicalTransformMatrix(scale = 1000) {
  return new THREE.Matrix4().set(
    -scale,      0,      0, 0,
         0,      0,  scale, 0,
         0,  scale,      0, 0,
         0,      0,      0, 1
  );
}

/**
 * Computes clinical anatomical sector localization from physical centroid coordinates (RAS+ mm).
 * Relates tumor location to anatomical cerebral quadrants and depth.
 *
 * @param {number[]} centroidMm [X, Y, Z] in RAS+ mm
 * @param {number[]} [brainCenterMm] Optional patient brain center
 * @returns {object} { hemisphere, lobe, depth, sectorLabel }
 */
export function computeAnatomicalSector(centroidMm = [0, 0, 0], brainCenterMm = [0, 0, 0]) {
  const relX = centroidMm[0] - brainCenterMm[0];
  const relY = centroidMm[1] - brainCenterMm[1];
  const relZ = centroidMm[2] - brainCenterMm[2];

  // Hemisphere
  let hemisphere = 'Midline';
  if (relX > 4) hemisphere = 'Right';
  else if (relX < -4) hemisphere = 'Left';

  // Lobe / Anterior-Posterior & Superior-Inferior distribution
  let lobe = 'Periventricular';
  if (relY > 15) {
    lobe = relZ > 10 ? 'Frontal (Superior)' : 'Frontotemporal';
  } else if (relY >= -15 && relY <= 15) {
    lobe = relZ > 12 ? 'Frontoparietal (Centrum Semiovale)' : 'Temporoparietal / Insular';
  } else if (relY < -15 && relY >= -45) {
    lobe = relZ > 5 ? 'Parietal' : 'Temporo-occipital';
  } else if (relY < -45) {
    lobe = 'Occipital';
  }

  // Depth
  const radialDist = Math.hypot(relX, relY * 0.9, relZ * 1.1);
  let depth = 'Cortical / Subcortical';
  if (radialDist < 25) {
    depth = 'Deep Paraventricular';
  } else if (radialDist < 48) {
    depth = 'Subcortical White Matter';
  } else {
    depth = 'Cortical Convexity';
  }

  const sectorLabel = hemisphere === 'Midline'
    ? `${lobe} (${depth})`
    : `${hemisphere} ${lobe} (${depth})`;

  return {
    hemisphere,
    lobe,
    depth,
    sectorLabel,
    radialDistanceMm: Number(radialDist.toFixed(1))
  };
}

/**
 * Computes quantitative surgical neuro-oncology indices based on physical volumes in mL
 * adhering strictly to AGENTS.md rules.
 *
 * @param {object} params
 * @param {number} params.wt - Whole Tumor volume in mL
 * @param {number} params.tc - Tumor Core volume in mL
 * @param {number} params.et - Enhancing Tumor volume in mL
 * @param {number} params.ed - Peritumoral Edema volume in mL
 * @param {number} params.netc - Necrotic Core volume in mL
 * @returns {object} Calculated clinical indices and classifications
 */
export function calculateTumorResectionIndices({ wt = 0, tc = 0, et = 0, ed = 0, netc = 0 }) {
  const safeTc = tc > 0.001 ? tc : (netc + et);

  // 1. Infiltration Index: Ratio of Vasogenic Edema to Tumor Core (ED / TC)
  const infiltrationRatio = safeTc > 0 ? Number((ed / safeTc).toFixed(2)) : 0;
  let infiltrationCategory = 'Minimal Infiltration';
  if (infiltrationRatio >= 1.5) {
    infiltrationCategory = 'Severe Infiltration (Diffuse Infiltration along Tracts)';
  } else if (infiltrationRatio >= 1.0) {
    infiltrationCategory = 'Marked Infiltration (Significant Infiltrative Margin)';
  } else if (infiltrationRatio >= 0.5) {
    infiltrationCategory = 'Moderate Infiltration';
  }

  // 2. Active Fraction (Angiogenesis / Vital Tumor Fraction): ET / TC
  const activeFractionPercent = safeTc > 0 ? Number(((et / safeTc) * 100).toFixed(1)) : 0;
  let activeFractionCategory = 'Low Vitality';
  if (activeFractionPercent >= 60) {
    activeFractionCategory = 'High Angiogenic Density (Aggressive Glioblastoma Pattern)';
  } else if (activeFractionPercent >= 35) {
    activeFractionCategory = 'Moderate Angiogenesis';
  } else if (activeFractionPercent > 0) {
    activeFractionCategory = 'Low / Focal Enhancement';
  }

  // 3. Necrotic Core Fraction: NETC / TC
  const necroticFractionPercent = safeTc > 0 ? Number(((netc / safeTc) * 100).toFixed(1)) : 0;

  // 4. Edema Burden: ED / WT
  const edemaFractionPercent = wt > 0 ? Number(((ed / wt) * 100).toFixed(1)) : 0;

  return {
    infiltrationRatio,
    infiltrationCategory,
    activeFractionPercent,
    activeFractionCategory,
    necroticFractionPercent,
    edemaFractionPercent
  };
}

/**
 * Formats unified volumetric measurements pulling from live NIfTI extraction,
 * Trust Layer computed volumes, or verified patient case metadata.
 *
 * @param {object} params
 * @returns {object} Structured telemetry dataset
 */
export function formatTumorVolumetrics({
  patientCase = null,
  computedVolumes = null,
  metrics = null,
  voxelSpacing = [1.0, 1.0, 1.0]
}) {
  const spacingVol = (voxelSpacing[0] || 1) * (voxelSpacing[1] || 1) * (voxelSpacing[2] || 1);

  // Priority 1: Direct computed volumes from active NIfTI volume if available
  let wtMl = 0;
  let tcMl = 0;
  let etMl = 0;
  let edMl = 0;
  let netcMl = 0;

  if (computedVolumes && computedVolumes.WT !== undefined) {
    wtMl = Number(computedVolumes.WT.toFixed(2));
    tcMl = Number(computedVolumes.TC.toFixed(2));
    etMl = Number(computedVolumes.ET.toFixed(2));
    edMl = Number((computedVolumes.ED ?? (computedVolumes.WT - computedVolumes.TC)).toFixed(2));
    netcMl = Number((computedVolumes.NETC ?? (computedVolumes.TC - computedVolumes.ET)).toFixed(2));
  } else if (metrics && metrics.wtVoxels > 0) {
    // Formula: Voxel Count * (dx * dy * dz) / 1000
    wtMl = Number(((metrics.wtVoxels * spacingVol) / 1000).toFixed(2));
    tcMl = Number(((metrics.tcVoxels * spacingVol) / 1000).toFixed(2));
    etMl = Number(((metrics.etVoxels * spacingVol) / 1000).toFixed(2));
    edMl = Number(((metrics.edVoxels * spacingVol) / 1000).toFixed(2));
    netcMl = Number(((metrics.netcVoxels * spacingVol) / 1000).toFixed(2));
  } else if (patientCase?.volumes_ml) {
    wtMl = Number(patientCase.volumes_ml.whole_tumor || 0);
    tcMl = Number(patientCase.volumes_ml.tumor_core || 0);
    etMl = Number(patientCase.volumes_ml.enhancing_tumor || 0);
    edMl = Number(patientCase.volumes_ml.edema || 0);
    netcMl = Number(patientCase.volumes_ml.necrotic_core || 0);
  }

  const indices = calculateTumorResectionIndices({
    wt: wtMl,
    tc: tcMl,
    et: etMl,
    ed: edMl,
    netc: netcMl
  });

  // Dimensions
  const dimsMm = metrics?.dimensionsMm || [
    patientCase?.metrics?.dimensions_mm?.max_axial_diameter || 44.0,
    patientCase?.metrics?.dimensions_mm?.max_coronal_diameter || 36.0,
    patientCase?.metrics?.dimensions_mm?.max_sagittal_diameter || 32.0
  ];

  const rano2d = Number((dimsMm[0] * dimsMm[1]).toFixed(1));
  const centroid = metrics?.centroidMm || [28.4, 18.2, 14.6];
  const sector = computeAnatomicalSector(centroid);

  return {
    volumesMl: {
      wt: wtMl,
      tc: tcMl,
      et: etMl,
      ed: edMl,
      netc: netcMl
    },
    indices,
    dimensionsMm: dimsMm,
    ranoProductMm2: rano2d,
    centroidMm: centroid,
    sector
  };
}

/**
 * Loads the Draco-compressed 3D Anatomical Brain Model (brain.glb)
 * and configures its materials, spatial orientation, and anatomical structure hierarchy.
 *
 * @param {object} params
 * @param {string} [params.modelUrl] Path to brain.glb (default '/models/brain.glb')
 * @param {string} [params.decoderPath] Path to draco gltf decoder (default '/draco/gltf/')
 * @param {number} [params.cortexOpacity] Initial opacity for cortex shell (default 0.18)
 * @param {Function} [params.onLoaded] Callback (brainGroup, categoryMeshesMap)
 * @param {Function} [params.onError] Error callback
 * @returns {object} Loader controller { abort }
 */
export function loadAnatomicalBrainModel({
  modelUrl = '/models/brain.glb',
  decoderPath = '/draco/gltf/',
  cortexOpacity = 0.18,
  onLoaded,
  onError
}) {
  let isAborted = false;
  let dracoLoader = null;

  try {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(decoderPath);
    dracoLoader.setDecoderConfig({ type: 'js' });

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      modelUrl,
      (gltf) => {
        if (isAborted) return;
        const rootScene = gltf.scene;

        // Container master group for the anatomical brain
        const brainMaster = new THREE.Group();
        brainMaster.name = 'AnatomicalBrainMaster';

        // Apply SO(3) coordinate transform: converts Z-Anatomy meters to RAS+ millimeters
        const transformMatrix = createAnatomicalTransformMatrix(1000);
        rootScene.applyMatrix4(transformMatrix);

        // Precompute category materials
        const materialCache = {};
        Object.entries(ANATOMICAL_CATEGORIES).forEach(([key, cfg]) => {
          const isVentricle = key === 'ventricles';
          const isArtery = key === 'arteries';
          const isSinus = key === 'veins_sinuses';
          const isCortex = key === 'cortex';

          const mat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(cfg.color),
            emissive: new THREE.Color(cfg.emissive),
            emissiveIntensity: isArtery ? 0.4 : isSinus ? 0.35 : 0.25,
            roughness: isVentricle ? 0.1 : cfg.roughness,
            metalness: cfg.metalness,
            transparent: true,
            opacity: isCortex ? cortexOpacity : cfg.opacity,
            clearcoat: isCortex ? 0.6 : isVentricle ? 0.95 : 0.3,
            clearcoatRoughness: 0.2,
            transmission: isVentricle ? 0.3 : 0.0,
            side: THREE.DoubleSide,
            depthWrite: cfg.depthWrite
          });
          materialCache[key] = mat;
        });

        const categoryMeshes = {
          cortex: [],
          deep_grey: [],
          diencephalon: [],
          white_matter: [],
          tracts: [],
          ventricles: [],
          cerebellum: [],
          brainstem: [],
          arteries: [],
          veins_sinuses: [],
          cranial_nerves: [],
          meninges_dura: []
        };

        // Traverse all meshes and organize them
        rootScene.traverse((child) => {
          if (child.isMesh) {
            const cat = categorizeAnatomicalMesh(child);
            const mat = materialCache[cat] || materialCache.cortex;
            child.material = mat;
            child.renderOrder = ANATOMICAL_CATEGORIES[cat]?.renderOrder || 1;

            // Preserve anatomical label metadata for raycasting HUD
            const extras = child.userData?.extras || {};
            child.userData = {
              ...child.userData,
              anatomicalCategory: cat,
              anatomicalLabel: extras.bx_label || child.name || 'Brain Tissue',
              anatomicalSide: extras.bx_side || (child.name.endsWith('.r') ? 'right' : child.name.endsWith('.l') ? 'left' : 'median'),
              anatomicalId: extras.bx_id || null,
              isAnatomicalModel: true
            };

            if (categoryMeshes[cat]) {
              categoryMeshes[cat].push(child);
            }
          }
        });

        // Compute true cerebrum bounding center directly from cerebral cortex meshes
        // (Prevents descending spinal nerves and lower spinal cord from skewing the vertical center)
        rootScene.updateMatrixWorld(true);

        const cerebrumBox = new THREE.Box3();
        if (categoryMeshes.cortex && categoryMeshes.cortex.length > 0) {
          categoryMeshes.cortex.forEach((mesh) => {
            cerebrumBox.expandByObject(mesh);
          });
        } else {
          cerebrumBox.setFromObject(rootScene);
        }

        const center = new THREE.Vector3();
        cerebrumBox.getCenter(center);

        // Center the brain so its cerebrum center sits at (0, 0, 0)
        rootScene.position.set(-center.x, -center.y, -center.z);
        rootScene.updateMatrixWorld(true);
        brainMaster.add(rootScene);

        // Save reference to cerebrum center
        brainMaster.userData = {
          originalCenter: center,
          materialCache,
          categoryMeshes,
          box
        };

        if (onLoaded) {
          onLoaded(brainMaster, categoryMeshes, materialCache);
        }
      },
      undefined,
      (err) => {
        if (isAborted) return;
        console.warn('Failed to load high-poly brain.glb model:', err);
        if (onError) onError(err);
      }
    );
  } catch (e) {
    if (onError) onError(e);
  }

  return {
    abort: () => {
      isAborted = true;
      if (dracoLoader) {
        try {
          dracoLoader.dispose();
        } catch {
          // Ignore dispose error
        }
      }
    }
  };
}
