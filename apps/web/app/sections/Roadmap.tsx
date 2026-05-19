"use client";

import { useEffect, useRef } from "react";
import { GiantText } from "@/components/ui/GiantText";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ROADMAP } from "@/lib/copy";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

export function Roadmap() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !root.current) return;
    const el = root.current;

    const ctx = gsap.context(() => {
      // Rail draws as user scrolls through
      gsap.fromTo(
        "[data-rail-fill]",
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          transformOrigin: "top center",
          scrollTrigger: {
            trigger: "[data-rail]",
            start: "top 75%",
            end: "bottom 50%",
            scrub: 0.8,
          },
        },
      );

      gsap.utils.toArray<HTMLElement>("[data-milestone]").forEach((m) => {
        gsap.fromTo(
          m,
          { x: -50, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            ease: "expo.out",
            scrollTrigger: {
              trigger: m,
              start: "top 80%",
              end: "top 50%",
              scrub: 0.6,
            },
          },
        );
      });

      gsap.from("[data-rm-head]", {
        y: 60,
        opacity: 0,
        ease: "expo.out",
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "top 30%",
          scrub: 0.8,
        },
      });
    }, el);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={root}
      id="roadmap"
      aria-labelledby="roadmap-headline"
      className="relative w-full px-6 py-32 md:px-10 md:py-44"
    >
      <div className="absolute inset-0 qb-vignette -z-10" aria-hidden />
      <GiantText className="opacity-[0.05]">DEVNET</GiantText>

      <div className="mx-auto max-w-[1440px]">
        <div data-rm-head>
          <SectionHeader
            id="roadmap-headline"
            eyebrow={ROADMAP.eyebrow}
            headline={ROADMAP.headline}
          />
          <p className="qb-body mt-10 max-w-[60ch]">{ROADMAP.body}</p>
        </div>

        <ol
          data-rail
          className="relative mt-20 flex flex-col gap-16 pl-8 md:pl-12"
        >
          {/* base rail (static dim) */}
          <span
            aria-hidden
            className="absolute left-0 top-0 h-full w-px bg-qb-line"
          />
          {/* progress rail (animated) */}
          <span
            data-rail-fill
            aria-hidden
            className="absolute left-0 top-0 h-full w-px origin-top bg-qb-spark"
          />

          {ROADMAP.milestones.map((m, i) => (
            <li
              key={m.phase}
              data-milestone
              className="relative grid grid-cols-1 gap-6 md:grid-cols-[180px_1fr_auto]"
            >
              <span
                aria-hidden
                className="absolute -left-[5px] top-2 h-2.5 w-2.5 bg-qb-spark md:-left-[7px]"
              />
              <div className="flex flex-col gap-2">
                <span className="qb-label text-qb-mist">
                  PHASE {String(i + 1).padStart(2, "0")} · {m.date}
                </span>
                <span className="font-display text-3xl text-qb-bone tracking-tight">
                  {m.phase}
                </span>
                <span className="qb-label text-qb-mist">{m.status}</span>
              </div>
              <p className="qb-body max-w-[58ch]">{m.summary}</p>
              <code className="font-mono text-sm text-qb-mist md:self-start">
                $ {m.command}
              </code>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
