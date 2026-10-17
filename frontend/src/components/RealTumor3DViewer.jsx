import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Loader2, AlertCircle, RotateCw, Activity, Layers, Eye } from 'lucide-react';
import { API_BASE_URL } from '../services/api';

export default function RealTumor3DViewer({
  meshUrl,
  showNETC = true,
  showED = true,
  showET = true,
  isAutoRotating = true,
  cameraPreset = 'iso',
  onMetadataLoaded = null,
}) {
  const containerRef = useRef(null);
  const sceneContextRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('Loading Patient Tumor & Anatomy...');
  const [error, setError] = useState(null);
  const [meshInfo, setMeshInfo] = useState(null);

  // Brain envelope visual style:
  // 'pink' (Default: Translucent Rose Quartz Glass with Real Sulci & Arteries)
  // 'glass' (Medical B&W: Monochromatic Crystalline Glass)
  // 'wireframe' (Cybernetic Lattice)
  // 'hidden' (Tumors Only)
  const [brainStyle, setBrainStyle] = useState('pink');
  const [showVasculature, setShowVasculature] = useState(true);
  const [localAutoRotate, setLocalAutoRotate] = useState(isAutoRotating);

  useEffect(() => {
    setLocalAutoRotate(isAutoRotating);
  }, [isAutoRotating]);

  // 1. Fetch real 3D Marching Cubes mesh artifact from backend
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setLoadingStep('Fetching 3D Segmentation Mesh...');
    setError(null);

    const backendBase = API_BASE_URL || 'http://localhost:8000';
    const targetUrl = meshUrl
      ? (meshUrl.startsWith('http') ? meshUrl : (meshUrl.startsWith('/data/') ? meshUrl : `${backendBase}${meshUrl}`))
      : '/data/sample_mesh.json';

    const tryFetchLocalFallback = () => {
      fetch('/data/sample_mesh.json')
        .then((r) => {
          if (!r.ok) throw new Error(`Local fallback HTTP ${r.status}`);
          return r.json();
        })
        .then((localData) => {
          if (isCancelled) return;
          setMeshInfo(localData);
          if (onMetadataLoaded && localData.metadata) onMetadataLoaded(localData.metadata);
          setLoadingStep('Loading 3D Neuroanatomical Gyri & Vasculature...');
        })
        .catch((fallbackErr) => {
          if (isCancelled) return;
          setError(fallbackErr.message || 'Unable to load 3D mesh. Please verify backend server connection.');
          setLoading(false);
        });
    };

    fetch(targetUrl, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isCancelled) return;
        setMeshInfo(data);
        if (onMetadataLoaded && data.metadata) onMetadataLoaded(data.metadata);
        setLoadingStep('Loading 3D Neuroanatomical Gyri & Vasculature...');
      })
      .catch(() => {
        if (isCancelled) return;
        fetch(`${backendBase}/api/v1/artifacts/sample_mesh.json`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
          .then((r) => {
            if (!r.ok) throw new Error(`Backend sample mesh HTTP ${r.status}`);
            return r.json();
          })
          .then((sampleData) => {
            if (isCancelled) return;
            setMeshInfo(sampleData);
            if (onMetadataLoaded && sampleData.metadata) onMetadataLoaded(sampleData.metadata);
            setLoadingStep('Loading 3D Neuroanatomical Gyri & Vasculature...');
          })
          .catch(() => {
            if (isCancelled) return;
            tryFetchLocalFallback();
          });
      });

    return () => { isCancelled = true; };
  }, [meshUrl]);

  // 2. Build Three.js scene with realistic GLTF Anatomical Model & Embedded Patient Tumor
  useEffect(() => {
    if (!meshInfo || !containerRef.current) return;
    const container = containerRef.current;
    let width = container.clientWidth || 800;
    let height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e030a); // Deep velvet obsidian rose

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 200);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Pivot group for user orbit rotation
    const pivotGroup = new THREE.Group();
    scene.add(pivotGroup);

    // Model group for center-of-mass centering
    const modelGroup = new THREE.Group();
    pivotGroup.add(modelGroup);

    // ── STUDIO LIGHTING ───────────────────────────────────────────────────────
    // Soft ambient light to illuminate deep sulcal cavities
    const ambientLight = new THREE.AmbientLight(0xffedf4, 1.3);
    scene.add(ambientLight);

    // Key directional light for specular highlights on cortical gyri
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(6, 8, 7);
    scene.add(keyLight);

    // Rose magenta rim light from back-left for anatomical silhouette contouring
    const roseRim = new THREE.DirectionalLight(0xf472b6, 2.5);
    roseRim.position.set(-7, -2, -5);
    scene.add(roseRim);

    // Cool cyan fill light from bottom-right for color separation
    const cyanFill = new THREE.DirectionalLight(0x06b6d4, 1.8);
    cyanFill.position.set(5, -5, 4);
    scene.add(cyanFill);

    // Hemisphere light for subtle gradient depth
    const hemiLight = new THREE.HemisphereLight(0x380b20, 0x050106, 1.0);
    scene.add(hemiLight);

    // Internal Core PointLight: illuminates the brain envelope and tumor from the center
    const coreLight = new THREE.PointLight(0xf472b6, 2.8, 8.0);
    coreLight.position.set(0, 0, 0);
    modelGroup.add(coreLight);

    // ── MESH GEOMETRIES & MATERIALS ───────────────────────────────────────────
    const meshes = {
      cortex: [],
      vascular: [],
      fallbackBrain: null,
      fallbackBrainBack: null,
    };
    const regions = meshInfo.regions || {};

    // ── ANATOMICAL REGISTRATION & SCALING ─────────────────────────────────────
    // Exact parenchyma bounds in brain.glb coordinates:
    const gltfCenter = new THREE.Vector3(0.0, 1.6197, -0.0088);
    const gltfSize = new THREE.Vector3(0.1378, 0.1618, 0.1807);

    // Calculate patient brain center & size from MRI mesh data in Three.js space:
    // (Three X = -vx, Three Y = vz, Three Z = vy)
    let patientCenter = new THREE.Vector3(-0.007, -0.023, -0.143);
    let patientSize = new THREE.Vector3(1.636, 1.617, 2.161);

    if (regions.brain && regions.brain.vertices && regions.brain.vertices.length > 0) {
      const bv = regions.brain.vertices;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < bv.length; i += 3) {
        const px = -bv[i];
        const py = bv[i + 2];
        const pz = bv[i + 1];
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }
      patientCenter = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      patientSize = new THREE.Vector3(
        Math.max(0.1, maxX - minX),
        Math.max(0.1, maxY - minY),
        Math.max(0.1, maxZ - minZ)
      );
    }

    // Scale factors to morph brain.glb directly to the patient's cranial dimensions:
    const scaleX = patientSize.x / gltfSize.x;
    const scaleY = patientSize.y / gltfSize.y;
    const scaleZ = patientSize.z / gltfSize.z;

    // Center entire head and tumor at (0, 0, 0) pivot origin
    modelGroup.position.set(-patientCenter.x, -patientCenter.y, -patientCenter.z);

    // Helper: Build patient tumor geometry directly in patient MRI space
    const buildTumorGeom = (region) => {
      const origVerts = region.vertices;
      const count = origVerts.length / 3;
      const pos = new Float32Array(origVerts.length);

      for (let i = 0; i < count; i++) {
        const vx = origVerts[i * 3];
        const vy = origVerts[i * 3 + 1];
        const vz = origVerts[i * 3 + 2];

        // Three.js space directly aligned with MRI volume:
        // Three X = -vx (Patient Right on Viewer Left)
        // Three Y = vz  (Superior is UP)
        // Three Z = vy  (Anterior is FORWARD)
        pos[i * 3] = -vx;
        pos[i * 3 + 1] = vz;
        pos[i * 3 + 2] = vy;
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(region.faces);
      g.computeVertexNormals();
      return g;
    };

    // A. Tumor Subregions (Embedded directly inside the cerebrum)
    // 1. Edema (ED - Amber Gold #FBBF24)
    if (regions.ed) {
      const edMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.75,
        roughness: 0.35,
        metalness: 0.05,
        transparent: true,
        opacity: showED ? 0.72 : 0.0,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const edMesh = new THREE.Mesh(buildTumorGeom(regions.ed), edMat);
      edMesh.renderOrder = 8;
      modelGroup.add(edMesh);
      meshes.ed = edMesh;
    }

    // 2. Necrotic Core (NETC - Cyan #06B6D4)
    if (regions.netc) {
      const netcMat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0891b2,
        emissiveIntensity: 1.4,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: showNETC ? 0.95 : 0.0,
        depthWrite: true,
        side: THREE.FrontSide,
      });
      const netcMesh = new THREE.Mesh(buildTumorGeom(regions.netc), netcMat);
      netcMesh.renderOrder = 9;
      modelGroup.add(netcMesh);
      meshes.netc = netcMesh;
    }

    // 3. Enhancing Active Margin (ET - Ruby Scarlet #F43F5E)
    if (regions.et) {
      const etMat = new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xe11d48,
        emissiveIntensity: 2.2,
        roughness: 0.15,
        metalness: 0.15,
        transparent: true,
        opacity: showET ? 0.98 : 0.0,
        depthWrite: true,
        side: THREE.FrontSide,
      });
      const etMesh = new THREE.Mesh(buildTumorGeom(regions.et), etMat);
      etMesh.renderOrder = 10;
      modelGroup.add(etMesh);
      meshes.et = etMesh;
    }

    // ── B. LOAD REALISTIC GLTF MEDICAL BRAIN MODEL (brain.glb) ─────────────────
    let isDisposed = false;
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/gltf/');

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    const gltfWrapper = new THREE.Group();
    modelGroup.add(gltfWrapper);
    meshes.gltfWrapper = gltfWrapper;

    // Safety timeout: ensure loading overlay never gets stuck if GLTF takes long or errors silently
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 4500);

    gltfLoader.load(
      '/models/brain.glb',
      (gltf) => {
        clearTimeout(safetyTimer);
        if (isDisposed) return;
        const root = gltf.scene;

        // Position root inside gltfWrapper so gltfCenter is at origin
        root.position.set(-gltfCenter.x, -gltfCenter.y, -gltfCenter.z);
        gltfWrapper.add(root);

        // Position & scale gltfWrapper so it matches the patient brain envelope exactly
        gltfWrapper.position.copy(patientCenter);
        gltfWrapper.scale.set(scaleX, scaleY, scaleZ);

        // Traverse and classify meshes
        root.traverse((node) => {
          if (!node.isMesh) return;

          const name = node.name || '';
          const isPeripheralNerve = /nerve/i.test(name);
          const isExtracranial = /vertebral artery|internal carotid artery/i.test(name);
          const isVascular = /artery|arteries|venous|vein|sinus|plexus|branches|carotid|basilar|striate|circulus|communicating|ophthalmic|pericallosal|cerebral/i.test(name);

          // Hide peripheral facial/jaw/cervical nerves and descending neck arteries
          if (isPeripheralNerve || isExtracranial) {
            node.visible = false;
            return;
          }

          if (isVascular) {
            // Real Intracranial Vasculature (Circle of Willis, MCA, Basilar artery, etc.)
            const vascMat = new THREE.MeshStandardMaterial({
              color: brainStyle === 'glass' ? 0x38bdf8 : 0xf43f5e,
              emissive: brainStyle === 'glass' ? 0x0284c7 : 0xe11d48,
              emissiveIntensity: 1.8,
              roughness: 0.25,
              metalness: 0.15,
              transparent: true,
              opacity: showVasculature && brainStyle !== 'hidden' ? 0.90 : 0.0,
              depthWrite: true,
            });
            node.material = vascMat;
            node.renderOrder = 4;
            node.visible = showVasculature && brainStyle !== 'hidden';
            meshes.vascular.push(node);
          } else {
            // Real Cortical Sulci & Gyri (Translucent Frosted Rose Quartz Glass)
            const cortexMat = new THREE.MeshPhysicalMaterial({
              color: brainStyle === 'glass' ? 0xe2e8f0 : 0xfbcfe8,
              emissive: brainStyle === 'glass' ? 0x334155 : 0x831843,
              emissiveIntensity: brainStyle === 'glass' ? 0.12 : 0.16,
              roughness: 0.16,
              metalness: 0.04,
              clearcoat: 0.85,
              clearcoatRoughness: 0.10,
              transparent: true,
              opacity: brainStyle === 'pink' ? 0.22 : brainStyle === 'glass' ? 0.16 : 0.0,
              depthWrite: false,
              side: THREE.DoubleSide,
              wireframe: brainStyle === 'wireframe',
            });
            node.material = cortexMat;
            node.renderOrder = 5;
            node.visible = brainStyle !== 'hidden';
            meshes.cortex.push(node);
          }
        });

        setLoading(false);
      },
      (progress) => {
        if (progress.total && progress.total > 0) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          setLoadingStep(`Loading Realistic 3D Brain Anatomy (${pct}%)...`);
        }
      },
      (loadErr) => {
        console.warn('GLTF brain model failed to load, falling back to MRI envelope mesh:', loadErr);
        // Fallback: If GLTF fails (e.g. offline or 404), build Marching Cubes brain mesh
        if (regions.brain) {
          const bGeom = buildTumorGeom(regions.brain);
          const fbMat = new THREE.MeshPhysicalMaterial({
            color: 0xf472b6,
            emissive: 0xbe185d,
            emissiveIntensity: 0.25,
            roughness: 0.14,
            metalness: 0.05,
            transparent: true,
            opacity: 0.25,
            depthWrite: false,
            side: THREE.FrontSide,
          });
          const fbMesh = new THREE.Mesh(bGeom, fbMat);
          fbMesh.renderOrder = 5;
          modelGroup.add(fbMesh);
          meshes.fallbackBrain = fbMesh;
        }
        setLoading(false);
      }
    );

    // Camera Framing: center comfortably around the brain
    const maxDim = 2.4;
    const cameraDistance = maxDim * 1.5;
    pivotGroup.rotation.set(0.28, 0.58, 0);
    camera.position.set(0, 0, cameraDistance);
    camera.lookAt(0, 0, 0);

    sceneContextRef.current = {
      pivotGroup,
      modelGroup,
      camera,
      meshes,
      coreLight,
      renderer,
      cameraDistance,
      scene,
    };

    // ── MOUSE DRAG ORBIT & SMOOTH ZOOM ────────────────────────────────────────
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouse.x;
      const deltaY = e.clientY - prevMouse.y;
      pivotGroup.rotation.y += deltaX * 0.007;
      pivotGroup.rotation.x += deltaY * 0.007;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = Math.max(
        cameraDistance * 0.5,
        Math.min(cameraDistance * 2.5, camera.position.z + e.deltaY * 0.003)
      );
      camera.lookAt(0, 0, 0);
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // ── ANIMATION RENDER LOOP ─────────────────────────────────────────────────
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isDragging && localAutoRotate) {
        pivotGroup.rotation.y += 0.003;
      }
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      dracoLoader.dispose();
      renderer.dispose();
    };
  }, [meshInfo, localAutoRotate]);

  // ── REACTIVE MATERIAL & STYLE SWITCHING ───────────────────────────────────
  useEffect(() => {
    if (!sceneContextRef.current) return;
    const { meshes, coreLight, scene } = sceneContextRef.current;

    const isPink = brainStyle === 'pink';
    const isGlass = brainStyle === 'glass';
    const isWire = brainStyle === 'wireframe';
    const isHidden = brainStyle === 'hidden';

    // 1. Update Scene Background & Core Light
    if (scene) {
      scene.background = new THREE.Color(isGlass ? 0x040609 : 0x0e030a);
    }
    if (coreLight) {
      coreLight.color.setHex(isGlass ? 0x94a3b8 : 0xf472b6);
      coreLight.intensity = isHidden ? 0.6 : isWire ? 1.4 : isGlass ? 2.4 : 2.8;
    }

    // 2. Update Cortical Meshes (Sulci & Gyri)
    if (meshes.cortex && meshes.cortex.length > 0) {
      meshes.cortex.forEach((node) => {
        node.visible = !isHidden;
        if (isHidden) return;

        const mat = node.material;
        if (!mat) return;

        if (isPink) {
          // 🌸 Translucent Rose Quartz Glass
          mat.wireframe = false;
          mat.color.setHex(0xfbcfe8);
          mat.emissive.setHex(0x831843);
          mat.emissiveIntensity = 0.16;
          mat.opacity = 0.22;
        } else if (isGlass) {
          // 🌫️ Medical B&W Crystal
          mat.wireframe = false;
          mat.color.setHex(0xe2e8f0);
          mat.emissive.setHex(0x334155);
          mat.emissiveIntensity = 0.12;
          mat.opacity = 0.16;
        } else if (isWire) {
          // 🔲 Pink Wireframe Lattice
          mat.wireframe = true;
          mat.color.setHex(0xf472b6);
          mat.emissive.setHex(0xbe185d);
          mat.emissiveIntensity = 0.35;
          mat.opacity = 0.50;
        }
        mat.needsUpdate = true;
      });
    }

    // 3. Update Intracranial Vasculature Meshes
    if (meshes.vascular && meshes.vascular.length > 0) {
      meshes.vascular.forEach((node) => {
        const shouldBeVisible = showVasculature && !isHidden;
        node.visible = shouldBeVisible;
        if (!shouldBeVisible) return;

        const mat = node.material;
        if (!mat) return;

        if (isGlass) {
          mat.color.setHex(0x38bdf8);
          mat.emissive.setHex(0x0284c7);
          mat.emissiveIntensity = 1.6;
        } else {
          mat.color.setHex(0xf43f5e);
          mat.emissive.setHex(0xe11d48);
          mat.emissiveIntensity = 1.8;
        }
        mat.opacity = 0.90;
        mat.needsUpdate = true;
      });
    }

    // 4. Update Fallback Brain Mesh (if GLTF was unavailable)
    if (meshes.fallbackBrain) {
      meshes.fallbackBrain.visible = !isHidden;
      if (!isHidden) {
        meshes.fallbackBrain.material.wireframe = isWire;
        meshes.fallbackBrain.material.opacity = isPink ? 0.24 : isGlass ? 0.18 : 0.50;
        meshes.fallbackBrain.material.needsUpdate = true;
      }
    }

    // 5. Update Tumor Subregions Visibility
    if (meshes.ed) {
      meshes.ed.material.opacity = showED ? 0.72 : 0.0;
      meshes.ed.material.needsUpdate = true;
    }
    if (meshes.netc) {
      meshes.netc.material.opacity = showNETC ? 0.95 : 0.0;
      meshes.netc.material.needsUpdate = true;
    }
    if (meshes.et) {
      meshes.et.material.opacity = showET ? 0.98 : 0.0;
      meshes.et.material.needsUpdate = true;
    }
  }, [brainStyle, showVasculature, showED, showNETC, showET]);

  // ── CAMERA PRESETS ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneContextRef.current) return;
    const { pivotGroup, camera, cameraDistance } = sceneContextRef.current;
    if (cameraPreset === 'iso') {
      pivotGroup.rotation.set(0.28, 0.58, 0);
      camera.position.set(0, 0, cameraDistance);
    } else if (cameraPreset === 'axial') {
      // Axial: Superior cranial view looking down from top
      pivotGroup.rotation.set(Math.PI / 2, 0, 0);
      camera.position.set(0, 0, cameraDistance);
    } else if (cameraPreset === 'coronal') {
      // Coronal: Face-forward anterior view
      pivotGroup.rotation.set(0, 0, 0);
      camera.position.set(0, 0, cameraDistance);
    } else if (cameraPreset === 'sagittal') {
      // Sagittal: Lateral profile view
      pivotGroup.rotation.set(0, Math.PI / 2, 0);
      camera.position.set(0, 0, cameraDistance);
    }
    camera.lookAt(0, 0, 0);
  }, [cameraPreset]);

  // ── RENDER STATES ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="w-full h-full min-h-[520px] rounded-2xl bg-[#0e030a] border border-rose-500/30 flex flex-col items-center justify-center space-y-2 p-6 text-center">
        <AlertCircle className="w-7 h-7 text-rose-400" />
        <p className="text-xs font-mono text-rose-300 font-semibold">Unable to load 3D mesh</p>
        <p className="text-[11px] font-mono text-slate-400 max-w-sm">{error}</p>
      </div>
    );
  }

  const STYLE_BUTTONS = [
    { id: 'pink', label: '🌸 Translucent Pink', badge: 'Default' },
    { id: 'glass', label: '🌫️ Glass B&W', badge: 'Medical' },
    { id: 'wireframe', label: '🔲 Pink Wireframe', badge: 'Lattice' },
    { id: 'hidden', label: '👁️ Tumors Only', badge: 'Focus' },
  ];

  return (
    <div className="relative w-full h-full min-h-[540px] rounded-2xl overflow-hidden bg-[#0e030a] border border-[#FCE7F3]/30 shadow-inner flex flex-col">
      {/* Three.js Canvas Container (Always mounted in DOM) */}
      <div ref={containerRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing min-h-[500px]" />

      {/* Non-blocking Animated Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-30 rounded-2xl bg-[#0e030a]/85 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 pointer-events-none transition-opacity duration-300">
          <Loader2 className="w-8 h-8 text-[#F472B6] animate-spin" />
          <p className="text-xs font-mono text-[#F472B6] font-medium tracking-wide">
            {loadingStep}
          </p>
        </div>
      )}

      {/* Floating Anatomical Badge (Top Left) */}
      <div className="absolute top-3.5 left-4 pointer-events-none flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-full bg-[#1A0512]/85 text-[#FBCFE8] border border-[#F472B6]/40 backdrop-blur-md shadow-sm">
          <Activity className="w-3 h-3 text-[#F472B6]" />
          <span>Real Cortical Gyri + Vasculature</span>
        </span>
      </div>

      {/* Floating Subregion Legend (Top Right) */}
      <div className="absolute top-3.5 right-4 flex flex-col gap-1.5 pointer-events-none">
        {showET && (
          <span className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#BE123C]/20 text-[#FECDD3] border border-[#BE123C]/40 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-[#F43F5E] shadow-[0_0_6px_#F43F5E]" />
            <span>ET · Active Margin</span>
          </span>
        )}
        {showNETC && (
          <span className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#0369A1]/20 text-[#BAE6FD] border border-[#0369A1]/40 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-[#06B6D4] shadow-[0_0_6px_#06B6D4]" />
            <span>NETC · Necrotic Core</span>
          </span>
        )}
        {showED && (
          <span className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#B45309]/20 text-[#FDE68A] border border-[#B45309]/40 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-[#FBBF24] shadow-[0_0_6px_#FBBF24]" />
            <span>ED · Peritumoral Edema</span>
          </span>
        )}
      </div>

      {/* Bottom Control Bar: Presets, Vasculature Toggle, & Orbit Controls */}
      <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-auto bg-[#1a0512]/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#F472B6]/30 shadow-lg">
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-[#FBCFE8] font-semibold text-[11px] mr-1 hidden sm:inline">Anatomy:</span>
          {STYLE_BUTTONS.map((style) => (
            <button
              key={style.id}
              onClick={() => setBrainStyle(style.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                brainStyle === style.id
                  ? 'bg-[#831843] text-white font-semibold shadow-[0_0_12px_rgba(244,114,182,0.45)] border border-[#F472B6]'
                  : 'bg-[#15050D]/60 text-[#FBCFE8]/70 hover:text-white hover:bg-[#25081a] border border-transparent'
              }`}
            >
              <span>{style.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Arterial Vasculature Toggle */}
          <button
            onClick={() => setShowVasculature(!showVasculature)}
            disabled={brainStyle === 'hidden'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
              brainStyle === 'hidden'
                ? 'opacity-40 cursor-not-allowed bg-[#15050D]/40 text-slate-500 border border-transparent'
                : showVasculature
                ? 'bg-[#E11D48]/30 text-[#FECDD3] border border-[#E11D48]/70 shadow-[0_0_8px_rgba(225,29,72,0.35)]'
                : 'bg-[#15050D]/60 text-[#FBCFE8]/70 hover:text-white border border-transparent'
            }`}
            title="Toggle Intracranial Vasculature (Circle of Willis, MCA, Basilar artery)"
          >
            <Activity className="w-3.5 h-3.5 text-[#F43F5E]" />
            <span>{showVasculature ? 'Arteries: ON' : 'Arteries: OFF'}</span>
          </button>

          {/* Auto Rotation Toggle */}
          <button
            onClick={() => setLocalAutoRotate(!localAutoRotate)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
              localAutoRotate
                ? 'bg-[#831843] text-white border border-[#F472B6]/60 shadow-[0_0_8px_rgba(244,114,182,0.3)]'
                : 'bg-[#15050D]/60 text-[#FBCFE8]/70 hover:text-white border border-transparent'
            }`}
          >
            <RotateCw className="w-3 h-3" />
            <span>{localAutoRotate ? 'Rotating' : 'Paused'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
