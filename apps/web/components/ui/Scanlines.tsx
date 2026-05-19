"use client";

import { useEffect } from "react";
import { gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Attaches a scaleX-from-0 reveal to every `section[id]`'s ::before scan line.
 * The pseudo-element is defined in globals.css; this hook just animates it on
 * intersection. One global controller — no per-section markup.
 */
export function Scanlines() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const sections = document.querySelectorAll<HTMLElement>(
      "section[id]:not(#hero)",
    );
    if (!sections.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            if (el.dataset.scanRevealed) continue;
            el.dataset.scanRevealed = "1";
            el.classList.add("qb-section-revealed");
            io.unobserve(el);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.01 },
    );

    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [reduced]);

  // Also expose a one-shot tween so a section can re-trigger if needed.
  useEffect(() => {
    if (reduced) return;
    const sections = document.querySelectorAll<HTMLElement>(
      "section[id]:not(#hero)",
    );
    sections.forEach((s) => {
      gsap.set(s, { "--qb-scan": 0 });
    });
  }, [reduced]);

  return null;
}
