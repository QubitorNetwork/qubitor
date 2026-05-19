"use client";

export type ScrollSample = {
  progress: number; // 0..1 over document
  velocity: number; // signed scroll velocity (Lenis units)
};

type Listener = (s: ScrollSample) => void;

const state: ScrollSample = { progress: 0, velocity: 0 };
const listeners = new Set<Listener>();

export function publishScroll(next: Partial<ScrollSample>) {
  if (typeof next.progress === "number") state.progress = next.progress;
  if (typeof next.velocity === "number") state.velocity = next.velocity;
  for (const l of listeners) l(state);
}

export function getScroll(): ScrollSample {
  return state;
}

export function subscribeScroll(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => {
    listeners.delete(l);
  };
}
