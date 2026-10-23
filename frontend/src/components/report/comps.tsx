"use client";

import clsx from "clsx";
import Link from "next/link";
import { LngLatBounds, Marker, type Map as MLMap } from "maplibre-gl";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { Comp, Report } from "@/lib/api/schemas";
import { perSqft, rooms, sqft, usd, usdCompact } from "@/lib/format";
import { isKnown, median } from "@/lib/report";
import { BaseMap, MapFallback } from "../map/base-map";

/** Comparable listings near this home (asking prices, not sales), each linking to its own report. */
export function CompsTable({ report, active, onActive }: { report: Report; active: number | null; onActive: (i: number | null) => void }) {
  const { comps, comps_rule, fair } = report.price;
  const l = report.listing;
  const medPrice = median(comps.map((c) => c.price));
  const medPpsf = median(comps.map((c) => c.ppsf));
  const ownPpsf = l.living_area ? report.price.asking / l.living_area : null;

  return (
    <div>
      <div className="w-full overflow-x-auto">
        <table className="tabular w-full min-w-[520px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Comparable homes</caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-3">
              <th scope="col" className="w-8 py-2 pr-2 font-medium">#</th>
              <th scope="col" className="py-2 pr-3 font-medium">Asking</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">$/sqft</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Beds / baths</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Size</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Distance</th>
              <th scope="col" className="py-2 font-medium"><span className="sr-only">Report</span></th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line bg-brand-tint/70">
              <td className="py-2 pr-2">
                <span className="grid size-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-canvas" aria-hidden>★</span>
              </td>
              <th scope="row" className="py-2 pr-3 font-semibold text-ink">{usd(report.price.asking)} <span className="font-normal text-ink-3">this home</span></th>
              <td className="py-2 pr-3 text-right text-ink">{perSqft(ownPpsf)}</td>
              <td className="py-2 pr-3 text-right text-ink-2">{rooms(l.beds ?? null)} / {rooms(l.baths ?? null)}</td>
              <td className="py-2 pr-3 text-right text-ink-2">{sqft(l.living_area ?? null)}</td>
              <td className="py-2 pr-3 text-right text-ink-3">—</td>
              <td />
            </tr>
            {comps.map((c, i) => (
              <tr
                key={c.zpid}
                onMouseEnter={() => onActive(i)}
                onMouseLeave={() => onActive(null)}
                className={clsx("border-b border-line/70 transition-colors last:border-0", active === i && "bg-surface-2")}
              >
                <td className="py-2 pr-2">
                  <span className="grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-on-brand">{i + 1}</span>
                </td>
                <th scope="row" className="py-2 pr-3 font-medium text-ink">{usd(c.price)}</th>
                <td className="py-2 pr-3 text-right text-ink">{perSqft(c.ppsf)}</td>
                <td className="py-2 pr-3 text-right text-ink-2">{rooms(c.beds)} / {rooms(c.baths)}</td>
                <td className="py-2 pr-3 text-right text-ink-2">{sqft(c.sqft)}</td>
                <td className="py-2 pr-3 text-right text-ink-2">{c.dist_km.toFixed(2)} km</td>
                <td className="py-2 text-right">
                  <Link
                    href={`/property/${c.zpid}`}
                    className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-tint"
                    onFocus={() => onActive(i)}
                    onBlur={() => onActive(null)}
                  >
                    Report <ArrowUpRight className="size-3" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-3">Median comp asking price</dt>
          <dd className="tabular mt-0.5 text-ink">
            <strong className="font-semibold">{usdCompact(medPrice)}</strong>
            {isKnown(fair) && <span className="text-ink-3"> vs fair price {usdCompact(fair)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">Median comp asking $/sqft</dt>
          <dd className="tabular mt-0.5 text-ink">
            <strong className="font-semibold">{perSqft(medPpsf)}</strong>
            <span className="text-ink-3"> vs this home {perSqft(ownPpsf)}</span>
          </dd>
        </div>
      </dl>
      {comps_rule && <p className="mt-3 text-xs text-ink-3">Similarity rule used: {comps_rule}. Comps are asking prices in the same snapshot, not closed sales.</p>}
    </div>
  );
}

/** Mini map: this home (★) and its numbered comps. Markers link to the comps' own reports. */
export function CompsMap({ report, active, onActive }: { report: Report; active: number | null; onActive: (i: number | null) => void }) {
  const l = report.listing;
  const located = report.price.comps.filter((c): c is Comp & { lat: number; lon: number } => typeof c.lat === "number" && typeof c.lon === "number");
  const [markers, setMarkers] = useState<HTMLElement[]>([]);
  useEffect(() => {
    markers.forEach((el, i) => el.classList.toggle("is-active", report.price.comps.indexOf(located[i]) === active));
  }, [markers, active, located, report.price.comps]);
  if (typeof l.lat !== "number" || typeof l.lon !== "number") {
    return <MapFallback message="This listing has no coordinates, so the comps can't be mapped." />;
  }
  const home: [number, number] = [l.lon, l.lat];

  const onLoad = (m: MLMap) => {
    const els: HTMLElement[] = [];
    const bounds = new LngLatBounds(home, home);
    located.forEach((c, i) => {
      // MapLibre positions the marker element with `transform`, so styling lives on an inner span.
      const a = document.createElement("a");
      a.href = `/property/${c.zpid}`;
      a.className = "comp-pin";
      const dot = document.createElement("span");
      dot.textContent = String(i + 1);
      a.append(dot);
      a.setAttribute("aria-label", `Comp ${i + 1}: ${usd(c.price)}, ${c.dist_km.toFixed(2)} km away. Open its report.`);
      a.addEventListener("mouseenter", () => onActive(report.price.comps.indexOf(c)));
      a.addEventListener("mouseleave", () => onActive(null));
      new Marker({ element: a }).setLngLat([c.lon, c.lat]).addTo(m);
      bounds.extend([c.lon, c.lat]);
      els.push(a);
    });
    const me = document.createElement("div");
    me.className = "comp-pin comp-pin-home";
    const star = document.createElement("span");
    star.textContent = "★";
    me.append(star);
    me.setAttribute("aria-label", "This home");
    new Marker({ element: me }).setLngLat(home).addTo(m);
    if (located.length) m.fitBounds(bounds, { padding: 44, maxZoom: 15.5, duration: 0 });
    setMarkers(els);
  };

  return (
    <BaseMap
      key={l.zpid}
      view={{ center: home, zoom: 14, pitch: 0, bearing: 0 }}
      onLoad={onLoad}
      className="relative h-full min-h-[280px] w-full overflow-hidden rounded-2xl"
      label="Map of this home and its comparable listings"
    />
  );
}
