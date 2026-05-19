"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { publishScroll } from "@/lib/scroll";

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      const onNative = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        publishScroll({
          progress: max > 0 ? window.scrollY / max : 0,
          velocity: 0,
        });
      };
      window.addEventListener("scroll", onNative, { passive: true });
      onNative();
      return () => window.removeEventListener("scroll", onNative);
    }

    const lenis = new Lenis({
      duration: 1.25,
      lerp: 0.08,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.2,
    });

    function raf(time: number) {
      lenis.raf(time * 1000);
    }

    function onScroll() {
      ScrollTrigger.update();
      publishScroll({
        progress: lenis.progress,
        velocity: lenis.velocity,
      });
    }

    lenis.on("scroll", onScroll);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // first publish
    onScroll();

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, [reduced]);

  return <>{children}</>;
}
