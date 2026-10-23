import clsx from "clsx";
import { ArrowDown, ArrowUp, CircleSlash, Minus } from "lucide-react";
import type { ReportVerdict } from "@/lib/api/schemas";
import { VERDICT_TEXT } from "@/lib/verdict";

/** Team rule: low = blue, expected = neutral grey, high = red. Always icon + text, never color alone. */
const STYLE: Record<ReportVerdict, string> = {
  high: "bg-v-high-soft text-v-high-ink border-v-high/30",
  low: "bg-v-low-soft text-v-low-ink border-v-low/30",
  expected: "bg-v-expected-soft text-v-expected-ink border-v-expected/35",
  unknown: "bg-surface-2 text-ink-3 border-line",
};

const ICON = { high: ArrowUp, low: ArrowDown, expected: Minus, unknown: CircleSlash } as const;

export function VerdictBadge({
  label,
  size = "md",
  long = false,
}: {
  label: ReportVerdict | null | undefined;
  size?: "sm" | "md" | "lg";
  long?: boolean;
}) {
  const v: ReportVerdict = label ?? "unknown";
  const Icon = ICON[v];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "h-6 px-2 text-[11.5px]" : size === "lg" ? "h-9 gap-1.5 px-3.5 text-[14px] font-semibold" : "h-7 px-2.5 text-xs",
        STYLE[v],
      )}
    >
      <Icon className={size === "lg" ? "size-4" : "size-3"} strokeWidth={2.4} aria-hidden />
      {long ? VERDICT_TEXT[v].long : VERDICT_TEXT[v].short}
    </span>
  );
}
