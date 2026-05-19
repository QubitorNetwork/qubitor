"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { HudPanel } from "./HudPanel";

export function Loading({ what }: { what: string }) {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeader eyebrow="Loading" headline="Loading…" />
      <HudPanel label={what}>
        <p className="qb-label py-10 text-qb-mist">Fetching from RPC…</p>
      </HudPanel>
    </div>
  );
}

export function Empty({
  headline,
  note,
}: {
  headline: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeader eyebrow="Not found" headline={headline} />
      <HudPanel label="QUERY RESULT">
        <p className="qb-label py-10 text-qb-spark">{note}</p>
      </HudPanel>
    </div>
  );
}
