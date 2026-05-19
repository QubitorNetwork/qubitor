"use client";

import { useParams } from "next/navigation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { HudPanel } from "@/components/explorer/HudPanel";
import { ScrambleText } from "@/components/explorer/ScrambleText";
import { Loading, Empty } from "@/components/explorer/States";
import { useTx } from "@/lib/qubitor/hooks";
import {
  hexToBigInt,
  hexToNumber,
  formatQbt,
  txTypeLabel,
  isPqTx,
} from "@/lib/qubitor/format";

export default function TxDetail() {
  const params = useParams<{ hash: string }>();
  const hash = decodeURIComponent(params.hash);
  const { data, error } = useTx(hash);

  if (error) return <Empty headline="Transaction not found." note={`${error}`} />;
  if (!data) return <Loading what="TRANSACTION" />;

  const { tx, receipt } = data;
  const pq = isPqTx(tx.type);
  const ok = receipt ? hexToNumber(receipt.status) === 1 : null;

  return (
    <div className="flex flex-col gap-12">
      <SectionHeader
        eyebrow={`Transaction · ${txTypeLabel(tx.type)}`}
        headline="Transaction"
      />

      {pq ? (
        <HudPanel
          label="QUBITORPQTXV1 · TYPE 0x04"
          status="ML-DSA-65 verified"
        >
          <div className="flex flex-col gap-4">
            <p className="qb-body text-sm">
              This transaction is the Qubitor post-quantum envelope. The
              sender is a Qubitor smart account; authorization is an ML-DSA-65
              signature verified by the native precompile at{" "}
              <span className="font-mono text-qb-bone">0x…0100</span> before
              execution. There is no ECDSA control path and no external gas
              payer — the account pays its own gas.
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tag k="Envelope" v="QubitorPQTxV1" accent />
              <Tag k="Auth" v="ML-DSA-65" accent />
              <Tag k="ECDSA" v="NONE" />
              <Tag k="Gas Payer" v="ACCOUNT" />
            </div>
          </div>
        </HudPanel>
      ) : null}

      <HudPanel label="TRANSACTION" status={ok == null ? "PENDING" : ok ? "SUCCESS" : "REVERTED"}>
        <dl className="grid grid-cols-1 gap-3 font-mono text-sm">
          <KV k="Hash" v={tx.hash} mono />
          <KV
            k="Block"
            v={tx.blockNumber ? String(hexToNumber(tx.blockNumber)) : "pending"}
            link={
              tx.blockNumber
                ? `/explorer/block/${hexToNumber(tx.blockNumber)}`
                : undefined
            }
          />
          <KV k="From" v={tx.from} mono link={`/explorer/address/${tx.from}`} />
          <KV
            k="To"
            v={tx.to ?? "Contract creation"}
            mono={!!tx.to}
            link={tx.to ? `/explorer/address/${tx.to}` : undefined}
          />
          <KV k="Value" v={`${formatQbt(hexToBigInt(tx.value))} QBT`} accent />
          <KV k="Type" v={txTypeLabel(tx.type)} accent={pq} />
          <KV k="Nonce" v={String(hexToNumber(tx.nonce))} />
          <KV k="Gas" v={hexToNumber(tx.gas).toLocaleString()} />
          {receipt ? (
            <KV
              k="Gas Used"
              v={hexToNumber(receipt.gasUsed).toLocaleString()}
            />
          ) : null}
        </dl>
      </HudPanel>

      {receipt && receipt.logs.length > 0 ? (
        <HudPanel label={`EVENT LOGS · ${receipt.logs.length}`}>
          <div className="flex flex-col gap-2 font-mono text-xs">
            {receipt.logs.map((l, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-qb-line/60 py-2"
              >
                <span className="text-qb-mist">▸</span>
                <ScrambleText
                  value={l.address}
                  truncateTo={{ head: 10, tail: 6 }}
                  className="text-xs"
                />
                <span className="ml-auto qb-label text-qb-mist">
                  {l.topics?.[0]?.slice(0, 14) ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </HudPanel>
      ) : null}

      {tx.input && tx.input !== "0x" ? (
        <HudPanel label="CALLDATA">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-qb-mist">
            {tx.input}
          </pre>
        </HudPanel>
      ) : null}
    </div>
  );
}

function KV({
  k,
  v,
  mono,
  accent,
  link,
}: {
  k: string;
  v: string;
  mono?: boolean;
  accent?: boolean;
  link?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-qb-line/60 pb-2">
      <dt className="qb-label text-qb-mist">{k}</dt>
      <dd className={accent ? "text-qb-spark" : "text-qb-bone"}>
        {mono ? (
          <ScrambleText
            value={v}
            href={link}
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

function Tag({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border border-qb-line bg-qb-ink p-3">
      <span className="qb-label text-qb-mist">{k}</span>
      <span
        className={`font-mono text-sm ${
          accent ? "text-qb-spark" : "text-qb-bone"
        }`}
      >
        {v}
      </span>
    </div>
  );
}
