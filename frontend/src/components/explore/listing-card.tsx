"use client";

import clsx from "clsx";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { forwardRef } from "react";
import type { SearchHome } from "@/lib/api/schemas";
import { homeTypeLabel, rooms, signedPctFromFraction, sqft, usd, usdCompact } from "@/lib/format";
import { VerdictBadge } from "../verdict-badge";

export const ListingCard = forwardRef<
  HTMLLIElement,
  {
    home: SearchHome;
    rank: number;
    active: boolean;
    hovered: boolean;
    onHover: (zpid: number | null) => void;
    onSelect: (h: SearchHome) => void;
    onOpen: () => void;
  }
>(function ListingCard({ home: h, rank, active, hovered, onHover, onSelect, onOpen }, ref) {
  return (
    <li
      ref={ref}
      onMouseEnter={() => onHover(h.zpid)}
      onMouseLeave={() => onHover(null)}
      className={clsx(
        "group relative rounded-2xl border bg-surface transition-[border-color,box-shadow,transform] duration-150",
        active ? "border-brand shadow-md ring-1 ring-brand/30" : hovered ? "border-line-strong shadow-md" : "border-line shadow-sm",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(h)}
        onFocus={() => onHover(h.zpid)}
        onBlur={() => onHover(null)}
        aria-pressed={active}
        aria-label={`Show listing ${h.zpid} in ZIP ${h.zipcode ?? "unknown"} on the map`}
        className="block w-full rounded-2xl p-3.5 text-left"
      >
        <div className="flex items-start gap-3">
          <span
            className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2"
            aria-hidden
          >
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="tabular text-[17px] font-semibold tracking-tight text-ink">{usd(h.price)}</p>
              <VerdictBadge label={h.label} size="sm" />
            </div>
            <p className="tabular mt-0.5 text-[12.5px] text-ink-3">
              Estimate {usdCompact(h.pred_price)} · <span className="text-ink-2">{signedPctFromFraction(h.residual_pct)}</span> vs estimate
            </p>
            <p className="mt-2 truncate text-[12.5px] text-ink-2">
              {homeTypeLabel(h.home_type)} · {rooms(h.beds)} bd · {rooms(h.baths)} ba · {sqft(h.living_area)}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-3">
              ZIP {h.zipcode ?? "unknown"}
              {h.dist_km !== null && ` · ${h.dist_km.toFixed(1)} km away`}
            </p>
          </div>
        </div>
      </button>
      <Link
        href={`/property/${h.zpid}`}
        onClick={onOpen}
        className="absolute bottom-3 right-3 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-brand opacity-90 transition-[background-color,opacity] duration-150 hover:bg-brand-tint group-hover:opacity-100"
      >
        Report <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  );
});
