"use client";

import { useEffect, useRef } from "react";
import { subscribeScroll } from "@/lib/scroll";

export function ProgressBar() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return subscribeScroll((s) => {
      el.style.transform = `scaleX(${s.progress})`;
    });
  }, []);

  return (
    <div
      aria-hidden
      className="fixed left-0 top-0 z-50 h-px w-full origin-left bg-qb-spark"
      style={{ transform: "scaleX(0)" }}
      ref={ref}
    />
  );
}
