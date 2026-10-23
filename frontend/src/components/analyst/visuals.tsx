"use client";

import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
import type { Report } from "@/lib/api/schemas";
import type { ChatVisual, MapPoint } from "@/lib/chat";
import { usd, usdCompact } from "@/lib/format";
import { isKnown, signalLabel, warnings } from "@/lib/report";
import { StatusChip, UnknownValue } from "../report/primitives";
import { VERDICT_COLOR, C } from "@/lib/palette";
import { ReceiptTable, ReceiptWaterfall } from "../receipt/receipt";
import { VerdictBadge } from "../verdict-badge";

export function VisualView({ v }: { v: ChatVisual }) {
  switch (v.type) {
    case "map":
      return <PointsVisual points={v.points} dropped={v.dropped} />;
    case "bar":
      return <BarVisual labels={v.labels} series={v.series} />;
    case "receipt":
      return (
        <figure className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
          <figcaption className="mb-3 flex items-center justify-between gap-2 text-[12px] text-ink-3">
            <span>{v.source === "listing" ? `Price receipt · Listing ${v.zpid}` : "Price receipt · hypothetical home"}</span>
            {v.zpid !== null && (
              <Link href={`/property/${v.zpid}`} className="inline-flex items-center gap-0.5 font-medium text-forest hover:underline">
                Report <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            )}
          </figcaption>
          {v.askingPrice !== null && <p className="tabular mb-2 text-[12px] text-ink-2">Asking {usd(v.askingPrice)}</p>}
          <ReceiptWaterfall receipt={v.receipt} compact />
          <details className="mt-3 text-[12px]">
            <summary className="cursor-pointer text-ink-3 hover:text-ink">Show as table</summary>
            <div className="mt-2">
              <ReceiptTable receipt={v.receipt} compact />
            </div>
          </details>
        </figure>
      );
    case "report":
      return <ReportCard report={v.report} />;
    case "unsupported":
      return (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2 text-[12px] text-ink-3">
          <Info className="size-3.5" aria-hidden /> A chart in this answer couldn&apos;t be displayed ({v.reason}).
        </p>
      );
  }
}

/** Compact geographic dot plot (equirectangular, lon/lat from GeoJSON order) with links to listed homes. */
function PointsVisual({ points, dropped }: { points: MapPoint[]; dropped: number }) {
  if (!points.length) return <p className="text-[12px] text-ink-3">The analyst&apos;s map had no listings.</p>;
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const [x0, x1] = [Math.min(...lons), Math.max(...lons)];
  const [y0, y1] = [Math.min(...lats), Math.max(...lats)];
  const W = 400;
  const H = 200;
  const pad = 14;
  const kx = Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
  const sx = (W - 2 * pad) / Math.max(1e-6, (x1 - x0) * kx);
  const sy = (H - 2 * pad) / Math.max(1e-6, y1 - y0);
  const s = Math.min(sx, sy);
  const ox = (W - (x1 - x0) * kx * s) / 2;
  const oy = (H - (y1 - y0) * s) / 2;
  const linked = points.filter((p) => p.zpid !== null).slice(0, 5);
  return (
    <figure className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      <figcaption className="mb-2 text-[12px] text-ink-3">
        {points.length.toLocaleString("en-US")} listing{points.length === 1 ? "" : "s"} plotted by location
        {dropped > 0 && ` · ${dropped} skipped (invalid coordinates)`}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-sage-tint" role="img" aria-label={`Location plot of ${points.length} listings`}>
        {points.map((p, i) => (
          <circle
            key={i}
            cx={ox + (p.lon - x0) * kx * s}
            cy={H - (oy + (p.lat - y0) * s)}
            r={points.length > 300 ? 2 : 4}
            fill={p.label ? VERDICT_COLOR[p.label] : C.neutral}
            stroke="#fff"
            strokeWidth={points.length > 300 ? 0.3 : 1}
            opacity={0.9}
          />
        ))}
      </svg>
      {linked.length > 0 && (
        <ul className="mt-2.5 divide-y divide-line">
          {linked.map((p) => (
            <li key={p.zpid}>
              <Link href={`/property/${p.zpid}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12.5px] hover:bg-sage-tint">
                <span className="tabular font-semibold text-ink">{usdCompact(p.price)}</span>
                <span className="flex-1 truncate text-ink-3">ZIP {p.zipcode ?? "unknown"} · Listing {p.zpid}</span>
                <VerdictBadge label={p.label} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function BarVisual({ labels, series }: { labels: string[]; series: { name: string; values: (number | null)[] }[] }) {
  return (
    <figure className="space-y-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      {series.map((s) => {
        const max = Math.max(0, ...s.values.filter((v): v is number => v !== null));
        return (
          <div key={s.name}>
            <figcaption className="mb-2 text-[12px] font-medium text-ink-2">{s.name}</figcaption>
            <table className="tabular w-full text-[12.5px]">
              <caption className="sr-only">{s.name}</caption>
              <tbody>
                {labels.map((l, i) => {
                  const v = s.values[i];
                  return (
                    <tr key={l}>
                      <th scope="row" className="w-24 py-1 pr-2 text-left font-normal text-ink-2">
                        {l}
                      </th>
                      <td className="py-1">
                        <div className="h-2.5 rounded-full bg-surface-2">
                          {v !== null && max > 0 && <div className="h-full rounded-full bg-forest" style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />}
                        </div>
                      </td>
                      <td className="w-20 py-1 pl-2 text-right text-ink">{v === null ? "n/a" : v.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </figure>
  );
}

/** Compact summary of a /report result. The three answers stay separate; the full report is one click away. */
function ReportCard({ report: r }: { report: Report }) {
  const l = r.listing;
  const p = r.price;
  const warn = warnings(r.verification.signals);
  const m = r.costs.monthly;
  const unknownCosts = (["tax", "hoa", "insurance"] as const).filter((k) => !isKnown(m[k])).map((k) => ({ tax: "Tax", hoa: "HOA", insurance: "Insurance" })[k]);
  return (
    <figure className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      <figcaption className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink">{l.street_address ?? `Listing ${l.zpid}`}</p>
          <p className="text-[11.5px] text-ink-3">
            {[l.city, l.zipcode].filter(Boolean).join(" ")} · Listing {l.zpid}
          </p>
        </div>
        <Link
          href={`/property/${l.zpid}`}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-forest px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-forest-2"
        >
          Full report <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </figcaption>
      <dl className="mt-3 divide-y divide-line text-[12.5px]">
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-ink-3">Price</dt>
          <dd className="tabular flex flex-wrap items-center justify-end gap-2 text-right text-ink">
            <span>
              {usdCompact(p.asking)} vs fair {isKnown(p.fair) ? usdCompact(p.fair) : "unknown"}
            </span>
            <VerdictBadge label={p.verdict} size="sm" />
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3 py-2">
          <dt className="pt-0.5 text-ink-3">Listing checks</dt>
          <dd className="text-right">
            {warn.length ? (
              <ul className="space-y-1">
                {warn.map((s) => (
                  <li key={s.name} className="flex items-center justify-end gap-1.5 text-ink">
                    {signalLabel(s.name)} <StatusChip status="warning" size="sm" />
                  </li>
                ))}
              </ul>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-ink-2">
                No warnings <StatusChip status="ok" size="sm" />
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-ink-3">Monthly (known items)</dt>
          <dd className="tabular text-right">
            <span className="font-semibold text-ink">{usd(m.total_known)}/mo</span>
            {unknownCosts.length > 0 && (
              <span className="mt-1 flex items-center justify-end gap-1.5 text-[11.5px] text-ink-3">
                {unknownCosts.join(", ")} <UnknownValue reason="Not included in the known total; see the full report." />
              </span>
            )}
          </dd>
        </div>
      </dl>
    </figure>
  );
}
