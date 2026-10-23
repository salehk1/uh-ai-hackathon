"use client";

import Link from "next/link";
import { Info, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "@/lib/api/client";
import { useStats } from "@/lib/api/queries";
import type { Stats } from "@/lib/api/schemas";
import { publishedKey } from "@/lib/stats";
import { count, decimal, homeTypeLabel, pctFromFraction, pctNumber, usd } from "@/lib/format";
import { Card, ErrorState, Notice, SectionHeading, Skeleton } from "../ui";

type Moran = { I?: number; p_perm?: number };
const moran = (v: unknown): Moran | null => (v && typeof v === "object" && typeof (v as Moran).I === "number" ? (v as Moran) : null);

export function MethodologyView() {
  const q = useStats();
  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 pb-20 pt-8 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Methodology</p>
      <h1 className="mt-1 font-display text-[38px] leading-tight tracking-tight text-ink">How the estimate and receipt work</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
        A model trained on 2024 Houston listings estimates each home&apos;s list price per square foot, validates itself on neighborhoods
        it hasn&apos;t seen, and explains each estimate as an itemized, location-specific receipt.
      </p>

      {q.isPending ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-32 rounded-[22px]" />
          <Skeleton className="h-72 rounded-[22px]" />
        </div>
      ) : q.isError ? (
        <div className="mt-8">
          <ErrorState title="Model statistics unavailable" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </div>
      ) : (
        <StatsBody s={q.data.data} />
      )}

      <Block id="receipt" title="Reading a price receipt">
        <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-ink-2">
          <li>
            <strong className="text-ink">Neighborhood baseline.</strong> The local price per square foot for a metro-average home, fitted by a
            geographically weighted regression (GWR) around this home, times its living area.
          </li>
          <li>
            <strong className="text-ink">Feature lines.</strong> Size, age, schools, distance to downtown, bedrooms and bathrooms, each
            valued with this location&apos;s own coefficients. The same extra bathroom can be worth very different amounts in different
            neighborhoods. Negative lines are shown as they are.
          </li>
          <li>
            <strong className="text-ink">ML adjustment.</strong> The gap between the GWR subtotal and the final LightGBM estimate, which also
            uses lot size, HOA, tax rate, text flags and nearby prices. It&apos;s shown as its own line so the receipt reconciles exactly.
          </li>
        </ol>
        <Notice icon={<Info className="size-4" />}>
          A receipt describes how the model attributes its estimate. It isn&apos;t SHAP attribution of the final model, and changing one
          feature wouldn&apos;t necessarily move the price by exactly that line.
        </Notice>
      </Block>

      <Block id="limits" title="Data scope and limits">
        <ul className="list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-ink-2">
          <li>The target is the 2024 <em>list</em> price, not a sale price. Estimates are a listing-price comparison, not an appraisal.</li>
          <li>Single-family homes, townhouses and condos only, inside the Houston metro area, after removing extreme $/sqft outliers.</li>
          <li>
            Stored listing estimates are out-of-fold. Estimates for hypothetical homes use models trained on all listings, and are limited
            to homes built up to 2024 and locations within 25 km of a reference listing.
          </li>
          <li>School figures are recorded average ratings. &ldquo;Never flooded&rdquo; and similar flags come from listing text, not flood records.</li>
          <li>
            A price outside its range, or a large gap from the estimate, is a reason to look closer. It isn&apos;t proof of a bargain, an
            overprice or fraud. This app doesn&apos;t produce fraud scores.
          </li>
          <li>The explore map shows a random sample of up to 3,000 listings. Searches return up to 20 matches.</li>
        </ul>
      </Block>

      <p className="mt-10 text-[13px] text-ink-3">
        <Link href="/?intro=1" className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:text-ink">
          <RotateCcw className="size-3.5" aria-hidden /> Replay the Houston intro
        </Link>
      </p>
    </div>
  );
}

function StatsBody({ s }: { s: Stats }) {
  const pubKey = publishedKey(s);
  const pub = pubKey ? s.leaderboard[pubKey] : undefined;
  const iv = s.intervals;
  const byType = iv.coverage_calibrated_by_home_type ?? {};
  const counts = iv.verdict_counts ?? {};
  const totalCounts = Object.values(counts).reduce((a, b) => a + b, 0);
  const sp = s.spatial;
  const morans = sp
    ? ([
        ["log $/sqft", moran(sp.moran_log_ppsf)],
        ["Global OLS residuals", moran(sp.moran_ols_resid_insample)],
        ["GWR residuals", moran(sp.moran_gwr_resid_insample)],
      ] as const)
    : [];

  return (
    <>
      <Card className="mt-8 grid gap-6 p-6 sm:grid-cols-4">
        <Headline label="Listings modeled" value={count(s.n)} />
        <Headline label="Typical error (MAPE)" value={pctNumber(pub?.MAPE ?? null, 1)} sub="published model" />
        <Headline label="Mean absolute error" value={usd(pub?.MAE ?? null)} sub="published model" />
        <Headline label="Variance explained (R²)" value={decimal(pub?.R2 ?? null, 3)} sub="on price" />
        <p className="text-[12.5px] leading-relaxed text-ink-3 sm:col-span-4">
          {s.cv ? `${String(s.cv)}. ` : ""}Recorded evaluation of the published model (&ldquo;{pubKey ?? s.published_model}&rdquo;) from the model&apos;s
          results file. These describe past held-out performance, not a guarantee for any single home.
        </p>
      </Card>

      <Block id="leaderboard" title="Model comparison">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[640px] text-left text-[13.5px]">
              <caption className="sr-only">Model leaderboard from spatial block cross-validation</caption>
              <thead className="bg-surface-2/70 text-xs text-ink-3">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Model</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">MAE</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">MAPE</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">R²</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Residual Moran&apos;s I</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(s.leaderboard).map(([name, v]) => {
                  const isPub = name === pubKey;
                  const isBench = /zestimate/i.test(name);
                  return (
                    <tr key={name} className={isPub ? "border-t border-line bg-sage-tint" : "border-t border-line"}>
                      <th scope="row" className="px-5 py-3 font-medium text-ink">
                        {name}
                        {isPub && <span className="ml-2 rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-semibold text-forest">Published</span>}
                        {isBench && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-3">Benchmark*</span>}
                      </th>
                      <td className="px-3 py-3 text-right">{usd(v.MAE ?? null)}</td>
                      <td className="px-3 py-3 text-right">{pctNumber(v.MAPE ?? null, 2)}</td>
                      <td className="px-3 py-3 text-right">{decimal(v.R2 ?? null, 3)}</td>
                      <td className="px-5 py-3 text-right">{decimal(v.moran_resid_oof ?? null, 3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          *Zillow&apos;s Zestimate is shown for reference only. It can reflect the asking price itself, so it isn&apos;t a like-for-like
          competitor, and it was never used as a model input. MAPE is a percentage; R² and Moran&apos;s I are unitless. Lower residual
          Moran&apos;s I means less leftover spatial clustering in errors.
        </p>
      </Block>

      <Block id="intervals" title="Estimated ranges and coverage">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Each estimate comes with a 10th–90th percentile range from quantile models, widened with {iv.calibration ?? "calibration"} so
          about {pctFromFraction(iv.target, 0)} of held-out listings fall inside. Before calibration, raw coverage was{" "}
          {pctFromFraction(iv.coverage_raw_q10_q90 ?? null)}; after, {pctFromFraction(iv.coverage_calibrated ?? null)}. The median range spans{" "}
          {pctNumber(iv.median_width_pct ?? null, 0)} of the estimate.
        </p>
        <Card className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-ink">Coverage by home type</h3>
          <div className="mt-4 space-y-3">
            {Object.entries(byType).map(([t, v]) => (
              <div key={t} className="grid grid-cols-[7.5rem_1fr_4rem] items-center gap-3">
                <span className="text-[13px] text-ink-2">{homeTypeLabel(t)}</span>
                <div className="relative h-3 rounded-full bg-surface-2">
                  {v !== null && <div className="h-full rounded-full bg-forest/80" style={{ width: `${v * 100}%` }} />}
                  <div className="absolute inset-y-[-4px] w-px bg-ink" style={{ left: `${iv.target * 100}%` }} aria-hidden />
                </div>
                <span className="tabular text-right text-[13px] font-semibold text-ink">{pctFromFraction(v)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">Vertical line: {pctFromFraction(iv.target, 0)} target.</p>
        </Card>
        {(byType.CONDO ?? 1) < iv.target - 0.05 && (
          <Notice tone="caution">
            Ranges are less reliable for condos: only {pctFromFraction(byType.CONDO ?? null)} of held-out condo listings fell inside their
            range, against an {pctFromFraction(iv.target, 0)} target. Read condo verdicts with extra caution.
          </Notice>
        )}
        {totalCounts > 0 && (
          <p className="text-[13.5px] text-ink-2">
            Across the dataset: {count(counts.expected)} within range, {count(counts.low)} below and {count(counts.high)} above.
          </p>
        )}
      </Block>

      {morans.length > 0 && (
        <Block id="spatial" title="Why location-specific receipts">
          <p className="text-[14px] leading-relaxed text-ink-2">
            Price per square foot is strongly clustered across Houston (Moran&apos;s I with a k-nearest-neighbor weight matrix). A single
            citywide regression leaves much of that clustering in its errors; local coefficients absorb most of it. Validation uses
            whole ~2 km blocks held out together, so a test home&apos;s neighbors are never in training.
          </p>
          <Card className="overflow-hidden">
            <table className="tabular w-full text-left text-[13.5px]">
              <caption className="sr-only">Moran&apos;s I spatial autocorrelation</caption>
              <thead className="bg-surface-2/70 text-xs text-ink-3">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Series</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Moran&apos;s I</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Permutation p</th>
                </tr>
              </thead>
              <tbody>
                {morans.map(([name, m]) => (
                  <tr key={name} className="border-t border-line">
                    <th scope="row" className="px-5 py-3 font-normal text-ink">{name}</th>
                    <td className="px-3 py-3 text-right">{decimal(m?.I ?? null, 3)}</td>
                    <td className="px-5 py-3 text-right">{m?.p_perm !== undefined ? `≤ ${m.p_perm}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {typeof sp?.gwr_k === "number" && (
            <p className="text-[12.5px] text-ink-3">GWR bandwidth: {sp.gwr_k} nearest homes, chosen by spatial cross-validation. Engine: {String(sp.engine ?? "—")}.</p>
          )}
        </Block>
      )}
    </>
  );
}

function Headline({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="tabular mt-1 text-[26px] font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-20 space-y-4" aria-labelledby={`${id}-h`}>
      <SectionHeading title={title} id={`${id}-h`} />
      {children}
    </section>
  );
}
