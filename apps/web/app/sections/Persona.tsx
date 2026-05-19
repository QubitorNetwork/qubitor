"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Marquee } from "@/components/ui/Marquee";
import { PERSONA } from "@/lib/copy";
import { GiantText } from "@/components/ui/GiantText";
import { gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

// V3 persona set — classical Roman-sculpture portraits with the dotted-particle
// texture. Three frames stacked + crossfaded under scroll progress: front bust,
// figure holding the Q orb, then 3/4 profile against the starfield.
const PERSONA_IMAGES = [
  "/brand/personas/persona.png",
  "/brand/personas/hodl.png",
  "/brand/personas/storm.png",
];

export function Persona() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !root.current) return;
    const el = root.current;

    const ctx = gsap.context(() => {
      // Image stack — scale + clip reveal on the wrapper
      gsap.fromTo(
        "[data-persona-img]",
        { scale: 1.25, clipPath: "inset(20% 0% 20% 0%)" },
        {
          scale: 1,
          clipPath: "inset(0% 0% 0% 0%)",
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top 90%",
            end: "top 0%",
            scrub: 0.8,
          },
        },
      );

      // Each persona layer fades in over its slice of the section progress.
      const layers = gsap.utils.toArray<HTMLElement>("[data-persona-layer]");
      layers.forEach((layer, i) => {
        const slice = 1 / layers.length;
        const start = `top+=${i * 60}% center`;
        gsap.to(layer, {
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: `top+=${i * slice * 100}% bottom`,
            end: `top+=${(i + 1) * slice * 100}% bottom`,
            scrub: 0.7,
          },
        });
        // Fade out the layer when the NEXT layer takes over (except last).
        if (i < layers.length - 1) {
          gsap.to(layer, {
            opacity: 0,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: `top+=${(i + 1) * slice * 100}% center`,
              end: `top+=${(i + 1.5) * slice * 100}% center`,
              scrub: 0.7,
            },
          });
        }
        void start;
      });

      gsap.fromTo(
        "[data-persona-head]",
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top 75%",
            end: "top 20%",
            scrub: 0.8,
          },
        },
      );

      gsap.fromTo(
        "[data-persona-body]",
        { y: 80, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top 60%",
            end: "top 0%",
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
      id="persona"
      aria-labelledby="persona-headline"
      className="relative w-full overflow-hidden"
    >
      <div className="absolute inset-0 qb-vignette -z-10" aria-hidden />

      <Marquee items={PERSONA.marquee} speed={70} />

      <div className="relative w-full px-6 py-32 md:px-10 md:py-44">
        <GiantText className="opacity-[0.05]">GUARDIAN</GiantText>
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-12">
          <div className="relative lg:col-span-7">
            <div
              data-persona-img
              data-cursor="view"
              data-cursor-label="VIEW"
              className="relative aspect-[4/5] w-full overflow-hidden border border-qb-line will-change-transform"
            >
              {PERSONA_IMAGES.map((src, i) => (
                <div
                  key={src}
                  data-persona-layer
                  className="absolute inset-0"
                  style={{ opacity: i === 0 ? 1 : 0 }}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 58vw, 100vw"
                  />
                </div>
              ))}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-qb-black/60 via-transparent to-transparent" />
            </div>
            <span className="qb-label mt-4 block text-qb-mist">
              FIG. 04 — THE GUARDIAN · ML-DSA-65
            </span>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-center">
            <div data-persona-head>
              <SectionHeader
                id="persona-headline"
                eyebrow={PERSONA.eyebrow}
                headline={PERSONA.headline}
              />
            </div>
            <p data-persona-body className="qb-body mt-10 max-w-[48ch]">
              {PERSONA.body}
            </p>
          </div>
        </div>
      </div>

      <Marquee items={PERSONA.marquee.slice().reverse()} speed={80} reverse />
    </section>
  );
}
