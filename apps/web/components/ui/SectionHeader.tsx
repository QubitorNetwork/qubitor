import { cn } from "@/lib/cn";

type Props = {
  eyebrow: string;
  headline: string;
  id?: string;
  className?: string;
  align?: "left" | "center";
};

export function SectionHeader({
  eyebrow,
  headline,
  id,
  className,
  align = "left",
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="h-px w-8 bg-qb-line-strong" aria-hidden />
        <span className="qb-label">{eyebrow}</span>
      </div>
      <h2
        id={id}
        className="qb-display text-[clamp(2.25rem,5.5vw,4.75rem)] text-qb-bone max-w-[18ch]"
      >
        {headline}
      </h2>
    </div>
  );
}
