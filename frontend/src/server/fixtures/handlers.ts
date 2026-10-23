/**
 * DEVELOPMENT FIXTURE HANDLERS — mimic api/main.py response shapes over the synthetic dataset.
 * They exist only for building the UI without the private backend; they are never used as a
 * fallback when the live backend fails.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CompareRow, PredictRequest, SearchRequest } from "@/lib/api/schemas";
import { FIXTURE_ZIPS, fixtureHomes, haversineKm, synthReceipt } from "./dataset";
import { report } from "./report";

export type FixtureResult = { status: number; body: unknown };

const ok = (body: unknown): FixtureResult => ({ status: 200, body });
const err = (status: number, detail: string): FixtureResult => ({ status, body: { detail } });

export function health(): FixtureResult {
  return ok({ ok: true, homes: fixtureHomes().length, engine: "numpy" });
}

export function home(zpid: number): FixtureResult {
  const h = fixtureHomes().find((x) => x.zpid === zpid);
  return h ? ok(h) : err(404, `zpid ${zpid} not found`);
}

export function search(s: SearchRequest): FixtureResult {
  const radius = s.radius_km ?? 5;
  const near = s.near_lat !== undefined && s.near_lon !== undefined;
  const rows = fixtureHomes()
    .map((h) => ({ h, d: near ? haversineKm(s.near_lat!, s.near_lon!, h.lat, h.lon) : null }))
    .filter(({ h, d }) => {
      if (s.max_price !== undefined && !(h.price !== null && h.price <= s.max_price)) return false;
      if (s.min_beds !== undefined && !(h.beds !== null && h.beds >= s.min_beds)) return false;
      if (s.zipcode && h.zipcode !== s.zipcode) return false;
      if (s.label && h.label !== s.label) return false;
      if (d !== null && d > radius) return false;
      return true;
    })
    .sort((a, b) => (a.h.residual_pct ?? Infinity) - (b.h.residual_pct ?? Infinity))
    .slice(0, 20)
    .map(({ h, d }) => ({
      zpid: h.zpid,
      lat: h.lat,
      lon: h.lon,
      zipcode: h.zipcode,
      home_type: h.home_type,
      price: h.price,
      pred_price: h.pred_price,
      q10_price: h.q10_price,
      q90_price: h.q90_price,
      residual_pct: h.residual_pct,
      label: h.label,
      living_area: h.living_area,
      beds: h.beds,
      baths: h.baths,
      year_built: h.year_built,
      school_mean: h.school_mean,
      ppsf: h.ppsf,
      dist_km: d === null ? null : Math.round(d * 100) / 100,
    }));
  return ok({ count: rows.length, order: "lowest asking vs fair price first", homes: rows });
}

export function map(metric: "residual_pct" | "ppsf" | "label", zip: string | null): FixtureResult {
  const rows = fixtureHomes().filter((h) => !zip || h.zipcode === zip);
  // deterministic shuffle so the "sample" isn't ZIP-ordered
  const sample = [...rows].sort((a, b) => ((a.zpid * 2654435761) % 1000) - ((b.zpid * 2654435761) % 1000)).slice(0, 3000);
  return ok({
    type: "FeatureCollection",
    metric,
    features: sample.map((h) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [h.lon, h.lat] },
      properties: {
        zpid: h.zpid,
        zipcode: h.zipcode,
        price: h.price,
        pred_price: h.pred_price,
        q10_price: h.q10_price,
        q90_price: h.q90_price,
        residual_pct: h.residual_pct,
        label: h.label,
        ppsf: h.ppsf,
        value: h[metric],
      },
    })),
  });
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
}

export function compare(zips: string[]): FixtureResult {
  const rows: CompareRow[] = [];
  for (const z of [...new Set(zips)].sort()) {
    const hs = fixtureHomes().filter((h) => h.zipcode === z);
    if (!hs.length) continue;
    const schools = hs.map((h) => h.school_mean).filter((v): v is number => v !== null);
    const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
    rows.push({
      zipcode: z,
      n: hs.length,
      median_ppsf: r1(median(hs.map((h) => h.ppsf).filter((v): v is number => v !== null))),
      median_price: (() => {
        const m = median(hs.map((h) => h.price).filter((v): v is number => v !== null));
        return m === null ? null : Math.round(m);
      })(),
      pct_high: r1((100 * hs.filter((h) => h.label === "high").length) / hs.length),
      pct_low: r1((100 * hs.filter((h) => h.label === "low").length) / hs.length),
      mean_school: schools.length ? Math.round((schools.reduce((s, v) => s + v, 0) / schools.length) * 100) / 100 : null,
    });
  }
  return ok({ zips: rows, missing: zips.filter((z) => !rows.some((r) => r.zipcode === z)) });
}

export function predict(p: PredictRequest): FixtureResult {
  let nearest = fixtureHomes()[0];
  let best = Infinity;
  for (const h of fixtureHomes()) {
    const d = haversineKm(p.lat, p.lon, h.lat, h.lon);
    if (d < best) {
      best = d;
      nearest = h;
    }
  }
  if (best > 25) return err(400, "location is outside the Houston coverage area");
  const zip = FIXTURE_ZIPS.find((z) => z.zip === nearest.zipcode)!;
  const typeAdj = p.home_type === "CONDO" ? 0.9 : p.home_type === "TOWNHOUSE" ? 0.97 : 1;
  const text = p.description?.toLowerCase() ?? "";
  const textAdj = (/renovat|remodel|updated/.test(text) ? 0.03 : 0) + (/pool/.test(text) ? 0.02 : 0) - (/as[- ]is|investor|tlc/.test(text) ? 0.05 : 0);
  const flags = 1 + (p.pool ? 0.03 : 0) + (p.renovated ? 0.04 : 0) + (p.new_construction ? 0.05 : 0) - (p.monthly_hoa ?? 0) / 20000 + textAdj;
  const age = Math.max(0, 2024 - p.year_built);
  const pred = Math.round(p.living_area * zip.ppsf * typeAdj * flags * Math.exp(-age / 400));
  const rand = (() => {
    let s = Math.round(p.lat * 1e4 + p.lon * 1e4 + p.living_area);
    return () => ((s = (s * 16807) % 2147483647) & 0xffff) / 0xffff;
  })();
  const receipt = synthReceipt({
    sqft: p.living_area,
    basePpsf: zip.ppsf,
    age,
    school: p.school_mean ?? 6,
    distDowntown: haversineKm(p.lat, p.lon, 29.7604, -95.3698),
    beds: p.beds,
    baths: p.baths,
    finalPrice: pred,
    rand,
  });
  return ok({
    pred_price: pred,
    q10_price: Math.round(pred * 0.82),
    q90_price: Math.round(pred * 1.21),
    ppsf: Math.round((pred / p.living_area) * 10) / 10,
    nearest_zpid: nearest.zpid,
    receipt,
  });
}

/**
 * Real recorded evaluation output, read as the backend does. `fixtures/results/` is a snapshot of
 * results/*.json from the `backend` branch (the newer model); refresh it when those files change.
 */
export async function stats(): Promise<FixtureResult> {
  const root = path.resolve(process.cwd(), "src", "server", "fixtures", "results");
  try {
    const out = JSON.parse(await readFile(path.join(root, "metrics.json"), "utf8"));
    try {
      const s = JSON.parse(await readFile(path.join(root, "spatial.json"), "utf8"));
      out.spatial = Object.fromEntries(
        ["engine", "moran_log_ppsf", "moran_ols_resid_insample", "moran_gwr_resid_insample", "gwr_k", "gwr_cv_rmse"].map((k) => [k, s[k]]),
      );
    } catch {
      /* spatial.json optional, as in the backend */
    }
    return ok(out);
  } catch {
    return err(500, "src/server/fixtures/results/metrics.json not found");
  }
}

/** A canned analyst that returns the backend's visual shapes so the chat UI can be exercised offline. */
export async function chat(message: string, signal: AbortSignal): Promise<FixtureResult> {
  if (process.env.FIXTURE_CHAT_FAIL === "1") return err(502, "Fixture: simulated chat provider failure");
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 1400);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
  const visuals: unknown[] = [];
  const tool_calls: { tool: string; args: Record<string, unknown> }[] = [];
  const parts: string[] = ["[Fixture analyst — canned response, no language model was called.]"];
  const zpidMatch = message.match(/\b(9\d{7}|27866230)\b/);
  const zips = [...new Set(message.match(/\b77\d{3}\b/g) ?? [])];
  const address = message.match(/\b\d{2,5}\s+[a-z][a-z ]*?\b(st|ave|ln|dr|ct|way|blvd|rd)\b/i)?.[0];

  if (/\breport\b/i.test(message) && (zpidMatch || address)) {
    const args = zpidMatch ? { zpid: Number(zpidMatch[1]) } : { address: address! };
    tool_calls.push({ tool: "report", args });
    const r = report(args);
    if (r.status === 200) {
      const b = r.body as { listing: { street_address: string }; price: { asking: number; fair: number | string; verdict: string } };
      visuals.push({ type: "report", data: r.body });
      parts.push(
        `Report for ${b.listing.street_address}: asking $${b.price.asking.toLocaleString("en-US")}, fair price ${typeof b.price.fair === "number" ? `$${b.price.fair.toLocaleString("en-US")}` : "unknown"} (verdict: ${b.price.verdict}). Listing checks and monthly costs are in the card; they're separate questions from the price.`,
      );
    } else parts.push("No listing matched that address or id in the fixture data.");
  } else if (/accura|validat|leaderboard|mape/i.test(message)) {
    const st = (await stats()).body as { leaderboard?: Record<string, { MAPE_zestimate_rows?: number }> };
    const b = st.leaderboard ?? {};
    tool_calls.push({ tool: "stats", args: {} });
    visuals.push({ type: "bar", data: { labels: Object.keys(b), series: [{ name: "MAPE %", values: Object.values(b).map((v) => v.MAPE_zestimate_rows ?? null) }] } });
    parts.push("These are the recorded evaluation results (5-fold spatial block CV). Lower MAPE is better. The Zestimate row is Zillow's own estimate, shown as a reference point; it was not produced under the same cross-validation.");
  } else if (zpidMatch) {
    const h = fixtureHomes().find((x) => x.zpid === Number(zpidMatch[1]));
    tool_calls.push({ tool: "get_home", args: { zpid: Number(zpidMatch[1]) } });
    if (h?.contributions) {
      visuals.push({ type: "receipt", data: { zpid: h.zpid, price: h.price, ...(h.contributions as object) } });
      parts.push(`Listing ${h.zpid} has a fixture estimate of $${h.pred_price?.toLocaleString("en-US")} against an asking price of $${h.price?.toLocaleString("en-US")}.`);
    } else parts.push("That listing id isn't in the fixture data, or it has no stored receipt.");
  } else if (zips.length) {
    const r = compare(zips).body as { zips: CompareRow[] };
    tool_calls.push({ tool: "compare", args: { zips: zips.join(",") } });
    visuals.push({
      type: "bar",
      data: { labels: r.zips.map((z) => z.zipcode), series: [{ name: "median $/sqft", values: r.zips.map((z) => z.median_ppsf) }] },
    });
    parts.push(`Compared ${r.zips.map((z) => z.zipcode).join(", ")} on median $/sqft using fixture data.`);
  } else {
    const s = search({ label: "low" }).body as { homes: { lat: number; lon: number; zpid: number; zipcode: string; price: number; label: string; residual_pct: number }[] };
    tool_calls.push({ tool: "search", args: { label: "low" } });
    visuals.push({
      type: "map",
      data: {
        type: "FeatureCollection",
        metric: "residual_pct",
        features: s.homes.map((h) => ({ type: "Feature", geometry: { type: "Point", coordinates: [h.lon, h.lat] }, properties: { ...h, value: h.residual_pct } })),
      },
    });
    parts.push(`Found ${s.homes.length} fixture listings below their estimated range. **Below range** is a reason to look closer, not a verified bargain.`);
  }
  return ok({ text: parts.join("\n\n"), visuals, tool_calls, mode: "fixture" });
}
