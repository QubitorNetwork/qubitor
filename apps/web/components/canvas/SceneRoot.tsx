"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getScroll, subscribeScroll } from "@/lib/scroll";

/* ---------------- shared shaders ---------------- */

const TORUS_VERT = /* glsl */ `
  precision highp float;
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uProgress;
  uniform float uPointer;
  uniform float uPointerY;
  varying float vAlpha;

  float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    float u = aSeed.x * 6.2831853;
    float v = aSeed.y * 6.2831853;
    float R = 1.95;
    float r = 0.6;

    float breath = sin(uTime * 0.45 + aSeed.z * 6.0) * 0.06;
    float rr = r + breath;

    vec3 pos;
    pos.x = (R + rr * cos(v)) * cos(u);
    pos.y = (R + rr * cos(v)) * sin(u);
    pos.z = rr * sin(v);

    float ang = uTime * 0.08 + uPointer * 0.6 + uProgress * 2.2;
    float c = cos(ang); float s = sin(ang);
    pos = vec3(c*pos.x + s*pos.z, pos.y, -s*pos.x + c*pos.z);

    float tilt = uPointerY * 0.4 + uProgress * 0.5;
    float ct = cos(tilt); float st = sin(tilt);
    pos = vec3(pos.x, ct*pos.y - st*pos.z, st*pos.y + ct*pos.z);

    // explode outward at end of torus arc
    float dispersion = smoothstep(0.18, 0.42, uProgress);
    pos *= 1.0 + dispersion * 1.6;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = (1.0 / max(dist, 0.001)) * 90.0;
    float twinkle = 0.55 + 0.45 * hash(aSeed + vec3(uTime * 0.6));
    vAlpha = clamp(twinkle * (1.6 - dist * 0.18), 0.0, 1.0);
  }
`;

const WAVE_VERT = /* glsl */ `
  precision highp float;
  attribute vec2 aGrid;
  uniform float uTime;
  uniform float uProgress;
  varying float vAlpha;

  void main() {
    float x = (aGrid.x - 0.5) * 18.0;
    float z = (aGrid.y - 0.5) * 18.0;
    float d = length(vec2(x, z));

    float wave =
      sin(d * 0.6 - uTime * 0.9) * 0.40 +
      sin(x * 0.3 + uTime * 0.3) * 0.14 +
      cos(z * 0.4 - uTime * 0.4) * 0.12;

    // amplify wave as scroll passes through smart-accounts region
    float amp = smoothstep(0.20, 0.50, uProgress) * (1.0 - smoothstep(0.55, 0.78, uProgress));
    wave *= 0.4 + amp * 1.4;

    vec3 pos = vec3(x, wave, z);
    pos.y -= 0.6;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 1.4 + (1.0 / max(-mv.z, 0.001)) * 14.0;
    vAlpha = smoothstep(10.0, 1.5, d) * (0.3 + amp * 0.8);
  }
`;

const RING_VERT = /* glsl */ `
  precision highp float;
  attribute float aRing;
  attribute float aPhase;
  uniform float uTime;
  uniform float uProgress;
  varying float vAlpha;

  void main() {
    float radius = 0.55 + aRing * 0.55;
    float speed = mix(0.22, 0.08, aRing / 4.0);
    float angle = aPhase + uTime * speed * (mod(aRing, 2.0) < 0.5 ? 1.0 : -1.0);

    float rise = smoothstep(0.55, 0.95, uProgress);
    radius *= 0.4 + rise * 1.2;

    vec3 pos;
    pos.x = cos(angle) * radius;
    pos.y = sin(angle) * radius * 0.5;
    pos.z = sin(angle) * radius;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 1.6 + (1.0 / max(-mv.z, 0.001)) * 11.0;
    vAlpha = (0.55 + 0.45 * sin(angle * 3.0)) * rise;
  }
`;

const FRAG_WHITE = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  uniform float uOpacity;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c));
    gl_FragColor = vec4(vec3(1.0), a * vAlpha * uOpacity);
  }
`;

/* ---------------- meshes ---------------- */

function TorusPoints() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const pointer = useRef({ x: 0.5, y: 0.5 });

  const { geometry, uniforms } = useMemo(() => {
    const COUNT = 24000;
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      seeds[i * 3 + 0] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uPointer: { value: 0.5 },
        uPointerY: { value: 0.5 },
        uOpacity: { value: 1 },
      },
    };
  }, []);

  useFrame((state, dt) => {
    if (!matRef.current) return;
    const px = (state.pointer.x + 1) * 0.5;
    const py = (state.pointer.y + 1) * 0.5;
    pointer.current.x += (px - pointer.current.x) * 0.04;
    pointer.current.y += (py - pointer.current.y) * 0.04;

    const { progress } = getScroll();
    const u = matRef.current.uniforms;
    u.uTime.value += dt;
    u.uPointer.value = pointer.current.x;
    u.uPointerY.value = pointer.current.y;
    u.uProgress.value = progress;
    // fade out between 0.20 and 0.32
    const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.18, 0.32);
    u.uOpacity.value = fade;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={TORUS_VERT}
        fragmentShader={FRAG_WHITE}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function WavePoints() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { geometry, uniforms } = useMemo(() => {
    const N = 150;
    const COUNT = N * N;
    const positions = new Float32Array(COUNT * 3);
    const grid = new Float32Array(COUNT * 2);
    let k = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        grid[k * 2 + 0] = i / (N - 1);
        grid[k * 2 + 1] = j / (N - 1);
        k++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aGrid", new THREE.BufferAttribute(grid, 2));
    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uOpacity: { value: 0 },
      },
    };
  }, []);

  useFrame((_s, dt) => {
    if (!matRef.current) return;
    const { progress } = getScroll();
    const u = matRef.current.uniforms;
    u.uTime.value += dt;
    u.uProgress.value = progress;
    const visible =
      THREE.MathUtils.smoothstep(progress, 0.15, 0.32) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.58, 0.72));
    u.uOpacity.value = visible;
  });

  return (
    <points
      geometry={geometry}
      rotation={[-Math.PI / 2.3, 0, 0]}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={matRef}
        vertexShader={WAVE_VERT}
        fragmentShader={FRAG_WHITE}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function RingPoints() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { geometry, uniforms } = useMemo(() => {
    const RINGS = 6;
    const PER = 360;
    const COUNT = RINGS * PER;
    const positions = new Float32Array(COUNT * 3);
    const aRing = new Float32Array(COUNT);
    const aPhase = new Float32Array(COUNT);
    let k = 0;
    for (let r = 0; r < RINGS; r++) {
      for (let i = 0; i < PER; i++) {
        aRing[k] = r;
        aPhase[k] = (i / PER) * Math.PI * 2;
        k++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aRing", new THREE.BufferAttribute(aRing, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uOpacity: { value: 0 },
      },
    };
  }, []);

  useFrame((_s, dt) => {
    if (!matRef.current) return;
    const { progress } = getScroll();
    const u = matRef.current.uniforms;
    u.uTime.value += dt;
    u.uProgress.value = progress;
    u.uOpacity.value = THREE.MathUtils.smoothstep(progress, 0.58, 0.78);
  });

  return (
    <points geometry={geometry} rotation={[0.22, 0, 0]} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={RING_VERT}
        fragmentShader={FRAG_WHITE}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ---------------- streaks (InfiniteLights vibe) ---------------- */

const STREAK_VERT = /* glsl */ `
  precision highp float;
  attribute vec3 aOffset; // x, y, z init
  attribute float aSpeed;
  attribute float aLen;
  uniform float uTime;
  uniform float uProgress;
  varying float vAlpha;
  varying float vEdge;

  void main() {
    // position.z gives the along-streak axis (0..1)
    float along = position.z;
    float total = mod(aOffset.z + uTime * aSpeed, 40.0) - 20.0;

    vec3 pos;
    pos.x = aOffset.x;
    pos.y = aOffset.y;
    pos.z = total + along * aLen;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    vEdge = along;
    // fade out as we leave the hero region
    float region = 1.0 - smoothstep(0.10, 0.22, uProgress);
    vAlpha = region * (0.5 + 0.5 * sin(aOffset.x * 13.0 + aOffset.y * 7.0));
  }
`;

const STREAK_FRAG = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vEdge;
  void main() {
    // taper to a point at both ends of the streak
    float taper = sin(vEdge * 3.14159);
    gl_FragColor = vec4(vec3(1.0), taper * vAlpha * 0.85);
  }
`;

function Streaks() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { geometry, uniforms } = useMemo(() => {
    const COUNT = 80;
    const SEGS = 64;
    // Each streak is a line strip; we use indexed triangles approximated as a
    // thin quad along its length. For simplicity here we render as line strips.
    const positions = new Float32Array(COUNT * SEGS * 3);
    const offsets = new Float32Array(COUNT * SEGS * 3);
    const speeds = new Float32Array(COUNT * SEGS);
    const lens = new Float32Array(COUNT * SEGS);

    for (let i = 0; i < COUNT; i++) {
      const r = 1.4 + Math.random() * 5.5;
      const angle = Math.random() * Math.PI * 2;
      const ox = Math.cos(angle) * r;
      const oy = Math.sin(angle) * r * 0.7;
      const oz = Math.random() * 40 - 20;
      const speed = 4 + Math.random() * 9;
      const len = 1.2 + Math.random() * 3.4;
      for (let s = 0; s < SEGS; s++) {
        const idx = i * SEGS + s;
        const along = s / (SEGS - 1);
        positions[idx * 3 + 0] = 0;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = along;
        offsets[idx * 3 + 0] = ox;
        offsets[idx * 3 + 1] = oy;
        offsets[idx * 3 + 2] = oz;
        speeds[idx] = speed;
        lens[idx] = len;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 3));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute("aLen", new THREE.BufferAttribute(lens, 1));

    // Draw call per streak using line strips: build index buffer
    const indices: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      for (let s = 0; s < SEGS - 1; s++) {
        indices.push(i * SEGS + s, i * SEGS + s + 1);
      }
    }
    geo.setIndex(indices);

    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
      },
    };
  }, []);

  useFrame((_s, dt) => {
    if (!matRef.current) return;
    const { progress } = getScroll();
    const u = matRef.current.uniforms;
    u.uTime.value += dt;
    u.uProgress.value = progress;
  });

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={STREAK_VERT}
        fragmentShader={STREAK_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

/* ---------------- camera (dolly + velocity-driven roll/tilt) ---------------- */

function CameraRig() {
  const { camera } = useThree();
  const tiltX = useRef(0);
  const tiltZ = useRef(0);

  useFrame(() => {
    const { progress, velocity } = getScroll();
    // dolly forward through the scene
    const targetZ = 5.4 - progress * 2.4;
    const targetY = -progress * 0.6;
    camera.position.z += (targetZ - camera.position.z) * 0.08;
    camera.position.y += (targetY - camera.position.y) * 0.08;

    // velocity-driven micro-roll: small Z rotation that reads as "weight"
    const targetRollZ = THREE.MathUtils.clamp(velocity * 0.0015, -0.08, 0.08);
    const targetTiltX = THREE.MathUtils.clamp(velocity * 0.0008, -0.05, 0.05);
    tiltZ.current += (targetRollZ - tiltZ.current) * 0.08;
    tiltX.current += (targetTiltX - tiltX.current) * 0.08;

    camera.rotation.z = tiltZ.current;
    camera.lookAt(0, camera.position.y * 0.4, 0);
    camera.rotation.x += tiltX.current;
    camera.rotation.z = tiltZ.current; // re-apply after lookAt
  });
  return null;
}

/* ---------------- demand-driven ticker ----------------
   With `frameloop="demand"`, useFrame only fires when invalidate() is called.
   We invalidate at ~30fps when the page is visible, on every scroll publish,
   and on pointermove — so the scene reacts immediately to input but sleeps
   completely when the tab is hidden. ~halves GPU vs. always-on 60fps.        */

function DemandTicker() {
  const { invalidate } = useThree();
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    function tick(t: number) {
      if (!document.hidden && t - last >= 33) {
        invalidate();
        last = t;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    const onScroll = () => invalidate();
    const unsub = subscribeScroll(onScroll);
    const onPointer = () => invalidate();
    window.addEventListener("pointermove", onPointer, { passive: true });
    const onVisible = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [invalidate]);
  return null;
}

/* ---------------- root ---------------- */

export function SceneRoot() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0, 5.4], fov: 40 }}
      >
        <DemandTicker />
        <CameraRig />
        <Streaks />
        <TorusPoints />
        <WavePoints />
        <RingPoints />
      </Canvas>
    </div>
  );
}
