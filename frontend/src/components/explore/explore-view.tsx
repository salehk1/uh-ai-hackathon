"use client";

import clsx from "clsx";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Box, Crosshair, Layers, List, Map as MapIcon, SearchX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/lib/api/client";
import { useHome, useMapSample, useSearch } from "@/lib/api/queries";
import type { MapProperties, SearchHome } from "@/lib/api/schemas";
import { homeTitle, homeTypeLabel, rooms, signedPctFromFraction, sqft, usd, usdCompact } from "@/lib/format";
import { DEFAULT_VIEW, type MapView } from "../map/base-map";
import { Button, ErrorState, Skeleton, Segmented, buttonClass } from "../ui";
import { VerdictBadge } from "../verdict-badge";
import { ExploreMap } from "./explore-map";
import { hasFilters, toSearchRequest, useExploreState, type ExploreFilters } from "./explore-state";
import { ReportSearch } from "../lookup/report-search";
import { Filters } from "./filters";
import { MapLegend } from "./legend";
import { ListingCard } from "./listing-card";

const SCROLL_KEY = "hpr:explore-scroll";

export function ExploreView() {
  const { state, update } = useExploreState();
  const { filters, metric, selected, panel, flat } = state;
  const reduced = !!useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [focus, setFocus] = useState<{ lon: number; lat: number; nonce: number } | null>(null);
  const viewRef = useRef<MapView>(state.view ?? DEFAULT_VIEW);
  const [initialView] = useState<MapView>(state.view ?? DEFAULT_VIEW);

  const searchReq = useMemo(() => toSearchRequest(filters), [filters]);
  const search = useSearch(searchReq);
  const sample = useMapSample(metric, filters.zip);
  const results = useMemo(() => search.data?.data.homes ?? [], [search.data]);
  const fitKey = JSON.stringify(searchReq);

  // ---- list scroll restoration (Back from a report returns to the same spot)
  const listRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !search.data || !listRef.current) return;
    restored.current = true;
    try {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved) {
        const { url, top } = JSON.parse(saved) as { url: string; top: number };
        if (url === window.location.search) listRef.current.scrollTop = top;
      }
    } catch {
      /* storage unavailable */
    }
  }, [search.data]);
  const rememberScroll = useCallback(() => {
    try {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ url: window.location.search, top: listRef.current?.scrollTop ?? 0 }));
    } catch {
      /* storage unavailable */
    }
  }, []);

  // ---- selection
  const sampleById = useMemo(() => {
    const m = new Map<number, { props: MapProperties; lon: number; lat: number }>();
    for (const f of sample.data?.data.features ?? []) m.set(f.properties.zpid, { props: f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
    return m;
  }, [sample.data]);

  const select = useCallback(
    (zpid: number | null) => update((s) => ({ ...s, selected: zpid })),
    [update],
  );

  const selectFromList = (h: SearchHome) => {
    select(h.zpid);
    setFocus({ lon: h.lon, lat: h.lat, nonce: Date.now() });
    if (panel === "list") update((s) => ({ ...s, panel: "map" }));
  };

  const cardRefs = useRef(new Map<number, HTMLLIElement>());
  useEffect(() => {
    if (selected) cardRefs.current.get(selected)?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [selected, reduced]);

  const setFilters = (f: ExploreFilters) => update((s) => ({ ...s, filters: f, selected: null }));
  const reset = () => update((s) => ({ ...s, filters: { radiusKm: 5 }, selected: null }));

  const sampleState = sample.isPending ? "loading" : sample.isError ? "error" : "ok";

  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(360px,420px)_1fr]">
      {/* ------------------------------------------------ list + filters */}
      <aside
        className={clsx(
          "min-h-0 flex-col border-r border-line bg-canvas lg:flex",
          panel === "list" ? "flex" : "hidden",
        )}
        aria-label="Search and results"
      >
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-5 lg:pb-6">
          <h1 className="font-display font-semibold text-[28px] leading-tight tracking-tight text-ink">Explore Houston listings</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            Asking prices compared with a model estimate and its calibrated range. Open any result for its full report.
          </p>
          <div className="mt-4 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
            <ReportSearch />
          </div>
          <div className="mt-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
            <Filters
              key={filters.zip ?? ""}
              filters={filters}
              onChange={setFilters}
              onReset={reset}
              mapCenter={() => ({ lat: viewRef.current.center[1], lon: viewRef.current.center[0] })}
            />
          </div>

          <div className="mt-5 flex items-baseline justify-between gap-3" aria-live="polite">
            <h2 className="text-[13px] font-semibold text-ink">
              {search.isPending
                ? "Searching…"
                : search.isError
                  ? "Results unavailable"
                  : `${results.length} matching listing${results.length === 1 ? "" : "s"}`}
              {search.isFetching && !search.isPending && <span className="ml-2 font-normal text-ink-3">updating…</span>}
            </h2>
            <span className="text-[11.5px] text-ink-3">up to 20 · lowest vs. estimate first</span>
          </div>

          <div className="mt-3">
            {search.isPending ? (
              <ul className="space-y-2.5" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[112px] rounded-2xl" />
                ))}
              </ul>
            ) : search.isError ? (
              <ErrorState title="Search failed" message={errorMessage(search.error)} onRetry={() => search.refetch()} />
            ) : results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-5 py-8 text-center">
                <SearchX className="mx-auto size-6 text-ink-3" aria-hidden />
                <p className="mt-2 text-sm font-medium text-ink">No listings match these filters</p>
                <p className="mt-1 text-[13px] text-ink-3">Try a higher price, fewer bedrooms or a wider radius.</p>
                {hasFilters(filters) && (
                  <Button size="sm" className="mt-4" onClick={reset}>
                    Reset filters
                  </Button>
                )}
              </div>
            ) : (
              <motion.ul
                key={fitKey}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                className={clsx("space-y-2.5 transition-opacity", search.isPlaceholderData && "opacity-60")}
              >
                {results.map((h, i) => (
                  <ListingCard
                    key={h.zpid}
                    ref={(el) => {
                      if (el) cardRefs.current.set(h.zpid, el);
                      else cardRefs.current.delete(h.zpid);
                    }}
                    home={h}
                    rank={i + 1}
                    active={selected === h.zpid}
                    hovered={hovered === h.zpid}
                    onHover={setHovered}
                    onSelect={selectFromList}
                    onOpen={rememberScroll}
                  />
                ))}
              </motion.ul>
            )}
          </div>
          <p className="mt-6 text-[11.5px] leading-relaxed text-ink-3">
            The model estimates a 2024 list price from comparable homes and location. It isn&apos;t an appraisal, and a price outside
            the range is a reason to look closer, not a verdict on the listing. <Link className="underline underline-offset-2 hover:text-ink" href="/methodology">How it works</Link>
          </p>
        </div>
      </aside>

      {/* ------------------------------------------------ map */}
      <section className={clsx("relative min-h-0 lg:block", panel === "map" ? "block" : "hidden")} aria-label="Map">
        <ExploreMap
          sample={sample.data?.data}
          results={results}
          metric={metric}
          selected={selected}
          hovered={hovered}
          flat={flat}
          initialView={initialView}
          fitKey={fitKey}
          focus={focus}
          reducedMotion={reduced}
          onSelect={select}
          onHover={setHovered}
          onViewChange={(v) => {
            viewRef.current = v;
            update((s) => ({ ...s, view: v }));
          }}
        />

        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
          <div className={clsx("pointer-events-auto sm:block", legendOpen ? "block" : "hidden")}>
            <MapLegend
              metric={metric}
              onMetric={(m) => update((s) => ({ ...s, metric: m }))}
              sampleCount={sample.data?.data.features.length ?? null}
              sampleZip={filters.zip}
              resultCount={results.length}
              sampleState={sampleState}
            />
          </div>
          <div className="pointer-events-auto mr-12 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setLegendOpen((o) => !o)}
              aria-expanded={legendOpen}
              className={buttonClass("secondary", "sm", "shadow-md sm:hidden")}
            >
              <Layers className="size-3.5" aria-hidden /> {legendOpen ? "Hide legend" : "Legend"}
            </button>
            <button
              type="button"
              onClick={() => update((s) => ({ ...s, flat: !s.flat }))}
              aria-pressed={!flat}
              className={buttonClass("secondary", "sm", "shadow-md")}
            >
              <Box className="size-3.5" aria-hidden /> {flat ? "2D view" : "3D view"}
            </button>
            <button
              type="button"
              onClick={() => {
                const c = viewRef.current.center;
                const z = viewRef.current.zoom;
                const radiusKm = z >= 13 ? 2 : z >= 11.5 ? 5 : z >= 10.5 ? 10 : 20;
                update((s) => ({ ...s, filters: { ...s.filters, near: { lat: c[1], lon: c[0] }, radiusKm }, selected: null }));
              }}
              className={buttonClass("secondary", "sm", "shadow-md")}
            >
              <Crosshair className="size-3.5" aria-hidden /> Search this area
            </button>
          </div>
        </div>

        {sample.isError && (
          <div className="absolute bottom-24 left-1/2 z-10 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2">
            <ErrorState compact title="Map sample unavailable" message={errorMessage(sample.error)} onRetry={() => sample.refetch()} />
          </div>
        )}

        <AnimatePresence>
          {selected !== null && (
            <SelectionPreview
              key={selected}
              zpid={selected}
              fromResults={results.find((r) => r.zpid === selected)}
              fromSample={sampleById.get(selected)?.props}
              onClose={() => select(null)}
              onOpen={rememberScroll}
            />
          )}
        </AnimatePresence>
      </section>

      {/* ------------------------------------------------ mobile toggle */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center lg:hidden">
        <div className="pointer-events-auto rounded-full shadow-lg">
          <Segmented
            label="Show map or list"
            value={panel}
            onChange={(v) => update((s) => ({ ...s, panel: v }))}
            options={[
              { value: "map", label: <><MapIcon className="size-3.5" aria-hidden /> Map</> },
              { value: "list", label: <><List className="size-3.5" aria-hidden /> List ({results.length})</> },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function SelectionPreview({
  zpid,
  fromResults,
  fromSample,
  onClose,
  onOpen,
}: {
  zpid: number;
  fromResults?: SearchHome;
  fromSample?: MapProperties;
  onClose: () => void;
  onOpen: () => void;
}) {
  // Details come from the result row or map sample immediately; the full record fills in type/beds.
  const full = useHome(zpid);
  const home = full.data?.data.zpid === zpid ? full.data.data : undefined;
  const base = fromResults ?? fromSample;
  const price = home?.price ?? base?.price ?? null;
  const pred = home?.pred_price ?? base?.pred_price ?? null;
  const residual = home?.residual_pct ?? base?.residual_pct ?? null;
  const label = home?.label ?? base?.label ?? null;
  const zip = home?.zipcode ?? base?.zipcode ?? null;
  const type = home?.home_type ?? fromResults?.home_type;
  const beds = home?.beds ?? fromResults?.beds;
  const baths = home?.baths ?? fromResults?.baths;
  const area = home?.living_area ?? fromResults?.living_area;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-20 left-1/2 z-20 w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-[22px] border border-line bg-surface p-4 shadow-lg lg:bottom-6"
      role="region"
      aria-label={`Selected listing ${zpid}`}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2.5 top-2.5 rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Close preview"
      >
        <X className="size-4" />
      </button>
      <p className="text-[12px] text-ink-3">{homeTitle(zip)} · Listing {zpid}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="tabular text-[22px] font-semibold tracking-tight text-ink">{usd(price)}</p>
        <VerdictBadge label={label} size="sm" />
      </div>
      <p className="tabular mt-0.5 text-[13px] text-ink-2">
        Model estimate {usdCompact(pred)} · {signedPctFromFraction(residual)} vs estimate
      </p>
      <p className="mt-1.5 min-h-[18px] text-[12.5px] text-ink-3">
        {type !== undefined || beds !== undefined ? (
          <>
            {homeTypeLabel(type)} · {rooms(beds)} bd · {rooms(baths)} ba · {sqft(area)}
          </>
        ) : full.isError ? (
          "Details unavailable"
        ) : (
          <span className="inline-block h-3 w-40 skeleton align-middle" aria-label="Loading details" />
        )}
      </p>
      <Link href={`/property/${zpid}`} onClick={onOpen} className={buttonClass("primary", "md", "mt-3 w-full")}>
        View full report <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </motion.div>
  );
}
