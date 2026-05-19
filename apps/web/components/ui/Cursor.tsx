"use client";

import { useEffect, useRef, useState } from "react";

/**
 * HUD cursor. A 3px dot tracks the pointer 1:1. A larger ring lags behind and
 * scales up over interactive elements. When the pointer enters a `[data-magnet]`
 * element, the ring snaps to that element's *current bounding-box center* —
 * which already reflects the magnetic pull — so the ring and the visual
 * element no longer disagree. The dot stays at the real pointer for precision.
 *
 * Hides on touch / no-hover devices and falls back to native cursor under
 * prefers-reduced-motion.
 */
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isTouch || reduced) return;
    setEnabled(true);

    const dot = dotRef.current!;
    const ring = ringRef.current!;
    const label = labelRef.current!;
    const root = document.documentElement;
    root.style.cursor = "none";

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let raf = 0;
    let magnet: HTMLElement | null = null;

    const tick = () => {
      // Ring target: magnet center if hovering one, otherwise the pointer.
      let tx = mx;
      let ty = my;
      if (magnet && magnet.isConnected) {
        const r = magnet.getBoundingClientRect();
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
      }
      rx += (tx - rx) * 0.22;
      ry += (ty - ry) * 0.22;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(var(--qb-cursor-scale, 1))`;
      label.style.transform = `translate3d(${rx + 18}px, ${ry + 18}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    const onDown = () => {
      document.documentElement.style.setProperty("--qb-cursor-scale", "0.7");
    };
    const onUp = () => {
      document.documentElement.style.removeProperty("--qb-cursor-scale");
    };

    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const cursorEl = t?.closest("[data-cursor]") as HTMLElement | null;
      const magnetEl = t?.closest("[data-magnet]") as HTMLElement | null;
      const interactive = t?.closest(
        "a, button, [role='button'], [data-magnet]",
      );
      const state = cursorEl?.dataset.cursor;
      const text = cursorEl?.dataset.cursorLabel;

      magnet = magnetEl ?? null;

      if (state === "view" || state === "drag") {
        document.documentElement.style.setProperty("--qb-cursor-scale", "2.2");
        label.textContent = text ?? state.toUpperCase();
        label.style.opacity = "1";
      } else if (interactive) {
        document.documentElement.style.setProperty("--qb-cursor-scale", "1.9");
        label.textContent = "";
        label.style.opacity = "0";
      } else {
        document.documentElement.style.removeProperty("--qb-cursor-scale");
        label.textContent = "";
        label.style.opacity = "0";
      }
    };

    const onLeave = () => {
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };
    const onEnter = () => {
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("mouseover", onOver);
    window.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget) onLeave();
    });
    document.addEventListener("mouseenter", onEnter);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("mouseover", onOver);
      root.style.cursor = "";
      root.style.removeProperty("--qb-cursor-scale");
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[100] h-8 w-8 rounded-full border border-qb-spark/70 mix-blend-difference"
        style={{ transition: "transform 80ms linear" }}
      />
      <div
        ref={dotRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[101] h-[3px] w-[3px] rounded-full bg-qb-spark mix-blend-difference"
      />
      <span
        ref={labelRef}
        aria-hidden
        className="qb-label pointer-events-none fixed left-0 top-0 z-[100] whitespace-nowrap text-qb-spark opacity-0 transition-opacity duration-200"
      />
    </>
  );
}
