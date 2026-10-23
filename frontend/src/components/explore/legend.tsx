"use client";

import { ArrowDown, ArrowUp, Check } from "lucide-react";
import type { MapMetric } from "@/lib/api/schemas";
import { PPSF_STOPS, RESIDUAL_STOPS, VERDICT_COLOR } from "@/lib/palette";
import { Segmented } from "../ui";

export const METRIC_LABEL: Record<MapMetric, string> = {
  residual_pct: "Asking vs. estimate",
  ppsf: "Asking $/sqft",
  label: "Range verdict",
};

export function MapLegend({
  metric,
  onMetric,
  sampleCount,
  sampleZip,
  resultCount,
  sampleState,
}: {
  metric: MapMetric;
  onMetric: (m: MapMetric) => void;
  sampleCount: number | null;
  sampleZip?: string;
  resultCount: number;
  sampleState: "loading" | "error" | "ok";
}) {
  return (
    <div className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface/95 p-3 shadow-md backdrop-blur">
      <Segmented
        label="Color map points by"
        size="sm"
        value={metric}
        onChange={onMetric}
        options={[
          { value: "residual_pct", label: "vs. estimate" },
          { value: "ppsf", label: "$/sqft" },
          { value: "label", label: "Verdict" },
        ]}
      />
      <div className="mt-3">
        {metric === "label" ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
            <li className="inline-flex items-center gap-1">
              <Dot c={VERDICT_COLOR.low} /> <ArrowDown className="size-3" aria-hidden /> Below range
            </li>
            <li className="inline-flex items-center gap-1">
              <Dot c={VERDICT_COLOR.expected} /> <Check className="size-3" aria-hidden /> Within
            </li>
            <li className="inline-flex items-center gap-1">
              <Dot c={VERDICT_COLOR.high} /> <ArrowUp className="size-3" aria-hidden /> Above range
            </li>
          </ul>
        ) : (
          <Ramp
            stops={metric === "ppsf" ? PPSF_STOPS : RESIDUAL_STOPS}
            left={metric === "ppsf" ? "$100" : "−30%"}
            mid={metric === "ppsf" ? "$250" : "0%"}
            right={metric === "ppsf" ? "$500+/sqft" : "+30%"}
            caption={metric === "ppsf" ? "Asking price per sqft" : "Asking price relative to model estimate"}
          />
        )}
      </div>
      <dl className="mt-3 space-y-1 border-t border-line pt-2.5 text-[11.5px] leading-snug text-ink-3">
        <div className="flex items-start gap-2">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-mint ring-1 ring-white" aria-hidden />
          <dd>
            {sampleState === "loading"
              ? "Loading listing sample…"
              : sampleState === "error"
                ? "Listing sample unavailable"
                : `Small dots: ${sampleCount?.toLocaleString("en-US")} randomly sampled listings${sampleZip ? ` in ${sampleZip}` : ""} (up to 3,000). Not filtered by price or beds.`}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex size-3 shrink-0 items-center justify-center rounded-full border-2 border-white bg-ink/70 ring-1 ring-ink/30" aria-hidden />
          <dd>Numbered: your {resultCount} matching result{resultCount === 1 ? "" : "s"} (up to 20).</dd>
        </div>
      </dl>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block size-2.5 rounded-full" style={{ background: c }} aria-hidden />;
}

function Ramp({ stops, left, mid, right, caption }: { stops: [number, string][]; left: string; mid: string; right: string; caption: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-medium text-ink-2">{caption}</p>
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${stops.map((s) => s[1]).join(",")})` }} aria-hidden />
      <div className="tabular mt-1 flex justify-between text-[11px] text-ink-3">
        <span>{left}</span>
        <span>{mid}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
