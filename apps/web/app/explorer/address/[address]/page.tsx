"use client";

import { useParams } from "next/navigation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { HudPanel } from "@/components/explorer/HudPanel";
import { ScrambleText } from "@/components/explorer/ScrambleText";
import { EventRow } from "@/components/explorer/Rows";
import { Loading, Empty } from "@/components/explorer/States";
import { useAddress, useEventStream } from "@/lib/qubitor/hooks";
import { formatQbt, isAddress } from "@/lib/qubitor/format";

export default function AddressDetail() {
  const params = useParams<{ address: string }>();
  const address = decodeURIComponent(params.address);

  const valid = isAddress(address);
  const { data: acct, error } = useAddress(valid ? address : "");
  // Pull this account's own emitted events (executePQ / rotate timeline).
  const { data: events } = useEventStream({
    addresses: valid ? [address] : [],
    limit: 30,
  });

  if (!valid)
    return <Empty headline="Invalid address." note={address} />;
  if (error) return <Empty headline="Lookup failed." note={error} />;
  if (!acct) return <Loading what="ACCOUNT" />;

  return (
    <div className="flex flex-col gap-12">
      <SectionHeader
        eyebrow={acct.isContract ? "Qubitor Account · Contract" : "Account"}
        headline={acct.isContract ? "Account" : "Address"}
      />

      <HudPanel label="ACCOUNT" status={acct.isContract ? "CONTRACT" : "EXTERNAL"}>
        <dl className="grid grid-cols-1 gap-3 font-mono text-sm md:grid-cols-2">
          <KV k="Address" v={acct.address} mono />
          <KV k="Balance" v={`${formatQbt(acct.balanceWei)} QBT`} accent />
          <KV
            k="Security Mode"
            v={acct.securityMode ?? "—"}
            accent={!!acct.securityMode}
          />
          <KV k="Readiness" v={acct.readiness ?? "—"} />
          <KV k="Type" v={acct.isContract ? "Smart account" : "External"} />
          <KV
            k="ECDSA Owner"
            v={acct.isContract ? "NONE (PQ-native)" : "—"}
          />
        </dl>
      </HudPanel>

      {acct.pqCommitment ? (
        <HudPanel label="ML-DSA PUBLIC-KEY COMMITMENT" status="POST-QUANTUM">
          <div className="flex flex-col gap-4">
            <ScrambleText
              value={acct.pqCommitment}
              className="text-base"
              duration={900}
            />
            <p className="qb-body text-sm">
              The account is controlled by this ML-DSA-65 public-key
              commitment. Execution and key rotation require a signature the
              native precompile verifies — breaking ECDSA does not move these
              funds.
            </p>
          </div>
        </HudPanel>
      ) : null}

      <HudPanel
        label="ACTIVITY · executePQ / rotatePQKey"
        status="FROM LOGS"
      >
        <div className="flex flex-col">
          {(events ?? []).map((e) => (
            <EventRow key={e.id} ev={e} />
          ))}
          {events && events.length === 0 ? (
            <p className="qb-label py-8 text-qb-mist">
              No events in the scanned range.
            </p>
          ) : null}
          {!events ? (
            <p className="qb-label py-8 text-qb-mist">Loading…</p>
          ) : null}
        </div>
      </HudPanel>
    </div>
  );
}

function KV({
  k,
  v,
  mono,
  accent,
}: {
  k: string;
  v: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-qb-line/60 pb-2">
      <dt className="qb-label text-qb-mist">{k}</dt>
      <dd className={accent ? "text-qb-spark" : "text-qb-bone"}>
        {mono ? (
          <ScrambleText
            value={v}
            truncateTo={{ head: 14, tail: 10 }}
            className="text-sm"
          />
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
