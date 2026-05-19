"use client";

import { cn } from "@/lib/cn";
import { ScrambleText } from "./ScrambleText";
import {
  hexToBigInt,
  hexToNumber,
  formatQbt,
  timeAgo,
  txTypeLabel,
  isPqTx,
} from "@/lib/qubitor/format";
import type { ExplorerEvent, RawBlock, RawTx } from "@/lib/qubitor/types";

export function BlockRow({ block }: { block: RawBlock }) {
  const num = hexToNumber(block.number);
  const txCount = Array.isArray(block.transactions)
    ? block.transactions.length
    : 0;
  return (
    <a
      href={`/explorer/block/${num}`}
      data-cursor="link"
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-6 border-b border-qb-line px-2 py-4 transition-colors hover:bg-qb-ink/40"
    >
      <span className="font-mono text-lg tabular-nums text-qb-bone">
        #{num.toLocaleString()}
      </span>
      <span className="flex flex-col gap-1">
        <ScrambleText
          value={block.hash}
          truncateTo={{ head: 10, tail: 8 }}
          className="text-sm"
          copyable={false}
        />
        <span className="qb-label text-qb-mist">
          MINER{" "}
          <span className="text-qb-mist/80">
            {block.miner?.slice(0, 10)}…
          </span>
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="qb-label text-qb-bone">{txCount} TX</span>
        <span className="qb-label text-qb-mist">
          {timeAgo(hexToNumber(block.timestamp))}
        </span>
      </span>
    </a>
  );
}

export function TxRow({ tx }: { tx: RawTx }) {
  const pq = isPqTx(tx.type);
  return (
    <a
      href={`/explorer/tx/${tx.hash}`}
      data-cursor="link"
      className="group grid grid-cols-[1fr_auto] items-center gap-6 border-b border-qb-line px-2 py-4 transition-colors hover:bg-qb-ink/40"
    >
      <span className="flex flex-col gap-1 overflow-hidden">
        <ScrambleText
          value={tx.hash}
          truncateTo={{ head: 12, tail: 10 }}
          className="text-sm"
          copyable={false}
        />
        <span className="qb-label text-qb-mist">
          {tx.from?.slice(0, 10)}… →{" "}
          {tx.to ? `${tx.to.slice(0, 10)}…` : "CONTRACT CREATE"}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span
          className={cn(
            "qb-label",
            pq ? "text-qb-spark" : "text-qb-mist",
          )}
        >
          {txTypeLabel(tx.type)}
        </span>
        <span className="qb-label text-qb-bone">
          {formatQbt(hexToBigInt(tx.value), 4)} QBT
        </span>
      </span>
    </a>
  );
}

export function EventRow({ ev }: { ev: ExplorerEvent }) {
  return (
    <a
      href={`/explorer/tx/${ev.txHash}`}
      data-cursor="link"
      className="group flex items-center gap-4 border-b border-qb-line/60 px-1 py-2.5 font-mono text-sm transition-colors hover:bg-qb-ink/40"
    >
      <span className="text-qb-mist">▸</span>
      <span
        className={cn(
          "tracking-wide",
          ev.known ? "text-qb-bone" : "text-qb-mist",
        )}
      >
        {ev.name}
      </span>
      {ev.addressLabel ? (
        <span className="qb-label text-qb-mist">{ev.addressLabel}</span>
      ) : (
        <span className="qb-label text-qb-mist">
          {ev.address.slice(0, 10)}…
        </span>
      )}
      <span className="ml-auto qb-label text-qb-mist">
        BLK {ev.blockNumber.toLocaleString()}
      </span>
    </a>
  );
}
