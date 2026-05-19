"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAddress, isTxHash, isBlockNumber } from "@/lib/qubitor/format";

/**
 * Search field. Resolves a block number, tx hash, or address and routes to
 * the matching detail page. Invalid input flashes a brief message.
 */
export function ExplorerCommandBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [bad, setBad] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (isTxHash(v)) router.push(`/explorer/tx/${v}`);
    else if (isAddress(v)) router.push(`/explorer/address/${v}`);
    else if (isBlockNumber(v)) {
      const n = v.startsWith("0x") ? String(Number(BigInt(v))) : v;
      router.push(`/explorer/block/${n}`);
    } else {
      setBad(true);
      setTimeout(() => setBad(false), 900);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="relative flex items-center border border-qb-line-strong bg-qb-ink"
    >
      <span className="qb-label px-4 text-qb-mist">Search</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        placeholder="Block number, tx hash, or address"
        data-cursor="link"
        className="w-full bg-transparent py-3.5 pr-4 font-mono text-sm text-qb-bone placeholder:text-qb-mist/50 focus:outline-none"
      />
      <button
        type="submit"
        data-magnet
        data-cursor="link"
        className="qb-label shrink-0 border-l border-qb-line-strong px-5 py-3.5 text-qb-bone transition-colors duration-300 hover:bg-qb-bone hover:text-qb-black"
      >
        {bad ? "Invalid input" : "Search"}
      </button>
    </form>
  );
}
