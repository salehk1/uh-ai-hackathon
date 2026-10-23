import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, CircleSlash } from "lucide-react";
import type { Verdict } from "@/lib/api/schemas";
import { VERDICT_TEXT } from "@/lib/verdict";

const STYLE: Record<Verdict, string> = {
  high: "bg-ochre-soft text-ochre-ink border-ochre/30",
  low: "bg-slate-soft text-slate-ink border-slate/25",
  expected: "bg-sage-soft text-forest border-sage/40",
};

const ICON = { high: ArrowUp, low: ArrowDown, expected: Check } as const;

export function VerdictBadge({
  label,
  size = "md",
  long = false,
}: {
  label: Verdict | null | undefined;
  size?: "sm" | "md";
  long?: boolean;
}) {
  const cls = clsx(
    "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
    size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-xs",
  );
  if (!label) {
    return (
      <span className={clsx(cls, "border-line bg-surface-2 text-ink-3")}>
        <CircleSlash className="size-3" aria-hidden /> No verdict
      </span>
    );
  }
  const Icon = ICON[label];
  return (
    <span className={clsx(cls, STYLE[label])}>
      <Icon className="size-3" strokeWidth={2.4} aria-hidden />
      {long ? VERDICT_TEXT[label].long : VERDICT_TEXT[label].short}
    </span>
  );
}
