"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Wiring-diagram visualization of the executePQ → precompile → execution
 * flow. Each connector path is animated via stroke-dashoffset under scroll
 * scrub, then a small "OK" tick lights up next to the destination node.
 *
 * Renders as an SVG with viewBox so it scales fluidly down to ~640px wide.
 * Below that it wraps to a vertical fallback driven purely by CSS.
 */
export function ExecuteFlow() {
  const root = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;

    const paths = svg.querySelectorAll<SVGPathElement>("[data-flow-path]");
    const lengths: number[] = [];
    paths.forEach((p) => {
      const len = p.getTotalLength();
      lengths.push(len);
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = reduced ? "0" : `${len}`;
    });

    const ticks = svg.querySelectorAll<SVGElement>("[data-flow-tick]");
    const nodes = svg.querySelectorAll<SVGGElement>("[data-flow-node]");

    if (reduced) {
      ticks.forEach((t) => (t.style.opacity = "1"));
      nodes.forEach((n) => (n.style.opacity = "1"));
      return;
    }

    nodes.forEach((n) => (n.style.opacity = "0"));
    ticks.forEach((t) => (t.style.opacity = "0"));

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: svg,
          start: "top 78%",
          end: "top 18%",
          scrub: 0.7,
        },
      });

      // first node visible immediately
      tl.to(nodes[0], { opacity: 1, duration: 0.05 }, 0);

      paths.forEach((p, i) => {
        const t = i * 0.2;
        tl.to(p, { strokeDashoffset: 0, duration: 0.18, ease: "none" }, t + 0.02);
        tl.to(nodes[i + 1], { opacity: 1, duration: 0.05 }, t + 0.18);
        tl.to(ticks[i], { opacity: 1, duration: 0.05 }, t + 0.2);
      });
    }, svg);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <svg
      ref={root}
      viewBox="0 0 1200 280"
      role="img"
      aria-label="executePQ signature flow"
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker
          id="qb-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.5)" />
        </marker>
      </defs>

      {/* nodes — 4 boxes evenly spaced along Y=80..200 */}
      <Node x={0} index="01" label="Wallet" big="ML-DSA-65" sub="sign(target, value, data, nonce)" />
      <Node x={300} index="02" label="QubitorAccount" big="executePQ" sub="(target, value, data, nonce, signature)" />
      <Node x={600} index="03" label="Precompile" big="0x…0100" sub="ML-DSA-65 verify" />
      <Node x={900} index="04" label="Execution" big="Dispatch" sub="nonce++ · target.call(value, data)" />

      {/* connectors */}
      <Connector x1={280} x2={300} y={140} label="signs" />
      <Connector x1={580} x2={600} y={140} label="verifies" />
      <Connector x1={880} x2={900} y={140} label="ok" />
    </svg>
  );
}

function Node({
  x,
  index,
  label,
  big,
  sub,
}: {
  x: number;
  index: string;
  label: string;
  big: string;
  sub: string;
}) {
  return (
    <g data-flow-node transform={`translate(${x}, 70)`}>
      <rect
        x="0"
        y="0"
        width="280"
        height="140"
        fill="rgba(11,11,11,0.55)"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
      {/* HUD corner ticks */}
      <path d="M0,0 L8,0 M0,0 L0,8" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <path d="M280,0 L272,0 M280,0 L280,8" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <path d="M0,140 L8,140 M0,140 L0,132" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <path d="M280,140 L272,140 M280,140 L280,132" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />

      <text
        x="16"
        y="28"
        fontFamily="var(--font-mono)"
        fontSize="11"
        letterSpacing="0.22em"
        fill="#8a8a8a"
      >
        {index} · {label.toUpperCase()}
      </text>
      <text
        x="16"
        y="72"
        fontFamily="var(--font-display)"
        fontWeight="500"
        fontSize="32"
        letterSpacing="-0.02em"
        fill="#ededed"
      >
        {big}
      </text>
      <text
        x="16"
        y="108"
        fontFamily="var(--font-mono)"
        fontSize="11"
        fill="#8a8a8a"
      >
        {sub}
      </text>
      <rect x="262" y="14" width="4" height="4" fill="#ffffff" />
    </g>
  );
}

function Connector({
  x1,
  x2,
  y,
  label,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
}) {
  return (
    <g>
      <path
        data-flow-path
        d={`M${x1},${y} L${x2},${y}`}
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="1.5"
        fill="none"
        markerEnd="url(#qb-arrow)"
      />
      <text
        data-flow-tick
        x={(x1 + x2) / 2}
        y={y - 10}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="10"
        letterSpacing="0.22em"
        fill="#ededed"
      >
        ▸ {label.toUpperCase()}
      </text>
    </g>
  );
}
