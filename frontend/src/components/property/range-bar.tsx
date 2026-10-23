"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { usd, usdCompact } from "@/lib/format";

/**
 * Locates the asking price and the model estimate against the calibrated q10–q90 range.
 * Pure positions; all numbers also appear as text next to the graphic.
 */
export function RangeBar({
  q10,
  q90,
  estimate,
  asking,
  askingLabel = "Asking",
}: {
  q10: number;
  q90: number;
  estimate: number;
  asking: number | null;
  askingLabel?: string;
}) {
  const values = [q10, q90, estimate, ...(asking !== null ? [asking] : [])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.18 || max * 0.1;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const outside = asking !== null && (asking > q90 || asking < q10);

  return (
    <div
      role="img"
      aria-label={`Estimated range ${usd(q10)} to ${usd(q90)}. Model estimate ${usd(estimate)}.${asking !== null ? ` ${askingLabel} ${usd(asking)}.` : ""}`}
      className="relative select-none px-1 pb-14 pt-10"
    >
      {/* track */}
      <div className="relative h-3 rounded-full bg-surface-2 ring-1 ring-line/80 ring-inset">
        <motion.div
          className="absolute inset-y-0 rounded-full bg-sage-soft ring-1 ring-sage/60 ring-inset"
          style={{ left: `${pct(q10)}%`, width: `${pct(q90) - pct(q10)}%`, originX: 0.5 }}
          initial={{ scaleX: 0.6, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
        {/* estimate marker */}
        <motion.div
          className="absolute top-1/2 z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border-2 border-surface bg-forest shadow-sm"
          style={{ left: `${pct(estimate)}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        />
        {asking !== null && (
          <motion.div
            className={clsx(
              "absolute top-1/2 z-20 size-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface shadow-md",
              outside ? (asking > q90 ? "bg-v-high" : "bg-v-low") : "bg-ink",
            )}
            style={{ left: `${pct(asking)}%` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.22 }}
          />
        )}
      </div>

      {/* asking label above */}
      {asking !== null && (
        <Tag pos={pct(asking)} place="top" strong>
          {askingLabel} {usdCompact(asking)}
        </Tag>
      )}
      {/* range ends + estimate below */}
      <Tag pos={pct(q10)} place="bottom" muted>
        {usdCompact(q10)}
      </Tag>
      <Tag pos={pct(q90)} place="bottom" muted>
        {usdCompact(q90)}
      </Tag>
      <Tag pos={pct(estimate)} place="bottom-far">
        Estimate {usdCompact(estimate)}
      </Tag>
    </div>
  );
}

function Tag({
  pos,
  place,
  children,
  strong,
  muted,
}: {
  pos: number;
  place: "top" | "bottom" | "bottom-far";
  children: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  const clamped = Math.min(92, Math.max(8, pos));
  return (
    <span
      aria-hidden
      className={clsx(
        "tabular absolute -translate-x-1/2 whitespace-nowrap text-[12px]",
        place === "top" && "top-2",
        place === "bottom" && "top-[3.35rem]",
        place === "bottom-far" && "top-[4.6rem]",
        strong ? "font-semibold text-ink" : muted ? "text-ink-3" : "font-medium text-forest",
      )}
      style={{ left: `${clamped}%` }}
    >
      {children}
    </span>
  );
}
