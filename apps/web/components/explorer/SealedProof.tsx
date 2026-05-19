"use client";

import { cn } from "@/lib/cn";
import { HudPanel } from "./HudPanel";
import type { ProofBundle } from "@/lib/qubitor/types";

type Props = {
  title: string;
  kind: string;
  exactClaim: string;
  eventCount: number;
  href?: string;
  bundle?: ProofBundle;
  className?: string;
};

/**
 * Proof card. Renders the verbatim exactClaim boundary (never paraphrased —
 * keeps us inside the coverage-matrix language) plus an evidence count, and,
 * when a reconstructed bundle is supplied, a download-as-JSON action.
 */
export function SealedProof({
  title,
  kind,
  exactClaim,
  eventCount,
  href,
  bundle,
  className,
}: Props) {
  function download() {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bundle.kind}-${bundle.subject.slice(0, 14)}-proof.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <HudPanel
      label={`PROOF · ${kind.toUpperCase()}`}
      status={`${eventCount} EVENTS`}
      className={cn("flex flex-col", className)}
    >
      <div className="flex flex-col gap-5">
        <h3 className="font-display text-2xl tracking-tight text-qb-bone">
          {title}
        </h3>
        <blockquote className="border-l border-qb-line-strong pl-4">
          <p className="font-mono text-xs uppercase leading-relaxed tracking-[0.08em] text-qb-bone">
            “{exactClaim}”
          </p>
          <footer className="qb-label mt-2 text-qb-mist">
            — qubitor_getNetworkSecurityStatus.exactClaim
          </footer>
        </blockquote>
        <div className="flex flex-wrap items-center gap-3">
          {href ? (
            <a
              href={href}
              data-magnet
              data-cursor="link"
              className="qb-label border border-qb-line-strong px-4 py-2 text-qb-bone transition-colors duration-500 hover:bg-qb-bone hover:text-qb-black"
            >
              View evidence
            </a>
          ) : null}
          {bundle ? (
            <button
              type="button"
              onClick={download}
              data-magnet
              data-cursor="link"
              className="qb-label border border-qb-line-strong px-4 py-2 text-qb-bone transition-colors duration-500 hover:bg-qb-bone hover:text-qb-black"
            >
              Download bundle
            </button>
          ) : null}
        </div>
      </div>
    </HudPanel>
  );
}
