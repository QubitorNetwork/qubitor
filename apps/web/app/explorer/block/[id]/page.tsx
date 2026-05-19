"use client";

import { useParams } from "next/navigation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { HudPanel } from "@/components/explorer/HudPanel";
import { ScrambleText } from "@/components/explorer/ScrambleText";
import { TxRow } from "@/components/explorer/Rows";
import { Loading, Empty } from "@/components/explorer/States";
import { useBlock } from "@/lib/qubitor/hooks";
import { hexToNumber, timeAgo } from "@/lib/qubitor/format";
import type { RawTx } from "@/lib/qubitor/types";

export default function BlockDetail() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { data: block, error } = useBlock(id);

  if (error)
    return (
      <Empty headline="Block not found." note={`${error} · ${id}`} />
    );
  if (!block) return <Loading what={`BLOCK ${id}`} />;

  const num = hexToNumber(block.number);
  const txs = (Array.isArray(block.transactions)
    ? block.transactions
    : []) as RawTx[];

  return (
    <div className="flex flex-col gap-12">
      <SectionHeader
        eyebrow={`Block · ${timeAgo(hexToNumber(block.timestamp))}`}
        headline={`#${num.toLocaleString()}`}
      />

      <HudPanel label="BLOCK HEADER">
        <dl className="grid grid-cols-1 gap-3 font-mono text-sm md:grid-cols-2">
          <KV k="Hash" v={block.hash} mono />
          <KV k="Parent" v={block.parentHash} mono />
          <KV k="Miner" v={block.miner} mono link={`/explorer/address/${block.miner}`} />
          <KV k="Timestamp" v={String(hexToNumber(block.timestamp))} />
          <KV k="Gas Used" v={hexToNumber(block.gasUsed).toLocaleString()} />
          <KV k="Gas Limit" v={hexToNumber(block.gasLimit).toLocaleString()} />
          <KV k="Size" v={`${hexToNumber(block.size).toLocaleString()} B`} />
          <KV k="Nonce" v={block.nonce} mono />
        </dl>
      </HudPanel>

      <HudPanel label={`TRANSACTIONS · ${txs.length}`} status="DECODED">
        <div className="flex flex-col">
          {txs.map((t) => (
            <TxRow key={t.hash} tx={t} />
          ))}
          {txs.length === 0 ? (
            <p className="qb-label py-8 text-qb-mist">
              No transactions in this block.
            </p>
          ) : null}
        </div>
      </HudPanel>

      <div className="flex gap-4">
        {num > 0 ? (
          <a
            href={`/explorer/block/${num - 1}`}
            data-magnet
            data-cursor="link"
            className="qb-label border border-qb-line-strong px-4 py-2 text-qb-bone hover:bg-qb-bone hover:text-qb-black"
          >
            ← PREV
          </a>
        ) : null}
        <a
          href={`/explorer/block/${num + 1}`}
          data-magnet
          data-cursor="link"
          className="qb-label border border-qb-line-strong px-4 py-2 text-qb-bone hover:bg-qb-bone hover:text-qb-black"
        >
          NEXT →
        </a>
      </div>
    </div>
  );
}

function KV({
  k,
  v,
  mono,
  link,
}: {
  k: string;
  v: string;
  mono?: boolean;
  link?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-qb-line/60 pb-2">
      <dt className="qb-label text-qb-mist">{k}</dt>
      <dd className="text-qb-bone">
        {mono ? (
          <ScrambleText
            value={v}
            href={link}
            truncateTo={{ head: 12, tail: 8 }}
            className="text-sm"
          />
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

