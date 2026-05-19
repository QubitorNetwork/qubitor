"use client";

/**
 * Minimal browser JSON-RPC client for the live Qubitor gateway.
 *
 * The public testnet gateway sends `access-control-allow-origin: *`, so the
 * browser calls it directly — no Next API route, no indexer, no proxy.
 *
 * Override the endpoint with NEXT_PUBLIC_QUBITOR_RPC; defaults to the live
 * testnet. The gateway base (without `/rpc`) also serves a `/chain` meta doc.
 */

export const RPC_URL =
  process.env.NEXT_PUBLIC_QUBITOR_RPC?.trim() ||
  "https://testrpc.qubitor.org/rpc";

export const GATEWAY_BASE = RPC_URL.replace(/\/rpc\/?$/, "");

class RpcError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

let nextId = 1;

// Tiny TTL cache so a burst of components asking for the same head/status
// doesn't fan out into duplicate network calls.
type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();

export async function rpc<T = unknown>(
  method: string,
  params: unknown[] = [],
  opts: { cacheMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const key = `${method}:${JSON.stringify(params)}`;
  const cacheMs = opts.cacheMs ?? 0;
  if (cacheMs > 0) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return hit.value as T;
  }

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    signal: opts.signal,
    cache: "no-store",
  });
  if (!res.ok) throw new RpcError(`HTTP ${res.status} for ${method}`, res.status);
  const json = (await res.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };
  if (json.error) throw new RpcError(json.error.message, json.error.code);

  if (cacheMs > 0) cache.set(key, { at: Date.now(), value: json.result });
  return json.result as T;
}

/** Batched JSON-RPC — one round trip for many calls. */
export async function rpcBatch(
  calls: { method: string; params?: unknown[] }[],
  opts: { signal?: AbortSignal } = {},
): Promise<unknown[]> {
  if (calls.length === 0) return [];
  const body = calls.map((c) => ({
    jsonrpc: "2.0",
    id: nextId++,
    method: c.method,
    params: c.params ?? [],
  }));
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
    cache: "no-store",
  });
  if (!res.ok) throw new RpcError(`HTTP ${res.status} (batch)`, res.status);
  const json = (await res.json()) as Array<{
    id: number;
    result?: unknown;
    error?: { code: number; message: string };
  }>;
  // Preserve request order by id.
  const byId = new Map(json.map((r) => [r.id, r]));
  return body.map((b) => {
    const r = byId.get(b.id);
    if (!r || r.error) return null;
    return r.result;
  });
}

/** GET the gateway `/chain` meta document (network name, system contracts). */
export async function fetchChainMeta(
  signal?: AbortSignal,
): Promise<ChainMeta | null> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/chain`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ChainMeta;
  } catch {
    return null;
  }
}

export type ChainMeta = {
  network: string;
  name: string;
  shortName: string;
  chainId: number;
  networkId: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  targetBlockTimeSeconds: number;
  gasLimit: number;
  contracts: Record<string, string>;
};

export { RpcError };
