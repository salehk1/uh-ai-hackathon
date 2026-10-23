import clsx from "clsx";
import { CircleCheck, CircleHelp, Minus, TriangleAlert } from "lucide-react";
import type { SignalStatus } from "@/lib/api/schemas";

const STATUS = {
  ok: { icon: CircleCheck, text: "OK", cls: "border-brand/25 bg-brand-soft text-brand" },
  warning: { icon: TriangleAlert, text: "Warning", cls: "border-amber/35 bg-amber-soft text-amber-ink" },
  unknown: { icon: Minus, text: "Unknown", cls: "border-line bg-surface-2 text-ink-3" },
} as const;

/** One verification signal's status. Icon + word, so it never relies on color alone. */
export function StatusChip({ status, size = "md" }: { status: SignalStatus; size?: "sm" | "md" }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[12px]",
        s.cls,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.2} aria-hidden />
      {s.text}
    </span>
  );
}

/**
 * "unknown" is a real answer, never $0 or a blank. Grey chip; the reason is in the tooltip and,
 * for screen readers, in the accessible name.
 */
export function UnknownValue({ reason, className }: { reason?: string; className?: string }) {
  return (
    <span
      title={reason}
      aria-label={reason ? `Unknown: ${reason}` : "Unknown"}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-ink-3",
        className,
      )}
    >
      <CircleHelp className="size-3" aria-hidden /> Unknown
    </span>
  );
}
