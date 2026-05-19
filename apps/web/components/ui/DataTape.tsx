"use client";

import { useEffect, useRef } from "react";
import { subscribeScroll } from "@/lib/scroll";
import { BRAND } from "@/lib/copy";

/**
 * Thin HUD readout that sits under the nav. Shows live-ish system values that
 * also respond to scroll — gives the page a constant cockpit feel.
 */
export function DataTape() {
  const progressEl = useRef<HTMLSpanElement>(null);
  const velocityEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    return subscribeScroll((s) => {
      if (progressEl.current)
        progressEl.current.textContent = `${(s.progress * 100).toFixed(1).padStart(5, " ")}%`;
      if (velocityEl.current) {
        const v = Math.abs(s.velocity).toFixed(1).padStart(5, " ");
        velocityEl.current.textContent = `${v}`;
      }
    });
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-16 z-30 hidden border-y border-qb-line bg-qb-black/40 backdrop-blur-sm md:block"
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-2 md:px-10">
        <div className="flex items-center gap-6">
          <span className="qb-label text-qb-bone">▸ PQ FIELD LIVE</span>
          <span className="qb-label">CHAIN {BRAND.chainId}</span>
          <span className="qb-label">{BRAND.signature}</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="qb-label">
            SCROLL <span ref={progressEl} className="ml-2 text-qb-bone tabular-nums">  0.0%</span>
          </span>
          <span className="qb-label">
            VEL <span ref={velocityEl} className="ml-2 text-qb-bone tabular-nums">  0.0</span>
          </span>
          <span className="qb-label text-qb-mist">{BRAND.precompile}</span>
        </div>
      </div>
    </div>
  );
}
