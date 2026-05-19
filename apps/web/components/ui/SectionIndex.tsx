"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "hero", label: "Index" },
  { id: "quantum-risk", label: "Risk" },
  { id: "smart-accounts", label: "Accounts" },
  { id: "network", label: "Network" },
  { id: "persona", label: "Guardian" },
  { id: "roadmap", label: "Path" },
  { id: "run-it", label: "Proof" },
  { id: "faq", label: "FAQ" },
  { id: "cta", label: "Enter" },
];

export function SectionIndex() {
  const [active, setActive] = useState("hero");

  useEffect(() => {
    const els = SECTIONS.map((s) =>
      document.getElementById(s.id),
    ).filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    type Best = { id: string; ratio: number };
    const io = new IntersectionObserver(
      (entries) => {
        let best: Best | null = null;
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const ratio = e.intersectionRatio;
            if (best === null || ratio > best.ratio) {
              best = { id: e.target.id, ratio } as Best;
            }
          }
        });
        if (best !== null) setActive((best as Best).id);
      },
      {
        rootMargin: "-40% 0px -40% 0px",
        threshold: [0, 0.2, 0.5, 0.8, 1],
      },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <nav
      aria-label="Section index"
      className="pointer-events-none fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 md:flex"
    >
      {SECTIONS.map((s, i) => {
        const isActive = active === s.id;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            data-magnet
            data-cursor="link"
            className="group pointer-events-auto flex items-center gap-3"
          >
            <span
              className={`qb-label transition-colors duration-300 ${
                isActive ? "text-qb-bone" : "text-qb-mist/50"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              aria-hidden
              className={`block h-px transition-all duration-500 ${
                isActive
                  ? "w-10 bg-qb-bone"
                  : "w-4 bg-qb-line-strong group-hover:w-7"
              }`}
            />
            <span
              className={`qb-label whitespace-nowrap transition-all duration-300 ${
                isActive
                  ? "translate-x-0 text-qb-bone opacity-100"
                  : "-translate-x-1 text-qb-mist opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
              }`}
            >
              {s.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
