"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Receipt } from "@/lib/api/schemas";
import { signedUsd, signedUsdCompact, usd, usdCompact } from "@/lib/format";
import { itemSum, reconciles, shortLabel, waterfall, type WaterfallStep } from "@/lib/receipt";

const BAR: Record<WaterfallStep["kind"] | "neg", string> = {
  baseline: "bg-sage",
  feature: "bg-forest",
  neg: "bg-ochre",
  adjustment: "bg-[repeating-linear-gradient(135deg,#9a978c_0_3px,#c9c5b8_3px_6px)]",
  total: "bg-ink",
};

/**
 * Waterfall: baseline from $0, each item from the running total, ML adjustment, then the estimate.
 * One coordinated reveal; values stay readable throughout (no counting animations).
 */
export function ReceiptWaterfall({ receipt, compact = false }: { receipt: Receipt; compact?: boolean }) {
  const steps = waterfall(receipt);
  const lo = Math.min(0, ...steps.map((s) => Math.min(s.start, s.end)));
  const hi = Math.max(...steps.map((s) => Math.max(s.start, s.end))) * 1.02;
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  return (
    <figure aria-label="Price receipt waterfall chart. The table that follows lists the same values." className="@container w-full">
      <div className={clsx("flex flex-col", compact ? "gap-1.5" : "gap-2.5")} aria-hidden>
        {steps.map((s, i) => {
          const left = pct(Math.min(s.start, s.end));
          const width = Math.max(0.4, Math.abs(pct(s.end) - pct(s.start)));
          const kind = s.kind === "feature" && s.usd < 0 ? "neg" : s.kind;
          return (
            <div
              key={s.key}
              className={clsx(
                // Narrow containers stack the label above its bar; wide ones use three columns.
                "grid grid-cols-[1fr_4.75rem] items-center gap-x-3 gap-y-1 @xl:grid-cols-[minmax(0,14rem)_1fr_6rem]",
                s.kind === "total" && "mt-1 border-t border-line pt-2.5",
              )}
            >
              <span
                className={clsx(
                  "col-span-2 truncate text-ink-2 @xl:col-span-1",
                  compact ? "text-[11.5px]" : "text-[13px]",
                  s.kind === "total" && "font-semibold text-ink",
                )}
              >
                {shortLabel(s.label)}
              </span>
              <div className={clsx("relative rounded-full bg-surface-2", compact ? "h-2.5" : "h-3.5")}>
                <motion.div
                  className={clsx("absolute inset-y-0 rounded-full", BAR[kind])}
                  style={{ left: `${left}%`, width: `${width}%`, originX: s.usd < 0 && s.kind !== "total" ? 1 : 0 }}
                  initial={{ scaleX: 0, opacity: 0.4 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: 0.05 + i * 0.045, duration: 0.32 }}
                />
              </div>
              <span
                className={clsx(
                  "tabular text-right",
                  compact ? "text-[11.5px]" : "text-[13px]",
                  s.kind === "total" ? "font-semibold text-ink" : s.kind === "baseline" ? "text-ink" : s.usd < 0 ? "text-ochre-ink" : "text-forest",
                )}
              >
                {s.kind === "baseline" || s.kind === "total" ? usdCompact(s.usd) : signedUsdCompact(s.usd)}
              </span>
            </div>
          );
        })}
      </div>
      {!compact && (
        <figcaption className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-3">
          <Legend className="bg-sage" label="Neighborhood baseline" />
          <Legend className="bg-forest" label="Adds to price" />
          <Legend className="bg-ochre" label="Reduces price" />
          <Legend className={BAR.adjustment} label="ML adjustment" />
          <Legend className="bg-ink" label="Model estimate" />
        </figcaption>
      )}
    </figure>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("h-2.5 w-4 rounded-full", className)} aria-hidden />
      {label}
    </span>
  );
}

/** The readable, accessible version of the receipt. Every number in the chart is here. */
export function ReceiptTable({ receipt, compact = false }: { receipt: Receipt; compact?: boolean }) {
  const running = receipt.items.reduce<number[]>((acc, it) => [...acc, (acc.at(-1) ?? 0) + it.usd], []);
  const sum = itemSum(receipt.items);
  const ok = reconciles(receipt);
  return (
    <div className="w-full overflow-x-auto">
      <table className={clsx("tabular w-full border-collapse text-left", compact ? "text-[12px]" : "text-[13.5px]")}>
        <caption className="sr-only">Itemized price receipt</caption>
        <thead>
          <tr className="border-b border-line text-xs text-ink-3">
            <th scope="col" className="py-2 pr-3 font-medium">Line item</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Effect</th>
            {!compact && <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">Running total</th>}
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((it, i) => {
            const isBase = it.feature === "baseline";
            return (
              <tr key={`${it.feature}-${i}`} className="border-b border-line/70 last:border-0">
                <th scope="row" className="py-2 pr-3 font-normal text-ink">
                  {it.label}
                  {typeof it.local_coef === "number" && !compact && (
                    <span className="ml-2 text-[11px] text-ink-3" title="Local GWR coefficient (log $/sqft per standard deviation)">
                      β {it.local_coef.toFixed(3)}
                    </span>
                  )}
                </th>
                <td className={clsx("whitespace-nowrap py-2 pr-3 text-right", isBase ? "text-ink" : it.usd < 0 ? "text-ochre-ink" : "text-forest")}>
                  {isBase ? usd(it.usd) : signedUsd(it.usd)}
                </td>
                {!compact && <td className="hidden whitespace-nowrap py-2 text-right text-ink-3 sm:table-cell">{usd(running[i])}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/80">
            <th scope="row" className="pt-2.5 pr-3 font-semibold text-ink">Model estimate</th>
            <td className="whitespace-nowrap pt-2.5 pr-3 text-right font-semibold text-ink">{usd(receipt.total)}</td>
            {!compact && <td className="hidden sm:table-cell" />}
          </tr>
        </tfoot>
      </table>
      <p className={clsx("mt-3 flex items-start gap-1.5 text-xs", ok ? "text-ink-3" : "text-danger")}>
        {ok ? <CircleCheck className="mt-px size-3.5 shrink-0 text-forest" aria-hidden /> : <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
        {ok
          ? `Line items sum to ${usd(sum)}, matching the estimate. GWR subtotal before the ML adjustment: ${usd(receipt.gwr_price)}.`
          : `Line items sum to ${usd(sum)} but the stated total is ${usd(receipt.total)}. Shown as received; please report this listing.`}
      </p>
    </div>
  );
}
