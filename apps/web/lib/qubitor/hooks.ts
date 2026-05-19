"use client";

import { useEffect, useRef, useState } from "react";
import { rpc, rpcBatch, fetchChainMeta, type ChainMeta } from "./rpc";
import { decodeKnownLog, SYSTEM_LABEL, WATCHED_ADDRESSES } from "./topics";
import {
  hexToBigInt,
  hexToNumber,
} from "./format";
import { publishHead } from "./head";
import type {
  AccountInfo,
  ExplorerEvent,
  NetworkStatus,
  RawBlock,
  RawLog,
  RawReceipt,
  RawTx,
} from "./types";
import { useReducedMotion } from "@/lib/useReducedMotion";

type Async<T> = { data: T | null; error: string | null; loading: boolean };

function useAsyncInit<T>(): [
  Async<T>,
  (p: Partial<Async<T>>) => void,
] {
  const [s, set] = useState<Async<T>>({
    data: null,
    error: null,
    loading: true,
  });
  return [s, (p) => set((prev) => ({ ...prev, ...p }))];
}

/* ---------------- network status + head poller ---------------- */

export function useNetworkStatus(): Async<NetworkStatus> & {
  meta: ChainMeta | null;
} {
  const [s, set] = useAsyncInit<NetworkStatus>();
  const [meta, setMeta] = useState<ChainMeta | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    const periodMs = reduced ? 20000 : 8000;

    async function tick() {
      try {
        const [status, chainMeta] = await Promise.all([
          rpc<NetworkStatus>("qubitor_getNetworkSecurityStatus", [], {
            signal: ac.signal,
            cacheMs: 4000,
          }),
          fetchChainMeta(ac.signal),
        ]);
        if (!alive) return;
        set({ data: status, error: null, loading: false });
        setMeta(chainMeta);
        publishHead({
          blockNumber: hexToNumber(status.mining?.blockNumber),
          chainId: status.chainId,
          mining: !!status.mining?.mining,
          peers: hexToNumber(status.mining?.peerCount),
          blockTimeSec: status.targetBlockTimeSeconds || 12,
        });
      } catch (e) {
        if (alive)
          set({
            error: e instanceof Error ? e.message : "rpc error",
            loading: false,
          });
      }
    }
    tick();
    const iv = setInterval(tick, periodMs);
    return () => {
      alive = false;
      ac.abort();
      clearInterval(iv);
    };
  }, [reduced]);

  return { ...s, meta };
}

/* ---------------- latest blocks ---------------- */

export function useLatestBlocks(count = 12): Async<RawBlock[]> {
  const [s, set] = useAsyncInit<RawBlock[]>();
  const reduced = useReducedMotion();

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    const periodMs = reduced ? 24000 : 9000;

    async function tick() {
      try {
        const headHex = await rpc<string>("eth_blockNumber", [], {
          signal: ac.signal,
        });
        const head = Number(BigInt(headHex));
        const nums = Array.from({ length: count }, (_, i) => head - i).filter(
          (n) => n >= 0,
        );
        const results = (await rpcBatch(
          nums.map((n) => ({
            method: "eth_getBlockByNumber",
            params: [`0x${n.toString(16)}`, false],
          })),
          { signal: ac.signal },
        )) as (RawBlock | null)[];
        if (!alive) return;
        set({
          data: results.filter((b): b is RawBlock => !!b),
          error: null,
          loading: false,
        });
      } catch (e) {
        if (alive)
          set({
            error: e instanceof Error ? e.message : "rpc error",
            loading: false,
          });
      }
    }
    tick();
    const iv = setInterval(tick, periodMs);
    return () => {
      alive = false;
      ac.abort();
      clearInterval(iv);
    };
  }, [count, reduced]);

  return s;
}

/* ---------------- single block ---------------- */

export function useBlock(idOrHash: string): Async<RawBlock> {
  const [s, set] = useAsyncInit<RawBlock>();
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    (async () => {
      try {
        const isHash = /^0x[0-9a-fA-F]{64}$/.test(idOrHash);
        const method = isHash
          ? "eth_getBlockByHash"
          : "eth_getBlockByNumber";
        const param = isHash
          ? idOrHash
          : `0x${Number(idOrHash).toString(16)}`;
        const block = await rpc<RawBlock | null>(method, [param, true], {
          signal: ac.signal,
          cacheMs: 15000,
        });
        if (!alive) return;
        if (!block) set({ error: "Block not found", loading: false });
        else set({ data: block, error: null, loading: false });
      } catch (e) {
        if (alive)
          set({
            error: e instanceof Error ? e.message : "rpc error",
            loading: false,
          });
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [idOrHash]);
  return s;
}

/* ---------------- single tx ---------------- */

export function useTx(
  hash: string,
): Async<{ tx: RawTx; receipt: RawReceipt | null }> {
  const [s, set] = useAsyncInit<{ tx: RawTx; receipt: RawReceipt | null }>();
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    (async () => {
      try {
        const [tx, receipt] = (await rpcBatch(
          [
            { method: "eth_getTransactionByHash", params: [hash] },
            { method: "eth_getTransactionReceipt", params: [hash] },
          ],
          { signal: ac.signal },
        )) as [RawTx | null, RawReceipt | null];
        if (!alive) return;
        if (!tx) set({ error: "Transaction not found", loading: false });
        else set({ data: { tx, receipt }, error: null, loading: false });
      } catch (e) {
        if (alive)
          set({
            error: e instanceof Error ? e.message : "rpc error",
            loading: false,
          });
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [hash]);
  return s;
}

/* ---------------- address / PQ account ---------------- */

export function useAddress(address: string): Async<AccountInfo> {
  const [s, set] = useAsyncInit<AccountInfo>();
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    (async () => {
      try {
        const [bal, code] = (await rpcBatch(
          [
            { method: "eth_getBalance", params: [address, "latest"] },
            { method: "eth_getCode", params: [address, "latest"] },
          ],
          { signal: ac.signal },
        )) as [string, string];

        // qubitor_* helpers may not exist on every gateway build — degrade.
        let securityMode: string | null = null;
        let readiness: string | null = null;
        let pqCommitment: string | null = null;
        try {
          const sm = await rpc<{ mode?: string; commitment?: string }>(
            "qubitor_getAccountSecurityMode",
            [address],
            { signal: ac.signal, cacheMs: 10000 },
          );
          securityMode = sm?.mode ?? null;
          pqCommitment = sm?.commitment ?? null;
        } catch {
          /* method absent */
        }
        try {
          const rd = await rpc<{ readiness?: string }>(
            "qubitor_getAccountReadiness",
            [address],
            { signal: ac.signal, cacheMs: 10000 },
          );
          readiness = rd?.readiness ?? null;
        } catch {
          /* method absent */
        }

        if (!alive) return;
        set({
          data: {
            address,
            balanceWei: hexToBigInt(bal),
            isContract: !!code && code !== "0x",
            securityMode,
            readiness,
            pqCommitment,
          },
          error: null,
          loading: false,
        });
      } catch (e) {
        if (alive)
          set({
            error: e instanceof Error ? e.message : "rpc error",
            loading: false,
          });
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [address]);
  return s;
}

/* ---------------- live event stream ---------------- */

const LOG_WINDOW = 4000; // blocks back; bounded so eth_getLogs never explodes

export function useEventStream(opts: {
  addresses?: string[];
  limit?: number;
  poll?: boolean;
}): Async<ExplorerEvent[]> {
  const { addresses = WATCHED_ADDRESSES, limit = 40, poll = true } = opts;
  const [s, set] = useAsyncInit<ExplorerEvent[]>();
  const reduced = useReducedMotion();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    const periodMs = reduced ? 24000 : 11000;
    seen.current = new Set();

    async function tick() {
      try {
        const headHex = await rpc<string>("eth_blockNumber", [], {
          signal: ac.signal,
        });
        const head = Number(BigInt(headHex));
        const from = Math.max(0, head - LOG_WINDOW);
        const logs = (await rpc<RawLog[]>(
          "eth_getLogs",
          [
            {
              fromBlock: `0x${from.toString(16)}`,
              toBlock: "latest",
              address: addresses,
            },
          ],
          { signal: ac.signal },
        )) as RawLog[];
        if (!alive) return;

        const events: ExplorerEvent[] = logs
          .slice(-limit * 2)
          .map((log) => {
            const decoded = decodeKnownLog({
              address: log.address as `0x${string}`,
              topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
              data: log.data as `0x${string}`,
            } as Parameters<typeof decodeKnownLog>[0]);
            return {
              id: `${hexToNumber(log.blockNumber)}-${hexToNumber(
                log.logIndex,
              )}`,
              address: log.address,
              addressLabel: SYSTEM_LABEL[log.address.toLowerCase()] ?? null,
              name: decoded.name,
              known: decoded.known,
              args: decoded.args,
              blockNumber: hexToNumber(log.blockNumber),
              txHash: log.transactionHash,
            };
          })
          .sort((a, b) => b.blockNumber - a.blockNumber)
          .slice(0, limit);

        set({ data: events, error: null, loading: false });
      } catch (e) {
        if (alive)
          set({
            error: e instanceof Error ? e.message : "rpc error",
            loading: false,
          });
      }
    }
    tick();
    const iv = poll ? setInterval(tick, periodMs) : null;
    return () => {
      alive = false;
      ac.abort();
      if (iv) clearInterval(iv);
    };
  }, [addresses, limit, poll, reduced]);

  return s;
}
