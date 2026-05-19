"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { truncate } from "@/lib/qubitor/format";

const GLYPHS = "0123456789ABCDEF░▒▓<>/\\=+*";

type Props = {
  value: string;
  /** middle-truncate to head/tail when set */
  truncateTo?: { head: number; tail: number };
  href?: string;
  copyable?: boolean;
  className?: string;
  /** ms; resolve speed */
  duration?: number;
};

/**
 * The signature cryptic device: a hash/address renders as scrambling glyphs
 * that resolve to the real value on mount and re-scramble→resolve on hover.
 * Click copies the full value. Reduced-motion → instant, no scramble.
 */
export function ScrambleText({
  value,
  truncateTo,
  href,
  copyable = true,
  className,
  duration = 520,
}: Props) {
  const display = truncateTo
    ? truncate(value, truncateTo.head, truncateTo.tail)
    : value;
  const reduced = useReducedMotion();
  const [text, setText] = useState(reduced ? display : "");
  const [copied, setCopied] = useState(false);
  const raf = useRef<number>(0);

  function run() {
    if (reduced) {
      setText(display);
      return;
    }
    const start = performance.now();
    const chars = display.split("");
    cancelAnimationFrame(raf.current);
    const frame = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const revealCount = Math.floor(p * chars.length);
      const out = chars
        .map((c, i) => {
          if (c === "…" || c === "x" || i < revealCount) return c;
          return GLYPHS[(Math.random() * GLYPHS.length) | 0];
        })
        .join("");
      setText(out);
      if (p < 1) raf.current = requestAnimationFrame(frame);
      else setText(display);
    };
    raf.current = requestAnimationFrame(frame);
  }

  useEffect(() => {
    run();
    return () => cancelAnimationFrame(raf.current);
    // re-run when the value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);

  async function onCopy(e: React.MouseEvent) {
    if (!copyable) return;
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1100);
    } catch {
      /* clipboard blocked */
    }
  }

  const body = (
    <span
      className={cn(
        "font-mono tabular-nums tracking-tight transition-colors",
        copied ? "text-qb-spark" : "text-qb-bone",
        className,
      )}
      title={value}
      onMouseEnter={run}
      onClick={onCopy}
      data-cursor={href ? "link" : undefined}
    >
      {text || display}
      {copied ? <span className="ml-2 qb-label text-qb-spark">COPIED</span> : null}
    </span>
  );

  if (href) {
    return (
      <a href={href} data-magnet data-cursor="link" className="inline-block">
        {body}
      </a>
    );
  }
  return body;
}
