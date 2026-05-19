import { cn } from "@/lib/cn";

type Props = {
  label?: string;
  status?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * Reticle-cornered framed panel — the explorer's primary container. Matches
 * the Terminal/Reticle chrome from the landing page so the explorer reads as
 * the same surface.
 */
export function HudPanel({ label, status, children, className }: Props) {
  return (
    <div
      className={cn(
        "relative border border-qb-line-strong bg-qb-ink",
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-qb-spark" />
      <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-qb-spark" />
      <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-qb-spark" />
      <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-qb-spark" />

      {(label || status) && (
        <div className="flex items-center justify-between border-b border-qb-line px-4 py-2">
          <span className="qb-label text-qb-mist">{label}</span>
          {status ? (
            <span className="flex items-center gap-2 qb-label text-qb-mist">
              <span aria-hidden className="inline-block h-1.5 w-1.5 bg-qb-spark" />
              {status}
            </span>
          ) : null}
        </div>
      )}
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}
