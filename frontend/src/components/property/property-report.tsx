"use client";

import clsx from "clsx";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  BookOpen,
  Calendar,
  CircleDollarSign,
  Clock,
  ExternalLink,
  House,
  Info,
  MessageSquareText,
  Ruler,
  SearchX,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { use, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useReport } from "@/lib/api/queries";
import type { Report } from "@/lib/api/schemas";
import { homeTypeLabel, rooms, sqft, usd, usdCompact, year } from "@/lib/format";
import { fullAddress, isKnown, reportReceipt, signalLabel, vsFairSentence, warnings } from "@/lib/report";
import { readStorage, useBrowserValue } from "@/lib/use-browser-value";
import { useAnalyst } from "../analyst/analyst-context";
import { ReceiptTable, ReceiptWaterfall } from "../receipt/receipt";
import { CompsMap, CompsTable } from "../report/comps";
import { CostsSection } from "../report/costs";
import { StatusChip, UnknownValue } from "../report/primitives";
import { VerificationSection } from "../report/verification";
import { Button, Card, ErrorState, LinkButton, Notice, SectionHeading, inputClass } from "../ui";
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
  const [offer, setOffer] = useState<number | undefined>(undefined);
  const q = useReport(zpid === null ? null : { zpid, ...(offer !== undefined ? { asking_price: offer } : {}) });
  const backHref = useBackHref();

  if (zpid === null) return <NotFound backHref={backHref} message={`"${raw}" isn't a valid listing id. Enter an address or zpid.`} />;
  if (q.isPending) return <ReportSkeleton />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <NotFound backHref={backHref} message={`Listing ${zpid} isn't in the dataset.`} />;
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6">
        <BackLink href={backHref} />
        <div className="mt-6">
          <ErrorState
            title={q.error instanceof ApiError && q.error.status === 400 ? "Enter an address or zpid" : "Couldn't load this report"}
            message={errorMessage(q.error)}
            onRetry={() => q.refetch()}
          />
        </div>
      </div>
    );
  }
  // Guard against a stale response for a different listing ever rendering under this URL.
  const report = q.data.data;
  if (report.listing.zpid !== zpid) return <ReportSkeleton />;
  return (
    <ReportView
      report={report}
      backHref={backHref}
      offer={offer}
      onOffer={setOffer}
      offerLoading={q.isFetching && q.isPlaceholderData}
    />
  );
}

export function BackLink({ href, label = "Back to explore" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> {label}
    </Link>
  );
}

export function NotFound({ backHref, message }: { backHref: string; message: string }) {
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

function ReportView({
  report: r,
  backHref,
  offer,
  onOffer,
  offerLoading,
}: {
  report: Report;
  backHref: string;
  offer: number | undefined;
  onOffer: (v: number | undefined) => void;
  offerLoading: boolean;
}) {
  const { openAnalyst } = useAnalyst();
  const l = r.listing;
  const address = fullAddress(l);
  const title = l.street_address ?? `Listing ${l.zpid}`;
  const ask = () =>
    openAnalyst({
      zpid: l.zpid,
      prompt: `Give me the report for listing ${l.zpid}${l.street_address ? ` (${l.street_address})` : ""}: is the price reasonable, does the listing check out, and what will it cost per month?`,
    });

  return (
    <article className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-5 sm:px-6">
      <BackLink href={backHref} />

      {/* identity */}
      <header className="mt-4 grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:gap-7">
        <motion.figure
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-[22px] border border-line bg-[#eef2ea] shadow-sm lg:min-h-[300px]"
        >
          <div className="aspect-[16/9] lg:absolute lg:inset-0 lg:aspect-auto">
            <HouseIllustration seed={l.zpid} homeType={l.home_type ?? null} />
          </div>
          <figcaption className="absolute left-3 top-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-[11.5px] text-ink-3 shadow-sm backdrop-blur">
            <Info className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              Illustration.{" "}
              {isKnown(l.photo_count) ? `The listing has ${l.photo_count} photos on Zillow; ` : ""}
              photos aren&apos;t served by the API.
            </span>
          </figcaption>
        </motion.figure>

        <div className="flex flex-col">
          <p className="tabular text-[13px] text-ink-3">
            Listing {l.zpid}
            {l.mls_id ? ` · MLS ${l.mls_id}` : ""}
          </p>
          <h1 className="mt-0.5 font-display text-[34px] leading-[1.08] tracking-tight text-ink sm:text-[42px]">{title}</h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {address && l.street_address ? address.slice(l.street_address.length + 2) : l.zipcode ? `ZIP ${l.zipcode}` : "Location not listed"}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2 text-[13px] text-ink-2">
            <Chip icon={<House className="size-3.5" />}>{homeTypeLabel(l.home_type ?? null)}</Chip>
            <Chip icon={<BedDouble className="size-3.5" />}>{rooms(l.beds)} beds</Chip>
            <Chip icon={<Bath className="size-3.5" />}>{rooms(l.baths)} baths</Chip>
            <Chip icon={<Ruler className="size-3.5" />}>{sqft(l.living_area)}</Chip>
            <Chip icon={<Calendar className="size-3.5" />}>Built {year(l.year_built ?? null)}</Chip>
            <Chip icon={<Clock className="size-3.5" />}>
              {isKnown(l.days_on_zillow) ? `${Math.round(l.days_on_zillow)} days on Zillow` : "Days on Zillow unknown"}
            </Chip>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {l.hdp_url && (
              <a href={l.hdp_url} target="_blank" rel="noopener noreferrer" className={buttonLike}>
                View on Zillow <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <Button variant="secondary" onClick={ask}>
              <MessageSquareText className="size-4 text-forest" aria-hidden /> Ask about this home
            </Button>
          </div>

          <QuestionSummary report={r} />
        </div>
      </header>

      {/* 1 · price */}
      <Section
        id="price"
        step={1}
        eyebrow="Price"
        title="Is the price reasonable?"
        intro="Asking price against the model's calibrated fair range, with an itemized receipt and nearby comparable listings."
      >
        <PriceSection report={r} offer={offer} onOffer={onOffer} loading={offerLoading} />
      </Section>

      {/* 2 · verification */}
      <Section
        id="verification"
        step={2}
        eyebrow="Verification"
        title="Does the listing check out?"
        intro="Independent checks on the listing itself. Each one stands alone; a warning here doesn't change the price verdict."
      >
        <VerificationSection signals={r.verification.signals} />
      </Section>

      {/* 3 · costs */}
      <Section
        id="costs"
        step={3}
        eyebrow="Monthly cost"
        title="What will it cost per month?"
        intro={offer !== undefined ? `Computed for your offer of ${usd(offer)}.` : "Computed for the asking price. Unknown items are shown as unknown, never as $0."}
      >
        <CostsSection costs={r.costs} />
      </Section>

      {/* sources + limitations */}
      <Section id="sources" eyebrow="About this report" title="Sources and limitations">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-ink">Sources</h3>
            <ul className="mt-3 space-y-3">
              {r.sources.map((s) => (
                <li key={s.name} className="text-[13px] leading-relaxed">
                  <p className="font-medium text-ink">{s.name}</p>
                  {s.detail && <p className="text-ink-2">{s.detail}</p>}
                  {s.license && <p className="text-xs text-ink-3">License: {s.license}</p>}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-ink">Limitations</h3>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-2">
              {r.limitations.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-[0.55em] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <LinkButton href="/methodology" variant="quiet" size="sm" className="-ml-3 mt-4">
              <BookOpen className="size-4" aria-hidden /> How the model works
            </LinkButton>
          </Card>
        </div>
      </Section>
    </article>
  );
}

const buttonLike =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:border-line-strong hover:bg-sage-tint";

/** Three separate answers at a glance; each links to its section. No combined score. */
function QuestionSummary({ report: r }: { report: Report }) {
  const warn = warnings(r.verification.signals);
  const unknownSignals = r.verification.signals.filter((s) => s.status === "unknown").length;
  const m = r.costs.monthly;
  const unknownCosts = (["tax", "hoa", "insurance"] as const).filter((k) => !isKnown(m[k]));
  return (
    <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
      <SummaryCard href="#price" step={1} icon={<CircleDollarSign className="size-4" />} title="Price">
        <VerdictBadge label={r.price.verdict} size="sm" />
        <p className="tabular mt-1.5 text-[12.5px] text-ink-2">
          {isKnown(r.price.fair) ? `${usdCompact(r.price.asking)} vs fair ${usdCompact(r.price.fair)}` : "Outside model scope"}
        </p>
      </SummaryCard>
      <SummaryCard href="#verification" step={2} icon={<ShieldCheck className="size-4" />} title="Listing checks">
        {warn.length ? (
          <>
            <StatusChip status="warning" size="sm" />
            <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">
              {warn.length} warning{warn.length === 1 ? "" : "s"}: {warn.map((s) => signalLabel(s.name).toLowerCase()).join("; ")}
            </p>
          </>
        ) : (
          <>
            <StatusChip status="ok" size="sm" />
            <p className="mt-1.5 text-[12.5px] text-ink-2">
              No warnings{unknownSignals ? ` · ${unknownSignals} unknown` : ""}
            </p>
          </>
        )}
      </SummaryCard>
      <SummaryCard href="#costs" step={3} icon={<Calendar className="size-4" />} title="Monthly cost">
        <p className="tabular text-[17px] font-semibold text-ink">
          {usd(m.total_known)}
          <span className="text-[12px] font-normal text-ink-3">/mo known</span>
        </p>
        <p className="mt-1 text-[12.5px] text-ink-2">{unknownCosts.length ? `${unknownCosts.map(costName).join(", ")} unknown` : "All items known"}</p>
      </SummaryCard>
    </div>
  );
}

const costName = (k: "tax" | "hoa" | "insurance") => ({ tax: "Tax", hoa: "HOA", insurance: "Insurance" })[k];

function SummaryCard({ href, step, icon, title, children }: { href: string; step: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="group rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-md"
    >
      <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        <span className="text-forest" aria-hidden>
          {icon}
        </span>
        {step} · {title}
      </p>
      {children}
    </a>
  );
}

function PriceSection({
  report: r,
  offer,
  onOffer,
  loading,
}: {
  report: Report;
  offer: number | undefined;
  onOffer: (v: number | undefined) => void;
  loading: boolean;
}) {
  const p = r.price;
  const receipt = reportReceipt(p);
  const priced = isKnown(p.fair) && isKnown(p.q10) && isKnown(p.q90);
  const [active, setActive] = useState<number | null>(null);
  const vs = vsFairSentence(p.asking_vs_fair_pct);
  const outOfScopeReason = p.reason ?? "This listing is outside the model's scope.";

  return (
    <div className="space-y-5">
      <Card className={clsx("p-5 transition-opacity sm:p-6", loading && "opacity-60")}>
        <div className="flex flex-wrap items-center gap-3">
          <VerdictBadge label={p.verdict} size="lg" long />
          {vs && <span className="tabular text-[14px] text-ink-2">{vs}</span>}
        </div>
        {p.verdict === "unknown" && (
          <p className="mt-3 text-[13.5px] text-ink-2">
            <strong className="font-semibold text-ink">No price verdict.</strong> {outOfScopeReason} The listing checks and monthly costs below still apply.
          </p>
        )}
        <dl className="mt-5 grid gap-5 sm:grid-cols-3">
          <BigNumber label={offer !== undefined ? "Your offer" : "Asking price"}>{usd(p.asking)}</BigNumber>
          <BigNumber label="Fair price" tone="forest">
            {isKnown(p.fair) ? usd(p.fair) : <UnknownValue reason={outOfScopeReason} className="text-[14px]" />}
          </BigNumber>
          <BigNumber label="Asking vs fair">
            {p.asking_vs_fair_pct !== undefined ? `${p.asking_vs_fair_pct > 0 ? "+" : p.asking_vs_fair_pct < 0 ? "−" : ""}${Math.abs(p.asking_vs_fair_pct).toFixed(1)}%` : <UnknownValue reason={outOfScopeReason} className="text-[14px]" />}
          </BigNumber>
        </dl>

        {priced ? (
          <div className="mt-2">
            <RangeBar q10={p.q10 as number} q90={p.q90 as number} estimate={p.fair as number} asking={p.asking} askingLabel={offer !== undefined ? "Offer" : "Asking"} />
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Shaded band: calibrated 80% fair range{" "}
              {p.range_coverage !== undefined && <>(measured coverage {(p.range_coverage * 100).toFixed(1)}%)</>}. Coverage describes the
              model across held-out Houston listings, not this particular home.{" "}
              <Link href="/methodology#intervals" className="text-forest underline underline-offset-2">
                How the range is calibrated
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <Notice icon={<Info className="size-4" />}>No fair range for this listing, so the asking price can&apos;t be placed on one.</Notice>
          </div>
        )}

        <OfferForm offer={offer} asking={r.listing.list_price ?? null} onOffer={onOffer} loading={loading} />
      </Card>

      {receipt ? (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
          <Card className="p-5 sm:p-6">
            <h3 className="mb-1 text-sm font-semibold text-ink">Price receipt</h3>
            <p className="mb-4 text-[12.5px] leading-relaxed text-ink-3">
              Starts from the neighborhood baseline; each line is a location-specific contribution, and the last line is the ML adjustment.
              Lines sum exactly to the fair price.
            </p>
            <ReceiptWaterfall receipt={receipt} totalLabel="Fair price" />
          </Card>
          <Card className="p-5 sm:p-6">
            <ReceiptTable receipt={receipt} totalLabel="Fair price" />
          </Card>
        </div>
      ) : (
        p.verdict !== "unknown" && <Notice icon={<Info className="size-4" />}>No price receipt was returned for this listing.</Notice>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Comparable homes nearby</h3>
        {p.comps.length === 0 ? (
          <Notice icon={<Info className="size-4" />}>No comparable listings were found nearby.</Notice>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <Card className="p-5 sm:p-6">
              <CompsTable report={r} active={active} onActive={setActive} />
            </Card>
            <Card className="overflow-hidden p-1.5">
              <CompsMap report={r} active={active} onActive={setActive} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/** "What if I offer $X?" Re-requests the report with `asking_price`; verdict and costs update. */
function OfferForm({
  offer,
  asking,
  onOffer,
  loading,
}: {
  offer: number | undefined;
  asking: number | null;
  onOffer: (v: number | undefined) => void;
  loading: boolean;
}) {
  const [text, setText] = useState(offer !== undefined ? String(offer) : "");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = Number(text.replace(/[$,\s]/g, ""));
    if (!text.trim() || !Number.isFinite(v) || v <= 0) return setError("Enter a positive dollar amount.");
    if (v > 100_000_000) return setError("That offer looks too large.");
    setError(null);
    onOffer(Math.round(v));
  };
  return (
    <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-2.5 border-t border-line pt-5" noValidate>
      <div className="min-w-[12rem] flex-1 sm:max-w-xs">
        <label htmlFor="offer" className="mb-1.5 block text-[13px] font-medium text-ink-2">
          What if I offer…
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$</span>
          <input
            id="offer"
            inputMode="numeric"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={asking ? Math.round(asking * 0.95).toLocaleString("en-US") : "350,000"}
            className={clsx(inputClass, "pl-6")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "offer-error" : "offer-hint"}
          />
        </div>
      </div>
      <Button type="submit" variant="primary" loading={loading}>
        Recompute
      </Button>
      {offer !== undefined && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setText("");
            setError(null);
            onOffer(undefined);
          }}
        >
          <Undo2 className="size-4" aria-hidden /> Back to asking {asking ? usdCompact(asking) : ""}
        </Button>
      )}
      <p id={error ? "offer-error" : "offer-hint"} className={clsx("basis-full text-xs", error ? "text-danger" : "text-ink-3")}>
        {error ?? "Recomputes the verdict, the asking-price checks and the monthly costs for your number. The fair price and range don't change."}
      </p>
    </form>
  );
}

function BigNumber({ label, children, tone }: { label: string; children: ReactNode; tone?: "forest" }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className={clsx("tabular mt-1 text-[28px] font-semibold leading-tight tracking-tight", tone === "forest" ? "text-forest" : "text-ink")}>{children}</dd>
    </div>
  );
}

function Section({
  id,
  step,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  step?: number;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      id={id}
      className="mt-14 scroll-mt-20"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      aria-labelledby={`${id}-title`}
    >
      <div className="flex items-start gap-3.5">
        {step !== undefined && (
          <span className="mt-5 grid size-8 shrink-0 place-items-center rounded-full bg-forest text-[14px] font-semibold text-white" aria-hidden>
            {step}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <SectionHeading eyebrow={step !== undefined ? `Question ${step} · ${eyebrow}` : eyebrow} title={title} id={`${id}-title`}>
            {intro}
          </SectionHeading>
        </div>
      </div>
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

