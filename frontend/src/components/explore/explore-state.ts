"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { MAP_METRICS, type MapMetric, type SearchRequest, type Verdict } from "@/lib/api/schemas";
import { DEFAULT_VIEW, type MapView } from "../map/base-map";

export const LANDMARKS = {
  downtown: { label: "Downtown", lat: 29.7604, lon: -95.3698 },
  galleria: { label: "the Galleria", lat: 29.739, lon: -95.4631 },
  tmc: { label: "Texas Medical Center", lat: 29.7069, lon: -95.4011 },
} as const;

export type ExploreFilters = {
  maxPrice?: number;
  minBeds?: number;
  zip?: string;
  label?: Verdict;
  near?: { lat: number; lon: number };
  radiusKm: number;
};

export type ExploreState = {
  filters: ExploreFilters;
  metric: MapMetric;
  selected: number | null;
  view: MapView | null;
  panel: "map" | "list";
  flat: boolean;
};

const num = (v: string | null) => (v !== null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function parseExplore(sp: URLSearchParams): ExploreState {
  const metric = (MAP_METRICS as readonly string[]).includes(sp.get("metric") ?? "") ? (sp.get("metric") as MapMetric) : "residual_pct";
  const label = sp.get("label");
  const zip = sp.get("zip");
  const nearRaw = sp.get("near")?.split(",").map(Number);
  const near =
    nearRaw && nearRaw.length === 2 && nearRaw.every(Number.isFinite) && Math.abs(nearRaw[0]) <= 90 && Math.abs(nearRaw[1]) <= 180
      ? { lat: nearRaw[0], lon: nearRaw[1] }
      : undefined;
  const v = sp.get("v")?.split(",").map(Number);
  const view =
    v && v.length === 5 && v.every(Number.isFinite)
      ? { center: [v[0], v[1]] as [number, number], zoom: v[2], pitch: v[3], bearing: v[4] }
      : null;
  const maxPrice = num(sp.get("max_price"));
  const minBeds = num(sp.get("min_beds"));
  const r = num(sp.get("r"));
  const sel = num(sp.get("sel"));
  return {
    filters: {
      maxPrice: maxPrice && maxPrice > 0 ? maxPrice : undefined,
      minBeds: minBeds !== undefined && minBeds >= 0 ? minBeds : undefined,
      zip: zip && /^\d{5}$/.test(zip) ? zip : undefined,
      label: label === "high" || label === "low" || label === "expected" ? label : undefined,
      near,
      radiusKm: r && r > 0 && r <= 100 ? r : 5,
    },
    metric,
    selected: sel && Number.isInteger(sel) && sel > 0 ? sel : null,
    view,
    panel: sp.get("panel") === "list" ? "list" : "map",
    flat: sp.get("3d") === "0",
  };
}

export function toSearchRequest(f: ExploreFilters): SearchRequest {
  return {
    max_price: f.maxPrice,
    min_beds: f.minBeds,
    zipcode: f.zip,
    label: f.label,
    ...(f.near ? { near_lat: f.near.lat, near_lon: f.near.lon, radius_km: f.radiusKm } : {}),
  };
}

export function hasFilters(f: ExploreFilters) {
  return f.maxPrice !== undefined || f.minBeds !== undefined || !!f.zip || !!f.label || !!f.near;
}

function serialize(s: ExploreState): string {
  const p = new URLSearchParams();
  const f = s.filters;
  if (s.metric !== "residual_pct") p.set("metric", s.metric);
  if (f.maxPrice !== undefined) p.set("max_price", String(f.maxPrice));
  if (f.minBeds !== undefined) p.set("min_beds", String(f.minBeds));
  if (f.zip) p.set("zip", f.zip);
  if (f.label) p.set("label", f.label);
  if (f.near) {
    p.set("near", `${f.near.lat.toFixed(4)},${f.near.lon.toFixed(4)}`);
    p.set("r", String(f.radiusKm));
  }
  if (s.selected) p.set("sel", String(s.selected));
  if (s.view) {
    const v = s.view;
    p.set("v", [v.center[0].toFixed(4), v.center[1].toFixed(4), v.zoom.toFixed(2), Math.round(v.pitch), Math.round(v.bearing)].join(","));
  }
  if (s.panel === "list") p.set("panel", "list");
  if (s.flat) p.set("3d", "0");
  return p.toString();
}

/**
 * URL-backed explore state. Updates use history.replaceState (which Next keeps in sync with
 * useSearchParams) so filter tweaks don't spam the Back stack, while a property link pushes
 * normally and Back returns to exactly this URL.
 */
export function useExploreState() {
  const sp = useSearchParams();
  const state = useMemo(() => parseExplore(new URLSearchParams(sp.toString())), [sp]);

  const update = useCallback((fn: (s: ExploreState) => ExploreState) => {
    // Map events can fire during the transition to another page; never write explore params elsewhere.
    if (window.location.pathname !== "/explore") return;
    const current = parseExplore(new URLSearchParams(window.location.search));
    const next = fn(current);
    const qs = serialize(next);
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
  }, []);

  return { state, update };
}

export { DEFAULT_VIEW };
