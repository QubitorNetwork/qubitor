"use client";

import { useParams } from "next/navigation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { HudPanel } from "@/components/explorer/HudPanel";
import { SealedProof } from "@/components/explorer/SealedProof";
import { EventRow } from "@/components/explorer/Rows";
import { Empty } from "@/components/explorer/States";
import { useEventStream, useNetworkStatus } from "@/lib/qubitor/hooks";
import { getHead } from "@/lib/qubitor/head";
import type { ExplorerEvent, ProofBundle, ProofKind } from "@/lib/qubitor/types";

const MATCHERS: Record<ProofKind, (e: ExplorerEvent) => boolean> = {
  "pq-accounts": (e) =>
    [
      "AccountCreated",
      "ExecutedPQ",
      "PQKeyRotated",
      "SecurityModeRecorded",
      "ReadinessRecorded",
    ].includes(e.name),
  faucet: (e) => e.name === "TreasuryTransferred",
  "admin-vaults": (e) =>
    ["TreasuryReceived", "TreasuryTransferred", "PolicyRecorded"].includes(
      e.name,
    ),
  bridge: (e) => e.addressLabel?.startsWith("QubitorNativeBridge") ?? false,
};

const TITLES: Record<ProofKind, string> = {
  "pq-accounts": "PQ-native accounts",
  faucet: "Faucet treasury",
  "admin-vaults": "Admin vault control",
  bridge: "Native bridge",
};

export default function ProofBundleViewer() {
  const params = useParams<{ subject: string }>();
  const kind = decodeURIComponent(params.subject) as ProofKind;
  const { data: status } = useNetworkStatus();
  const { data: events } = useEventStream({ limit: 200 });

  if (!(kind in MATCHERS))
    return <Empty headline="Unknown proof." note={kind} />;

  const matched = (events ?? []).filter(MATCHERS[kind]);
  const claim = status?.exactClaim ?? "";

  const bundle: ProofBundle | undefined =
    status && events
      ? {
          proofBundleVersion: "qbt-testnet-proof-v1",
          generatedAt: new Date().toISOString(),
          network: status.network,
          chainId: status.chainId,
          kind,
          subject: kind,
          exactClaim: claim,
          evidence: {
            address: "multiple",
            events: matched,
            headBlock: getHead().blockNumber,
          },
        }
      : undefined;

  return (
    <div className="flex flex-col gap-12">
      <SectionHeader
        eyebrow={`Proof · ${kind}`}
        headline={TITLES[kind] ?? kind}
      />

      <SealedProof
        title={TITLES[kind] ?? kind}
        kind={kind}
        exactClaim={claim || "Loading coverage boundary…"}
        eventCount={matched.length}
        bundle={bundle}
      />

      <HudPanel label={`EVIDENCE · ${matched.length} EVENTS`} status="LIVE">
        <div className="flex flex-col">
          {matched.map((e) => (
            <EventRow key={e.id} ev={e} />
          ))}
          {events && matched.length === 0 ? (
            <p className="qb-label py-8 text-qb-mist">
              No matching events in the scanned 4,000-block range.
            </p>
          ) : null}
          {!events ? (
            <p className="qb-label py-8 text-qb-mist">Loading events…</p>
          ) : null}
        </div>
      </HudPanel>

      <p className="qb-body max-w-[62ch] text-sm">
        The downloadable bundle is a{" "}
        <span className="font-mono text-qb-bone">qbt-testnet-proof-v1</span>{" "}
        document: the verbatim coverage claim, the chain ID, the observed head
        block, and the matched event evidence — independently re-verifiable
        against the same public RPC.
      </p>
    </div>
  );
}
