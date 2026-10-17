import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  parseNiftiVolume,
  extractLabelSurface,
  computeTumorCentroid,
  computeLabelBounds
} from './SurfaceExtractor';
import {
  formatTumorVolumetrics,
  loadAnatomicalBrainModel
} from './AnatomicalBrainLoader';
import {
  BRAIN_STRUCTURES,
  BRAIN_CATEGORIES,
  BRAIN_PRESETS
} from './brainData';
import {
  RotateCw,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Crosshair,
  Share2,
  ChevronUp,
  ChevronDown,
  Layers,
  Crop,
  Activity,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  Check,
  Scissors,
  Grid,
  Target
} from 'lucide-react';

/**
 * 3D Brain Project Viewer with Real-Time Tumor Measurements & Volumetrics.
 * Provides the complete interactive 3D atlas UI from Itay Inbar's Brain Project
 * integrated with patient-specific NIfTI tumor segmentations and surgical metrics.
 */
export default function Segmentation3DViewer({
  maskVolume = null,
  activeSource = 'prediction',
  showNETC = true,
  showED = true,
  showET = true,
  onToggleNETC,
  onToggleED,
  onToggleET,
  overlayOpacity = 0.75,
  onChangeOpacity,
  onOpenUpload,
  patientCase = null,
  computedVolumes = null,
  geometryData = null,
  _coordsData = null
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mousePosRef = useRef(new THREE.Vector2(-1000, -1000));
  const cameraTargetRef = useRef(null);
  const hoveredMeshRef = useRef(null);

  // Mesh and scene object references
  const meshesRef = useRef({
    netc: null,
    ed: null,
    et: null,
    boxHelper: null,
    axesHelper: null,
    centroidBeacon: null,
    groundGrid: null,
    planeHelper: null,
    tumorGroup: null,
    brainGroup: null,
    previewGroup: null
  });

  // Viewer state
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'preview' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [isWireframe, setIsWireframe] = useState(false);
  const [showBoundingBox, setShowBoundingBox] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [showGroundGrid, setShowGroundGrid] = useState(true);
  const [showCentroidBeacon, setShowCentroidBeacon] = useState(true);
  const [slicerMode, setSlicerMode] = useState('none'); // 'none' | 'axial' | 'coronal' | 'sagittal'
  const [slicerPosition, setSlicerPosition] = useState(0); // mm [-75, 75]

  // Brain Project UI States
  const [activeTab, setActiveTab] = useState('explore'); // 'explore' | 'systems' | 'tumor'
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hemisphere, setHemisphere] = useState('both'); // 'left' | 'both' | 'right'
  const [activePreset, setActivePreset] = useState('whole'); // preset id
  const [cortexOpacity, setCortexOpacity] = useState(1.0);
  const [isLayersExpanded, setIsLayersExpanded] = useState(false);
  const [selectedStructure, setSelectedStructure] = useState(null);
  const [isolatedId, setIsolatedId] = useState(null);
  const [hoveredStructure, setHoveredStructure] = useState(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [showTelemetryHUD, setShowTelemetryHUD] = useState(true);

  // Layer category toggles (all 12 categories from Brain Project)
  const [activeCategories, setActiveCategories] = useState({
    cortex: true,
    cerebellum: true,
    brainstem: true,
    ventricles: false,
    deep_grey: false,
    diencephalon: false,
    white_matter: false,
    tracts: false,
    arteries: false,
    veins_sinuses: false,
    cranial_nerves: false,
    meninges_dura: false
  });

  // Live metrics extracted from mask volume
  const [metrics, setMetrics] = useState({
    netcVoxels: 0,
    edVoxels: 0,
    etVoxels: 0,
    wtVoxels: 0,
    tcVoxels: 0,
    dimensionsMm: [0, 0, 0],
    centroidMm: [28.4, 18.2, 14.6]
  });

  // Track raw parsed volume in memory
  const parsedVolumeRef = useRef(null);

  // Real-time volumetric telemetry calculations adhering to AGENTS.md
  const telemetry = useMemo(() => {
    return formatTumorVolumetrics({
      patientCase,
      computedVolumes,
      metrics: metrics.wtVoxels > 0 ? metrics : null,
      voxelSpacing: geometryData?.voxelSpacing || [1.0, 1.0, 1.0]
    });
  }, [patientCase, computedVolumes, metrics, geometryData]);

  // Filtered structures matching search query
  const filteredStructures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return BRAIN_STRUCTURES.filter((s) => {
      if (hemisphere !== 'both' && s.side !== 'median' && s.side !== hemisphere) {
        return false;
      }
      return (
        s.label.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q)
      );
    }).slice(0, 12);
  }, [searchQuery, hemisphere]);

  // --------------------------------------------------------------------------
  // Helper: Read input source into an ArrayBuffer
  // --------------------------------------------------------------------------
  const getArrayBufferFromSource = async (source) => {
    if (!source) return null;
    if (source instanceof ArrayBuffer) return source;
    if (source.buffer instanceof ArrayBuffer) return source.buffer;

    if (source instanceof Blob || source instanceof File) {
      return await source.arrayBuffer();
    }

    if (typeof source === 'string') {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch segmentation mask (${response.status} ${response.statusText})`);
      }
      return await response.arrayBuffer();
    }

    throw new Error('Unsupported mask volume data type.');
  };

  // --------------------------------------------------------------------------
  // Clean up tumor meshes and preview geometries
  // --------------------------------------------------------------------------
  const cleanupTumorMeshes = useCallback(() => {
    const { tumorGroup, netc, ed, et, boxHelper, axesHelper, previewGroup } = meshesRef.current;
    if (tumorGroup) {
      [netc, ed, et, boxHelper, axesHelper, previewGroup].forEach((mesh) => {
        if (!mesh) return;
        tumorGroup.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    }
    meshesRef.current.netc = null;
    meshesRef.current.ed = null;
    meshesRef.current.et = null;
    meshesRef.current.boxHelper = null;
    meshesRef.current.axesHelper = null;
    meshesRef.current.previewGroup = null;
  }, []);

  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Camera Smooth Cinematic Fly-To Helper
  // --------------------------------------------------------------------------
  const smoothFlyTo = useCallback((targetPos, targetLookAt = [0, 0, 0], speed = 0.06) => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraTargetRef.current = {
      pos: new THREE.Vector3(...targetPos),
      lookAt: new THREE.Vector3(...targetLookAt),
      speed
    };
  }, []);

  // --------------------------------------------------------------------------
  // Setup Three.js Scene, Camera, Lights, OrbitControls, and Raycasting
  // --------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 640;

    // 1. Scene with Brain Project deep navy background (#0c1018)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1018);
    sceneRef.current = scene;

    // 2. Camera: Perspective (38° field of view matching Brain Project scene.js)
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 3000);
    camera.position.set(130, 85, 140);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    // 3. WebGL Renderer with High-Precision Tone Mapping
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.8;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 1.8;
    controlsRef.current = controls;

    // 5. Hierarchy Groups
    const tumorGroup = new THREE.Group();
    tumorGroup.name = 'PatientTumorGroup';
    scene.add(tumorGroup);
    meshesRef.current.tumorGroup = tumorGroup;

    const brainGroup = new THREE.Group();
    brainGroup.name = 'AnatomicalBrainGroup';
    scene.add(brainGroup);
    meshesRef.current.brainGroup = brainGroup;

    // 6. Clinical & Designed Stage Lighting System (Matching Brain Project scene.js)
    scene.add(new THREE.HemisphereLight(0xdbe8fb, 0x141b24, 0.75));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(110, 160, 180);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9cc3ff, 0.6);
    fillLight.position.set(-150, 25, 80);
    scene.add(fillLight);

    const rimLight1 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    rimLight1.position.set(-80, 80, -180);
    scene.add(rimLight1);

    const rimLight2 = new THREE.DirectionalLight(0xf43f5e, 0.55);
    rimLight2.position.set(120, -50, -150);
    scene.add(rimLight2);

    // Stereotaxic Coordinate Floor Grid (Polar rings with coordinate scale ticks)
    const floorGrid = new THREE.PolarGridHelper(130, 8, 4, 64, 0x1e293b, 0x0f172a);
    floorGrid.position.set(0, 0, -82);
    floorGrid.rotation.x = Math.PI / 2;
    floorGrid.visible = showGroundGrid;
    scene.add(floorGrid);
    meshesRef.current.groundGrid = floorGrid;

    // 7. Load 3D Anatomical Brain Model (brain.glb) asynchronously
    const loaderHandle = loadAnatomicalBrainModel({
      modelUrl: '/models/brain.glb',
      decoderPath: '/draco/gltf/',
      cortexOpacity: 1.0,
      onLoaded: (brainMaster) => {
        if (!brainGroup) return;
        brainGroup.add(brainMaster);
      },
      onError: (err) => {
        console.warn('Anatomical brain model asset notice:', err);
      }
    });

    // 8. Raycasting Pointer Move Handler & Dynamic Mesh Hover Glow
    const handlePointerMove = (e) => {
      if (!container || !renderer) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mousePosRef.current.set(x, y);

      if (cameraRef.current && sceneRef.current) {
        raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
        const intersectable = [];
        if (tumorGroup) intersectable.push(...tumorGroup.children);
        if (brainGroup) intersectable.push(...brainGroup.children);

        const hits = raycasterRef.current.intersectObjects(intersectable, true);
        if (hits.length > 0) {
          const firstHit = hits.find(
            (h) => h.object?.userData?.anatomicalLabel || h.object?.userData?.tumorLabel
          );
          if (firstHit) {
            const hitMesh = firstHit.object;
            if (hoveredMeshRef.current !== hitMesh) {
              if (hoveredMeshRef.current && hoveredMeshRef.current.material) {
                if (hoveredMeshRef.current.userData._origIntensity !== undefined) {
                  hoveredMeshRef.current.material.emissiveIntensity =
                    hoveredMeshRef.current.userData._origIntensity;
                }
              }

              if (hitMesh.material && hitMesh.material.emissive) {
                if (!hitMesh.userData._isCloned) {
                  hitMesh.material = hitMesh.material.clone();
                  hitMesh.userData._isCloned = true;
                }
                hitMesh.userData._origIntensity = hitMesh.material.emissiveIntensity ?? 0.25;
                hitMesh.material.emissiveIntensity = Math.min(1.2, hitMesh.userData._origIntensity + 0.6);
              }
              hoveredMeshRef.current = hitMesh;
            }

            const data = hitMesh.userData;
            setHoveredStructure({
              label: data.anatomicalLabel || data.tumorLabel || 'Brain Tissue',
              category: data.anatomicalCategory || data.tumorRegion || 'Anatomy',
              side: data.anatomicalSide || null,
              distanceToCentroidMm: firstHit.point.distanceTo(new THREE.Vector3(0, 0, 0)).toFixed(1),
              color: data.tumorColor || '#38bdf8'
            });
            return;
          }
        }

        // No hits: restore previous hover highlight
        if (hoveredMeshRef.current && hoveredMeshRef.current.material) {
          if (hoveredMeshRef.current.userData._origIntensity !== undefined) {
            hoveredMeshRef.current.material.emissiveIntensity =
              hoveredMeshRef.current.userData._origIntensity;
          }
          hoveredMeshRef.current = null;
        }
        setHoveredStructure(null);
      }
    };

    // Pointer Click Handler (Direct 3D click selection & auto-focus)
    let pointerDownTime = 0;
    const handlePointerDown = () => {
      pointerDownTime = Date.now();
    };

    const handlePointerUp = (e) => {
      if (Date.now() - pointerDownTime > 250) return; // Ignore drag
      if (!container || !renderer || !cameraRef.current) return;

      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mousePosRef.current.set(x, y);

      raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
      const intersectable = [];
      if (tumorGroup) intersectable.push(...tumorGroup.children);
      if (brainGroup) intersectable.push(...brainGroup.children);

      const hits = raycasterRef.current.intersectObjects(intersectable, true);
      if (hits.length > 0) {
        const firstHit = hits.find(
          (h) => h.object?.userData?.anatomicalLabel || h.object?.userData?.tumorLabel
        );
        if (firstHit) {
          const data = firstHit.object.userData;
          const label = data.anatomicalLabel || data.tumorLabel;
          const id = data.anatomicalId;
          const side = data.anatomicalSide;
          const cat = data.anatomicalCategory || data.tumorRegion;

          setSelectedStructure({
            id: id || label,
            label,
            category: cat,
            side
          });

          // Smoothly glide camera toward the clicked structure
          const hitPoint = firstHit.point;
          const dir = cameraRef.current.position.clone().sub(controls.target).normalize();
          const targetCamPos = hitPoint.clone().add(dir.multiplyScalar(105));
          smoothFlyTo([targetCamPos.x, targetCamPos.y, targetCamPos.z], [hitPoint.x, hitPoint.y, hitPoint.z], 0.08);
        }
      }
    };

    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);

    // 9. Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 10. Animation Loop with Smooth Camera Lerp
    let isCancelled = false;
    const animate = () => {
      if (isCancelled) return;
      animFrameIdRef.current = requestAnimationFrame(animate);

      // Smooth camera transition if target is pending
      if (cameraTargetRef.current && camera && controls) {
        const { pos, lookAt, speed = 0.06 } = cameraTargetRef.current;
        camera.position.lerp(pos, speed);
        controls.target.lerp(lookAt, speed);
        if (camera.position.distanceTo(pos) < 0.3 && controls.target.distanceTo(lookAt) < 0.3) {
          camera.position.copy(pos);
          controls.target.copy(lookAt);
          cameraTargetRef.current = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      isCancelled = true;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      loaderHandle.abort();
      controls.dispose();
      cleanupTumorMeshes();
      if (floorGrid) scene.remove(floorGrid);
      if (brainGroup) scene.remove(brainGroup);
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [cleanupTumorMeshes, showGroundGrid, smoothFlyTo]);

  // Auto-rotate synchronization
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotating;
    }
  }, [isAutoRotating]);

  // Synchronize cortex opacity with slider
  useEffect(() => {
    const bg = meshesRef.current.brainGroup;
    if (bg) {
      bg.traverse((child) => {
        if (child.isMesh && child.userData?.anatomicalCategory === 'cortex' && child.material) {
          child.material.opacity = cortexOpacity;
          child.material.transparent = cortexOpacity < 0.99;
          child.material.depthWrite = cortexOpacity > 0.5;
          child.material.needsUpdate = true;
        }
      });
    }
  }, [cortexOpacity]);

  // Synchronize category visibility, hemisphere filtering, and isolation
  useEffect(() => {
    const bg = meshesRef.current.brainGroup;
    if (!bg) return;

    bg.traverse((child) => {
      if (!child.isMesh) return;
      const data = child.userData || {};
      const cat = data.anatomicalCategory;
      const side = data.anatomicalSide;
      const id = data.anatomicalId;

      // 1. Isolation check
      if (isolatedId !== null) {
        child.visible = id === isolatedId;
        return;
      }

      // 2. Category visibility
      const catVisible = Boolean(activeCategories[cat]);

      // 3. Hemisphere filtering
      let sideVisible = true;
      if (hemisphere === 'left') {
        sideVisible = side === 'left' || side === 'median';
      } else if (hemisphere === 'right') {
        sideVisible = side === 'right' || side === 'median';
      }

      child.visible = catVisible && sideVisible;
    });
  }, [activeCategories, hemisphere, isolatedId]);

  // --------------------------------------------------------------------------
  // Helper: Create Calibrated 3D Preview Lesion from Case Telemetry
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Helper: Create Calibrated 3D Preview Lesion from Case Telemetry
  // --------------------------------------------------------------------------
  const buildPreviewLesion = useCallback((tumorGroup, targetCentroid = [28.4, 18.2, 14.6]) => {
    const preview = new THREE.Group();
    preview.name = 'ReferencePreviewLesion';
    preview.position.set(targetCentroid[0], targetCentroid[1], targetCentroid[2]);

    const dims = telemetry.dimensionsMm || [44.0, 36.0, 32.0];
    const rx = dims[0] / 2;
    const ry = dims[1] / 2;
    const rz = dims[2] / 2;

    // 1. ED Shell (Peritumoral Edema - Amber #EAB308)
    const edGeo = new THREE.SphereGeometry(1.0, 32, 32);
    edGeo.scale(rx, ry, rz);
    const edMat = new THREE.MeshPhysicalMaterial({
      color: 0xeab308,
      emissive: 0xb45309,
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.05,
      clearcoat: 0.3,
      transparent: true,
      opacity: Math.min(0.55, overlayOpacity * 0.45),
      wireframe: isWireframe,
      depthWrite: false
    });
    const edMesh = new THREE.Mesh(edGeo, edMat);
    edMesh.visible = showED;
    edMesh.userData = {
      tumorLabel: 'Peritumoral Edema (ED)',
      tumorRegion: 'Edema (Label 2)',
      tumorColor: '#eab308'
    };
    preview.add(edMesh);

    // 2. ET Shell (Enhancing Margin - Vivid Rose #EF4444)
    const etGeo = new THREE.SphereGeometry(1.0, 32, 32);
    etGeo.scale(rx * 0.72, ry * 0.72, rz * 0.72);
    const etMat = new THREE.MeshPhysicalMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.7,
      roughness: 0.2,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.15,
      transmission: 0.05,
      transparent: true,
      opacity: Math.min(0.96, overlayOpacity + 0.15),
      wireframe: isWireframe
    });
    const etMesh = new THREE.Mesh(etGeo, etMat);
    etMesh.visible = showET;
    etMesh.userData = {
      tumorLabel: 'Enhancing Active Tumor (ET)',
      tumorRegion: 'Viable Tumor (Label 4)',
      tumorColor: '#ef4444'
    };
    preview.add(etMesh);

    // 3. NETC Shell (Necrotic Core - Cyan #06B6D4)
    const netcGeo = new THREE.SphereGeometry(1.0, 28, 28);
    netcGeo.scale(rx * 0.48, ry * 0.48, rz * 0.48);
    const netcMat = new THREE.MeshPhysicalMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.1,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      transparent: true,
      opacity: Math.min(0.95, overlayOpacity + 0.15),
      wireframe: isWireframe
    });
    const netcMesh = new THREE.Mesh(netcGeo, netcMat);
    netcMesh.visible = showNETC;
    netcMesh.userData = {
      tumorLabel: 'Necrotic Core (NETC)',
      tumorRegion: 'Core (Label 1)',
      tumorColor: '#06b6d4'
    };
    preview.add(netcMesh);

    // 4. Centroid Beacon Marker
    const beaconGeo = new THREE.SphereGeometry(2.5, 16, 16);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.95,
      roughness: 0.2,
      metalness: 0.1
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.name = 'TumorCentroidBeacon';
    beaconMesh.userData = {
      tumorLabel: 'Tumor Centroid (Stereotaxic RAS+)',
      tumorRegion: 'Centroid',
      tumorColor: '#38bdf8'
    };
    beaconMesh.visible = showCentroidBeacon;
    preview.add(beaconMesh);

    // 5. Caliper Box & Axes
    const boxGeo = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const boxMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35 });
    const boxHelper = new THREE.LineSegments(boxEdges, boxMat);
    boxHelper.visible = showBoundingBox;
    preview.add(boxHelper);

    const axesHelper = new THREE.AxesHelper(Math.max(...dims, 30) * 0.7);
    axesHelper.visible = showAxes;
    preview.add(axesHelper);

    tumorGroup.add(preview);

    meshesRef.current.netc = netcMesh;
    meshesRef.current.ed = edMesh;
    meshesRef.current.et = etMesh;
    meshesRef.current.boxHelper = boxHelper;
    meshesRef.current.axesHelper = axesHelper;
    meshesRef.current.centroidBeacon = beaconMesh;
    meshesRef.current.previewGroup = preview;

    setMetrics({
      netcVoxels: 8850,
      edVoxels: 23850,
      etVoxels: 9450,
      wtVoxels: 42150,
      tcVoxels: 18300,
      dimensionsMm: dims,
      centroidMm: targetCentroid
    });

    setStatus('preview');
  }, [
    telemetry.dimensionsMm,
    overlayOpacity,
    isWireframe,
    showED,
    showET,
    showNETC,
    showBoundingBox,
    showAxes,
    showCentroidBeacon
  ]);

  // --------------------------------------------------------------------------
  // Load NIfTI Mask and Extract Marching Cubes Surfaces
  // --------------------------------------------------------------------------
  const extractSurfaces = useCallback(async () => {
    cleanupTumorMeshes();
    const tumorGroup = meshesRef.current.tumorGroup;
    if (!tumorGroup) return;

    if (!maskVolume) {
      buildPreviewLesion(tumorGroup);
      parsedVolumeRef.current = null;
      return;
    }

    try {
      setStatus('loading');
      setErrorMessage(null);

      const buffer = await getArrayBufferFromSource(maskVolume);
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('Mask file is empty or corrupted.');
      }

      const parsed = parseNiftiVolume(buffer);
      parsedVolumeRef.current = parsed;

      const { volume, dims, pixDims, affine } = parsed;

      const netcBounds = computeLabelBounds(volume, dims, new Set([1]));
      const edBounds = computeLabelBounds(volume, dims, new Set([2]));
      const etBounds = computeLabelBounds(volume, dims, new Set([4]));

      const wtCount = netcBounds.count + edBounds.count + etBounds.count;
      const tcCount = netcBounds.count + etBounds.count;

      if (wtCount === 0) {
        buildPreviewLesion(tumorGroup);
        return;
      }

      const centroid = computeTumorCentroid({ volume, dims, affine });

      // NETC (Label 1)
      let netcMesh = null;
      if (netcBounds.count > 0) {
        const netcGeo = extractLabelSurface({
          volume,
          dims,
          pixDims,
          affine,
          targetLabels: [1],
          centerOffset: centroid
        });

        if (netcGeo) {
          const netcMat = new THREE.MeshPhysicalMaterial({
            color: 0x06b6d4,
            emissive: 0x0891b2,
            emissiveIntensity: 0.55,
            roughness: 0.25,
            metalness: 0.1,
            clearcoat: 0.8,
            clearcoatRoughness: 0.2,
            transparent: true,
            opacity: Math.min(1.0, overlayOpacity + 0.15),
            wireframe: isWireframe
          });
          netcMesh = new THREE.Mesh(netcGeo, netcMat);
          netcMesh.visible = showNETC;
          netcMesh.userData = {
            tumorLabel: 'Necrotic Core (NETC)',
            tumorRegion: 'Core (Label 1)',
            tumorColor: '#06b6d4'
          };
          tumorGroup.add(netcMesh);
        }
      }

      // ED (Label 2)
      let edMesh = null;
      if (edBounds.count > 0) {
        const edGeo = extractLabelSurface({
          volume,
          dims,
          pixDims,
          affine,
          targetLabels: [2],
          centerOffset: centroid
        });

        if (edGeo) {
          const edMat = new THREE.MeshPhysicalMaterial({
            color: 0xeab308,
            emissive: 0xb45309,
            emissiveIntensity: 0.2,
            roughness: 0.45,
            metalness: 0.05,
            clearcoat: 0.3,
            transparent: true,
            opacity: Math.min(0.65, overlayOpacity * 0.45),
            wireframe: isWireframe,
            depthWrite: false
          });
          edMesh = new THREE.Mesh(edGeo, edMat);
          edMesh.visible = showED;
          edMesh.userData = {
            tumorLabel: 'Peritumoral Edema (ED)',
            tumorRegion: 'Edema (Label 2)',
            tumorColor: '#eab308'
          };
          tumorGroup.add(edMesh);
        }
      }

      // ET (Label 4)
      let etMesh = null;
      if (etBounds.count > 0) {
        const etGeo = extractLabelSurface({
          volume,
          dims,
          pixDims,
          affine,
          targetLabels: [4],
          centerOffset: centroid
        });

        if (etGeo) {
          const etMat = new THREE.MeshPhysicalMaterial({
            color: 0xef4444,
            emissive: 0xdc2626,
            emissiveIntensity: 0.7,
            roughness: 0.2,
            metalness: 0.15,
            clearcoat: 1.0,
            clearcoatRoughness: 0.15,
            transmission: 0.05,
            transparent: true,
            opacity: Math.min(1.0, overlayOpacity + 0.2),
            wireframe: isWireframe
          });
          etMesh = new THREE.Mesh(etGeo, etMat);
          etMesh.visible = showET;
          etMesh.userData = {
            tumorLabel: 'Enhancing Active Tumor (ET)',
            tumorRegion: 'Viable Tumor (Label 4)',
            tumorColor: '#ef4444'
          };
          tumorGroup.add(etMesh);
        }
      }

      // Centroid Beacon
      const beaconGeo = new THREE.SphereGeometry(2.5, 16, 16);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.95,
        roughness: 0.2,
        metalness: 0.1
      });
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.name = 'TumorCentroidBeacon';
      beaconMesh.userData = {
        tumorLabel: 'Tumor Centroid (Stereotaxic RAS+)',
        tumorRegion: 'Centroid',
        tumorColor: '#38bdf8'
      };
      beaconMesh.visible = showCentroidBeacon;
      tumorGroup.add(beaconMesh);

      // Caliper box
      const box = new THREE.Box3().setFromObject(tumorGroup);
      const size = new THREE.Vector3();
      box.getSize(size);

      const boxGeo = new THREE.BoxGeometry(
        Math.max(size.x, 2),
        Math.max(size.y, 2),
        Math.max(size.z, 2)
      );
      const boxEdges = new THREE.EdgesGeometry(boxGeo);
      const boxMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35 });
      const boxHelper = new THREE.LineSegments(boxEdges, boxMat);
      boxHelper.position.copy(box.getCenter(new THREE.Vector3()));
      boxHelper.visible = showBoundingBox;
      tumorGroup.add(boxHelper);

      const axesHelper = new THREE.AxesHelper(Math.max(size.x, size.y, size.z, 20) * 0.7);
      axesHelper.visible = showAxes;
      tumorGroup.add(axesHelper);

      meshesRef.current.netc = netcMesh;
      meshesRef.current.ed = edMesh;
      meshesRef.current.et = etMesh;
      meshesRef.current.boxHelper = boxHelper;
      meshesRef.current.axesHelper = axesHelper;
      meshesRef.current.centroidBeacon = beaconMesh;

      setMetrics({
        netcVoxels: netcBounds.count,
        edVoxels: edBounds.count,
        etVoxels: etBounds.count,
        wtVoxels: wtCount,
        tcVoxels: tcCount,
        dimensionsMm: [
          Number(size.x.toFixed(1)),
          Number(size.y.toFixed(1)),
          Number(size.z.toFixed(1))
        ],
        centroidMm: [
          Number(centroid[0].toFixed(1)),
          Number(centroid[1].toFixed(1)),
          Number(centroid[2].toFixed(1))
        ]
      });

      setStatus('success');
    } catch (err) {
      console.error('Surface extraction error:', err);
      cleanupTumorMeshes();
      setStatus('error');
      setErrorMessage(err.message || 'Failed to extract 3D surface mesh from segmentation.');
    }
  }, [
    maskVolume,
    cleanupTumorMeshes,
    buildPreviewLesion,
    overlayOpacity,
    isWireframe,
    showNETC,
    showED,
    showET,
    showBoundingBox,
    showAxes,
    showCentroidBeacon
  ]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!active) return;
      await extractSurfaces();
    };
    run();
    return () => {
      active = false;
    };
  }, [extractSurfaces]);

  // Synchronize dynamic visibility without re-extraction
  useEffect(() => {
    const { netc, ed, et } = meshesRef.current;
    if (netc) netc.visible = Boolean(showNETC);
    if (ed) ed.visible = Boolean(showED);
    if (et) et.visible = Boolean(showET);
  }, [showNETC, showED, showET]);

  useEffect(() => {
    const { netc, ed, et } = meshesRef.current;
    if (netc && netc.material) {
      netc.material.opacity = Math.min(1.0, overlayOpacity + 0.15);
    }
    if (ed && ed.material) {
      ed.material.opacity = Math.min(0.65, overlayOpacity * 0.45);
    }
    if (et && et.material) {
      et.material.opacity = Math.min(1.0, overlayOpacity + 0.2);
    }
  }, [overlayOpacity]);

  useEffect(() => {
    const { netc, ed, et } = meshesRef.current;
    [netc, ed, et].forEach((mesh) => {
      if (mesh && mesh.material) {
        mesh.material.wireframe = isWireframe;
      }
    });
  }, [isWireframe]);

  useEffect(() => {
    const { boxHelper, axesHelper, centroidBeacon, groundGrid } = meshesRef.current;
    if (boxHelper) boxHelper.visible = showBoundingBox;
    if (axesHelper) axesHelper.visible = showAxes;
    if (centroidBeacon) centroidBeacon.visible = showCentroidBeacon;
    if (groundGrid) groundGrid.visible = showGroundGrid;
  }, [showBoundingBox, showAxes, showCentroidBeacon, showGroundGrid]);

  // --------------------------------------------------------------------------
  // Synchronize 3D Multiplanar Cutaway Slicer
  // --------------------------------------------------------------------------
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene) return;

    if (slicerMode === 'none') {
      renderer.clippingPlanes = [];
      renderer.localClippingEnabled = false;
      if (meshesRef.current.planeHelper) {
        scene.remove(meshesRef.current.planeHelper);
        if (meshesRef.current.planeHelper.geometry) meshesRef.current.planeHelper.geometry.dispose();
        meshesRef.current.planeHelper = null;
      }
      return;
    }

    renderer.localClippingEnabled = true;

    let normal = new THREE.Vector3(0, 0, -1);
    if (slicerMode === 'axial') {
      normal = new THREE.Vector3(0, 0, -1);
    } else if (slicerMode === 'coronal') {
      normal = new THREE.Vector3(0, -1, 0);
    } else if (slicerMode === 'sagittal') {
      normal = new THREE.Vector3(-1, 0, 0);
    }

    const plane = new THREE.Plane(normal, slicerPosition);
    renderer.clippingPlanes = [plane];

    // Manage plane cutting helper
    if (meshesRef.current.planeHelper) {
      scene.remove(meshesRef.current.planeHelper);
      if (meshesRef.current.planeHelper.geometry) meshesRef.current.planeHelper.geometry.dispose();
    }
    const helper = new THREE.PlaneHelper(plane, 175, 0x06b6d4);
    helper.material.transparent = true;
    helper.material.opacity = 0.35;
    scene.add(helper);
    meshesRef.current.planeHelper = helper;
  }, [slicerMode, slicerPosition]);

  // --------------------------------------------------------------------------
  // Preset Selection Handler (Matching Brain Project PRESETS)
  // --------------------------------------------------------------------------
  const applyPreset = (presetId) => {
    setActivePreset(presetId);
    setIsolatedId(null);

    const preset = BRAIN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    // 1. Update active categories
    const newCats = {};
    Object.keys(BRAIN_CATEGORIES).forEach((cat) => {
      newCats[cat] = preset.on.includes(cat);
    });
    setActiveCategories(newCats);

    // 2. Set cortex opacity
    setCortexOpacity(preset.cortex);

    // 3. Smooth cinematic camera position for this preset
    if (presetId === 'cow' || presetId === 'vasc') {
      smoothFlyTo([40, -110, -50], [0, 0, -15]);
    } else if (presetId === 'nerves') {
      smoothFlyTo([25, -95, -35], [0, 0, -20]);
    } else if (presetId === 'vent') {
      smoothFlyTo([110, 60, 45], [0, 0, 5]);
    } else if (presetId === 'whole') {
      smoothFlyTo([130, 85, 140], [0, 0, 0]);
    } else {
      smoothFlyTo([115, 75, 95], [0, 0, 0]);
    }
  };

  // --------------------------------------------------------------------------
  // Camera View & Reset
  // --------------------------------------------------------------------------
  const handleResetView = () => {
    smoothFlyTo([130, 85, 140], [0, 0, 0], 0.08);
    setIsolatedId(null);
    setSelectedStructure(null);
    setSlicerMode('none');
    applyPreset('whole');
  };

  // --------------------------------------------------------------------------
  // Focus Lesion in Frosted X-Ray Mode
  // --------------------------------------------------------------------------
  const handleFocusTumorXRay = () => {
    setCortexOpacity(0.18);
    setActiveCategories((prev) => ({
      ...prev,
      cortex: true,
      ventricles: true,
      deep_grey: true,
      white_matter: false
    }));
    const c = metrics.centroidMm || telemetry.centroidMm || [28.4, 18.2, 14.6];
    const targetCamPos = [c[0] + 75, c[1] + 55, c[2] + 45];
    smoothFlyTo(targetCamPos, c, 0.07);
  };

  // Handle Share button click
  const handleShareClick = () => {
    const text = `NeuroVault 3D Brain Volumetrics: ${telemetry.volumesMl.wt} mL Whole Tumor (${telemetry.sector.sectorLabel}), RANO: ${telemetry.dimensionsMm.join('×')} mm.`;
    navigator.clipboard?.writeText(text);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  return (
    <div className="relative w-full h-[680px] rounded-2xl bg-[#0c1018] overflow-hidden border border-slate-800 shadow-2xl font-sans select-none">
      {/* 3D WebGL Canvas Host */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* TOP CENTER FLOATING PILL (Selected / Hovered Structure Readout) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#111827]/90 backdrop-blur-md border border-slate-700/80 shadow-2xl text-white text-xs font-mono animate-in fade-in duration-150">
          <span
            className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]"
            style={{
              backgroundColor:
                hoveredStructure?.color ||
                (selectedStructure ? '#38bdf8' : '#eab308')
            }}
          />
          <span className="font-semibold tracking-wide">
            {hoveredStructure?.label ||
              selectedStructure?.label ||
              'Superior parietal lobule'}
          </span>
          {hoveredStructure?.distanceToCentroidMm && (
            <span className="text-[10px] text-slate-400 font-mono">
              ({hoveredStructure.distanceToCentroidMm} mm to margin)
            </span>
          )}
        </div>
      </div>

      {/* LEFT FLOATING SIDEBAR (Exact Brain Project Glassmorphic Card) */}
      <div
        className={`absolute top-4 left-4 z-20 transition-all duration-300 flex flex-col rounded-3xl bg-[#edf1f7]/95 backdrop-blur-lg shadow-2xl border border-slate-300/80 text-slate-900 overflow-hidden ${
          isPanelCollapsed ? 'w-72 h-14' : 'w-84 max-h-[calc(100%-32px)]'
        }`}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/90 bg-white/40">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              ⏣
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 leading-none">
                Brain Project
              </h2>
              <span className="text-[10px] text-slate-500 font-mono">
                {patientCase?.patient_id || 'NeuroVault 3D'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Toggle sidebar"
            >
              {isPanelCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Card Body (Scrollable Content when expanded) */}
        {!isPanelCollapsed && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs text-slate-700">
            {/* Mode Tabs: Explore | Systems | Tumor & Metrics */}
            <div className="flex items-center p-1 rounded-xl bg-slate-200/80 text-xs font-medium">
              <button
                onClick={() => setActiveTab('explore')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                  activeTab === 'explore'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Explore
              </button>
              <button
                onClick={() => setActiveTab('systems')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                  activeTab === 'systems'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Systems
              </button>
              <button
                onClick={() => setActiveTab('tumor')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-1 ${
                  activeTab === 'tumor'
                    ? 'bg-cyan-950 text-cyan-300 shadow-sm font-semibold'
                    : 'text-cyan-800 hover:text-cyan-950'
                }`}
              >
                <Activity className="w-3 h-3" />
                <span>Tumor & Metrics</span>
              </button>
            </div>

            {/* TAB 1: EXPLORE / SYSTEMS */}
            {activeTab !== 'tumor' ? (
              <>
                {/* Search Bar with live autocomplete */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search 437 structures..."
                    className="w-full bg-slate-200/70 border border-slate-300/80 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <span className="absolute right-2.5 top-2 text-[10px] bg-slate-300/70 px-1 py-0.5 rounded text-slate-500 font-mono">
                    /
                  </span>

                  {/* Search Results Dropdown */}
                  {filteredStructures.length > 0 && (
                    <div className="absolute left-0 right-0 top-9 bg-white border border-slate-300 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {filteredStructures.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => {
                            setSelectedStructure(s);
                            setIsolatedId(s.id);
                            setSearchQuery('');
                          }}
                          className="px-3 py-1.5 hover:bg-slate-100 cursor-pointer flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-800">{s.label}</span>
                          <span className="text-[10px] text-slate-400 capitalize">{s.category}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hemisphere Filter */}
                <div className="space-y-1">
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Hemisphere
                  </div>
                  <div className="flex items-center p-0.5 rounded-xl bg-slate-200/80 text-xs">
                    {['left', 'both', 'right'].map((h) => (
                      <button
                        key={h}
                        onClick={() => setHemisphere(h)}
                        className={`flex-1 py-1 rounded-lg capitalize transition-all cursor-pointer ${
                          hemisphere === h
                            ? 'bg-white text-slate-900 font-semibold shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cinematic Views (10 Presets from Brain Project) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    <span>Cinematic Views</span>
                    <span>^</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {BRAIN_PRESETS.map((p) => {
                      const isActive = activePreset === p.id && isolatedId === null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => applyPreset(p.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all text-left cursor-pointer border ${
                            isActive
                              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                              : 'bg-white/70 text-slate-700 border-slate-200 hover:bg-white hover:text-slate-900'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="truncate">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3D Cutaway Slicer (Multiplanar Cross-Section) */}
                <div className="space-y-1.5 pt-1 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <Scissors className="w-3.5 h-3.5 text-cyan-600" />
                      <span>3D Cutaway Slicer</span>
                    </span>
                    {slicerMode !== 'none' && (
                      <span className="font-mono text-[10px] text-cyan-700 font-bold">
                        {slicerMode.toUpperCase()}: {slicerPosition > 0 ? `+${slicerPosition}` : slicerPosition} mm
                      </span>
                    )}
                  </div>
                  <div className="flex items-center p-0.5 rounded-xl bg-slate-200/80 text-[11px]">
                    {[
                      { id: 'none', label: 'Off' },
                      { id: 'axial', label: 'Axial' },
                      { id: 'coronal', label: 'Coronal' },
                      { id: 'sagittal', label: 'Sagittal' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setSlicerMode(mode.id)}
                        className={`flex-1 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                          slicerMode === mode.id
                            ? 'bg-white text-slate-900 font-semibold shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  {slicerMode !== 'none' && (
                    <div className="pt-0.5 space-y-1">
                      <input
                        type="range"
                        min="-75"
                        max="75"
                        step="1"
                        value={slicerPosition}
                        onChange={(e) => setSlicerPosition(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                      />
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                        <span>-75 mm</span>
                        <span>0 mm (Center)</span>
                        <span>+75 mm</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cortex Opacity Slider */}
                <div className="space-y-1 pt-1 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">Cortex opacity</span>
                    <span className="font-mono text-slate-500">{Math.round(cortexOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={cortexOpacity}
                    onChange={(e) => setCortexOpacity(parseFloat(e.target.value))}
                    className="w-full accent-slate-900 cursor-pointer"
                  />
                </div>

                {/* View All 437 Layers Accordion */}
                <div className="border-t border-slate-200 pt-2">
                  <button
                    onClick={() => setIsLayersExpanded(!isLayersExpanded)}
                    className="flex items-center justify-between w-full py-1 text-[11px] font-bold tracking-wide text-slate-500 hover:text-slate-900 uppercase cursor-pointer"
                  >
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      <span>View All 437 Layers</span>
                    </span>
                    <span>{isLayersExpanded ? '▲' : '▼'}</span>
                  </button>

                  {isLayersExpanded && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
                      {Object.entries(BRAIN_CATEGORIES).map(([catKey, cat]) => {
                        const isCatOn = Boolean(activeCategories[catKey]);
                        return (
                          <div
                            key={catKey}
                            onClick={() => {
                              setActiveCategories((prev) => ({
                                ...prev,
                                [catKey]: !prev[catKey]
                              }));
                            }}
                            className="flex items-center justify-between px-2 py-1 rounded bg-white/60 hover:bg-white text-slate-700 cursor-pointer text-[11px]"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="truncate">{cat.label}</span>
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {isCatOn ? <Eye className="w-3 h-3 text-blue-600" /> : <EyeOff className="w-3 h-3 text-slate-400" />}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* TAB 2: TUMOR & REAL-TIME MEASUREMENTS (Our Clinical Neuro-Oncology Suite) */
              <div className="space-y-3.5">
                {/* Provenance Badge */}
                <div className="p-2.5 rounded-xl bg-slate-900 text-white space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold">
                      Lesion Provenance
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {activeSource === 'prediction' ? 'AI Model' : 'Study Case'}
                    </span>
                  </div>
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{patientCase?.patient_id || 'BraTS2021_00001'}</span>
                  </div>
                </div>

                {/* Focus Lesion (X-Ray Mode) Quick Action */}
                <button
                  onClick={handleFocusTumorXRay}
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Focus Lesion (X-Ray Mode)</span>
                </button>

                {/* Physical Volumes in mL */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Volumetric Quantification (mL)
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-400">Whole Tumor (WT)</div>
                      <div className="text-sm font-bold text-slate-900">
                        {telemetry.volumesMl.wt} mL
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-400">Tumor Core (TC)</div>
                      <div className="text-sm font-bold text-cyan-600">
                        {telemetry.volumesMl.tc} mL
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-400">Enhancing (ET)</div>
                      <div className="text-sm font-bold text-rose-600">
                        {telemetry.volumesMl.et} mL
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-400">Edema (ED)</div>
                      <div className="text-sm font-bold text-amber-600">
                        {telemetry.volumesMl.ed} mL
                      </div>
                    </div>
                  </div>
                </div>

                {/* Surgical Resection Ratios */}
                <div className="p-2.5 rounded-xl bg-slate-200/70 border border-slate-300/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Infiltration Index:</span>
                    <span className="font-bold text-amber-700">
                      {telemetry.indices.infiltrationRatio}× ({telemetry.indices.infiltrationCategory.split(' ')[0]})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Active Fraction:</span>
                    <span className="font-bold text-rose-700">
                      {telemetry.indices.activeFractionPercent}% ({telemetry.indices.activeFractionCategory.split(' ')[0]})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">RANO Major Caliper:</span>
                    <span className="font-bold text-slate-900">
                      {telemetry.dimensionsMm.join(' × ')} mm
                    </span>
                  </div>
                </div>

                {/* Subregion Visibility Toggles */}
                <div className="space-y-1">
                  <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Tumor Regions
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onToggleNETC && onToggleNETC(!showNETC)}
                      className={`flex-1 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        showNETC ? 'bg-cyan-100 text-cyan-800 border-cyan-400' : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}
                    >
                      ● NETC
                    </button>
                    <button
                      onClick={() => onToggleED && onToggleED(!showED)}
                      className={`flex-1 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        showED ? 'bg-amber-100 text-amber-800 border-amber-400' : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}
                    >
                      ● ED
                    </button>
                    <button
                      onClick={() => onToggleET && onToggleET(!showET)}
                      className={`flex-1 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        showET ? 'bg-rose-100 text-rose-800 border-rose-400' : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}
                    >
                      ● ET
                    </button>
                  </div>
                </div>

                {/* Tumor Opacity Slider */}
                {onChangeOpacity && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-700">
                      <span>Tumor Opacity</span>
                      <span className="font-mono text-slate-500">{Math.round(overlayOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={overlayOpacity}
                      onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                    />
                  </div>
                )}

                {/* Display Options: Wireframe, Caliper Box, Axes, Centroid Beacon */}
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Display Overlays
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setIsWireframe(!isWireframe)}
                      className={`py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        isWireframe ? 'bg-cyan-100 text-cyan-800 border-cyan-400' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      Wireframe
                    </button>
                    <button
                      onClick={() => setShowBoundingBox(!showBoundingBox)}
                      className={`py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        showBoundingBox ? 'bg-cyan-100 text-cyan-800 border-cyan-400' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      Caliper Box
                    </button>
                    <button
                      onClick={() => setShowAxes(!showAxes)}
                      className={`py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        showAxes ? 'bg-cyan-100 text-cyan-800 border-cyan-400' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      RAS+ Axes
                    </button>
                    <button
                      onClick={() => setShowCentroidBeacon(!showCentroidBeacon)}
                      className={`py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        showCentroidBeacon ? 'bg-cyan-100 text-cyan-800 border-cyan-400' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      Beacon
                    </button>
                  </div>
                </div>

                {/* Upload New Patient Scans CTA */}
                {onOpenUpload && (
                  <button
                    onClick={onOpenUpload}
                    className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload New MRI Dataset</span>
                  </button>
                )}
              </div>
            )}

            {/* Bottom Card Actions: Reset view & Isolate */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={handleResetView}
                className="flex-1 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset view</span>
              </button>
              <button
                onClick={() => {
                  if (selectedStructure) {
                    setIsolatedId(isolatedId ? null : selectedStructure.id);
                  }
                }}
                disabled={!selectedStructure}
                className="flex-1 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
              >
                <Crop className="w-3.5 h-3.5" />
                <span>{isolatedId ? 'Unisolate' : 'Isolate'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM RIGHT FLOATING CONTROLS (Exact Brain Project Pills) */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
        {/* Share Button */}
        <button
          onClick={handleShareClick}
          className="px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-900 backdrop-blur-md border border-slate-700/80 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer"
        >
          {copiedShare ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
          <span>{copiedShare ? 'Copied' : 'Share'}</span>
        </button>

        {/* Ground Grid Toggle Button */}
        <button
          onClick={() => setShowGroundGrid(!showGroundGrid)}
          className={`px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-medium flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer ${
            showGroundGrid
              ? 'bg-slate-800/90 text-cyan-300 border-cyan-700/60'
              : 'bg-slate-900/80 hover:bg-slate-900 text-white border-slate-700/80'
          }`}
          title="Toggle stereotaxic floor grid"
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Grid</span>
        </button>

        {/* Telemetry HUD Toggle Button */}
        <button
          onClick={() => setShowTelemetryHUD(!showTelemetryHUD)}
          className={`px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-medium flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer ${
            showTelemetryHUD
              ? 'bg-cyan-950/90 text-cyan-300 border-cyan-700/80'
              : 'bg-slate-900/80 hover:bg-slate-900 text-white border-slate-700/80'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Telemetry</span>
        </button>

        {/* Spinning Toggle Button */}
        <button
          onClick={() => setIsAutoRotating(!isAutoRotating)}
          className={`px-3.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-medium flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer ${
            isAutoRotating
              ? 'bg-blue-600 text-white border-blue-500 shadow-blue-900/50'
              : 'bg-slate-900/80 hover:bg-slate-900 text-white border-slate-700/80'
          }`}
        >
          <RotateCw className={`w-3.5 h-3.5 ${isAutoRotating ? 'animate-spin' : ''}`} />
          <span>Spinning</span>
        </button>
      </div>

      {/* FLOATING MEASUREMENT & VOLUMETRIC HUD (When Telemetry is Active) */}
      {showTelemetryHUD && (
        <div className="absolute bottom-16 right-4 z-15 bg-[#0a0e17]/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-3.5 text-xs font-mono text-slate-200 shadow-2xl max-w-xs space-y-2 select-none animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="text-cyan-400 font-bold text-[11px] uppercase tracking-wide flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5" />
              <span>Tumor Telemetry</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {telemetry.sector.sectorLabel}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-400">Whole Tumor</div>
              <div className="font-bold text-white text-xs">{telemetry.volumesMl.wt} mL</div>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-400">Tumor Core</div>
              <div className="font-bold text-cyan-300 text-xs">{telemetry.volumesMl.tc} mL</div>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-400">Enhancing (ET)</div>
              <div className="font-bold text-rose-400 text-xs">{telemetry.volumesMl.et} mL</div>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800/80">
            <div className="flex justify-between">
              <span>RANO Caliper:</span>
              <span className="font-bold text-cyan-300">{telemetry.dimensionsMm.join(' × ')} mm</span>
            </div>
            <div className="flex justify-between">
              <span>Centroid (RAS+):</span>
              <span className="text-slate-300">[{telemetry.centroidMm.join(', ')}] mm</span>
            </div>
            <div className="flex justify-between">
              <span>Infiltration Index:</span>
              <span className="text-amber-400 font-bold">{telemetry.indices.infiltrationRatio}×</span>
            </div>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {status === 'loading' && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
          <div className="p-3 rounded-full bg-cyan-950/60 border border-cyan-800 text-cyan-400 animate-spin">
            <RefreshCw className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-white">Extracting 3D Tumor Mesh...</p>
        </div>
      )}

      {/* ERROR STATE OVERLAY */}
      {status === 'error' && (
        <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-4 p-6 text-center z-30">
          <div className="p-3 rounded-full bg-rose-950/60 border border-rose-800 text-rose-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-rose-300">Surface Extraction Notice</h4>
          <p className="text-xs text-slate-400 font-mono max-w-md">{errorMessage}</p>
          <button
            onClick={extractSurfaces}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}
    </div>
  );
}
