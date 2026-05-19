"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "@/lib/gsap";

/**
 * Initial-load curtain. Two black panels meet in the middle with the Q logo
 * suspended between them; on mount, the logo briefly pulses, then the panels
 * split apart and dissolve. Skipped under prefers-reduced-motion.
 */
export function PageCurtain() {
  const root = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  const meta = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      root.current.style.display = "none";
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("lenis-stopped");

    const tl = gsap.timeline({
      onComplete: () => {
        document.body.style.overflow = "";
        document.documentElement.classList.remove("lenis-stopped");
        if (root.current) root.current.style.display = "none";
      },
    });

    tl.set([top.current, bottom.current], { yPercent: 0 })
      .from(logo.current, {
        scale: 0.7,
        opacity: 0,
        duration: 0.9,
        ease: "expo.out",
      })
      .from(
        meta.current,
        { opacity: 0, y: 12, duration: 0.6, ease: "expo.out" },
        "-=0.4",
      )
      .to(
        [logo.current, meta.current],
        {
          opacity: 0,
          duration: 0.5,
          ease: "power2.inOut",
          stagger: 0.05,
        },
        "+=0.5",
      )
      .to(
        top.current,
        { yPercent: -100, duration: 1.1, ease: "expo.inOut" },
        "<",
      )
      .to(
        bottom.current,
        { yPercent: 100, duration: 1.1, ease: "expo.inOut" },
        "<",
      );

    return () => {
      tl.kill();
      document.body.style.overflow = "";
      document.documentElement.classList.remove("lenis-stopped");
    };
  }, []);

  return (
    <div
      ref={root}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[200]"
    >
      <div
        ref={top}
        className="absolute left-0 top-0 h-1/2 w-full bg-qb-black"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      />
      <div
        ref={bottom}
        className="absolute bottom-0 left-0 h-1/2 w-full bg-qb-black"
      />
      <div
        ref={logo}
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
      >
        <Image
          src="/brand/logo-vector.png"
          alt=""
          width={120}
          height={120}
          priority
        />
      </div>
      <div
        ref={meta}
        className="absolute left-1/2 top-1/2 z-10 mt-24 -translate-x-1/2 text-center"
      >
        <div className="qb-label text-qb-bone">QUBITOR NETWORK</div>
        <div className="qb-label mt-2 text-qb-mist">
          INITIALIZING POST-QUANTUM SHADER
        </div>
      </div>
    </div>
  );
}
