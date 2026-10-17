import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  RotateCw,
  Search,
  ExternalLink,
  Scissors,
  AlertTriangle,
  X,
  Eye,
} from 'lucide-react';

export default function DetailedParts3DViewer({
  meshUrl,
  showNETC = true,
  showED = true,
  showET = true,
  isAutoRotating = false,
  cameraPreset = 'iso',
  onMetadataLoaded = null,
}) {
  const containerRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const animationFrameRef = useRef(null);
  const clippingPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100));

  // Brain Model Nodes & Materials references
  const regionNodesRef = useRef(new Map());
  const brainMeshesRef = useRef([]);
  const tumorMeshesRef = useRef({ et: null, netc: null, ed: null });
  const selectedRegionRef = useRef(null);

  // Component UI States
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('Initializing Anatomical Neuro-Engine...');
  const [error, setError] = useState(null);
  const [meshInfo, setMeshInfo] = useState(null);
  const [regionsDb, setRegionsDb] = useState({});

  // Interactive Anatomical Selection
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchList, setShowSearchList] = useState(false);

  // Slicing & Visibility Controls
  const [sliceAxis, setSliceAxis] = useState('x'); // 'x' (Sagittal), 'y' (Axial), 'z' (Coronal)
  const [sliceValue, setSliceValue] = useState(100); // 0 to 100%
  const [sliceEnabled, setSliceEnabled] = useState(false);
  const [brainOpacity, setBrainOpacity] = useState(0.35); // 0.1 to 1.0
  const [localAutoRotate, setLocalAutoRotate] = useState(isAutoRotating);
  const [involvedRegions, setInvolvedRegions] = useState([]);

  // Bounding box limits for clipping planes
  const boundsRef = useRef({
    minX: -1.0, maxX: 1.0,
    minY: -1.0, maxY: 1.0,
    minZ: -1.0, maxZ: 1.0,
  });

  const sliceEnabledRef = useRef(sliceEnabled);
  const sliceAxisRef = useRef(sliceAxis);
  const localAutoRotateRef = useRef(localAutoRotate);

  useEffect(() => {
    sliceEnabledRef.current = sliceEnabled;
  }, [sliceEnabled]);

  useEffect(() => {
    sliceAxisRef.current = sliceAxis;
  }, [sliceAxis]);

  useEffect(() => {
    localAutoRotateRef.current = localAutoRotate;
  }, [localAutoRotate]);

  // Keep selectedRegionRef in sync
  useEffect(() => {
    selectedRegionRef.current = selectedRegion;
  }, [selectedRegion]);

  // Keep localAutoRotate in sync with prop
  useEffect(() => {
    setLocalAutoRotate(isAutoRotating);
  }, [isAutoRotating]);

  // 1. Fetch Anatomical Descriptions (regions.json)
  useEffect(() => {
    fetch('/data/regions.json')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load regions metadata');
        return res.json();
      })
      .then((data) => {
        setRegionsDb(data);
      })
      .catch((err) => {
        console.warn('Regions metadata fallback:', err);
      });
  }, []);

  // 2. Fetch Patient 3D Tumor Mesh
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setLoadingStep('Fetching Patient Segmentation Mesh...');

    const targetUrl = meshUrl
      ? (meshUrl.startsWith('http') ? meshUrl : `http://localhost:8000${meshUrl}`)
      : 'http://localhost:8000/api/v1/artifacts/sample_mesh.json';

    fetch(targetUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isCancelled) return;
        setMeshInfo(data);
        if (onMetadataLoaded && data.metadata) onMetadataLoaded(data.metadata);
      })
      .catch(() => {
        if (isCancelled) return;
        // Fallback to sample_mesh.json
        fetch('http://localhost:8000/api/v1/artifacts/sample_mesh.json')
          .then((r) => r.json())
          .then((sampleData) => {
            if (isCancelled) return;
            setMeshInfo(sampleData);
            if (onMetadataLoaded && sampleData.metadata) onMetadataLoaded(sampleData.metadata);
          })
          .catch((fallbackErr) => {
            if (isCancelled) return;
            setError(fallbackErr.message || 'Unable to load 3D mesh.');
            setLoading(false);
          });
      });

    return () => { isCancelled = true; };
  }, [meshUrl]);

  // 3. Initialize Three.js Scene, OrbitControls & Draco GLTF Loader
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 900;
    const height = container.clientHeight || 620;

    // Create Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c040a); // Deep velvet obsidian rose
    sceneRef.current = scene;

    // Create Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(2.2, 1.8, 3.2);
    cameraRef.current = camera;

    // Create Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.localClippingEnabled = true;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Create OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 1.2;
    controls.minDistance = 0.8;
    controls.maxDistance = 6.0;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // ── LIGHTING SETUP ────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xfff1f6, 1.4);
    scene.add(ambientLight);

    const mainKeyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainKeyLight.position.set(5, 6, 5);
    scene.add(mainKeyLight);

    const magentaRimLight = new THREE.DirectionalLight(0xf43f5e, 2.0);
    magentaRimLight.position.set(-5, -2, -4);
    scene.add(magentaRimLight);

    const cyanFillLight = new THREE.DirectionalLight(0x06b6d4, 1.6);
    cyanFillLight.position.set(4, -4, 3);
    scene.add(cyanFillLight);

    const bottomFill = new THREE.HemisphereLight(0x380b20, 0x050106, 0.9);
    scene.add(bottomFill);

    // Root Group
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // ── LOAD 188-REGION GLTF BRAIN ───────────────────────────────────────────
    setLoadingStep('Loading 188 Neuroanatomical Structures...');

    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    gltfLoader.setDRACOLoader(dracoLoader);

    const loadBrainModel = (url, isFallback = false) => {
      gltfLoader.load(
        url,
        (gltf) => {
          // Normalize and center model
          gltf.scene.scale.setScalar(10);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          gltf.scene.position.sub(center);

          // Update bounds for slicing plane
          const worldBox = new THREE.Box3().setFromObject(gltf.scene);
          boundsRef.current = {
            minX: worldBox.min.x, maxX: worldBox.max.x,
            minY: worldBox.min.y, maxY: worldBox.max.y,
            minZ: worldBox.min.z, maxZ: worldBox.max.z,
          };

          regionNodesRef.current.clear();
          brainMeshesRef.current = [];

          // Process each anatomical structure
          gltf.scene.children.forEach((childObj) => {
            const rawName = childObj.name;
            const regionName = rawName.replace(/^_+/, '').replace(/[*?]/g, '');
            regionNodesRef.current.set(regionName, childObj);

            childObj.traverse((child) => {
              if (child.isMesh) {
                // Clone materials to prevent shared state
                child.material = Array.isArray(child.material)
                  ? child.material.map((m) => m.clone())
                  : child.material.clone();

                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((m) => {
                  m.clippingPlanes = [clippingPlaneRef.current];
                  m.clipShadows = true;
                  m.transparent = true;
                  m.opacity = brainOpacity;
                  m.roughness = 0.35;
                  m.metalness = 0.12;
                  m.color.set(0xeddce7); // Soft pearlescent rose alabaster
                  m.emissive = new THREE.Color(0x000000);
                  m.emissiveIntensity = 0;
                });

                child.userData.regionName = regionName;
                child.userData.rootGroup = childObj;
                brainMeshesRef.current.push(child);
              }
            });
          });

          rootGroup.add(gltf.scene);

          // Now build and embed the patient tumor inside the anatomy
          buildAndEmbedPatientTumor(rootGroup, worldBox);
          setLoading(false);
        },
        undefined,
        (err) => {
          console.warn('Draco GLTF load failed, attempting uncompressed fallback:', err);
          if (!isFallback) {
            loadBrainModel('/models/brain-parts-nwm.glb', true);
          } else {
            setError('Failed to load brain anatomical model.');
            setLoading(false);
          }
        }
      );
    };

    // Helper: Build patient tumor geometries and align coordinates
    const buildAndEmbedPatientTumor = (targetGroup, brainBounds) => {
      if (!meshInfo || !meshInfo.regions) return;
      const regions = meshInfo.regions;

      // Extract Patient Brain Parent Dimensions in MRI Space
      let patientCenter = new THREE.Vector3(0, 0, 0);
      let patientSize = new THREE.Vector3(1.63, 1.61, 2.16);

      if (regions.brain && regions.brain.vertices && regions.brain.vertices.length > 0) {
        const bv = regions.brain.vertices;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < bv.length; i += 3) {
          const px = -bv[i];
          const py = bv[i + 2];
          const pz = bv[i + 1];
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
          if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
        }
        patientCenter = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
        patientSize = new THREE.Vector3(
          Math.max(0.1, maxX - minX),
          Math.max(0.1, maxY - minY),
          Math.max(0.1, maxZ - minZ)
        );
      }

      // Calculate Target Anatomical Extents
      const targetWidth = brainBounds.max.x - brainBounds.min.x;
      const targetHeight = brainBounds.max.y - brainBounds.min.y;
      const targetDepth = brainBounds.max.z - brainBounds.min.z;

      const scaleX = targetWidth / patientSize.x;
      const scaleY = targetHeight / patientSize.y;
      const scaleZ = targetDepth / patientSize.z;

      // Helper function to build patient subregion geometry
      const buildGeom = (subregion) => {
        if (!subregion || !subregion.vertices || subregion.vertices.length === 0) return null;
        const origVerts = subregion.vertices;
        const count = origVerts.length / 3;
        const pos = new Float32Array(origVerts.length);

        for (let i = 0; i < count; i++) {
          const vx = origVerts[i * 3];
          const vy = origVerts[i * 3 + 1];
          const vz = origVerts[i * 3 + 2];

          // MRI to Registered Three.js Space
          const px = -vx;
          const py = vz;
          const pz = vy;

          pos[i * 3] = (px - patientCenter.x) * scaleX;
          pos[i * 3 + 1] = (py - patientCenter.y) * scaleY;
          pos[i * 3 + 2] = (pz - patientCenter.z) * scaleZ;
        }

        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (subregion.faces && subregion.faces.length > 0) {
          g.setIndex(subregion.faces);
        }
        g.computeVertexNormals();
        return g;
      };

      const tumorGroup = new THREE.Group();
      tumorGroup.name = 'PatientTumorGroup';

      // 1. Enhancing Tumor (ET) - Scarlet #E11D48
      const etGeom = buildGeom(regions.et);
      if (etGeom) {
        const etMat = new THREE.MeshStandardMaterial({
          color: 0xe11d48,
          emissive: 0xbe123c,
          emissiveIntensity: 0.8,
          roughness: 0.25,
          metalness: 0.1,
          transparent: true,
          opacity: 0.95,
          clippingPlanes: [clippingPlaneRef.current],
          clipShadows: true,
          side: THREE.DoubleSide,
        });
        const etMesh = new THREE.Mesh(etGeom, etMat);
        tumorGroup.add(etMesh);
        tumorMeshesRef.current.et = etMesh;
      }

      // 2. Necrotic Core (NETC) - Cyan #0284C7
      const netcGeom = buildGeom(regions.netc);
      if (netcGeom) {
        const netcMat = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          emissive: 0x0369a1,
          emissiveIntensity: 0.5,
          roughness: 0.35,
          metalness: 0.05,
          transparent: true,
          opacity: 0.90,
          clippingPlanes: [clippingPlaneRef.current],
          clipShadows: true,
          side: THREE.DoubleSide,
        });
        const netcMesh = new THREE.Mesh(netcGeom, netcMat);
        tumorGroup.add(netcMesh);
        tumorMeshesRef.current.netc = netcMesh;
      }

      // 3. Peritumoral Edema (ED) - Amber #F59E0B
      const edGeom = buildGeom(regions.ed);
      if (edGeom) {
        const edMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xb45309,
          emissiveIntensity: 0.25,
          roughness: 0.45,
          metalness: 0.0,
          transparent: true,
          opacity: 0.35,
          clippingPlanes: [clippingPlaneRef.current],
          clipShadows: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const edMesh = new THREE.Mesh(edGeom, edMat);
        tumorGroup.add(edMesh);
        tumorMeshesRef.current.ed = edMesh;
      }

      targetGroup.add(tumorGroup);

      // Compute which anatomical regions are in contact or invaded by the tumor
      detectTumorInvolvedRegions(tumorGroup);
    };

    // Helper: Detect brain parts involved with tumor
    const detectTumorInvolvedRegions = (tumorGroup) => {
      const tumorBox = new THREE.Box3().setFromObject(tumorGroup);
      if (tumorBox.isEmpty()) return;

      const detected = [];
      regionNodesRef.current.forEach((obj, name) => {
        const partBox = new THREE.Box3().setFromObject(obj);
        if (!partBox.isEmpty() && partBox.intersectsBox(tumorBox)) {
          // Check overlap with ET (Core invasion) vs ED (Edema expansion)
          let isCoreInvolved = false;
          if (tumorMeshesRef.current.et) {
            const etBox = new THREE.Box3().setFromObject(tumorMeshesRef.current.et);
            if (partBox.intersectsBox(etBox)) isCoreInvolved = true;
          }
          detected.push({
            id: name,
            type: isCoreInvolved ? 'Core Infiltration' : 'Peritumoral Edema Margin',
            severity: isCoreInvolved ? 'high' : 'medium',
          });
        }
      });

      setInvolvedRegions(detected);
    };

    // Trigger Initial Model Load
    loadBrainModel('/models/brain-parts-draco.glb');

    // ── INTERACTIVE RAYCASTING (Click & Hover Selection) ───────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(brainMeshesRef.current, true);

      // Filter out clipped points
      const plane = clippingPlaneRef.current;
      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        if (sliceEnabledRef.current) {
          const pt = hit.point;
          const axis = sliceAxisRef.current;
          if (axis === 'x' && pt.x > plane.constant + 1e-4) continue;
          if (axis === 'y' && pt.y > plane.constant + 1e-4) continue;
          if (axis === 'z' && pt.z > plane.constant + 1e-4) continue;
        }

        const regionName = hit.object?.userData?.regionName;
        if (regionName) {
          setSelectedRegion(regionName);
          return;
        }
      }
    };

    const handlePointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(brainMeshesRef.current, true);

      let foundHover = null;
      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        if (sliceEnabledRef.current) {
          const pt = hit.point;
          const axis = sliceAxisRef.current;
          if (axis === 'x' && pt.x > clippingPlaneRef.current.constant + 1e-4) continue;
          if (axis === 'y' && pt.y > clippingPlaneRef.current.constant + 1e-4) continue;
          if (axis === 'z' && pt.z > clippingPlaneRef.current.constant + 1e-4) continue;
        }
        foundHover = hit.object?.userData?.regionName;
        break;
      }
      setHoveredRegion(foundHover);
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('pointerdown', handlePointerDown);
    domElement.addEventListener('pointermove', handlePointerMove);

    // ── ANIMATION & PULSE RENDER LOOP ─────────────────────────────────────────
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();

      // Emissive breathing pulse for selected region
      if (selectedRegionRef.current) {
        const pulse = 0.8 + 0.6 * Math.sin(elapsedTime * 4.5);
        const targetObj = regionNodesRef.current.get(selectedRegionRef.current);
        if (targetObj) {
          targetObj.traverse((child) => {
            if (child.isMesh && child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                m.emissiveIntensity = pulse;
              });
            }
          });
        }
      }

      // Auto-rotation handling
      if (controlsRef.current) {
        controlsRef.current.autoRotate = localAutoRotateRef.current;
        controlsRef.current.autoRotateSpeed = 1.6;
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointermove', handlePointerMove);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current) rendererRef.current.dispose();
      dracoLoader.dispose();
    };
  }, [meshInfo]);

  // 4. Update Clipping Plane when sliceValue, sliceAxis or sliceEnabled change
  useEffect(() => {
    const plane = clippingPlaneRef.current;
    const bounds = boundsRef.current;

    if (!sliceEnabled || sliceValue >= 100) {
      // Slicing inactive: push plane far away
      plane.normal.set(-1, 0, 0);
      plane.constant = 1000;
      return;
    }

    const t = sliceValue / 100;
    if (sliceAxis === 'x') {
      plane.normal.set(-1, 0, 0);
      plane.constant = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, t);
    } else if (sliceAxis === 'y') {
      plane.normal.set(0, -1, 0);
      plane.constant = THREE.MathUtils.lerp(bounds.minY, bounds.maxY, t);
    } else {
      plane.normal.set(0, 0, -1);
      plane.constant = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, t);
    }
  }, [sliceValue, sliceAxis, sliceEnabled]);

  // 5. Update Brain Parts Opacity
  useEffect(() => {
    brainMeshesRef.current.forEach((mesh) => {
      const isSelected = selectedRegion && mesh.userData?.regionName === selectedRegion;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        m.opacity = isSelected ? 0.95 : brainOpacity;
      });
    });
  }, [brainOpacity, selectedRegion]);

  // 6. Update Highlight Color when selectedRegion changes
  useEffect(() => {
    // Reset all brain parts to neutral
    brainMeshesRef.current.forEach((mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        m.emissive.set(0x000000);
        m.emissiveIntensity = 0;
        m.opacity = brainOpacity;
      });
    });

    if (!selectedRegion) return;

    // Helper for bilateral regions (e.g. Precentral_gyrus_L and _R)
    const regionsToHighlight = [selectedRegion];
    const match = selectedRegion.match(/^(.+)_([LR])$/);
    if (match) {
      const base = match[1];
      const counterpart = `${base}_${match[2] === 'L' ? 'R' : 'L'}`;
      if (regionNodesRef.current.has(counterpart)) {
        regionsToHighlight.push(counterpart);
      }
    }

    regionsToHighlight.forEach((reg) => {
      const node = regionNodesRef.current.get(reg);
      if (node) {
        node.traverse((child) => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              m.emissive.set(0x00ff88); // Bioluminescent emerald
              m.opacity = 0.92;
            });
          }
        });
      }
    });
  }, [selectedRegion, brainOpacity]);

  // 7. Update Tumor Subregions Visibility
  useEffect(() => {
    if (tumorMeshesRef.current.et) {
      tumorMeshesRef.current.et.visible = showET;
    }
    if (tumorMeshesRef.current.netc) {
      tumorMeshesRef.current.netc.visible = showNETC;
    }
    if (tumorMeshesRef.current.ed) {
      tumorMeshesRef.current.ed.visible = showED;
    }
  }, [showET, showNETC, showED]);

  // 8. Camera Presets Handling
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (cameraPreset === 'axial') {
      camera.position.set(0, 3.8, 0.01);
      controls.target.set(0, 0, 0);
    } else if (cameraPreset === 'coronal') {
      camera.position.set(0, 0.2, 3.8);
      controls.target.set(0, 0, 0);
    } else if (cameraPreset === 'sagittal') {
      camera.position.set(3.8, 0.2, 0);
      controls.target.set(0, 0, 0);
    } else {
      camera.position.set(2.2, 1.8, 3.2);
      controls.target.set(0, 0, 0);
    }
    controls.update();
  }, [cameraPreset]);

  // Information details for the selected region
  const selectedInfo = useMemo(() => {
    if (!selectedRegion) return null;
    const baseInfo = regionsDb[selectedRegion];
    if (baseInfo) return baseInfo;

    // Check without _L or _R
    const cleanKey = selectedRegion.replace(/_[LR]$/, '');
    return regionsDb[cleanKey] || {
      name: selectedRegion.replace(/_/g, ' '),
      desc: 'Anatomical cortical structure identified in segmentation atlas. Functionally involved in neural transmission and inter-lobar signaling.',
      refs: ['https://en.wikipedia.org/wiki/Neuroanatomy']
    };
  }, [selectedRegion, regionsDb]);

  // Filtered regions for quick-picker search
  const filteredRegions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return Object.keys(regionsDb)
      .filter((key) => {
        const item = regionsDb[key];
        return (
          key.toLowerCase().includes(q) ||
          (item.name && item.name.toLowerCase().includes(q))
        );
      })
      .slice(0, 8);
  }, [searchQuery, regionsDb]);

  return (
    <div className="relative w-full h-[620px] rounded-2xl overflow-hidden bg-[#0c040a] border border-[#FCE7F3] shadow-lg select-none">
      {/* ── 3D WEBGL CANVAS CONTAINER ─────────────────────────────────────────── */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* ── LOADING & ERROR OVERLAYS ────────────────────────────────────────── */}
      {loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0c040a]/90 backdrop-blur-md text-white">
          <div className="relative w-14 h-14 mb-4">
            <div className="w-14 h-14 rounded-full border-2 border-rose-500/20 border-t-rose-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-cyan-400/20 border-b-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }} />
          </div>
          <span className="text-sm font-semibold tracking-wide text-rose-100">{loadingStep}</span>
          <span className="text-xs font-mono text-rose-300/70 mt-1">Direct WebGL Marching Cubes & 188-Part Neuroanatomy</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0c040a]/95 text-white p-6">
          <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
          <h3 className="text-base font-semibold text-rose-200">Unable to Render Detailed Anatomy</h3>
          <p className="text-xs text-rose-300/80 mt-1 max-w-md text-center">{error}</p>
        </div>
      )}

      {/* ── TOP FLOATING TOOLBAR: SEARCH & PROXIMITY ────────────────────────── */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left: Quick Region Search Box */}
        <div className="relative pointer-events-auto w-72">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#190914]/85 backdrop-blur-md border border-rose-500/30 text-white shadow-md">
            <Search className="w-4 h-4 text-rose-400 shrink-0" />
            <input
              type="text"
              placeholder="Search 188 brain parts..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchList(true);
              }}
              onFocus={() => setShowSearchList(true)}
              className="w-full bg-transparent text-xs text-white placeholder-rose-300/50 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setShowSearchList(false); }}
                className="text-rose-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown List */}
          {showSearchList && filteredRegions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 py-1.5 rounded-xl bg-[#190914]/95 backdrop-blur-lg border border-rose-500/30 shadow-2xl z-30 max-h-56 overflow-y-auto">
              {filteredRegions.map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setSelectedRegion(k);
                    setSearchQuery(regionsDb[k]?.name || k);
                    setShowSearchList(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-rose-900/40 transition-colors flex items-center justify-between text-rose-100"
                >
                  <span className="font-medium truncate">{regionsDb[k]?.name || k.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] font-mono text-rose-400/80 ml-2 shrink-0">
                    {k.endsWith('_L') ? 'Left' : k.endsWith('_R') ? 'Right' : 'Mid'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center / Right: Hover Region Tooltip */}
        {hoveredRegion && !selectedRegion && (
          <div className="pointer-events-auto px-3 py-1 rounded-full bg-[#190914]/85 backdrop-blur-md border border-cyan-500/40 text-cyan-200 text-xs font-mono shadow-md animate-fade-in flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>{regionsDb[hoveredRegion]?.name || hoveredRegion.replace(/_/g, ' ')}</span>
          </div>
        )}

        {/* Right: Quick Stats Badge */}
        <div className="pointer-events-auto flex items-center gap-2">
          {involvedRegions.length > 0 && (
            <button
              onClick={() => {
                setSidebarTab('involved');
                if (!selectedRegion) setSelectedRegion(involvedRegions[0].id);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/80 backdrop-blur-md border border-rose-500/50 text-rose-300 text-xs font-mono shadow-md hover:bg-rose-900/90 transition-all cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>{involvedRegions.length} Tumor-Invaded Structures</span>
            </button>
          )}

          <button
            onClick={() => setLocalAutoRotate(!localAutoRotate)}
            className={`p-2 rounded-xl border backdrop-blur-md transition-all cursor-pointer ${
              localAutoRotate
                ? 'bg-rose-900/70 border-rose-400 text-rose-200'
                : 'bg-[#190914]/85 border-rose-500/30 text-rose-300/80 hover:text-white'
            }`}
            title="Toggle Orbit Auto-Rotation"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── LEFT OVERLAY: ANATOMICAL INTELLIGENCE DOSSIER ───────────────────── */}
      {selectedRegion && selectedInfo && (
        <div className="absolute top-16 left-4 z-20 w-80 max-h-[500px] overflow-hidden flex flex-col rounded-2xl bg-[#140610]/90 backdrop-blur-md border border-rose-500/30 shadow-2xl text-white animate-in fade-in slide-in-from-left-4 duration-200">
          {/* Dossier Header */}
          <div className="p-4 border-b border-rose-900/40 flex items-start justify-between bg-gradient-to-r from-rose-950/50 to-transparent">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase font-semibold">
                  Selected Structure
                </span>
              </div>
              <h4 className="text-base font-bold text-rose-100 mt-1 leading-snug">
                {selectedInfo.name}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-900/50 text-rose-300 border border-rose-800/60">
                  {selectedRegion.endsWith('_L') ? 'Left Hemisphere' : selectedRegion.endsWith('_R') ? 'Right Hemisphere' : 'Bilateral / Core'}
                </span>
                {involvedRegions.some((r) => r.id === selectedRegion) && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Invaded Margin
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedRegion(null)}
              className="p-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-900/40 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Dossier Body */}
          <div className="p-4 space-y-3 overflow-y-auto text-xs text-rose-200/90 leading-relaxed font-sans">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400/80 block mb-1">
                Neuroanatomical Role & Function:
              </span>
              <p className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-900/30 text-rose-100/90 leading-normal">
                {selectedInfo.desc || 'Detailed functional documentation available in reference links.'}
              </p>
            </div>

            {selectedInfo.refs && selectedInfo.refs.length > 0 && (
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400/80 block mb-1">
                  Literature & References:
                </span>
                <div className="space-y-1">
                  {selectedInfo.refs.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded-lg bg-rose-950/20 hover:bg-rose-900/40 border border-rose-900/20 text-cyan-300 hover:text-cyan-200 transition-all font-mono text-[11px]"
                    >
                      <span className="truncate max-w-[200px]">{url.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 ml-1.5 text-cyan-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RIGHT OVERLAY: 3-AXIS SLICING & BRAIN OPACITY HUD ────────────────── */}
      <div className="absolute top-16 right-4 z-20 w-72 p-4 rounded-2xl bg-[#140610]/90 backdrop-blur-md border border-rose-500/30 shadow-2xl text-white space-y-4">
        {/* HUD Title */}
        <div className="flex items-center justify-between border-b border-rose-900/40 pb-2">
          <div className="flex items-center gap-1.5">
            <Scissors className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-rose-100">3-Axis Anatomy Slicing</span>
          </div>
          <button
            onClick={() => setSliceEnabled(!sliceEnabled)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-all ${
              sliceEnabled ? 'bg-cyan-500 text-black font-bold' : 'bg-rose-950 text-rose-400 border border-rose-800'
            }`}
          >
            {sliceEnabled ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        {/* Axis Selector: Sagittal (X), Horizontal/Axial (Y), Coronal (Z) */}
        <div>
          <span className="text-[10px] font-mono text-rose-400/80 uppercase block mb-1.5">Slicing Plane:</span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'x', label: 'Sagittal' },
              { id: 'y', label: 'Axial' },
              { id: 'z', label: 'Coronal' },
            ].map((axis) => (
              <button
                key={axis.id}
                onClick={() => {
                  setSliceAxis(axis.id);
                  if (!sliceEnabled) setSliceEnabled(true);
                }}
                className={`py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                  sliceAxis === axis.id && sliceEnabled
                    ? 'bg-cyan-500 text-black font-bold shadow-xs'
                    : 'bg-rose-950/60 text-rose-300 hover:text-white border border-rose-900/40'
                }`}
              >
                {axis.label}
              </button>
            ))}
          </div>
        </div>

        {/* Slice Position Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-rose-300">
            <span>Plane Position:</span>
            <span className="font-semibold text-cyan-400">{sliceValue}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={sliceValue}
            onChange={(e) => {
              setSliceValue(parseFloat(e.target.value));
              if (!sliceEnabled) setSliceEnabled(true);
            }}
            className="w-full accent-cyan-400 h-1.5 bg-rose-950 rounded-lg cursor-pointer"
          />
        </div>

        {/* Brain Cortex Opacity Slider */}
        <div className="pt-2 border-t border-rose-900/40 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-rose-300">
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-rose-400" />
              <span>Cortex Transparency:</span>
            </span>
            <span className="font-semibold text-rose-200">{Math.round(brainOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={brainOpacity}
            onChange={(e) => setBrainOpacity(parseFloat(e.target.value))}
            className="w-full accent-rose-500 h-1.5 bg-rose-950 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* ── BOTTOM HUD BANNER: BRAIN PARTS GUIDE & LEGEND ────────────────────── */}
      <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Subregion Legend */}
        <div className="pointer-events-auto flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[#140610]/85 backdrop-blur-md border border-rose-500/30 text-xs font-mono shadow-md">
          <div className="flex items-center gap-1.5 text-rose-300">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>ET: Enhancing Tumor</span>
          </div>
          <div className="flex items-center gap-1.5 text-cyan-300">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            <span>NETC: Core</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>ED: Edema</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-300 pl-2 border-l border-rose-900/40">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>Highlighted Part</span>
          </div>
        </div>

        {/* Tip Badge */}
        <div className="pointer-events-auto text-[11px] font-mono text-rose-300/80 bg-[#140610]/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-rose-500/20 shadow-md">
          💡 Click any brain gyrus to isolate & view clinical role
        </div>
      </div>
    </div>
  );
}
