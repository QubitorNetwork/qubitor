import Image from "next/image";
import { cn } from "@/lib/cn";

type Props = {
  value: string;
  label: string;
  icon?: string;
  className?: string;
};

export function Stat({ value, label, icon, className }: Props) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 border border-qb-line bg-qb-ink/40 p-6",
        className,
      )}
    >
      {icon ? (
        <Image
          aria-hidden
          src={icon}
          alt=""
          width={48}
          height={48}
          className="mb-2 opacity-80"
        />
      ) : null}
      <span className="qb-label">{label}</span>
      <span className="font-display text-3xl md:text-4xl tracking-tight text-qb-bone">
        {value}
      </span>
      <span
        aria-hidden
        className="absolute right-3 top-3 h-1 w-1 bg-qb-spark"
      />
    </div>
  );
}
