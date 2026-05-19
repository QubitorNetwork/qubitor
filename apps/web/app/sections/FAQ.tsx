"use client";

import { useEffect, useRef } from "react";
import { GiantText } from "@/components/ui/GiantText";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FAQ as FAQ_COPY } from "@/lib/copy";
import { gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

export function FAQ() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !root.current) return;
    const el = root.current;
    const ctx = gsap.context(() => {
      gsap.from("[data-reveal]", {
        y: 40,
        opacity: 0,
        stagger: 0.04,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top 80%",
          end: "top 30%",
          scrub: 0.6,
        },
      });
    }, el);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={root}
      id="faq"
      aria-labelledby="faq-headline"
      className="relative w-full px-6 py-32 md:px-10 md:py-44"
    >
      <div className="absolute inset-0 qb-vignette -z-10" aria-hidden />
      <GiantText className="opacity-[0.05]">QUESTIONS</GiantText>

      <div className="mx-auto max-w-[1440px]">
        <div data-reveal>
          <SectionHeader
            id="faq-headline"
            eyebrow={FAQ_COPY.eyebrow}
            headline={FAQ_COPY.headline}
          />
        </div>

        <ul className="mt-16 flex flex-col gap-px bg-qb-line">
          {FAQ_COPY.items.map((item, i) => (
            <li
              key={item.q}
              data-reveal
              className="qb-faq-row bg-qb-black"
            >
              <details className="group">
                <summary
                  data-cursor="link"
                  className="flex cursor-pointer items-center justify-between gap-6 px-2 py-6 transition-colors md:px-4 md:py-8 hover:text-qb-bone"
                >
                  <span className="flex items-baseline gap-4 md:gap-6">
                    <span className="qb-label text-qb-mist">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-display text-xl tracking-tight text-qb-bone md:text-2xl">
                      {item.q}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="qb-faq-marker inline-flex h-7 w-7 shrink-0 items-center justify-center border border-qb-line-strong text-qb-bone transition-transform duration-500 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="qb-faq-body grid grid-rows-[0fr] transition-[grid-template-rows] duration-500 group-open:grid-rows-[1fr]">
                  <p className="qb-body min-h-0 max-w-[78ch] overflow-hidden px-2 pb-8 md:px-4">
                    <span className="block pt-1">{item.a}</span>
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
