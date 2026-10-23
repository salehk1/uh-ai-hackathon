"use client";

import clsx from "clsx";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/api/client";
import { useCompare } from "@/lib/api/queries";
import type { CompareRow } from "@/lib/api/schemas";
import { count, decimal, pctNumber, perSqft, usd, usdCompact } from "@/lib/format";
import { Button, Card, ErrorState, Notice, Segmented, Skeleton, inputClass } from "../ui";

const DEFAULT = ["77002", "77019", "77494"];
const MAX = 8;

type MetricKey = "median_ppsf" | "median_price" | "pct_high" | "pct_low" | "mean_school";
const METRICS: { key: MetricKey; label: string; short: string; fmt: (v: number | null) => string; unit: string }[] = [
  { key: "median_ppsf", label: "Median asking $/sqft", short: "$/sqft", fmt: perSqft, unit: "dollars per sqft" },
  { key: "median_price", label: "Median asking price", short: "Price", fmt: usdCompact, unit: "dollars" },
  { key: "pct_high", label: "Listings above their range", short: "% above", fmt: (v) => pctNumber(v), unit: "percent of listings" },
  { key: "pct_low", label: "Listings below their range", short: "% below", fmt: (v) => pctNumber(v), unit: "percent of listings" },
  { key: "mean_school", label: "Mean school rating (of 10)", short: "Schools", fmt: (v) => decimal(v, 2), unit: "rating out of 10" },
];

function parseZips(raw: string | null): string[] {
  if (raw === null) return DEFAULT;
  return [...new Set(raw.split(",").map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z)))].slice(0, MAX);
}

export function CompareView() {
  const sp = useSearchParams();
  const [zips, setZips] = useState<string[]>(() => parseZips(sp.get("zips")));
  const [draft, setDraft] = useState("");
  const [metric, setMetric] = useState<MetricKey>("median_ppsf");
  const q = useCompare(zips);

  const commit = (next: string[]) => {
    setZips(next);
    const url = next.length ? `/compare?zips=${next.join(",")}` : "/compare?zips=";
    window.history.replaceState(null, "", url);
  };

  const draftValid = /^\d{5}$/.test(draft);
  const add = () => {
    if (!draftValid || zips.includes(draft) || zips.length >= MAX) return;
    commit([...zips, draft]);
    setDraft("");
  };

  const rows = useMemo(() => q.data?.data.zips ?? [], [q.data]);
  const missing = q.data?.data.missing ?? [];
  const m = METRICS.find((x) => x.key === metric)!;
  const ordered = useMemo(() => zips.map((z) => rows.find((r) => r.zipcode === z) ?? null), [zips, rows]);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-20 pt-8 sm:px-6">
      <h1 className="font-display text-[36px] leading-tight tracking-tight text-ink">Compare ZIP codes</h1>
      <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        Median asking prices, how many listings sit above or below their estimated range, and recorded school ratings for up to {MAX}{" "}
        ZIP codes. Figures cover listings in the 2024 dataset.
      </p>

      <Card className="mt-6 p-4 sm:p-5">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          aria-label="ZIP codes to compare"
        >
          <ul className="flex flex-wrap gap-2" aria-label="Selected ZIP codes">
            {zips.map((z) => (
              <li key={z}>
                <span className="tabular inline-flex h-9 items-center gap-1 rounded-full border border-line bg-sage-tint pl-3 pr-1 text-[13px] font-medium text-ink">
                  {z}
                  <button
                    type="button"
                    onClick={() => commit(zips.filter((x) => x !== z))}
                    className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface hover:text-ink"
                    aria-label={`Remove ${z}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <label htmlFor="zip-add" className="sr-only">
              Add a ZIP code
            </label>
            <input
              id="zip-add"
              inputMode="numeric"
              maxLength={5}
              placeholder="Add ZIP"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
              className={clsx(inputClass, "h-9 w-28")}
              aria-invalid={draft.length > 0 && !draftValid}
              disabled={zips.length >= MAX}
            />
            <Button type="submit" size="sm" disabled={!draftValid || zips.includes(draft) || zips.length >= MAX}>
              <Plus className="size-3.5" aria-hidden /> Add
            </Button>
          </div>
          {zips.length >= MAX && <p className="text-xs text-ink-3">Up to {MAX} ZIP codes.</p>}
        </form>
      </Card>

      {zips.length === 0 ? (
        <Notice>Add a ZIP code to start comparing.</Notice>
      ) : q.isPending ? (
        <Skeleton className="mt-6 h-80 rounded-[22px]" />
      ) : q.isError ? (
        <div className="mt-6">
          <ErrorState title="Comparison failed" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </div>
      ) : (
        <>
          {missing.length > 0 && (
            <div className="mt-5">
              <Notice tone="caution">
                No listings in the dataset for <strong className="tabular font-semibold">{missing.join(", ")}</strong>. These ZIP codes are
                shown as missing rather than as zeros.
              </Notice>
            </div>
          )}

          <Card className={clsx("mt-6 p-5 sm:p-6", q.isPlaceholderData && "opacity-70")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">{m.label}</h2>
              <div className="max-w-full overflow-x-auto">
                <Segmented label="Chart metric" size="sm" value={metric} onChange={setMetric} options={METRICS.map((x) => ({ value: x.key, label: x.short }))} />
              </div>
            </div>
            <Chart rows={ordered} zips={zips} metric={m} />
          </Card>

          <Card className="mt-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tabular w-full min-w-[720px] text-left text-[13.5px]">
                <caption className="sr-only">ZIP code comparison</caption>
                <thead className="bg-surface-2/70 text-xs text-ink-3">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">ZIP</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Listings</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Median $/sqft</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Median price</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Above range</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Below range</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">School avg</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Explore</span></th>
                  </tr>
                </thead>
                <tbody>
                  {zips.map((z, i) => {
                    const r = ordered[i];
                    return (
                      <tr key={z} className="border-t border-line">
                        <th scope="row" className="px-5 py-3 font-semibold text-ink">{z}</th>
                        {r ? (
                          <>
                            <td className="px-3 py-3 text-right">{count(r.n)}</td>
                            <td className="px-3 py-3 text-right">{perSqft(r.median_ppsf)}</td>
                            <td className="px-3 py-3 text-right">{usd(r.median_price)}</td>
                            <td className="px-3 py-3 text-right">{pctNumber(r.pct_high)}</td>
                            <td className="px-3 py-3 text-right">{pctNumber(r.pct_low)}</td>
                            <td className="px-3 py-3 text-right">{decimal(r.mean_school, 2)}</td>
                            <td className="px-5 py-3 text-right">
                              <Link href={`/explore?zip=${z}`} className="inline-flex items-center gap-0.5 text-[12.5px] font-medium text-forest hover:underline">
                                Explore <ArrowUpRight className="size-3.5" aria-hidden />
                              </Link>
                            </td>
                          </>
                        ) : (
                          <td colSpan={7} className="px-3 py-3 text-ink-3">
                            No listings in the dataset for this ZIP code.
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-3">
            &ldquo;Above&rdquo; and &ldquo;below range&rdquo; compare each asking price with that home&apos;s calibrated 10th–90th percentile
            estimate. School averages are recorded listing ratings, not an independent assessment. Small listing counts make medians less
            stable.
          </p>
        </>
      )}
    </div>
  );
}

/** One metric at a time, so dollars, percentages and ratings never share an axis. */
function Chart({ rows, zips, metric }: { rows: (CompareRow | null)[]; zips: string[]; metric: (typeof METRICS)[number] }) {
  const values = rows.map((r) => (r ? r[metric.key] : null));
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  return (
    <div className="mt-5 space-y-2.5" role="img" aria-label={`${metric.label} by ZIP code, in ${metric.unit}. The table below lists every value.`}>
      {zips.map((z, i) => {
        const v = values[i];
        return (
          <div key={z} className="grid grid-cols-[3.5rem_1fr_6.5rem] items-center gap-3" aria-hidden>
            <span className="tabular text-[13px] font-medium text-ink-2">{z}</span>
            <div className="h-6 rounded-lg bg-surface-2">
              {v !== null && max > 0 && (
                <motion.div
                  key={metric.key}
                  className="h-full rounded-lg bg-forest/85"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(1.5, (v / max) * 100)}%` }}
                  transition={{ duration: 0.35, delay: i * 0.04 }}
                />
              )}
            </div>
            <span className={clsx("tabular text-right text-[13px]", v === null ? "text-ink-3" : "font-semibold text-ink")}>
              {rows[i] ? metric.fmt(v) : "no data"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
