"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { gsap } from "@/lib/gsap";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Y translate range in vh — element parallaxes between -range and +range */
  range?: number;
};

/**
 * Huge background type that parallaxes with scroll (Blueyard editorial layer).
 * Place inside a section as a fixed-pointless decorative element.
 */
export function GiantText({ children, className, range = 8 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { yPercent: range },
        {
          yPercent: -range,
          ease: "none",
          scrollTrigger: {
            trigger: el.parentElement!,
            start: "top bottom",
            end: "bottom top",
            scrub: 1,
          },
        },
      );
    });
    return () => ctx.revert();
  }, [range]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "qb-display pointer-events-none absolute left-0 right-0 top-1/2 -z-10 -translate-y-1/2 whitespace-nowrap text-[clamp(8rem,22vw,22rem)] uppercase tracking-[-0.04em] text-qb-line-strong opacity-[0.06]",
        className,
      )}
      style={{ lineHeight: 0.85 }}
    >
      {children}
    </div>
  );
}
