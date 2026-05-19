import { cn } from "@/lib/cn";

type Props = {
  label?: string;
  className?: string;
  corner?: "tl" | "tr" | "bl" | "br";
};

export function Reticle({ label, className, corner = "tr" }: Props) {
  const place = {
    tl: "top-6 left-6",
    tr: "top-6 right-6",
    bl: "bottom-6 left-6",
    br: "bottom-6 right-6",
  }[corner];

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 flex items-center gap-3",
        place,
        className,
      )}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        className="text-qb-spark/70"
      >
        <circle cx="7" cy="7" r="3" />
        <line x1="7" y1="0" x2="7" y2="3" />
        <line x1="7" y1="11" x2="7" y2="14" />
        <line x1="0" y1="7" x2="3" y2="7" />
        <line x1="11" y1="7" x2="14" y2="7" />
      </svg>
      {label ? (
        <span className="qb-label text-qb-mist whitespace-nowrap">{label}</span>
      ) : null}
    </div>
  );
}

export function CornerBrackets() {
  return (
    <>
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <span
          key={c}
          aria-hidden
          className={cn(
            "pointer-events-none absolute h-3 w-3 border-qb-line-strong",
            c === "tl" && "top-4 left-4 border-l border-t",
            c === "tr" && "top-4 right-4 border-r border-t",
            c === "bl" && "bottom-4 left-4 border-l border-b",
            c === "br" && "bottom-4 right-4 border-r border-b",
          )}
        />
      ))}
    </>
  );
}
