"use client";

import { useEffect, useRef } from "react";
import { ExecuteFlow } from "@/components/diagrams/ExecuteFlow";
import { GiantText } from "@/components/ui/GiantText";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Stat } from "@/components/ui/Stat";
import { SMART_ACCOUNTS } from "@/lib/copy";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

export function SmartAccounts() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !root.current) return;
    const el = root.current;
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;

    const ctx = gsap.context(() => {
      // Headline + body always reveal on scrub.
      gsap.from("[data-sa-head]", {
        y: 50,
        opacity: 0,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "top 30%",
          scrub: 0.7,
        },
      });
      gsap.from("[data-sa-body]", {
        y: 40,
        opacity: 0,
        stagger: 0.06,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top 65%",
          end: "top 20%",
          scrub: 0.7,
        },
      });
      gsap.from("[data-stat]", {
        y: 30,
        opacity: 0,
        stagger: 0.08,
        ease: "none",
        scrollTrigger: {
          trigger: "[data-stats]",
          start: "top 85%",
          end: "top 60%",
          scrub: 0.6,
        },
      });

      // Pin only on desktop — pinning a tall section on mobile gets glitchy
      // with Lenis + small viewports, and the SVG flow is the real centerpiece
      // which already animates under scrub.
      if (isDesktop) {
        ScrollTrigger.create({
          trigger: el,
          start: "top top",
          end: "+=80%",
          pin: "[data-sa-stage]",
          pinSpacing: true,
        });
      }
    }, el);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={root}
      id="smart-accounts"
      aria-labelledby="smart-accounts-headline"
      className="relative w-full overflow-hidden px-6 py-32 md:px-10 md:py-44"
    >
      <div className="absolute inset-0 qb-vignette -z-10" aria-hidden />
      <GiantText className="opacity-[0.05]">ACCOUNT</GiantText>

      <div className="mx-auto max-w-[1440px]">
        <div data-sa-head>
          <SectionHeader
            id="smart-accounts-headline"
            eyebrow={SMART_ACCOUNTS.eyebrow}
            headline={SMART_ACCOUNTS.headline}
          />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5 flex flex-col gap-6 max-w-[58ch]">
            {SMART_ACCOUNTS.body.map((p, i) => (
              <p key={i} data-sa-body className="qb-body">
                {p}
              </p>
            ))}
          </div>

          <div className="lg:col-span-7 flex flex-col gap-4">
            <span className="qb-label">FIG. 02 — EXECUTE-PQ FLOW</span>
            <div
              data-sa-stage
              className="border border-qb-line bg-qb-ink/40 p-4 backdrop-blur-sm md:p-6"
            >
              <ExecuteFlow />
            </div>
          </div>
        </div>

        <div
          data-stats
          className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {SMART_ACCOUNTS.stats.map((s) => (
            <div key={s.label} data-stat>
              <Stat value={s.value} label={s.label} icon={s.icon} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
