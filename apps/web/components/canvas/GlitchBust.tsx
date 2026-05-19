"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type Props = {
  src: string;
  alt?: string;
  className?: string;
};

/**
 * Lightweight datamosh overlay. Canvas 2D pass over an image: random horizontal
 * slice offsets + scanline + binary rain in a side channel. Cheap on CPU and
 * matches the BG10 / quantum-risk flyer aesthetic without a WebGL context.
 */
export function GlitchBust({ src, alt = "", className }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const c = canvas.current;
    const w = wrap.current;
    const i = img.current;
    if (!c || !w || !i) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    let burst = 0;

    function size() {
      if (!c || !w) return;
      const r = w.getBoundingClientRect();
      c.width = Math.floor(r.width * devicePixelRatio);
      c.height = Math.floor(r.height * devicePixelRatio);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
    }
    size();
    const ro = new ResizeObserver(size);
    ro.observe(w);

    function draw(t: number) {
      if (!ctx || !c || !i) return;
      const dt = t - last;
      if (dt < 90) {
        raf = requestAnimationFrame(draw);
        return;
      }
      last = t;
      burst = Math.max(0, burst - 0.04);
      if (Math.random() < 0.06) burst = 1;

      ctx.clearRect(0, 0, c.width, c.height);

      const slices = 6 + Math.floor(Math.random() * 10);
      for (let s = 0; s < slices; s++) {
        const y = Math.floor(Math.random() * c.height);
        const h = 1 + Math.floor(Math.random() * (c.height / 24));
        const ox = (Math.random() - 0.5) * 60 * burst;
        ctx.globalAlpha = 0.18 + Math.random() * 0.22;
        ctx.drawImage(
          i,
          0,
          (y / c.height) * i.naturalHeight,
          i.naturalWidth,
          (h / c.height) * i.naturalHeight,
          ox,
          y,
          c.width,
          h,
        );
      }

      // scanlines
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#000";
      for (let y = 0; y < c.height; y += 3) {
        ctx.fillRect(0, y, c.width, 1);
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }

    if (i.complete) raf = requestAnimationFrame(draw);
    else i.onload = () => (raf = requestAnimationFrame(draw));

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrap} className={cn("relative overflow-hidden", className)}>
      <img
        ref={img}
        src={src}
        alt={alt}
        className="block h-full w-full object-cover opacity-90"
        crossOrigin="anonymous"
      />
      <canvas
        ref={canvas}
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-screen"
      />
    </div>
  );
}
