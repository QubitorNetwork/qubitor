"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@/components/ui/Terminal";
import { GiantText } from "@/components/ui/GiantText";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { RUN_IT } from "@/lib/copy";
import { gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

export function RunIt() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !root.current) return;
    const el = root.current;
    const ctx = gsap.context(() => {
      gsap.from("[data-reveal]", {
        y: 50,
        opacity: 0,
        stagger: 0.05,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "top 25%",
          scrub: 0.7,
        },
      });
      gsap.from("[data-term-line]", {
        x: -16,
        opacity: 0,
        stagger: 0.04,
        ease: "none",
        scrollTrigger: {
          trigger: "[data-term-frame]",
          start: "top 75%",
          end: "top 35%",
          scrub: 0.6,
        },
      });
    }, el);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={root}
      id="run-it"
      aria-labelledby="run-it-headline"
      className="relative w-full px-6 py-32 md:px-10 md:py-44"
    >
      <div className="absolute inset-0 qb-vignette -z-10" aria-hidden />
      <GiantText className="opacity-[0.05]">VERIFY</GiantText>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <div data-reveal>
            <SectionHeader
              id="run-it-headline"
              eyebrow={RUN_IT.eyebrow}
              headline={RUN_IT.headline}
            />
          </div>
          <p data-reveal className="qb-body mt-10 max-w-[52ch]">
            {RUN_IT.body}
          </p>

          <ul className="mt-10 flex flex-col gap-2">
            {RUN_IT.followups.map((f) => (
              <li
                key={f.label}
                data-reveal
                className="flex flex-col gap-1 border-l border-qb-line-strong pl-4 md:flex-row md:items-baseline md:gap-4"
              >
                <code className="font-mono text-sm text-qb-bone">
                  $ {f.label}
                </code>
                <span className="qb-label text-qb-mist">— {f.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <div data-reveal className="lg:col-span-7">
          <span data-term-frame className="block">
            <Terminal
              command={RUN_IT.command}
              output={RUN_IT.output}
              label="qubitor@devnet:~ · acceptance"
            />
          </span>
          <span className="qb-label mt-4 block text-qb-mist">
            FIG. 06 — REPRODUCIBLE PROOF PACK · ARTIFACTS/PROOFS/DEVNET/
          </span>
        </div>
      </div>
    </section>
  );
}
