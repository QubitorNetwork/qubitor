"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { HudPanel } from "@/components/explorer/HudPanel";
import { BlockRow } from "@/components/explorer/Rows";
import { useLatestBlocks } from "@/lib/qubitor/hooks";

export default function BlocksPage() {
  const { data: blocks, error } = useLatestBlocks(40);
  return (
    <div className="flex flex-col gap-12">
      <SectionHeader eyebrow="Ledger" headline="Latest blocks" />
      <HudPanel label="Last 40 blocks" status="LIVE">
        <div className="flex flex-col">
          {(blocks ?? []).map((b) => (
            <BlockRow key={b.hash} block={b} />
          ))}
          {!blocks && !error ? (
            <p className="qb-label py-10 text-qb-mist">Loading blocks…</p>
          ) : null}
          {error ? (
            <p className="qb-label py-10 text-qb-spark">{error}</p>
          ) : null}
        </div>
      </HudPanel>
    </div>
  );
}
