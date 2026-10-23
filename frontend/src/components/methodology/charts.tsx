"use client";

import clsx from "clsx";
import { useState } from "react";
import type { Stats } from "@/lib/api/schemas";
import { homeTypeLabel, pctFromFraction } from "@/lib/format";
import { C } from "@/lib/palette";

const GREY = "#a9b6c4";

/** Horizontal MAPE bars, lowest first. The Zestimate is grey (a reference, not a competitor); the published row is brand. */
export function LeaderboardChart({ leaderboard, published }: { leaderboard: Stats["leaderboard"]; published: string | null }) {
  const rows = Object.entries(leaderboard)
    .map(([name, v]) => ({ name, mape: v.MAPE_zestimate_rows ?? v.MAPE ?? null }))
    .filter((r): r is { name: string; mape: number } => typeof r.mape === "number")
    .sort((a, b) => a.mape - b.mape);
  const max = Math.max(...rows.map((r) => r.mape)) * 1.08;
  return (
    <figure aria-label="Model error (MAPE) by model; the table below lists the same values.">
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const bench = /zestimate/i.test(r.name);
          const pub = r.name === published;
          return (
            <li key={r.name} className="group grid grid-cols-[minmax(0,15rem)_1fr_3.5rem] items-center gap-3" title={`${r.name}: ${r.mape.toFixed(2)}% MAPE`}>
              <span className={clsx("truncate text-[12.5px]", pub ? "font-semibold text-ink" : "text-ink-2")}>
                {r.name}
                {bench && "*"}
              </span>
              <div className="h-3 rounded-r-[4px] bg-transparent">
                <div
                  className={clsx("h-full rounded-r-[4px] transition-opacity group-hover:opacity-80", bench && "bg-[repeating-linear-gradient(135deg,#a9b6c4_0_3px,#d6dfe8_3px_6px)]")}
                  style={{ width: `${(r.mape / max) * 100}%`, background: bench ? undefined : pub ? C.brand : C.mint }}
                />
              </div>
              <span className={clsx("tabular text-right text-[12.5px]", pub ? "font-semibold text-ink" : "text-ink-2")}>{r.mape.toFixed(2)}%</span>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <Key color={C.brand} label="Published fair price" />
        <Key color={C.mint} label="Other models and ablations" />
        <Key color={GREY} label="Zestimate (reference)*" hatched />
        <span>MAPE on rows that have a Zestimate · lower is better</span>
      </figcaption>
    </figure>
  );
}

/** Paired bars per home type: raw quantile coverage vs calibrated coverage, with the 80% target line. */
export function CoverageChart({ raw, calibrated, target }: { raw: Record<string, number | null>; calibrated: Record<string, number | null>; target: number }) {
  const types = Object.keys(calibrated);
  return (
    <figure aria-label="Range coverage by home type before and after calibration.">
      <div className="space-y-4">
        {types.map((t) => (
          <div key={t}>
            <p className="mb-1.5 text-[13px] font-medium text-ink">{homeTypeLabel(t)}</p>
            {[
              { label: "Before", v: raw[t] ?? null, color: GREY },
              { label: "After", v: calibrated[t] ?? null, color: C.brand },
            ].map((b) => (
              <div key={b.label} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-3 py-0.5" title={`${homeTypeLabel(t)}, ${b.label.toLowerCase()} calibration: ${pctFromFraction(b.v)}`}>
                <span className="text-[12px] text-ink-3">{b.label}</span>
                <div className="relative h-3">
                  {b.v !== null && <div className="h-full rounded-r-[4px]" style={{ width: `${b.v * 100}%`, background: b.color }} />}
                  <div className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${target * 100}%` }} aria-hidden />
                </div>
                <span className="tabular text-right text-[12.5px] text-ink">{pctFromFraction(b.v)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <Key color={GREY} label="Raw q10–q90" />
        <Key color={C.brand} label="Calibrated" />
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-ink" aria-hidden /> {pctFromFraction(target, 0)} target
        </span>
      </figcaption>
    </figure>
  );
}

/** A single-series line with markers and a hover readout. Used for the learning curve and the tuning trials. */
export function LineChart({
  points,
  xLabel,
  yLabel,
  format,
  xFormat,
  connect = true,
  label,
}: {
  points: { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
  format: (y: number) => string;
  xFormat: (x: number) => string;
  connect?: boolean;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 220;
  const P = { l: 44, r: 14, t: 14, b: 34 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.12 || 0.5;
  const [y0, y1] = [Math.min(...ys) - pad, Math.max(...ys) + pad];
  const sx = (x: number) => P.l + ((x - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const sy = (y: number) => P.t + (1 - (y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  const best = ys.indexOf(Math.min(...ys));
  const h = hover !== null ? points[hover] : null;

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke={C.line} strokeDasharray="2 4" />
            <text x={P.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="10.5" fill={C.ink3}>
              {format(t)}
            </text>
          </g>
        ))}
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke={C.line} />
        {connect && <polyline fill="none" stroke={C.brand} strokeWidth="2" strokeLinejoin="round" points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} />}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={i === best ? 5 : 4} fill={i === best ? C.brand : connect ? C.surface : C.mint} stroke={connect || i === best ? C.brand : C.surface} strokeWidth="2" />
            <rect x={sx(p.x) - 9} y={P.t} width="18" height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {h && <line x1={sx(h.x)} x2={sx(h.x)} y1={P.t} y2={H - P.b} stroke={C.ink3} strokeWidth="1" pointerEvents="none" />}
        {(connect ? points : [points[0], points[points.length - 1]]).map((p) => (
          <text key={p.x} x={sx(p.x)} y={H - P.b + 15} textAnchor="middle" fontSize="10.5" fill={C.ink3}>
            {xFormat(p.x)}
          </text>
        ))}
        <text x={(W + P.l) / 2} y={H - 4} textAnchor="middle" fontSize="10.5" fill={C.ink3}>
          {xLabel}
        </text>
      </svg>
      {h && (
        <div
          className="tabular pointer-events-none absolute top-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink shadow-md"
          style={{ left: `${Math.min(78, (sx(h.x) / W) * 100)}%` }}
        >
          <span className="text-ink-3">{xFormat(h.x)}</span> · {yLabel} <strong className="font-semibold">{format(h.y)}</strong>
        </div>
      )}
    </figure>
  );
}

function Key({ color, label, hatched }: { color: string; label: string; hatched?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={clsx("h-2.5 w-3.5 rounded-sm", hatched && "bg-[repeating-linear-gradient(135deg,#a9b6c4_0_2px,#d6dfe8_2px_4px)]")}
        style={hatched ? undefined : { background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}
