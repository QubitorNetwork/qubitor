"use client";

import { useEffect } from "react";

/**
 * Magnetic hover: any element matched by `selector` will translate toward the
 * cursor while the pointer is within `radius` pixels of its bounding box.
 * Translation is `strength` × offset (0..1).
 *
 * Usage: call `useMagnet("[data-magnet]")` once at the layout level.
 */
export function useMagnet(
  selector: string,
  { radius = 110, strength = 0.28 }: { radius?: number; strength?: number } = {},
) {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const tracked = new Map<HTMLElement, { rect: DOMRect }>();
    const refresh = () => {
      tracked.clear();
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        tracked.set(el, { rect: el.getBoundingClientRect() });
      });
    };
    refresh();

    let raf = 0;
    let mx = 0;
    let my = 0;
    const targets = new Map<HTMLElement, { x: number; y: number }>();

    const tick = () => {
      tracked.forEach((info, el) => {
        const r = info.rect;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = mx - cx;
        const dy = my - cy;
        const dist = Math.hypot(dx, dy);
        const max = Math.max(r.width, r.height) / 2 + radius;
        if (dist < max) {
          const cur = targets.get(el) ?? { x: 0, y: 0 };
          const targetX = dx * strength;
          const targetY = dy * strength;
          cur.x += (targetX - cur.x) * 0.18;
          cur.y += (targetY - cur.y) * 0.18;
          targets.set(el, cur);
          el.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
        } else {
          const cur = targets.get(el);
          if (cur && (Math.abs(cur.x) > 0.05 || Math.abs(cur.y) > 0.05)) {
            cur.x += (0 - cur.x) * 0.18;
            cur.y += (0 - cur.y) * 0.18;
            el.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
          } else if (cur) {
            el.style.transform = "";
            targets.delete(el);
          }
        }
      });
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };

    const onResize = () => refresh();
    const mo = new MutationObserver(refresh);
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("pointermove", onMove);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
      mo.disconnect();
    };
  }, [selector, radius, strength]);
}
