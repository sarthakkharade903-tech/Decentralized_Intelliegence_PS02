import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export default function Brain3D() {
  const containerRef = useRef(null);
  const [modelStatus, setModelStatus] = useState('initializing'); // 'initializing' | 'active'

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || 560;
    let height = container.clientHeight || 560;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, 0.3, 4.4);

    // 2. High-Performance WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);

    // Master Group for continuous rotation & mouse parallax
    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // 3. Lighting System (Cyan/Teal Rim Lighting + Warm-White Accents)
    const ambientLight = new THREE.AmbientLight(0x0a1e34, 2.5);
    scene.add(ambientLight);

    // Key front light
    const keyLight = new THREE.DirectionalLight(0xdcf8ff, 3.2);
    keyLight.position.set(2.5, 3.5, 4.5);
    scene.add(keyLight);

    // Vibrant Electric Cyan Rim Light (back-left)
    const cyanRim = new THREE.DirectionalLight(0x00f2fe, 5.5);
    cyanRim.position.set(-5, 3, -3);
    scene.add(cyanRim);

    // Vivid Neon Teal Rim Light (back-right)
    const tealRim = new THREE.DirectionalLight(0x00ffc4, 4.2);
    tealRim.position.set(5, -2, -3);
    scene.add(tealRim);

    // Subtle warm amber point light for anatomical contrast
    const warmAccent = new THREE.PointLight(0xffdfba, 1.8, 12);
    warmAccent.position.set(2, -2.5, 3);
    scene.add(warmAccent);

    // Internal radiant core light
    const coreLight = new THREE.PointLight(0x22d3ee, 3.5, 6);
    coreLight.position.set(0, 0, 0);
    masterGroup.add(coreLight);

    // 4. Luminous Anatomical Materials
    const cortexMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x13273e),
      emissive: new THREE.Color(0x063e54),
      emissiveIntensity: 0.95,
      roughness: 0.22,
      metalness: 0.3,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.94
    });

    const vesselMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x22d3ee),
      emissive: new THREE.Color(0x00f2fe),
      emissiveIntensity: 2.5,
      roughness: 0.15,
      metalness: 0.8
    });

    // 5. Immediate Anatomical 3D Brain Geometry (Visible from Frame 0)
    // Creates sculpted dual cerebral hemispheres with realistic cortical gyri and cerebellum
    const createAnatomicalBrainMesh = () => {
      const brainGroup = new THREE.Group();

      const createHemisphere = (isRight) => {
        const geo = new THREE.SphereGeometry(1.0, 48, 48);
        const pos = geo.attributes.position;
        const sign = isRight ? 1 : -1;

        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i);
          let y = pos.getY(i);
          let z = pos.getZ(i);

          // Shape into cerebral hemisphere: elongate anteroposteriorly (Z), arch superiorly (Y)
          x = x * 0.72 + (sign * 0.42);
          y = y * 0.75 + 0.1;
          z = z * 1.15;

          // Flatten medial surface facing longitudinal fissure
          if ((isRight && x < 0.08) || (!isRight && x > -0.08)) {
            x = sign * 0.06;
          }

          // Gyri & Sulci sinusoidal surface displacement
          const freq1 = Math.sin(x * 7.0) * Math.cos(y * 8.0) * Math.sin(z * 6.0);
          const freq2 = Math.sin(x * 14.0 + z * 10.0) * 0.04;
          const gyriDisplacement = freq1 * 0.08 + freq2;

          x += x * gyriDisplacement;
          y += y * gyriDisplacement;
          z += z * gyriDisplacement;

          pos.setXYZ(i, x, y, z);
        }

        geo.computeVertexNormals();
        return new THREE.Mesh(geo, cortexMaterial);
      };

      // Left and Right Cerebral Hemispheres
      brainGroup.add(createHemisphere(false));
      brainGroup.add(createHemisphere(true));

      // Anatomical Cerebellum (posteroventral lobes)
      const cerebellumGeo = new THREE.SphereGeometry(0.48, 32, 32);
      const cPos = cerebellumGeo.attributes.position;
      for (let i = 0; i < cPos.count; i++) {
        let x = cPos.getX(i) * 0.85;
        let y = cPos.getY(i) * 0.55 - 0.48;
        let z = cPos.getZ(i) * 0.75 - 0.55;

        // Fine horizontal folia texture
        const folia = Math.sin(y * 28.0) * 0.02;
        x += x * folia;
        z += z * folia;
        cPos.setXYZ(i, x, y, z);
      }
      cerebellumGeo.computeVertexNormals();
      const cerebellum = new THREE.Mesh(cerebellumGeo, cortexMaterial);
      brainGroup.add(cerebellum);

      // Brainstem
      const stemGeo = new THREE.CylinderGeometry(0.16, 0.12, 0.65, 24);
      stemGeo.translate(0, -0.65, -0.2);
      const stem = new THREE.Mesh(stemGeo, cortexMaterial);
      brainGroup.add(stem);

      return brainGroup;
    };

    let activeBrainMesh = createAnatomicalBrainMesh();
    masterGroup.add(activeBrainMesh);

    // 6. Neural Filament Network & Glowing Synapse Nodes
    const netGroup = new THREE.Group();
    const nodeCount = 42;
    const nodes = [];

    for (let i = 0; i < nodeCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 1.05 + Math.random() * 0.25;

      const x = r * 0.85 * Math.sin(phi) * Math.cos(theta);
      const y = r * 0.8 * Math.sin(phi) * Math.sin(theta) + 0.05;
      const z = r * 1.15 * Math.cos(phi);

      nodes.push(new THREE.Vector3(x, y, z));
    }

    const linePositions = [];
    const lineColors = [];
    const cyanCol = new THREE.Color(0x22d3ee);
    const tealCol = new THREE.Color(0x14b8a6);

    for (let i = 0; i < nodes.length; i++) {
      let connections = 0;
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].distanceTo(nodes[j]) < 0.72 && connections < 3) {
          linePositions.push(nodes[i].x, nodes[i].y, nodes[i].z);
          linePositions.push(nodes[j].x, nodes[j].y, nodes[j].z);

          const col = (i + j) % 2 === 0 ? cyanCol : tealCol;
          lineColors.push(col.r, col.g, col.b);
          lineColors.push(col.r, col.g, col.b);
          connections++;
        }
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    netGroup.add(new THREE.LineSegments(lineGeo, lineMat));

    // Luminous Synapse Spheres
    const nodeSphereGeo = new THREE.SphereGeometry(0.025, 12, 12);
    const nodeMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });

    nodes.forEach((pos, idx) => {
      if (idx % 2 === 0) {
        const sphere = new THREE.Mesh(nodeSphereGeo, nodeMat);
        sphere.position.copy(pos);
        netGroup.add(sphere);
      }
    });

    masterGroup.add(netGroup);

    // 7. Ambient Synaptic Particle Dust
    const particleCount = 180;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    const cyanP = new THREE.Color(0x00f2fe);
    const warmP = new THREE.Color(0xfff5ea);

    for (let i = 0; i < particleCount; i++) {
      const radius = 1.35 + Math.random() * 1.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      particlePos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      particlePos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePos[i * 3 + 2] = radius * Math.cos(phi);

      const color = Math.random() > 0.35 ? cyanP : warmP;
      particleColors[i * 3] = color.r;
      particleColors[i * 3 + 1] = color.g;
      particleColors[i * 3 + 2] = color.b;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.038,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    masterGroup.add(particles);

    // Initial orientation: elegant three-quarter perspective
    masterGroup.rotation.y = 0.55;
    masterGroup.rotation.x = 0.15;

    // 8. Draco-Equipped GLTF Loader for High-Poly Asset
    let dracoLoader = null;
    try {
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('/draco/gltf/');
      dracoLoader.setDecoderConfig({ type: 'js' });

      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      loader.load(
        '/models/brain.glb',
        (gltf) => {
          const gltfModel = gltf.scene;

          // Compute bounding box
          const box = new THREE.Box3().setFromObject(gltfModel);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);

          gltfModel.position.set(-center.x, -center.y, -center.z);
          const maxDim = Math.max(size.x, size.y, size.z);
          const targetScale = 2.7 / maxDim;
          gltfModel.scale.set(targetScale, targetScale, targetScale);

          gltfModel.traverse((child) => {
            if (child.isMesh) {
              const name = (child.name || '').toLowerCase();
              if (name.includes('artery') || name.includes('vessel') || name.includes('nerve')) {
                child.material = vesselMaterial;
              } else {
                child.material = cortexMaterial;
              }
            }
          });

          // Smoothly swap procedural placeholder with high-poly model
          masterGroup.remove(activeBrainMesh);
          activeBrainMesh = gltfModel;
          masterGroup.add(activeBrainMesh);
          setModelStatus('active');
        },
        undefined,
        (err) => {
          console.warn('Using procedural 3D anatomical brain (GLTF info):', err);
          setModelStatus('active');
        }
      );
    } catch (e) {
      console.warn('Draco setup fallback:', e);
      setModelStatus('active');
    }

    // 9. Pointer Parallax Tracking
    let targetRotX = 0.15;
    let targetRotY = 0.55;
    let currentRotX = 0.15;
    let currentRotY = 0.55;

    const handlePointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      targetRotX = 0.15 + y * 0.28;
      targetRotY = 0.55 + x * 0.45;
    };

    container.addEventListener('pointermove', handlePointerMove);

    // 10. Animation Loop
    let animationFrameId;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Continuous subtle yaw spin
      targetRotY += 0.0022;

      // Smooth lerp easing
      currentRotX += (targetRotX - currentRotX) * 0.06;
      currentRotY += (targetRotY - currentRotY) * 0.06;

      masterGroup.rotation.x = currentRotX;
      masterGroup.rotation.y = currentRotY;

      // Gentle levitation
      masterGroup.position.y = Math.sin(elapsedTime * 0.95) * 0.06;

      // Synaptic dust drift
      particles.rotation.y = elapsedTime * 0.025;
      particles.rotation.x = elapsedTime * 0.012;

      // Breathing core glow
      coreLight.intensity = 2.5 + Math.sin(elapsedTime * 2.5) * 0.8;

      renderer.render(scene, camera);
    };

    animate();

    // 11. Responsive Resize Handling
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 12. Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener('pointermove', handlePointerMove);
      resizeObserver.disconnect();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      cortexMaterial.dispose();
      vesselMaterial.dispose();
      if (dracoLoader) dracoLoader.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center select-none overflow-hidden"
    />
  );
}
