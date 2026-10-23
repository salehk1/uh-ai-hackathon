"use client";

import clsx from "clsx";
import Link from "next/link";
import { Marker, type Map as MLMap } from "maplibre-gl";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Calculator, Info, MapPin } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ApiError, errorMessage } from "@/lib/api/client";
import { usePredict } from "@/lib/api/queries";
import { HOME_TYPES, MODEL_YEAR, predictRequestSchema, type HomeType, type PredictRequest } from "@/lib/api/schemas";
import { homeTypeLabel, perSqft, signedPctFromFraction, usd } from "@/lib/format";
import { C } from "@/lib/palette";
import { classifyAgainstRange, deviationSentence, residualFraction, verdictExplanation } from "@/lib/verdict";
import { BaseMap } from "../map/base-map";
import { RangeBar } from "../property/range-bar";
import { ReceiptTable, ReceiptWaterfall } from "../receipt/receipt";
import { Button, Card, ErrorState, Field, Notice, SectionHeading, inputClass } from "../ui";
import { VerdictBadge } from "../verdict-badge";

const PLACES = [
  { label: "Downtown", lat: 29.7604, lon: -95.3698 },
  { label: "The Heights", lat: 29.798, lon: -95.398 },
  { label: "Meyerland", lat: 29.672, lon: -95.47 },
  { label: "Katy", lat: 29.786, lon: -95.824 },
  { label: "Sugar Land", lat: 29.6197, lon: -95.6349 },
];

type Form = {
  living_area: string;
  beds: string;
  baths: string;
  year_built: string;
  lat: string;
  lon: string;
  home_type: HomeType;
  lot_size_acres: string;
  monthly_hoa: string;
  school_mean: string;
  pool: boolean;
  renovated: boolean;
  new_construction: boolean;
  no_flood: boolean;
  garage: boolean;
  description: string;
  asking: string;
};

const INITIAL: Form = {
  living_area: "2000",
  beds: "3",
  baths: "2",
  year_built: "2005",
  lat: "29.8000",
  lon: "-95.4000",
  home_type: "SINGLE_FAMILY",
  lot_size_acres: "",
  monthly_hoa: "0",
  school_mean: "",
  pool: false,
  renovated: false,
  new_construction: false,
  no_flood: false,
  garage: true,
  description: "",
  asking: "",
};

const n = (s: string) => (s.trim() === "" ? undefined : Number(s));

function toRequest(f: Form): { req?: PredictRequest; errors: Record<string, string> } {
  const candidate = {
    living_area: n(f.living_area),
    beds: n(f.beds),
    baths: n(f.baths),
    year_built: n(f.year_built),
    lat: n(f.lat),
    lon: n(f.lon),
    home_type: f.home_type,
    lot_size_acres: n(f.lot_size_acres),
    monthly_hoa: n(f.monthly_hoa) ?? 0,
    school_mean: n(f.school_mean),
    pool: f.pool,
    renovated: f.renovated,
    new_construction: f.new_construction,
    no_flood: f.no_flood,
    garage: f.garage,
    description: f.description.trim() || undefined,
  };
  const errors: Record<string, string> = {};
  for (const k of ["living_area", "beds", "baths", "year_built", "lat", "lon"] as const) {
    if (candidate[k] === undefined) errors[k] = "Required";
    else if (!Number.isFinite(candidate[k])) errors[k] = "Enter a number";
  }
  const r = predictRequestSchema.safeParse(Object.fromEntries(Object.entries(candidate).filter(([, v]) => v !== undefined)));
  if (!r.success) for (const i of r.error.issues) errors[String(i.path[0])] ??= i.message;
  if (f.asking.trim() && !(Number(f.asking) > 0)) errors.asking = "Enter a positive price";
  return Object.keys(errors).length ? { errors } : { req: r.success ? r.data : undefined, errors };
}

export function EstimateView() {
  const [f, setF] = useState<Form>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<{ req: PredictRequest; asking: number | null; key: string } | null>(null);
  const predict = usePredict();
  const markerRef = useRef<Marker | null>(null);
  const mapRef = useRef<MLMap | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  const setLocation = (lat: number, lon: number, fly = true) => {
    setF((p) => ({ ...p, lat: lat.toFixed(4), lon: lon.toFixed(4) }));
    setErrors((e) => ({ ...e, lat: "", lon: "" }));
    markerRef.current?.setLngLat([lon, lat]);
    if (fly) mapRef.current?.easeTo({ center: [lon, lat], zoom: Math.max(mapRef.current.getZoom(), 11), duration: 450 });
  };

  const submit = () => {
    const { req, errors: errs } = toRequest(f);
    setErrors(errs);
    if (!req) return;
    const asking = f.asking.trim() ? Number(f.asking) : null;
    const key = JSON.stringify(req);
    setSubmitted({ req, asking, key });
    predict.mutate(req);
  };

  const currentKey = (() => {
    const { req } = toRequest(f);
    return req ? JSON.stringify(req) : null;
  })();
  const stale = submitted && predict.isSuccess && currentKey !== submitted.key;
  const outOfCoverage = predict.error instanceof ApiError && predict.error.status === 400 && /coverage/i.test(predict.error.message);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-20 pt-8 sm:px-6">
      <h1 className="font-display text-[36px] leading-tight tracking-tight text-ink">Estimate a home</h1>
      <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        Describe a hypothetical Houston home to get a model estimate of its 2024 list price, a calibrated range and the price receipt.
        Leave school rating and lot size blank to use the neighborhood&apos;s typical values.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Card className="p-5 sm:p-6">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-6"
            aria-label="Home details"
          >
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-ink">The home</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Living area (sqft)" htmlFor="e-area" error={errors.living_area}>
                  <NumInput id="e-area" value={f.living_area} onChange={(v) => set("living_area", v)} error={errors.living_area} />
                </Field>
                <Field label="Bedrooms" htmlFor="e-beds" error={errors.beds}>
                  <NumInput id="e-beds" value={f.beds} onChange={(v) => set("beds", v)} error={errors.beds} />
                </Field>
                <Field label="Bathrooms" htmlFor="e-baths" error={errors.baths}>
                  <NumInput id="e-baths" value={f.baths} step="0.5" onChange={(v) => set("baths", v)} error={errors.baths} />
                </Field>
                <Field label="Year built" htmlFor="e-year" error={errors.year_built} hint={`Up to ${MODEL_YEAR}`}>
                  <NumInput id="e-year" value={f.year_built} onChange={(v) => set("year_built", v)} error={errors.year_built} />
                </Field>
                <Field label="Home type" htmlFor="e-type" className="col-span-2 sm:col-span-2">
                  <select id="e-type" className={inputClass} value={f.home_type} onChange={(e) => set("home_type", e.target.value as HomeType)}>
                    {HOME_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {homeTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-ink">Location</legend>
              <div className="relative h-56 overflow-hidden rounded-2xl border border-line">
                <BaseMap
                  label="Pick the home's location. Click the map to place the marker."
                  view={{ center: [Number(INITIAL.lon), Number(INITIAL.lat)], zoom: 9.6, pitch: 0, bearing: 0 }}
                  onLoad={(m) => {
                    mapRef.current = m;
                    const el = document.createElement("div");
                    el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true"><path d="M14 35s11-11.4 11-20A11 11 0 0 0 3 15c0 8.6 11 20 11 20Z" fill="${C.forest}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="15" r="4" fill="#fff"/></svg>`;
                    const marker = new Marker({ element: el, anchor: "bottom", draggable: true })
                      .setLngLat([Number(f.lon) || -95.4, Number(f.lat) || 29.8])
                      .addTo(m);
                    markerRef.current = marker;
                    marker.on("dragend", () => {
                      const p = marker.getLngLat();
                      setLocation(p.lat, p.lng, false);
                    });
                    m.on("click", (e) => setLocation(e.lngLat.lat, e.lngLat.lng, false));
                    return () => {
                      markerRef.current?.remove();
                      mapRef.current = null;
                    };
                  }}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {PLACES.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setLocation(p.lat, p.lon)}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[12px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                  >
                    <MapPin className="size-3" aria-hidden /> {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Latitude" htmlFor="e-lat" error={errors.lat}>
                  <NumInput id="e-lat" value={f.lat} step="0.0001" onChange={(v) => set("lat", v)} error={errors.lat} />
                </Field>
                <Field label="Longitude" htmlFor="e-lon" error={errors.lon}>
                  <NumInput id="e-lon" value={f.lon} step="0.0001" onChange={(v) => set("lon", v)} error={errors.lon} />
                </Field>
              </div>
              {outOfCoverage && (
                <p className="mt-2 text-[13px] text-danger" role="alert">
                  This location is outside the area the model covers (no reference listing within 25 km). Pick a point in the Houston
                  metro.
                </p>
              )}
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-ink">Optional details</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="School rating (0–10)" htmlFor="e-school" error={errors.school_mean} hint="Blank = neighborhood avg">
                  <NumInput id="e-school" value={f.school_mean} step="0.1" onChange={(v) => set("school_mean", v)} error={errors.school_mean} />
                </Field>
                <Field label="Lot size (acres)" htmlFor="e-lot" error={errors.lot_size_acres} hint="Blank = typical nearby">
                  <NumInput id="e-lot" value={f.lot_size_acres} step="0.01" onChange={(v) => set("lot_size_acres", v)} error={errors.lot_size_acres} />
                </Field>
                <Field label="Monthly HOA ($)" htmlFor="e-hoa" error={errors.monthly_hoa}>
                  <NumInput id="e-hoa" value={f.monthly_hoa} onChange={(v) => set("monthly_hoa", v)} error={errors.monthly_hoa} />
                </Field>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Check label="Pool" checked={f.pool} onChange={(v) => set("pool", v)} />
                <Check label="Garage" checked={f.garage} onChange={(v) => set("garage", v)} />
                <Check label="Renovated" checked={f.renovated} onChange={(v) => set("renovated", v)} />
                <Check label="New construction" checked={f.new_construction} onChange={(v) => set("new_construction", v)} />
                <Check label={'"Never flooded" in listing'} checked={f.no_flood} onChange={(v) => set("no_flood", v)} />
              </div>
              <p className="mt-2 text-xs text-ink-3">These flags mirror phrases detected in listing descriptions; they aren&apos;t verified records.</p>
              <Field
                label="Listing description"
                htmlFor="e-desc"
                error={errors.description}
                hint="The model reads this text, so details like “renovated with pool” change the estimate."
                className="mt-4"
              >
                <textarea
                  id="e-desc"
                  value={f.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="e.g. Fully renovated 3-bed with new kitchen, pool and covered patio."
                  className={clsx(inputClass, "h-auto resize-y py-2 leading-relaxed")}
                  aria-invalid={errors.description ? true : undefined}
                />
              </Field>
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-ink">Compare with a price (optional)</legend>
              <Field
                label="Asking price to compare ($)"
                htmlFor="e-ask"
                error={errors.asking}
                hint="Stays in your browser. It isn't sent to the model or used in the estimate."
              >
                <NumInput id="e-ask" value={f.asking} onChange={(v) => set("asking", v)} error={errors.asking} placeholder="e.g. 425000" />
              </Field>
            </fieldset>

            <Button type="submit" variant="primary" size="lg" loading={predict.isPending} className="w-full sm:w-auto">
              <Calculator className="size-4" aria-hidden /> {predict.isPending ? "Estimating…" : "Estimate price"}
            </Button>
          </form>
        </Card>

        <div className="min-w-0" aria-live="polite">
          <AnimatePresence mode="wait">
            {predict.isError && !outOfCoverage ? (
              <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ErrorState title="Couldn't estimate this home" message={errorMessage(predict.error)} onRetry={submit} />
              </motion.div>
            ) : predict.isSuccess && submitted ? (
              <motion.div key={submitted.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Result data={predict.data.data} asking={submitted.asking} req={submitted.req} stale={!!stale} />
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="flex min-h-[320px] flex-col items-center justify-center border-dashed p-8 text-center">
                  <Calculator className="size-7 text-sage" aria-hidden />
                  <p className="mt-3 text-sm font-medium text-ink">Your estimate and receipt will appear here</p>
                  <p className="mt-1 max-w-sm text-[13px] text-ink-3">
                    {predict.isPending ? "Running the model…" : "Fill in the home and press Estimate price."}
                  </p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Result({
  data: d,
  asking,
  req,
  stale,
}: {
  data: { pred_price: number; q10_price: number; q90_price: number; ppsf: number; nearest_zpid: number; receipt: import("@/lib/api/schemas").Receipt };
  asking: number | null;
  req: PredictRequest;
  stale: boolean;
}) {
  const verdict = asking !== null ? classifyAgainstRange(asking, d.q10_price, d.q90_price) : null;
  const dev = asking !== null ? residualFraction(asking, d.pred_price) : null;
  return (
    <div className="space-y-5">
      {stale && (
        <Notice tone="caution">The form has changed since this estimate. Press Estimate price again to update it.</Notice>
      )}
      <Card className="p-5 sm:p-6">
        <p className="text-[12.5px] text-ink-3">
          {homeTypeLabel(req.home_type ?? "SINGLE_FAMILY")} · {req.living_area.toLocaleString("en-US")} sqft · {req.beds} bd · {req.baths} ba · built{" "}
          {req.year_built}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs font-medium text-ink-3">Model estimate</dt>
            <dd className="tabular mt-1 text-[30px] font-semibold tracking-tight text-forest">{usd(d.pred_price)}</dd>
            <dd className="tabular text-xs text-ink-3">{perSqft(d.ppsf)} model estimate</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-3">Estimated range</dt>
            <dd className="tabular mt-1 text-lg font-semibold text-ink">
              {usd(d.q10_price)} – {usd(d.q90_price)}
            </dd>
            <dd className="text-xs text-ink-3">10th–90th percentile, calibrated</dd>
          </div>
        </dl>
        <RangeBar q10={d.q10_price} q90={d.q90_price} estimate={d.pred_price} asking={asking} askingLabel="Your price" />
        {verdict && (
          <div className="rounded-xl bg-surface-2/70 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge label={verdict} long />
              <span className="tabular text-[13px] text-ink-2">
                {deviationSentence(dev)?.replace("Asking is", "Your price is")} ({signedPctFromFraction(dev)})
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-2">{verdictExplanation(verdict, d.q10_price, d.q90_price).replace("asking price", "price you entered")}</p>
            <p className="mt-1 text-[11.5px] text-ink-3">Calculated in your browser from the returned range. Not a backend verdict.</p>
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionHeading eyebrow="Price receipt" title="How the estimate adds up" />
        <ReceiptWaterfall receipt={d.receipt} />
        <div className="mt-6 border-t border-line pt-5">
          <ReceiptTable receipt={d.receipt} />
        </div>
      </Card>

      <div className="space-y-3">
        <Notice icon={<Info className="size-4" />}>
          Location coefficients come from the nearest reference listing,{" "}
          <Link href={`/property/${d.nearest_zpid}`} className="inline-flex items-center gap-0.5 font-medium text-forest underline-offset-2 hover:underline">
            listing {d.nearest_zpid}
            <ArrowUpRight className="size-3" aria-hidden />
          </Link>
          . Hypothetical estimates use models trained on all 2024 listings, unlike stored listing reports, which are out-of-fold.
        </Notice>
      </div>
    </div>
  );
}

function NumInput({
  id,
  value,
  onChange,
  error,
  step,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step ?? "1"}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      className={clsx(inputClass, "tabular")}
    />
  );
}

function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={clsx(
        "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] transition-colors",
        checked ? "border-sage bg-sage-tint text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
      )}
    >
      <input type="checkbox" className="size-4 accent-[var(--forest)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
