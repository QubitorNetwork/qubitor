"use client";

import { useEffect, useRef } from "react";
import { GiantText } from "@/components/ui/GiantText";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { NETWORK } from "@/lib/copy";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

export function Network() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !root.current || !track.current) return;
    const el = root.current;
    const trackEl = track.current;
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;

    const ctx = gsap.context(() => {
      // On mobile, the horizontal track becomes a natural overflow-x scroller
      // (handled in JSX below). The pin+scrub trick is desktop-only.
      if (isDesktop) {
        const scrollAmount = () =>
          trackEl.scrollWidth - window.innerWidth + 80;

        gsap.to(trackEl, {
          x: () => -scrollAmount(),
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: () => `+=${scrollAmount()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
      }

      // intro fade for the heading
      gsap.from("[data-net-head]", {
        opacity: 0,
        y: 40,
        ease: "expo.out",
        scrollTrigger: {
          trigger: el,
          start: "top 80%",
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
      id="network"
      aria-labelledby="network-headline"
      className="relative w-full overflow-hidden"
    >
      <div className="absolute inset-0 qb-vignette -z-10" aria-hidden />
      <GiantText className="opacity-[0.05]">NETWORK</GiantText>

      <div className="mx-auto max-w-[1440px] px-6 pt-32 md:px-10 md:pt-40">
        <div data-net-head>
          <SectionHeader
            id="network-headline"
            eyebrow={NETWORK.eyebrow}
            headline={NETWORK.headline}
          />
          <p className="qb-body mt-10 max-w-[60ch]">{NETWORK.body[0]}</p>
        </div>
      </div>

      <div className="mt-16 w-full overflow-x-auto overflow-y-hidden md:overflow-hidden snap-x snap-mandatory md:snap-none">
        <div
          ref={track}
          data-cursor="drag"
          data-cursor-label="PAN"
          className="flex w-max gap-[1px] bg-qb-line px-6 md:px-10"
          aria-label="Network attributes"
        >
          {NETWORK.tiles.map((t, i) => (
            <article
              key={t.label}
              data-tile
              className="relative flex h-[60vh] min-h-[420px] w-[78vw] max-w-[520px] shrink-0 flex-col justify-between bg-qb-black p-8 md:w-[44vw]"
            >
              <div className="flex items-start justify-between">
                <span className="qb-label">
                  {String(i + 1).padStart(2, "0")} · {t.label}
                </span>
                <span aria-hidden className="h-1 w-1 bg-qb-spark" />
              </div>
              <div className="flex flex-col gap-3">
                <span className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-none tracking-tight text-qb-bone">
                  {t.value}
                </span>
                <span className="qb-label text-qb-mist">{t.note}</span>
              </div>
            </article>
          ))}

          <article className="relative flex h-[60vh] min-h-[420px] w-[78vw] max-w-[520px] shrink-0 flex-col justify-between bg-qb-black p-8 md:w-[44vw]">
            <span className="qb-label">SERVICES</span>
            <div className="flex flex-wrap gap-2">
              {NETWORK.services.map((s) => (
                <span
                  key={s}
                  className="qb-label border border-qb-line px-3 py-2 text-qb-bone"
                >
                  {s}
                </span>
              ))}
            </div>
          </article>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-12 md:px-10">
        <span className="qb-label text-qb-mist">SCROLL TO PAN →</span>
      </div>
    </section>
  );
}
