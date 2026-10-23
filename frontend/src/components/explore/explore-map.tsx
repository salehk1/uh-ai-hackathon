"use client";

import { NavigationControl, type GeoJSONSource, type LngLatBoundsLike, type Map as MLMap, type MapGeoJSONFeature, type ExpressionSpecification } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { listingBounds, shouldFitZip } from "@/lib/map-fit";
import type { MapMetric, MapResponse, SearchHome } from "@/lib/api/schemas";
import { C, PPSF_STOPS, RESIDUAL_STOPS, VERDICT_COLOR } from "@/lib/palette";
import { BaseMap, MapFallback, setExtrusionsVisible, type MapView } from "../map/base-map";

type Props = {
  sample: MapResponse | undefined;
  results: SearchHome[];
  metric: MapMetric;
  selected: number | null;
  hovered: number | null;
  flat: boolean;
  initialView: MapView;
  fitKey: string;
  zip?: string;
  sampleLoaded: boolean;
  restoreInitial: boolean;
  /** Request a camera move to a listing; `nonce` lets the same listing be focused twice. */
  focus: { lon: number; lat: number; nonce: number } | null;
  reducedMotion: boolean;
  onSelect: (zpid: number | null) => void;
  onHover: (zpid: number | null) => void;
  onViewChange: (v: MapView) => void;
};

function colorExpr(metric: MapMetric): ExpressionSpecification {
  if (metric === "label") {
    return ["match", ["get", "label"], "high", VERDICT_COLOR.high, "low", VERDICT_COLOR.low, "expected", VERDICT_COLOR.expected, C.neutral];
  }
  const stops = metric === "ppsf" ? PPSF_STOPS : RESIDUAL_STOPS;
  return [
    "case",
    ["==", ["typeof", ["get", metric]], "number"],
    ["interpolate", ["linear"], ["get", metric], ...stops.flat()] as ExpressionSpecification,
    C.neutral,
  ];
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function resultsGeoJSON(rs: SearchHome[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rs.map((h, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [h.lon, h.lat] }, // [lon, lat]
      properties: { zpid: h.zpid, rank: i + 1, label: h.label, residual_pct: h.residual_pct, ppsf: h.ppsf },
    })),
  };
}

export function ExploreMap(p: Props) {
  const mapRef = useRef<MLMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const prev = useRef<{ hovered: number | null; selected: number | null }>({ hovered: null, selected: null });
  const handlers = useRef(p);
  useEffect(() => {
    handlers.current = p;
  });

  const setState = useCallback((zpid: number | null, key: "hover" | "selected", on: boolean) => {
    const m = mapRef.current;
    if (!m || zpid === null) return;
    for (const source of ["sample", "results"]) {
      if (m.getSource(source)) m.setFeatureState({ source, id: zpid }, { [key]: on });
    }
  }, []);

  const onLoad = useCallback((m: MLMap) => {
    mapRef.current = m;
    m.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    m.addSource("sample", {
      type: "geojson",
      data: EMPTY,
      cluster: true,
      clusterMaxZoom: 11,
      clusterRadius: 38,
      promoteId: "zpid",
    });
    m.addSource("results", { type: "geojson", data: EMPTY, promoteId: "zpid" });

    m.addLayer({
      id: "sample-clusters",
      type: "circle",
      source: "sample",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": C.violet,
        "circle-opacity": 0.22,
        "circle-stroke-color": C.violet,
        "circle-stroke-opacity": 0.7,
        "circle-stroke-width": 1,
        "circle-radius": ["step", ["get", "point_count"], 12, 25, 15, 100, 19, 300, 24],
      },
    });
    m.addLayer({
      id: "sample-cluster-count",
      type: "symbol",
      source: "sample",
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 10.5 },
      paint: { "text-color": C.ink2 },
    });
    m.addLayer({
      id: "sample-points",
      type: "circle",
      source: "sample",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": colorExpr(handlers.current.metric),
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 13, 5.5, 16, 8],
        "circle-opacity": 0.88,
        "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], C.brand, ["boolean", ["feature-state", "hover"], false], C.ink, C.canvas],
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, ["boolean", ["feature-state", "hover"], false], 2, 0.8],
      },
    });
    m.addLayer({
      id: "results-halo",
      type: "circle",
      source: "results",
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 17, ["boolean", ["feature-state", "selected"], false], 17, 13],
        "circle-color": C.brand,
        "circle-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.32, ["boolean", ["feature-state", "hover"], false], 0.18, 0],
        "circle-radius-transition": { duration: 150 },
      },
    });
    m.addLayer({
      id: "results-points",
      type: "circle",
      source: "results",
      paint: {
        "circle-color": colorExpr(handlers.current.metric),
        "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 12, 10],
        "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], C.brand, C.ink],
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, 2],
      },
    });
    m.addLayer({
      id: "results-rank",
      type: "symbol",
      source: "results",
      layout: {
        "text-field": ["to-string", ["get", "rank"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": 10,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": C.ink, "text-halo-color": "rgba(9,15,31,0.9)", "text-halo-width": 1.4 },
    });

    const zpidOf = (f: MapGeoJSONFeature | undefined) => (f?.properties?.zpid !== undefined ? Number(f.properties.zpid) : null);
    const interactive = ["results-points", "sample-points"];
    for (const layer of interactive) {
      m.on("mousemove", layer, (e) => {
        m.getCanvas().style.cursor = "pointer";
        handlers.current.onHover(zpidOf(e.features?.[0]));
      });
      m.on("mouseleave", layer, () => {
        m.getCanvas().style.cursor = "";
        handlers.current.onHover(null);
      });
    }
    m.on("click", (e) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: [...interactive, "sample-clusters"] });
      const f = hit[0];
      if (!f) return handlers.current.onSelect(null);
      if (f.layer.id === "sample-clusters") {
        const src = m.getSource("sample") as GeoJSONSource;
        void src.getClusterExpansionZoom(f.properties.cluster_id).then((zoom) => {
          m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom, duration: handlers.current.reducedMotion ? 0 : 450 });
        });
        return;
      }
      handlers.current.onSelect(zpidOf(f));
    });
    setExtrusionsVisible(m, !handlers.current.flat);
    return () => {
      mapRef.current = null;
    };
  }, []);

  // data → sources
  const sync = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    (m.getSource("sample") as GeoJSONSource | undefined)?.setData((p.sample as unknown as GeoJSON.FeatureCollection) ?? EMPTY);
    (m.getSource("results") as GeoJSONSource | undefined)?.setData(resultsGeoJSON(p.results));
    // feature-state survives setData by id; re-assert selection after new data
    if (p.selected) setState(p.selected, "selected", true);
  }, [p.sample, p.results, p.selected, setState]);

  useEffect(() => {
    if (mapReady) sync();
  }, [sync, mapReady]);

  // metric → paint
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setPaintProperty("sample-points", "circle-color", colorExpr(p.metric));
    m.setPaintProperty("results-points", "circle-color", colorExpr(p.metric));
  }, [p.metric]);

  useEffect(() => {
    if (mapRef.current) setExtrusionsVisible(mapRef.current, !p.flat);
    mapRef.current?.easeTo({ pitch: p.flat ? 0 : 38, duration: p.reducedMotion ? 0 : 400 });
  }, [p.flat, p.reducedMotion]);

  // hover/selection → feature-state
  useEffect(() => {
    const before = prev.current;
    if (before.hovered !== p.hovered) {
      setState(before.hovered, "hover", false);
      setState(p.hovered, "hover", true);
    }
    if (before.selected !== p.selected) {
      setState(before.selected, "selected", false);
      setState(p.selected, "selected", true);
    }
    prev.current = { hovered: p.hovered, selected: p.selected };
  }, [p.hovered, p.selected, setState]);

  useEffect(() => {
    const m = mapRef.current;
    if (m && p.focus) flyToListing(m, p.focus.lon, p.focus.lat, p.reducedMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus?.nonce]);

  // ZIP camera moves are independent of metric/filter/pan updates.
  const lastFit = useRef<string | null>(null);
  useEffect(() => {
    const m = mapRef.current;
    const zip = p.zip ?? "";
    if (!m || !mapReady || !p.sampleLoaded) return;
    if (lastFit.current === null && p.restoreInitial) {
      lastFit.current = zip;
      return;
    }
    if (!shouldFitZip(mapReady, p.sampleLoaded, zip, lastFit.current, false)) return;
    const points = (p.sample?.features ?? [])
      .filter((f) => !zip || f.properties.zipcode === zip)
      .map((f) => f.geometry.coordinates);
    const bounds = listingBounds(points);
    lastFit.current = zip;
    if (!bounds) return;
    m.fitBounds(bounds as LngLatBoundsLike, { padding: window.innerWidth < 640 ? 45 : 80, maxZoom: 14, duration: p.reducedMotion ? 0 : 700 });
  }, [mapReady, p.zip, p.sampleLoaded, p.sample, p.restoreInitial, p.reducedMotion]);

  return (
    <BaseMap
      view={p.initialView}
      label="Map of sampled Houston listings and matching search results"
      onLoad={(m) => {
        const c = onLoad(m);
        setMapReady(true);
        sync();
        return c;
      }}
      onMoveEnd={(m) => {
        const c = m.getCenter();
        handlers.current.onViewChange({ center: [c.lng, c.lat], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() });
      }}
      fallback={<MapFallback />}
    />
  );
}

/** Fly to a listing without changing zoom more than needed. */
export function flyToListing(m: MLMap, lon: number, lat: number, reduced: boolean) {
  m.easeTo({ center: [lon, lat], zoom: Math.max(m.getZoom(), 13), duration: reduced ? 0 : 600 });
}
