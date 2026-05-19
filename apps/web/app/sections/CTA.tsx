"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { GiantText } from "@/components/ui/GiantText";
import { CTA as COPY } from "@/lib/copy";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { splitChars } from "@/lib/splitText";
import { useReducedMotion } from "@/lib/useReducedMotion";

export function CTA() {
  const root = useRef<HTMLElement>(null);
  const headline = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!root.current || !headline.current) return;
    const el = root.current;
    const chars = splitChars(headline.current);

    if (reduced) {
      gsap.set(chars, { y: 0, opacity: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.set(chars, { yPercent: 110, opacity: 0 });

      gsap.to(chars, {
        yPercent: 0,
        opacity: 1,
        stagger: 0.012,
        ease: "expo.out",
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "top 25%",
          scrub: 0.8,
        },
      });

      gsap.from("[data-cta-fade]", {
        y: 40,
        opacity: 0,
        stagger: 0.05,
        ease: "expo.out",
        scrollTrigger: {
          trigger: el,
          start: "top 60%",
          end: "top 15%",
          scrub: 0.8,
        },
      });
    }, el);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={root}
      id="cta"
      aria-labelledby="cta-headline"
      className="relative w-full overflow-hidden"
    >
      <div className="absolute inset-0 qb-vignette -z-10" aria-hidden />
      <GiantText className="opacity-[0.06]">ENTER</GiantText>

      {/* Q watermark — closes the page loop with the brand mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-1/2 z-0 -translate-y-1/2 translate-x-1/4 opacity-[0.07] mix-blend-screen md:opacity-[0.10]"
      >
        <Image
          src="/brand/logo-vector.png"
          alt=""
          width={900}
          height={900}
          className="h-[clamp(420px,60vw,900px)] w-auto"
        />
      </div>

      <div className="relative mx-auto flex max-w-[1440px] flex-col items-start gap-12 px-6 py-40 md:px-10 md:py-56">
        <div data-cta-fade className="flex items-center gap-3">
          <span className="h-px w-8 bg-qb-line-strong" aria-hidden />
          <span className="qb-label">{COPY.eyebrow}</span>
        </div>

        <h2
          id="cta-headline"
          ref={headline}
          className="qb-display max-w-[16ch] overflow-hidden text-[clamp(2.75rem,8vw,7rem)] text-qb-bone"
          style={{ lineHeight: 0.95 }}
        >
          {COPY.headline}
        </h2>

        <p data-cta-fade className="qb-body max-w-[58ch] text-qb-bone">
          {COPY.body}
        </p>

        <div className="flex flex-wrap gap-3" data-cta-fade>
          {COPY.links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer noopener"
              data-magnet
              data-cursor="link"
              className="qb-label group inline-flex items-center gap-3 border border-qb-line-strong bg-qb-black/40 px-5 py-3 text-qb-bone backdrop-blur-sm transition-colors duration-500 hover:bg-qb-bone hover:text-qb-black"
            >
              {l.label}
              <span
                aria-hidden
                className="inline-block h-[1px] w-6 bg-qb-line-strong transition-colors duration-500 group-hover:bg-qb-black"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
