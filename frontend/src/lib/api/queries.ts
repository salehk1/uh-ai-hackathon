"use client";

import { keepPreviousData, useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "./client";
import {
  compareResponseSchema,
  healthSchema,
  homeSchema,
  mapResponseSchema,
  predictResponseSchema,
  searchResponseSchema,
  statsSchema,
  type MapMetric,
  type PredictRequest,
  type SearchRequest,
} from "./schemas";

const sourceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("live"), backend_host: z.string() }),
  z.object({ mode: z.literal("fixtures") }),
  z.object({ mode: z.literal("unconfigured"), reason: z.string() }),
]);
export type SourceInfo = z.infer<typeof sourceSchema>;

/** Stable, normalized search keys: undefined fields are dropped so equal filters share a cache entry. */
export function normalizeSearch(s: SearchRequest): SearchRequest {
  return Object.fromEntries(
    Object.entries(s)
      .filter(([, v]) => v !== undefined && v !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  ) as SearchRequest;
}

export const keys = {
  source: ["source"] as const,
  health: ["health"] as const,
  home: (zpid: number) => ["home", zpid] as const,
  search: (s: SearchRequest) => ["search", normalizeSearch(s)] as const,
  map: (metric: MapMetric, zip?: string) => ["map", metric, zip ?? null] as const,
  compare: (zips: string[]) => ["compare", [...zips].sort().join(",")] as const,
  stats: ["stats"] as const,
};

export function useSource() {
  return useQuery({
    queryKey: keys.source,
    queryFn: ({ signal }) => apiFetch("/api/source", sourceSchema, { signal }).then((r) => r.data),
    staleTime: Infinity,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: ({ signal }) => apiFetch("/api/health", healthSchema, { signal }),
    staleTime: 60_000,
    retry: false,
  });
}

export const homeQuery = (zpid: number) => ({
  queryKey: keys.home(zpid),
  queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch(`/api/home/${zpid}`, homeSchema, { signal }),
  staleTime: 5 * 60_000,
});

export function useHome(zpid: number | null) {
  return useQuery({
    ...homeQuery(zpid ?? 0),
    enabled: zpid !== null && Number.isInteger(zpid) && zpid > 0,
    retry: (n, e) => n < 1 && !(e as { status?: number }).status?.toString().startsWith("4"),
  });
}

export const searchQuery = (s: SearchRequest) => ({
  queryKey: keys.search(s),
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    apiFetch("/api/search", searchResponseSchema, { signal, json: normalizeSearch(s) }),
  staleTime: 2 * 60_000,
});

export function useSearch(s: SearchRequest) {
  return useQuery({ ...searchQuery(s), placeholderData: keepPreviousData, retry: 1 });
}

/** /map is a random sample: cache it for the whole session so panning never refetches it. */
export const mapQuery = (metric: MapMetric, zip?: string) => ({
  queryKey: keys.map(metric, zip),
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    apiFetch(`/api/map?${new URLSearchParams({ metric, ...(zip ? { zip } : {}) })}`, mapResponseSchema, { signal }),
  staleTime: Infinity,
  gcTime: Infinity,
});

export function useMapSample(metric: MapMetric, zip?: string) {
  return useQuery({ ...mapQuery(metric, zip), retry: 1 });
}

export function useCompare(zips: string[]) {
  return useQuery({
    queryKey: keys.compare(zips),
    queryFn: ({ signal }) =>
      apiFetch(`/api/compare?${new URLSearchParams({ zips: zips.join(",") })}`, compareResponseSchema, { signal }),
    enabled: zips.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: ({ signal }) => apiFetch("/api/stats", statsSchema, { signal }),
    staleTime: Infinity,
  });
}

export function usePredict() {
  return useMutation({
    mutationFn: (p: PredictRequest) => apiFetch("/api/predict", predictResponseSchema, { json: p }),
  });
}

/** Warm the explore view while the intro plays. Never blocks interaction. */
export function prefetchExplore(qc: QueryClient) {
  void qc.prefetchQuery(mapQuery("residual_pct"));
  void qc.prefetchQuery(searchQuery({}));
}
