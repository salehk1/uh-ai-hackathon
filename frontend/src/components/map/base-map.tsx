"use client";

import { Map as MapLibreMap, setWorkerUrl, type Map as MLMap, type StyleSpecification } from "maplibre-gl";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useBrowserValue } from "@/lib/use-browser-value";

// Served from public/ (see scripts/copy-maplibre-worker.mjs); bundlers can't resolve MapLibre's own worker URL.
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
export const HOUSTON = { lon: -95.3698, lat: 29.7604 };

export type MapView = { center: [number, number]; zoom: number; pitch: number; bearing: number };

export const DEFAULT_VIEW: MapView = { center: [-95.43, 29.77], zoom: 10.2, pitch: 38, bearing: -12 };

export type MapStatus = "loading" | "ready" | "failed";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Soft 3D buildings where the vector tiles carry heights. Not a reconstruction of any specific house. */
export function addBuildingExtrusions(map: MLMap) {
  const style = map.getStyle() as StyleSpecification;
  const src = Object.entries(style.sources ?? {}).find(([, s]) => s.type === "vector")?.[0];
  if (!src || map.getLayer("hpr-buildings-3d")) return;
  // Insert above every fill/line layer (some styles, like Dark, interleave a label below the roads) and under the top labels.
  const layers = style.layers ?? [];
  let lastShape = -1;
  layers.forEach((l, i) => {
    if (l.type !== "symbol") lastShape = i;
  });
  const firstSymbol = layers.slice(lastShape + 1).find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: "hpr-buildings-3d",
      type: "fill-extrusion",
      source: src,
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 0], 0, "#4d6283", 40, "#5f7699", 150, "#7a93b8"],
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 13.8, ["coalesce", ["get", "render_height"], 0]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.95,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    firstSymbol,
  );
}

/** Shift the grey OpenFreeMap Dark base to midnight navy through its own layers (no CSS filter, so verdict colors stay exact). */
export function tintBaseStyle(map: MLMap) {
  const layers = (map.getStyle() as StyleSpecification).layers ?? [];
  const paint = (id: string, prop: Parameters<MLMap["setPaintProperty"]>[1], value: string) => map.setPaintProperty(id, prop, value);
  for (const l of layers) {
    try {
      if (l.type === "background") paint(l.id, "background-color", "#0b1426");
      else if (l.type === "fill" && /water/.test(l.id)) paint(l.id, "fill-color", "#0d2442");
      else if (l.type === "line" && /waterway|river/.test(l.id)) paint(l.id, "line-color", "#123058");
      else if (l.type === "fill" && /park|wood|grass/.test(l.id)) paint(l.id, "fill-color", "#0d2029");
      else if (l.type === "fill" && /landuse|residential|landcover|pier/.test(l.id)) paint(l.id, "fill-color", "#0e1a30");
      else if (l.type === "fill" && /building/.test(l.id)) {
        paint(l.id, "fill-color", "#13203a");
        paint(l.id, "fill-outline-color", "#1c2c48");
      } else if (l.type === "fill" && /aeroway/.test(l.id)) paint(l.id, "fill-color", "#101b30");
      else if (l.type === "line" && /dashline/.test(l.id)) paint(l.id, "line-color", "#0b1426");
      else if (l.type === "line" && /motorway_inner/.test(l.id)) paint(l.id, "line-color", "#2a5c7e");
      else if (l.type === "line" && /casing/.test(l.id)) paint(l.id, "line-color", "#2c4166");
      else if (l.type === "line" && /major_inner/.test(l.id)) paint(l.id, "line-color", "#24375a");
      else if (l.type === "line" && /highway|aeroway|road/.test(l.id)) paint(l.id, "line-color", "#1b2a46");
      else if (l.type === "line" && /railway/.test(l.id)) paint(l.id, "line-color", "#22324f");
      else if (l.type === "line" && /boundary/.test(l.id)) paint(l.id, "line-color", "#3a4d6e");
      else if (l.type === "symbol") {
        // Labels: readable but quieter than the data on top.
        const color = /water/.test(l.id) ? "#6f95c4" : /highway|road/.test(l.id) ? "#8a9bb6" : /suburb|other|village/.test(l.id) ? "#a3b3cb" : "#c9d4e6";
        paint(l.id, "text-color", color);
        paint(l.id, "text-halo-color", "rgba(9,15,31,0.9)");
      }
    } catch {
      /* layer shape differs; leave it as styled */
    }
  }
}

export function setExtrusionsVisible(map: MLMap, on: boolean) {
  if (map.getLayer("hpr-buildings-3d")) map.setLayoutProperty("hpr-buildings-3d", "visibility", on ? "visible" : "none");
}

/**
 * Owns one MapLibre instance: creation, failure detection, cleanup.
 * `onLoad` runs once the style is ready; consumers add their own sources/layers there.
 */
export function BaseMap({
  view = DEFAULT_VIEW,
  onLoad,
  onMoveEnd,
  className,
  interactive = true,
  label,
  fallback,
  children,
}: {
  view?: MapView;
  onLoad?: (map: MLMap) => void | (() => void);
  onMoveEnd?: (map: MLMap) => void;
  className?: string;
  interactive?: boolean;
  label: string;
  fallback?: ReactNode;
  children?: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const webgl = useBrowserValue(webglAvailable, true);
  const [loadStatus, setStatus] = useState<MapStatus>("loading");
  const status: MapStatus = webgl ? loadStatus : "failed";
  const onLoadRef = useRef(onLoad);
  const onMoveEndRef = useRef(onMoveEnd);
  useLayoutEffect(() => {
    onLoadRef.current = onLoad;
    onMoveEndRef.current = onMoveEnd;
  });
  const initialView = useRef(view);

  useEffect(() => {
    if (!el.current || !webgl) return;
    let m: MLMap;
    try {
      const v = initialView.current;
      m = new MapLibreMap({
        container: el.current,
        style: STYLE_URL,
        center: v.center,
        zoom: v.zoom,
        pitch: v.pitch,
        bearing: v.bearing,
        maxPitch: 60,
        interactive,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        fadeDuration: 150,
      });
    } catch {
      // WebGL context creation can still fail after the capability check (e.g. GPU blocklisted).
      const t = window.setTimeout(() => setStatus("failed"));
      return () => window.clearTimeout(t);
    }
    let cleanup: void | (() => void);
    const timer = window.setTimeout(() => {
      if (!m.isStyleLoaded()) setStatus((s) => (s === "loading" ? "failed" : s));
    }, 12_000);
    m.on("load", () => {
      window.clearTimeout(timer);
      try {
        tintBaseStyle(m);
        addBuildingExtrusions(m);
      } catch {
        /* extrusions are optional decoration */
      }
      cleanup = onLoadRef.current?.(m);
      setStatus("ready");
    });
    // The Dark style references sprite images it doesn't ship (circle-11, wood-pattern); a blank stand-in keeps the console quiet.
    m.setMissingStyleImageResolver((id) => {
      if (!m.hasImage(id)) m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    m.on("moveend", () => onMoveEndRef.current?.(m));
    m.on("error", (e) => {
      // Individual tile failures are tolerated; a failed style load is not.
      if (!m.isStyleLoaded() && (e.error as { status?: number })?.status) setStatus("failed");
    });
    const canvas = m.getCanvas();
    canvas.setAttribute("aria-label", label);
    canvas.setAttribute("role", "application");
    return () => {
      window.clearTimeout(timer);
      if (typeof cleanup === "function") cleanup();
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, webgl]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      {/* MapLibre's CSS forces position:relative on its container, so size it from an absolute wrapper. */}
      <div className="absolute inset-0">
        <div ref={el} className="h-full w-full" />
      </div>
      {status === "failed" && (
        <div className="absolute inset-0 z-10">{fallback ?? <MapFallback />}</div>
      )}
      {children}
    </div>
  );
}

/** Shown when WebGL or the tile style is unavailable. The rest of the page keeps working. */
export function MapFallback({ message = "The map couldn't load here (WebGL or map tiles unavailable). The listing list still works." }: { message?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center blueprint bg-[radial-gradient(circle_at_40%_45%,#103041_0%,#090f1f_60%)] p-6">
      <svg viewBox="0 0 200 120" className="absolute inset-0 h-full w-full opacity-40" aria-hidden preserveAspectRatio="xMidYMid slice">
        <path d="M0 70 C40 60 70 80 100 66 S160 50 200 60" stroke="#43d9e6" strokeWidth="1.2" fill="none" />
        <path d="M30 0 C40 40 60 70 50 120" stroke="#304361" strokeWidth="0.8" fill="none" />
        <path d="M120 0 C110 40 130 80 140 120" stroke="#304361" strokeWidth="0.8" fill="none" />
        <circle cx="100" cy="64" r="18" stroke="#4a6089" strokeWidth="0.6" fill="none" />
        <circle cx="100" cy="64" r="38" stroke="#304361" strokeWidth="0.6" fill="none" />
      </svg>
      <p className="relative max-w-xs rounded-[14px] border border-line bg-surface/90 px-4 py-3 text-center text-[13px] text-ink-2 shadow-sm">{message}</p>
    </div>
  );
}
