"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bath,
  BedDouble,
  BookOpen,
  Calendar,
  GraduationCap,
  House,
  Info,
  MapPin,
  MessageSquareText,
  Ruler,
  SearchX,
} from "lucide-react";
import { use, type ReactNode } from "react";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useCompare, useHome, useSearch } from "@/lib/api/queries";
import type { Home } from "@/lib/api/schemas";
import {
  decimal,
  homeTitle,
  homeTypeLabel,
  pctNumber,
  perSqft,
  rooms,
  signedPctFromFraction,
  sqft,
  usd,
  usdCompact,
  year,
} from "@/lib/format";
import { parseReceipt } from "@/lib/receipt";
import { deviationSentence, verdictExplanation } from "@/lib/verdict";
import { readStorage, useBrowserValue } from "@/lib/use-browser-value";
import { useAnalyst } from "../analyst/analyst-context";
import { ReceiptTable, ReceiptWaterfall } from "../receipt/receipt";
import { Button, Card, ErrorState, LinkButton, Notice, SectionHeading, Skeleton, Stat } from "../ui";
import { VerdictBadge } from "../verdict-badge";
import { HouseIllustration } from "./house-illustration";
import { RangeBar } from "./range-bar";
import { ReportSkeleton } from "./report-skeleton";

const SCROLL_KEY = "hpr:explore-scroll";

/** Return to the exact explore URL (filters, selection, map view) the report was opened from. */
function useBackHref() {
  const saved = useBrowserValue(() => readStorage("session", SCROLL_KEY), null);
  try {
    if (saved) return `/explore${(JSON.parse(saved) as { url: string }).url}`;
  } catch {
    /* malformed entry */
  }
  return "/explore";
}

export function PropertyReport({ params }: { params: Promise<{ zpid: string }> }) {
  const { zpid: raw } = use(params);
  const zpid = /^\d{1,12}$/.test(raw) ? Number(raw) : null;
  const q = useHome(zpid);
  const backHref = useBackHref();

  if (zpid === null) return <NotFound backHref={backHref} message={`"${raw}" isn't a valid listing id.`} />;
  if (q.isPending) return <ReportSkeleton />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <NotFound backHref={backHref} message={`Listing ${zpid} isn't in the dataset.`} />;
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6">
        <BackLink href={backHref} />
        <div className="mt-6">
          <ErrorState title="Couldn't load this report" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </div>
      </div>
    );
  }
  // Guard against a stale response for a different listing ever rendering under this URL.
  const home = q.data.data;
  if (home.zpid !== zpid) return <ReportSkeleton />;
  return <Report home={home} backHref={backHref} />;
}

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> Back to explore
    </Link>
  );
}

function NotFound({ backHref, message }: { backHref: string; message: string }) {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6">
      <BackLink href={backHref} />
      <Card className="mt-6 px-6 py-12 text-center">
        <SearchX className="mx-auto size-7 text-ink-3" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-ink">Listing not found</h1>
        <p className="mt-1 text-sm text-ink-2">{message}</p>
        <LinkButton href="/explore" variant="primary" className="mt-5">
          Explore listings
        </LinkButton>
      </Card>
    </div>
  );
}

function Report({ home: h, backHref }: { home: Home; backHref: string }) {
  const { openAnalyst } = useAnalyst();
  const receipt = parseReceipt(h.contributions);
  const hasRange = h.q10_price !== null && h.q90_price !== null && h.pred_price !== null;
  const dev = deviationSentence(h.residual_pct);
  const ask = () =>
    openAnalyst({
      zpid: h.zpid,
      prompt: `Explain the price receipt for listing ${h.zpid}. What drives its model estimate, and how does the asking price compare with the estimated range?`,
    });

  return (
    <article className="mx-auto w-full max-w-[1180px] px-4 pb-20 pt-5 sm:px-6">
      <BackLink href={backHref} />

      {/* 1 · identity */}
      <header className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:gap-7">
        <motion.figure
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-[22px] border border-line bg-[#eef2ea] shadow-sm lg:min-h-[340px]"
        >
          <div className="aspect-[16/9] lg:absolute lg:inset-0 lg:aspect-auto">
            <HouseIllustration seed={h.zpid} homeType={h.home_type} />
          </div>
          <figcaption className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-[11.5px] text-ink-3 shadow-sm backdrop-blur">
            <Info className="size-3" aria-hidden /> Illustration. No listing photos are available from the API.
          </figcaption>
        </motion.figure>

        <div className="flex flex-col">
          <p className="text-[13px] text-ink-3">Listing {h.zpid}</p>
          <h1 className="mt-0.5 font-display text-[34px] leading-[1.1] tracking-tight text-ink sm:text-[40px]">{homeTitle(h.zipcode)}</h1>
          <ul className="mt-4 flex flex-wrap gap-2 text-[13px] text-ink-2">
            <Chip icon={<House className="size-3.5" />}>{homeTypeLabel(h.home_type)}</Chip>
            <Chip icon={<BedDouble className="size-3.5" />}>{rooms(h.beds)} beds</Chip>
            <Chip icon={<Bath className="size-3.5" />}>{rooms(h.baths)} baths</Chip>
            <Chip icon={<Ruler className="size-3.5" />}>{sqft(h.living_area)}</Chip>
            <Chip icon={<Calendar className="size-3.5" />}>Built {year(h.year_built)}</Chip>
            <Chip icon={<GraduationCap className="size-3.5" />}>Schools avg {decimal(h.school_mean)}/10</Chip>
          </ul>

          {/* 2 · price summary */}
          <Card className="mt-5 p-5">
            <dl className="grid grid-cols-2 gap-4">
              <Stat label="Asking price" value={<span className="text-[26px]">{usd(h.price)}</span>} sub={`${perSqft(h.ppsf)} asking`} />
              <Stat
                label="Model estimate"
                value={<span className="text-[26px] text-forest">{usd(h.pred_price)}</span>}
                sub={hasRange ? `Range ${usdCompact(h.q10_price)} – ${usdCompact(h.q90_price)}` : "Range unavailable"}
              />
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <VerdictBadge label={h.label} long />
              {dev && (
                <span className="tabular text-[13px] text-ink-2">
                  {dev} ({signedPctFromFraction(h.residual_pct)})
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{verdictExplanation(h.label, h.q10_price, h.q90_price)}</p>
          </Card>
          <Button variant="secondary" className="mt-3 self-start" onClick={ask}>
            <MessageSquareText className="size-4 text-forest" aria-hidden /> Ask about this home
          </Button>
        </div>
      </header>

      {/* 3 · range graphic */}
      <Section id="range" eyebrow="Price range" title="Where the asking price sits">
        {hasRange ? (
          <Card className="p-5 sm:p-6">
            <RangeBar q10={h.q10_price!} q90={h.q90_price!} estimate={h.pred_price!} asking={h.price} />
            <p className="text-[13px] leading-relaxed text-ink-2">
              The shaded band is the model&apos;s calibrated range (10th to 90th percentile), tuned so about 80% of held-out listings
              fell inside it. Coverage is lower for condos and townhouses. See{" "}
              <Link href="/methodology#intervals" className="text-forest underline underline-offset-2">
                methodology
              </Link>
              .
            </p>
          </Card>
        ) : (
          <Notice icon={<Info className="size-4" />}>The estimate or range is missing for this listing, so it can&apos;t be placed on a range.</Notice>
        )}
      </Section>

      {/* 4 · receipt */}
      <Section
        id="receipt"
        eyebrow="Price receipt"
        title="How the estimate adds up"
        intro="Each line is a location-specific contribution from a geographically weighted regression fitted around this home, plus a final machine-learning adjustment that reconciles to the model estimate. Lines describe the model's attribution, not guaranteed price changes."
      >
        {receipt.status === "ok" ? (
          <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
            <Card className="p-5 sm:p-6">
              <ReceiptWaterfall receipt={receipt.receipt} />
            </Card>
            <Card className="p-5 sm:p-6">
              <ReceiptTable receipt={receipt.receipt} />
            </Card>
          </div>
        ) : receipt.status === "missing" ? (
          <Notice icon={<Info className="size-4" />}>No price receipt is stored for this listing.</Notice>
        ) : (
          <ErrorState
            title="This listing's receipt couldn't be read"
            message={`The stored receipt doesn't match the expected format (${receipt.problem}). The price summary above is unaffected.`}
          />
        )}
      </Section>

      {/* 5 · neighborhood */}
      <Section id="neighborhood" eyebrow="Neighborhood" title={h.zipcode ? `Context in ZIP ${h.zipcode}` : "Nearby context"}>
        <Neighborhood home={h} />
      </Section>

      {/* 6 · description + evidence */}
      <Section id="listing" eyebrow="Listing" title="Description and evidence">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-ink">Listing description</h3>
            {h.description ? (
              <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{h.description}</p>
            ) : (
              <p className="mt-2 text-[14px] text-ink-3">No description is stored for this listing.</p>
            )}
          </Card>
          <div className="space-y-3">
            <Notice icon={<Info className="size-4" />}>
              <strong className="font-semibold text-ink">Additional listing evidence isn&apos;t available yet.</strong> Address, photos,
              listing history and duplicate-listing checks are prepared offline but not served by the current API.
            </Notice>
            <Notice icon={<Info className="size-4" />}>
              Description-based flags such as &ldquo;never flooded&rdquo; come from listing text and are not verified flood records.
              School figures are recorded average ratings.
            </Notice>
          </div>
        </div>
      </Section>

      {/* 7 · methodology (compact) */}
      <Section id="method" eyebrow="Method" title="What this report is, and isn't">
        <Card className="grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
          <MethodPoint title="A 2024 list-price model">
            Trained on 2024 Houston list prices, not closed sales. Treat it as a listing-price comparison, not an appraisal.
          </MethodPoint>
          <MethodPoint title="Validated across space">
            This listing&apos;s estimate is out-of-fold: it comes from a model that never saw this home&apos;s neighborhood block
            during training.
          </MethodPoint>
          <MethodPoint title="A signal, not a verdict">
            Prices outside the range are worth investigating. They are not proof of a bargain, an overprice or fraud.
          </MethodPoint>
          <div className="sm:col-span-3">
            <LinkButton href="/methodology" variant="quiet" size="sm" className="-ml-3">
              <BookOpen className="size-4" aria-hidden /> Full methodology and evaluation
            </LinkButton>
          </div>
        </Card>
      </Section>
    </article>
  );
}

function Neighborhood({ home: h }: { home: Home }) {
  const zips = h.zipcode ? [h.zipcode] : [];
  const cmp = useCompare(zips);
  const nearby = useSearch({ near_lat: h.lat, near_lon: h.lon, radius_km: 2 });
  const row = cmp.data?.data.zips.find((z) => z.zipcode === h.zipcode);
  const others = (nearby.data?.data.homes ?? []).filter((x) => x.zpid !== h.zpid).slice(0, 6);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Card className="p-5 sm:p-6">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <MapPin className="size-4 text-forest" aria-hidden /> ZIP {h.zipcode ?? "unknown"} at a glance
        </h3>
        {!h.zipcode ? (
          <p className="mt-2 text-sm text-ink-3">This listing has no ZIP code recorded.</p>
        ) : cmp.isPending ? (
          <Skeleton className="mt-4 h-28" />
        ) : cmp.isError ? (
          <div className="mt-3">
            <ErrorState compact message={errorMessage(cmp.error)} onRetry={() => cmp.refetch()} />
          </div>
        ) : row ? (
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Stat label="Listings in data" value={row.n.toLocaleString("en-US")} />
            <Stat label="Median asking $/sqft" value={perSqft(row.median_ppsf)} sub={`This home: ${perSqft(h.ppsf)}`} />
            <Stat label="Median asking price" value={usdCompact(row.median_price)} />
            <Stat label="Above / below range" value={`${pctNumber(row.pct_high, 0)} / ${pctNumber(row.pct_low, 0)}`} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-ink-3">No ZIP statistics returned.</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {h.zipcode && (
            <>
              <LinkButton href={`/compare?zips=${h.zipcode}`} size="sm">
                Compare ZIPs
              </LinkButton>
              <LinkButton href={`/explore?zip=${h.zipcode}`} size="sm" variant="ghost">
                Explore {h.zipcode} <ArrowUpRight className="size-3.5" aria-hidden />
              </LinkButton>
            </>
          )}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-ink">Other listings within 2 km</h3>
        <p className="mt-0.5 text-xs text-ink-3">Up to 20 nearby matches, lowest asking vs. estimate first.</p>
        {nearby.isPending ? (
          <Skeleton className="mt-4 h-40" />
        ) : nearby.isError ? (
          <div className="mt-3">
            <ErrorState compact message={errorMessage(nearby.error)} onRetry={() => nearby.refetch()} />
          </div>
        ) : others.length === 0 ? (
          <p className="mt-3 text-sm text-ink-3">No other listings within 2 km.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {others.map((o) => (
              <li key={o.zpid}>
                <Link
                  href={`/property/${o.zpid}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-sage-tint"
                >
                  <div className="min-w-0 flex-1">
                    <p className="tabular text-[14px] font-semibold text-ink">{usd(o.price)}</p>
                    <p className="truncate text-[12px] text-ink-3">
                      {homeTypeLabel(o.home_type)} · {rooms(o.beds)} bd · {sqft(o.living_area)}
                      {o.dist_km !== null && ` · ${o.dist_km.toFixed(1)} km`}
                    </p>
                  </div>
                  <VerdictBadge label={o.label} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <motion.section
      id={id}
      className="mt-12 scroll-mt-20"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      aria-labelledby={`${id}-title`}
    >
      <SectionHeading eyebrow={eyebrow} title={title} id={`${id}-title`}>
        {intro}
      </SectionHeading>
      {children}
    </motion.section>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="tabular inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 shadow-sm">
      <span className="text-ink-3" aria-hidden>
        {icon}
      </span>
      {children}
    </li>
  );
}

function MethodPoint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}
