"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { subscribeHead } from "@/lib/qubitor/head";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * The explorer's own background: a rigid block-lattice that ripples outward
 * on every new chain head. Deliberately recessive vs. the landing's organic
 * particle clouds — calm idle, low alpha, structured grid.
 */

const MAX_RIPPLES = 5;

const VERT = /* glsl */ `
  precision highp float;
  attribute vec2 aGrid;            // 0..1 lattice coords
  uniform float uTime;
  uniform float uReduced;          // 1.0 = reduced-motion: freeze
  uniform float uRippleT[${MAX_RIPPLES}]; // scene-clock start times (<0 = unused)
  varying float vAlpha;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float span = 26.0;
    float x = (aGrid.x - 0.5) * span;
    float z = (aGrid.y - 0.5) * span;
    float d = length(vec2(x, z));

    // calm idle shimmer (killed under reduced-motion)
    float idle = (1.0 - uReduced) *
      sin(uTime * 0.35 + hash(aGrid) * 6.2831) * 0.045;

    // sum decaying radial wavefronts — one per recent block
    float ripple = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      float t0 = uRippleT[i];
      if (t0 < 0.0) continue;
      float e = uTime - t0;
      if (e < 0.0 || e > 2.4) continue;
      ripple += sin(d * 0.55 - e * 3.4) * exp(-e * 2.1)
                * exp(-d * 0.05) * (1.0 - uReduced);
    }

    float y = idle + ripple * 0.85;

    vec3 pos = vec3(x, y, z);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = -mv.z;
    gl_PointSize = (1.0 / max(dist, 0.001)) * 42.0;

    // recessive: dim base, brief lift on a passing wavefront
    float base = 0.16 + 0.10 * hash(aGrid + 3.0);
    float lift = clamp(abs(ripple) * 2.2, 0.0, 0.55);
    vAlpha = clamp((base + lift) * smoothstep(15.0, 2.0, d), 0.0, 0.62);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  uniform float uOpacity;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c));
    // Datasheet: near-black INK plotted on paper (normal-blended), not an
    // additive white glow on black.
    gl_FragColor = vec4(vec3(0.04), a * vAlpha * uOpacity);
  }
`;

function Lattice() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const reduced = useReducedMotion();
  // ripple start times in scene-clock seconds; -1 = empty slot
  const ripples = useRef<number[]>(
    Array.from({ length: MAX_RIPPLES }, () => -1),
  );
  const pendingTick = useRef(0);
  const lastTick = useRef(0);

  const { geometry, uniforms } = useMemo(() => {
    const N = 90;
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
        uReduced: { value: reduced ? 1 : 0 },
        // ink-on-paper needs more presence than additive-on-black did
        uOpacity: { value: reduced ? 0.4 : 0.55 },
        uRippleT: {
          value: Array.from({ length: MAX_RIPPLES }, () => -1),
        },
      },
    };
  }, [reduced]);

  useEffect(() => {
    return subscribeHead((h) => {
      if (h.tick !== lastTick.current) {
        lastTick.current = h.tick;
        pendingTick.current += 1;
      }
    });
  }, []);

  useFrame((_s, dt) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    if (reduced) {
      u.uTime.value = 0;
      return;
    }
    u.uTime.value += dt;

    if (pendingTick.current > 0) {
      pendingTick.current = 0;
      // shift buffer, push current time as the newest wavefront origin
      const buf = ripples.current;
      buf.copyWithin(1, 0, MAX_RIPPLES - 1);
      buf[0] = u.uTime.value;
      (u.uRippleT.value as number[]).splice(0, MAX_RIPPLES, ...buf);
    }
  });

  return (
    <points
      geometry={geometry}
      rotation={[-Math.PI / 2.35, 0, 0]}
      position={[0, -0.4, 0]}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

/**
 * Demand ticker: ~30fps while a wavefront is decaying, a lazy ~6fps idle
 * shimmer otherwise, fully asleep when the tab is hidden or reduced-motion.
 */
function DemandTicker({ active }: { active: React.MutableRefObject<number> }) {
  const { invalidate } = useThree();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      invalidate();
      return;
    }
    let raf = 0;
    let last = performance.now();
    function loop(t: number) {
      const since = t - last;
      const fast = active.current > 0;
      const step = fast ? 33 : 170;
      if (!document.hidden && since >= step) {
        invalidate();
        last = t;
        if (fast) active.current = Math.max(0, active.current - since);
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    const onVisible = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [invalidate, reduced, active]);
  return null;
}

export function ExplorerScene() {
  // ms of "fast" rendering remaining; bumped only when a NEW block lands
  const activeMs = useRef(0);
  const lastTick = useRef(0);
  useEffect(() => {
    return subscribeHead((h) => {
      if (h.tick !== lastTick.current) {
        lastTick.current = h.tick;
        // keep fast cadence ~2.5s after each new head (covers ripple decay)
        activeMs.current = 2500;
      }
    });
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 3.1, 6.2], fov: 42 }}
      >
        <DemandTicker active={activeMs} />
        <Lattice />
      </Canvas>
    </div>
  );
}
