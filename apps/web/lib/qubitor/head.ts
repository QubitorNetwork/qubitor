"use client";

/**
 * Global chain-head store. Same pub/sub shape as lib/scroll.ts so HUD
 * components (DataTape-style readouts, LiveBadge, the SceneRoot canvas) can
 * subscribe to the live block height without each polling the RPC.
 *
 * A single poller (started by the explorer layout) calls `publishHead`.
 */

export type HeadSample = {
  blockNumber: number;
  chainId: number;
  mining: boolean;
  peers: number;
  blockTimeSec: number;
  /** bumps each time a *new* block is observed — drives glitch flashes */
  tick: number;
};

type Listener = (s: HeadSample) => void;

const state: HeadSample = {
  blockNumber: 0,
  chainId: 0,
  mining: false,
  peers: 0,
  blockTimeSec: 12,
  tick: 0,
};
const listeners = new Set<Listener>();

export function publishHead(next: Partial<HeadSample>) {
  const prevBlock = state.blockNumber;
  Object.assign(state, next);
  if (typeof next.blockNumber === "number" && next.blockNumber > prevBlock) {
    state.tick += 1;
  }
  for (const l of listeners) l(state);
}

export function getHead(): HeadSample {
  return state;
}

export function subscribeHead(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => {
    listeners.delete(l);
  };
}
