"use client";

import { useEffect, useRef } from "react";
import { HERO } from "@/lib/copy";
import { GiantText } from "@/components/ui/GiantText";
import { Reticle } from "@/components/ui/Reticle";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { splitChars } from "@/lib/splitText";
import { useReducedMotion } from "@/lib/useReducedMotion";

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const headline = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!root.current || !headline.current) return;
    const el = root.current;
    const heading = headline.current;
    const chars = splitChars(heading);

    if (reduced) {
      gsap.set(chars, { y: 0, opacity: 1 });
      return;
    }

    const isDesktop = window.matchMedia("(min-width: 768px)").matches;

    const ctx = gsap.context(() => {
      gsap.set(chars, { yPercent: 110, opacity: 0 });
      gsap.set("[data-hero-fade]", { opacity: 0, y: 24 });

      // Pin the hero for a scroll-distance equal to 1× viewport (desktop only).
      // On mobile we skip the pin entirely — a tall pinned hero on small
      // viewports fights Lenis and breaks address-bar collapse.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: isDesktop ? "+=120%" : "bottom top",
          pin: isDesktop,
          scrub: 1.1,
        },
      });

      tl.to(
        chars,
        { yPercent: 0, opacity: 1, ease: "expo.out", stagger: 0.012, duration: 0.6 },
        0,
      )
        .to(
          "[data-hero-fade]",
          { opacity: 1, y: 0, ease: "expo.out", duration: 0.4, stagger: 0.04 },
          0.15,
        )
        .to(chars, { yPercent: -40, opacity: 0.15, duration: 0.5 }, 0.7)
        .to(
          "[data-hero-fade]",
          { opacity: 0, y: -20, duration: 0.4 },
          0.75,
        );
    }, el);

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={root}
      id="hero"
      aria-labelledby="hero-headline"
      className="relative isolate min-h-[100svh] w-full overflow-hidden"
    >
      <div className="qb-grid absolute inset-0 opacity-[0.10]" aria-hidden />
      <div className="absolute inset-0 qb-vignette" aria-hidden />
      <div className="qb-noise" aria-hidden />
      <GiantText className="opacity-[0.04]">QUBITOR</GiantText>

      <Reticle corner="tr" label={HERO.reticle} />
      <Reticle corner="tl" label="QUBITOR // V0.1 · PQ-NATIVE" />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1440px] flex-col justify-between px-6 pb-16 pt-28 md:px-10 md:pt-32">
        <div className="flex flex-col gap-8">
          <span data-hero-fade className="qb-label flex items-center gap-3">
            <span className="h-px w-8 bg-qb-line-strong" aria-hidden />
            {HERO.eyebrow}
          </span>
        </div>

        <div className="flex flex-col gap-10">
          <h1
            id="hero-headline"
            ref={headline}
            className="qb-display max-w-[14ch] text-[clamp(3.25rem,11vw,10.5rem)] text-qb-bone overflow-hidden"
            style={{ lineHeight: 0.92 }}
          >
            {HERO.headline}
          </h1>

          <p
            data-hero-fade
            className="qb-body max-w-[58ch] text-qb-mist md:text-lg"
          >
            {HERO.subhead}
          </p>

          <div data-hero-fade className="mt-2 flex flex-wrap gap-3">
            {HERO.ctas.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target={c.external ? "_blank" : undefined}
                rel={c.external ? "noreferrer noopener" : undefined}
                data-magnet
                data-cursor="link"
                className="qb-label group inline-flex items-center gap-3 border border-qb-line-strong bg-qb-black/30 px-5 py-3 text-qb-bone backdrop-blur-sm transition-colors duration-500 hover:bg-qb-bone hover:text-qb-black"
              >
                {c.label}
                <span
                  aria-hidden
                  className="inline-block h-[1px] w-6 bg-qb-line-strong transition-colors duration-500 group-hover:bg-qb-black"
                />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between px-6 pb-6 md:px-10">
        <span data-hero-fade className="qb-label text-qb-mist">
          SCROLL ▾
        </span>
        <span data-hero-fade className="qb-label text-qb-mist">
          ML-DSA-65 · FIPS 204 · NO EOA ANYWHERE
        </span>
      </div>
    </section>
  );
}
