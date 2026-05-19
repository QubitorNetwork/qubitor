"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { subscribeScroll } from "@/lib/scroll";

type Props = {
  items: string[];
  speed?: number;
  reverse?: boolean;
  className?: string;
};

/**
 * Slow infinite ticker. Speeds up momentarily when the user is scrolling fast
 * (Lenis velocity), then settles back. CSS animation is the baseline; JS just
 * nudges `animation-duration` based on velocity for the scroll-velocity feel.
 */
export function Marquee({ items, speed = 60, reverse, className }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const baseDuration = speed;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    return subscribeScroll((s) => {
      const v = Math.min(Math.abs(s.velocity), 80);
      // higher velocity = lower duration = faster
      const dur = Math.max(baseDuration * 0.25, baseDuration - v * 0.6);
      track.style.animationDuration = `${dur}s`;
    });
  }, [baseDuration]);

  const stream = [...items, ...items];

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden border-y border-qb-line py-6",
        className,
      )}
      aria-hidden
    >
      <div
        ref={trackRef}
        className="flex shrink-0 items-center gap-12 whitespace-nowrap will-change-transform"
        style={{
          animation: `qb-marquee ${baseDuration}s linear infinite ${reverse ? "reverse" : "normal"}`,
        }}
      >
        {stream.map((s, i) => (
          <span
            key={`${s}-${i}`}
            className="qb-label text-[0.95rem] tracking-[0.32em] text-qb-mist"
          >
            {s}
            <span className="ml-12 inline-block text-qb-line-strong">◇</span>
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes qb-marquee {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(-50%, 0, 0);
          }
        }
      `}</style>
    </div>
  );
}
