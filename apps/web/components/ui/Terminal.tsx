import { cn } from "@/lib/cn";

type Props = {
  command: string;
  output: string[];
  label?: string;
  className?: string;
};

/**
 * HUD terminal frame. Renders a fake shell session — a command line and a
 * list of output rows, framed with the same corner-tick chrome used elsewhere.
 * Output rows carry `data-term-line` so they can be revealed under scroll
 * scrub by the section that hosts the terminal.
 */
export function Terminal({ command, output, label, className }: Props) {
  return (
    <div
      className={cn(
        "relative border border-qb-line-strong bg-qb-black/70 font-mono text-sm text-qb-bone backdrop-blur-sm",
        className,
      )}
    >
      {/* HUD corner ticks */}
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-qb-spark" />
      <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-qb-spark" />
      <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-qb-spark" />
      <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-qb-spark" />

      <div className="flex items-center justify-between border-b border-qb-line px-4 py-2">
        <span className="qb-label text-qb-mist">
          {label ?? "qubitor@devnet:~"}
        </span>
        <span className="flex items-center gap-2 qb-label text-qb-mist">
          <span aria-hidden className="inline-block h-1.5 w-1.5 bg-qb-spark" />
          LIVE
        </span>
      </div>

      <div className="flex flex-col gap-1 px-4 py-5">
        <div data-term-line className="flex items-center gap-3">
          <span className="text-qb-mist">▍</span>
          <span className="text-qb-bone">$ {command}</span>
        </div>
        <div className="mt-3 flex flex-col gap-[3px] text-qb-mist">
          {output.map((line, i) => (
            <div
              key={i}
              data-term-line
              className={cn(
                "leading-relaxed",
                line.startsWith("✓") && "text-qb-bone",
                line.startsWith("→") && "text-qb-bone/80",
              )}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
