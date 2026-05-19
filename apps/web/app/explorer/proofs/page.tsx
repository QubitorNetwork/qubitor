"use client";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { SealedProof } from "@/components/explorer/SealedProof";
import { HudPanel } from "@/components/explorer/HudPanel";
import { useEventStream, useNetworkStatus } from "@/lib/qubitor/hooks";
import type { ExplorerEvent } from "@/lib/qubitor/types";

const KINDS = [
  {
    kind: "pq-accounts",
    title: "PQ-native accounts",
    match: (e: ExplorerEvent) =>
      [
        "AccountCreated",
        "ExecutedPQ",
        "PQKeyRotated",
        "SecurityModeRecorded",
        "ReadinessRecorded",
      ].includes(e.name),
  },
  {
    kind: "admin-vaults",
    title: "Admin vault control",
    match: (e: ExplorerEvent) =>
      ["TreasuryReceived", "TreasuryTransferred", "PolicyRecorded"].includes(
        e.name,
      ),
  },
  {
    kind: "bridge",
    title: "Native bridge",
    match: (e: ExplorerEvent) =>
      e.addressLabel?.startsWith("QubitorNativeBridge") ?? false,
  },
] as const;

export default function ProofsBrowser() {
  const { data: status } = useNetworkStatus();
  const { data: events } = useEventStream({ limit: 200 });
  const claim = status?.exactClaim ?? "";

  return (
    <div className="flex flex-col gap-12">
      <SectionHeader eyebrow="Proofs" headline="Proofs" />
      <p className="qb-body max-w-[62ch]">
        Each proof is reconstructed in your browser from system-contract logs
        and bound to the coverage claim the gateway reports. No data is
        asserted by this site — it is read from the chain.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {KINDS.map((k) => {
          const matched = (events ?? []).filter(k.match);
          return (
            <SealedProof
              key={k.kind}
              title={k.title}
              kind={k.kind}
              exactClaim={claim || "Loading coverage boundary…"}
              eventCount={matched.length}
              href={`/explorer/proofs/${k.kind}`}
            />
          );
        })}
      </div>

      {events && events.length === 0 ? (
        <HudPanel label="No results">
          <p className="qb-label py-8 text-qb-mist">
            No system-contract events in the scanned range. Proofs populate as
            PQ activity is recorded.
          </p>
        </HudPanel>
      ) : null}
    </div>
  );
}
