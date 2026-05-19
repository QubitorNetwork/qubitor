"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { subscribeHead } from "@/lib/qubitor/head";

/**
 * Pulsing "● LIVE · BLOCK n" badge. Glitch-flashes whenever a new block head
 * is observed (driven by the global head store, not its own poll).
 */
export function LiveBadge({ className }: { className?: string }) {
  const [block, setBlock] = useState(0);
  const [mining, setMining] = useState(false);
  const [flash, setFlash] = useState(false);
  const lastTick = useRef(0);

  useEffect(() => {
    return subscribeHead((h) => {
      setBlock(h.blockNumber);
      setMining(h.mining);
      if (h.tick !== lastTick.current) {
        lastTick.current = h.tick;
        setFlash(true);
        setTimeout(() => setFlash(false), 420);
      }
    });
  }, []);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 qb-label transition-colors duration-300",
        flash ? "text-qb-spark" : "text-qb-mist",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          mining ? "bg-qb-spark" : "bg-qb-mist",
          flash && "scale-150",
        )}
        style={{ transition: "transform 200ms var(--ease-monument)" }}
      />
      {mining ? "LIVE" : "IDLE"} · BLOCK{" "}
      <span
        className={cn(
          "tabular-nums",
          flash && "[text-shadow:0_0_6px_rgba(0,0,0,0.35)]",
        )}
      >
        {block ? block.toLocaleString() : "—"}
      </span>
    </span>
  );
}
