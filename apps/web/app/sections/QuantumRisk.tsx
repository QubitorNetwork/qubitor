"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { GiantText } from "@/components/ui/GiantText";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { QUANTUM_RISK } from "@/lib/copy";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

const GlitchBust = dynamic(
  () => import("@/components/canvas/GlitchBust").then((m) => m.GlitchBust),
  { ssr: false },
);

export function QuantumRisk() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !root.current) return;
    const el = root.current;

    const ctx = gsap.context(() => {
      // Scroll-scrubbed clip-path reveal on the image.
      gsap.fromTo(
        "[data-clip]",
        { clipPath: "inset(40% 0% 40% 0%)" },
        {
          clipPath: "inset(0% 0% 0% 0%)",
          ease: "none",
          scrollTrigger: {
            trigger: "[data-clip]",
            start: "top 85%",
            end: "top 25%",
            scrub: 0.8,
          },
        },
      );
      // Image scales down slightly as section enters (Tympanus parallax feel)
      gsap.fromTo(
        "[data-clip-img]",
        { scale: 1.18 },
        {
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: "[data-clip]",
            start: "top 100%",
            end: "top 20%",
            scrub: 0.8,
          },
        },
      );
      // Body copy slides up with scroll
      gsap.fromTo(
        "[data-reveal]",
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          ease: "none",
          stagger: 0.04,
          scrollTrigger: {
            trigger: el,
            start: "top 75%",
            end: "top 25%",
            scrub: 0.8,
          },
        },
      );
    }, el);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={root}
      id="quantum-risk"
      aria-labelledby="quantum-risk-headline"
      className="relative w-full overflow-hidden px-6 py-40 md:px-10 md:py-56"
    >
      <div className="absolute inset-0 qb-vignette -z-10" aria-hidden />
      <GiantText>RISK</GiantText>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-12">
        <div className="relative lg:col-span-6">
          <div
            data-clip
            data-cursor="view"
            data-cursor-label="VIEW"
            className="relative aspect-[4/5] w-full overflow-hidden border border-qb-line"
          >
            <div data-clip-img className="absolute inset-0 will-change-transform">
              {reduced ? (
                <Image
                  src="/brand/flyers/quantum risk.png"
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                />
              ) : (
                <GlitchBust src="/brand/flyers/quantum risk.png" className="h-full w-full" />
              )}
            </div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-qb-black/30 via-transparent to-qb-black/20" />
          </div>
          <span className="qb-label mt-4 block text-qb-mist">
            FIG. 01 — VALIDATORS, GUARDIANS, SEQUENCERS, UPGRADE KEYS
          </span>
        </div>

        <div className="lg:col-span-6">
          <div data-reveal>
            <SectionHeader
              id="quantum-risk-headline"
              eyebrow={QUANTUM_RISK.eyebrow}
              headline={QUANTUM_RISK.headline}
            />
          </div>

          <div className="mt-10 flex flex-col gap-6 max-w-[58ch]">
            {QUANTUM_RISK.body.map((p, i) => (
              <p key={i} data-reveal className="qb-body">
                {p}
              </p>
            ))}
          </div>

          <blockquote
            data-reveal
            className="mt-12 border-l border-qb-line-strong pl-6 max-w-[58ch]"
          >
            <p className="font-mono text-base text-qb-bone uppercase tracking-[0.08em] leading-relaxed">
              “{QUANTUM_RISK.quote.text}”
            </p>
            <footer className="qb-label mt-3 text-qb-mist">
              — {QUANTUM_RISK.quote.source}
            </footer>
          </blockquote>

          <ul className="mt-10 flex flex-col gap-3 max-w-[58ch]">
            {QUANTUM_RISK.bullets.map((b, i) => (
              <li
                key={i}
                data-reveal
                className="qb-label flex items-start gap-3 text-qb-bone"
              >
                <span
                  aria-hidden
                  className="mt-2 inline-block h-px w-4 bg-qb-line-strong shrink-0"
                />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
