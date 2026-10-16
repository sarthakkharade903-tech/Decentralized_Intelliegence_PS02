import React, { useState, useEffect, useCallback } from 'react';
import brainLateral from '../assets/atlas/brain_lateral.png';
import brainSuperior from '../assets/atlas/brain_superior.png';
import brainVentral from '../assets/atlas/brain_ventral.png';

const VIEWS_DATA = {
  lateral: {
    id: 'lateral',
    name: 'Lateral View',
    subtitle: 'Sagittal profile',
    image: brainLateral,
    imageBounds: { x: 250, y: 80, width: 500, height: 490 },
    annotations: [
      // Left side callouts
      {
        id: 'frontal',
        side: 'left',
        title: 'Frontal Lobe',
        subtitle: 'Cognition & planning',
        pinX: 370,
        pinY: 250,
        elbowX: 250,
        elbowY: 175,
        labelX: 130,
        labelY: 175
      },
      {
        id: 'temporal',
        side: 'left',
        title: 'Temporal Lobe',
        subtitle: 'Memory & language',
        pinX: 450,
        pinY: 410,
        elbowX: 270,
        elbowY: 460,
        labelX: 130,
        labelY: 460
      },
      // Right side callouts
      {
        id: 'parietal',
        side: 'right',
        title: 'Parietal Lobe',
        subtitle: 'Sensation & integration',
        pinX: 625,
        pinY: 205,
        elbowX: 740,
        elbowY: 175,
        labelX: 870,
        labelY: 175
      },
      {
        id: 'occipital',
        side: 'right',
        title: 'Occipital Lobe',
        subtitle: 'Visual cortex',
        pinX: 720,
        pinY: 345,
        elbowX: 780,
        elbowY: 345,
        labelX: 870,
        labelY: 345
      },
      {
        id: 'cerebellum',
        side: 'right',
        title: 'Cerebellum',
        subtitle: 'Motor coordination',
        pinX: 650,
        pinY: 470,
        elbowX: 750,
        elbowY: 485,
        labelX: 870,
        labelY: 485
      }
    ]
  },
  superior: {
    id: 'superior',
    name: 'Superior View',
    subtitle: 'Top-down axial',
    image: brainSuperior,
    imageBounds: { x: 275, y: 75, width: 450, height: 495 },
    annotations: [
      // Left side callouts
      {
        id: 'frontal_pole',
        side: 'left',
        title: 'Frontal Pole',
        subtitle: 'Executive control',
        pinX: 410,
        pinY: 170,
        elbowX: 260,
        elbowY: 170,
        labelX: 130,
        labelY: 170
      },
      {
        id: 'precentral',
        side: 'left',
        title: 'Precentral Gyrus',
        subtitle: 'Primary motor cortex',
        pinX: 375,
        pinY: 310,
        elbowX: 250,
        elbowY: 310,
        labelX: 130,
        labelY: 310
      },
      {
        id: 'left_hemisphere',
        side: 'left',
        title: 'Left Hemisphere',
        subtitle: 'Analytical processing',
        pinX: 410,
        pinY: 450,
        elbowX: 270,
        elbowY: 460,
        labelX: 130,
        labelY: 460
      },
      // Right side callouts
      {
        id: 'fissure',
        side: 'right',
        title: 'Longitudinal Fissure',
        subtitle: 'Interhemispheric division',
        pinX: 500,
        pinY: 125,
        elbowX: 680,
        elbowY: 125,
        labelX: 870,
        labelY: 125
      },
      {
        id: 'postcentral',
        side: 'right',
        title: 'Postcentral Gyrus',
        subtitle: 'Somatosensory reception',
        pinX: 625,
        pinY: 310,
        elbowX: 740,
        elbowY: 310,
        labelX: 870,
        labelY: 310
      },
      {
        id: 'occipital_pole',
        side: 'right',
        title: 'Occipital Pole',
        subtitle: 'Primary visual cortex',
        pinX: 590,
        pinY: 470,
        elbowX: 740,
        elbowY: 470,
        labelX: 870,
        labelY: 470
      }
    ]
  },
  ventral: {
    id: 'ventral',
    name: 'Ventral View',
    subtitle: 'Inferior basal',
    image: brainVentral,
    imageBounds: { x: 270, y: 70, width: 460, height: 500 },
    annotations: [
      // Left side callouts
      {
        id: 'optic_chiasm',
        side: 'left',
        title: 'Optic Chiasm',
        subtitle: 'Visual decussation',
        pinX: 440,
        pinY: 245,
        elbowX: 270,
        elbowY: 180,
        labelX: 130,
        labelY: 180
      },
      {
        id: 'inferior_temporal',
        side: 'left',
        title: 'Inferior Temporal',
        subtitle: 'Facial & form recognition',
        pinX: 360,
        pinY: 360,
        elbowX: 250,
        elbowY: 360,
        labelX: 130,
        labelY: 360
      },
      {
        id: 'pons',
        side: 'left',
        title: 'Pons & Brainstem',
        subtitle: 'Autonomic vital relay',
        pinX: 470,
        pinY: 440,
        elbowX: 290,
        elbowY: 480,
        labelX: 130,
        labelY: 480
      },
      // Right side callouts
      {
        id: 'olfactory',
        side: 'right',
        title: 'Olfactory Tract',
        subtitle: 'Direct sensory afferents',
        pinX: 545,
        pinY: 220,
        elbowX: 730,
        elbowY: 180,
        labelX: 870,
        labelY: 180
      },
      {
        id: 'cerebellar_folia',
        side: 'right',
        title: 'Cerebellar Folia',
        subtitle: 'Equilibrium & posture',
        pinX: 640,
        pinY: 460,
        elbowX: 750,
        elbowY: 380,
        labelX: 870,
        labelY: 380
      },
      {
        id: 'medulla',
        side: 'right',
        title: 'Medulla Oblongata',
        subtitle: 'Cardiorespiratory center',
        pinX: 520,
        pinY: 535,
        elbowX: 730,
        elbowY: 500,
        labelX: 870,
        labelY: 500
      }
    ]
  }
};

export default function AnnotatedBrain({ activeView = 'lateral', onViewChange }) {
  const [currentViewId, setCurrentViewId] = useState(activeView);
  const [previousViewId, setPreviousViewId] = useState(null);
  const [isSweepActive, setIsSweepActive] = useState(false);
  const [sweepProgress, setSweepProgress] = useState(0); // 0 to 100
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null);

  const triggerTransition = useCallback((newViewId) => {
    if (newViewId === currentViewId || isSweepActive) return;

    setPreviousViewId(currentViewId);
    setCurrentViewId(newViewId);
    setIsSweepActive(true);
    setSweepProgress(0);

    const startTime = performance.now();
    const duration = 750; // ms

    const step = (now) => {
      const elapsed = now - startTime;
      const p = Math.min(elapsed / duration, 1.0);
      setSweepProgress(p * 100);

      if (p < 1.0) {
        requestAnimationFrame(step);
      } else {
        setIsSweepActive(false);
        setPreviousViewId(null);
        if (onViewChange) onViewChange(newViewId);
      }
    };

    requestAnimationFrame(step);
  }, [currentViewId, isSweepActive, onViewChange]);

  // Sync with prop changes if passed from parent
  useEffect(() => {
    if (activeView && activeView !== currentViewId) {
      const timer = setTimeout(() => {
        triggerTransition(activeView);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeView, currentViewId, triggerTransition]);

  const currentView = VIEWS_DATA[currentViewId];
  const previousView = previousViewId ? VIEWS_DATA[previousViewId] : null;

  // Calculate sweep line Y in SVG coordinates (0 to 650)
  const sweepY = (sweepProgress / 100) * 650;

  return (
    <div className="relative w-full max-w-[820px] aspect-[1000/650] flex items-center justify-center select-none mx-auto">
      
      {/* Background Orbital Rings and Scientific Measurement Marks */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-35">
        <div className="w-[520px] h-[520px] rounded-full border border-[#D5C2B8]" />
        <div className="absolute w-[600px] h-[600px] rounded-full border border-dashed border-[#D5C2B8]/60" />
        <div className="absolute w-[420px] h-[420px] rounded-full border border-[#D5C2B8]/40" />
      </div>

      {/* Unified SVG Canvas for 100% Mathematical Alignment */}
      <svg
        viewBox="0 0 1000 650"
        className="w-full h-full overflow-visible"
        style={{ filter: 'drop-shadow(0 14px 28px rgba(48,37,42,0.08))' }}
      >
        <defs>
          {/* Top-to-bottom Electric Neuron Sweep Gradient */}
          <linearGradient id="electric-beam" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6D263D" stopOpacity="0" />
            <stop offset="25%" stopColor="#C24168" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#FFE3BE" stopOpacity="1" />
            <stop offset="75%" stopColor="#C24168" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#6D263D" stopOpacity="0" />
          </linearGradient>

          {/* Electric Glow Filter */}
          <filter id="synaptic-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Pin Highlight Filter */}
          <filter id="pin-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#6D263D" floodOpacity="0.5" />
          </filter>

          {/* Clip-Path revealing incoming view during top-to-bottom sweep */}
          <clipPath id="sweep-reveal-clip">
            <rect x="0" y="0" width="1000" height={isSweepActive ? sweepY : 650} />
          </clipPath>

          <clipPath id="sweep-hide-clip">
            <rect x="0" y={sweepY} width="1000" height={650 - sweepY} />
          </clipPath>
        </defs>

        {/* 1. Outgoing Brain Image (shown during sweep) */}
        {isSweepActive && previousView && (
          <g clipPath="url(#sweep-hide-clip)">
            <image
              href={previousView.image}
              x={previousView.imageBounds.x}
              y={previousView.imageBounds.y}
              width={previousView.imageBounds.width}
              height={previousView.imageBounds.height}
              preserveAspectRatio="xMidYMid meet"
              className="transition-transform duration-300"
            />
          </g>
        )}

        {/* 2. Current / Incoming Brain Image */}
        <g clipPath={isSweepActive ? 'url(#sweep-reveal-clip)' : undefined}>
          <image
            href={currentView.image}
            x={currentView.imageBounds.x}
            y={currentView.imageBounds.y}
            width={currentView.imageBounds.width}
            height={currentView.imageBounds.height}
            preserveAspectRatio="xMidYMid meet"
            className="transition-transform duration-300"
          />
        </g>

        {/* 3. Electric Synaptic Impulse Wave Laser (Active during sweep) */}
        {isSweepActive && (
          <g className="pointer-events-none">
            {/* Luminous Synaptic Beam Line */}
            <line
              x1="180"
              y1={sweepY}
              x2="820"
              y2={sweepY}
              stroke="url(#electric-beam)"
              strokeWidth="3.5"
              filter="url(#synaptic-glow)"
            />
            {/* Soft Ambient Laser Aura */}
            <line
              x1="220"
              y1={sweepY}
              x2="780"
              y2={sweepY}
              stroke="#FFE3BE"
              strokeWidth="1.2"
            />
            {/* Spark points along the wave */}
            {[-120, -50, 20, 90, 160].map((offset, i) => (
              <circle
                key={i}
                cx={500 + offset}
                cy={sweepY}
                r={1.8 + (i % 2)}
                fill="#FFF5EA"
                filter="url(#synaptic-glow)"
              />
            ))}
          </g>
        )}

        {/* 4. Connecting SVG Leader Lines & Pins (Mathematically Locked Coordinates) */}
        {currentView.annotations.map((ann) => {
          const isHovered = hoveredAnnotation === ann.id;
          const isLeft = ann.side === 'left';

          return (
            <g
              key={ann.id}
              className="cursor-pointer group"
              onMouseEnter={() => setHoveredAnnotation(ann.id)}
              onMouseLeave={() => setHoveredAnnotation(null)}
            >
              {/* Leader Elbow Line */}
              <path
                d={`M ${ann.pinX} ${ann.pinY} L ${ann.elbowX} ${ann.elbowY} L ${isLeft ? ann.labelX + 8 : ann.labelX - 8} ${ann.elbowY}`}
                fill="none"
                stroke={isHovered ? '#6D263D' : '#8C485A'}
                strokeWidth={isHovered ? '1.8' : '0.9'}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={isHovered ? 'url(#pin-glow)' : undefined}
                className="transition-all duration-300 opacity-85"
              />

              {/* Precise Anchor Pin on Cortical Anatomy */}
              <circle
                cx={ann.pinX}
                cy={ann.pinY}
                r={isHovered ? 6 : 4.5}
                fill="#F8F5F0"
                stroke={isHovered ? '#6D263D' : '#8C485A'}
                strokeWidth={isHovered ? '2' : '1.2'}
                filter={isHovered ? 'url(#pin-glow)' : undefined}
                className="transition-all duration-300"
              />
              <circle
                cx={ann.pinX}
                cy={ann.pinY}
                r={isHovered ? 2.5 : 1.8}
                fill={isHovered ? '#6D263D' : '#8C485A'}
                className="transition-all duration-300"
              />

              {/* Educational Text Labels on Left and Right Sides */}
              <text
                x={ann.labelX}
                y={ann.labelY - 2}
                textAnchor={isLeft ? 'end' : 'start'}
                className={`font-sans font-bold transition-all duration-200 select-none ${
                  isHovered ? 'fill-[#6D263D] text-[15px]' : 'fill-[#30252A] text-[13.5px]'
                }`}
                style={{ letterSpacing: '-0.01em' }}
              >
                {ann.title}
              </text>
              <text
                x={ann.labelX}
                y={ann.labelY + 14}
                textAnchor={isLeft ? 'end' : 'start'}
                className="font-sans text-[11px] fill-[#6E5D65] transition-all duration-200 select-none"
              >
                {ann.subtitle}
              </text>
            </g>
          );
        })}
      </svg>

      {/* View Switch Indicator Badge at Bottom */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 rounded-full bg-[#F3ECE7]/80 border border-[#DDD0C8] text-[11px] font-mono text-[#6E5D65] shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-[#6D263D] animate-pulse" />
        <span>CURRENT ORIENTATION: {currentView.name.toUpperCase()}</span>
      </div>

    </div>
  );
}
