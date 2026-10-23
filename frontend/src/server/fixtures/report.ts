/**
 * DEVELOPMENT FIXTURE for POST /report.
 *
 * Two kinds of placeholder reports:
 *  - `sample-report.json` is the sample response published with the backend contract
 *    (docs/REPORT_SCHEMA.json on `backend`), served verbatim for zpid 27866230 / "932 Bennington St".
 *  - every synthetic fixture home gets a report built from the synthetic dataset. Street names
 *    are deliberately placeholder ("Fixture St", "Sample Ave"), and there is no Zillow link.
 * Never used as a fallback for live failures.
 */
import type { Comp, Home, Report, ReportRequest, Signal } from "@/lib/api/schemas";
import { fixtureHomes, haversineKm } from "./dataset";
import sample from "./sample-report.json";

const SAMPLE = sample as unknown as Report;
const SAMPLE_RATE = 6.621;
const SAMPLE_TAX = 1.6;

const STREETS = ["Fixture St", "Sample Ave", "Placeholder Ln", "Example Dr", "Demo Ct", "Mockup Way", "Prototype Blvd"];
const OUT_OF_SCOPE = (idx: number) => idx % 53 === 11;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function monthlyPI(loan: number, ratePct: number) {
  const r = ratePct / 100 / 12;
  return (loan * r) / (1 - (1 + r) ** -360);
}

function costs(asking: number, ratePct: number, taxPct: number, hoa: number | "unknown", unknowns: string[]): Report["costs"] {
  const down = asking * 0.2;
  const mortgage = r2(monthlyPI(asking - down, ratePct));
  const tax = r2((asking * taxPct) / 100 / 12);
  const known = [mortgage, tax, typeof hoa === "number" ? hoa : 0];
  return {
    monthly: { mortgage, tax, hoa, insurance: "unknown", total_known: r2(known.reduce((s, v) => s + v, 0)) },
    assumptions: [
      `30-yr fixed rate ${ratePct}% (rate shown on the listing).`,
      `20% down (${usd(down)}); loan ${usd(asking - down)}; principal and interest only; no PMI at 20% down.`,
      `Property tax = ${taxPct.toFixed(2)}% x asking price / 12. Actual tax uses the appraised value, and rates change yearly.`,
    ],
    unknowns,
  };
}

/** Recompute everything that depends on the asking price, as the backend does for `asking_price`. */
function withAsking(rep: Report, asking: number, rate: number, taxPct: number): Report {
  const p = rep.price;
  const priced = typeof p.fair === "number" && typeof p.q10 === "number" && typeof p.q90 === "number";
  const verdict = !priced ? "unknown" : asking > (p.q90 as number) ? "high" : asking < (p.q10 as number) ? "low" : "expected";
  return {
    ...rep,
    price: {
      ...p,
      asking,
      verdict,
      ...(typeof p.fair === "number" ? { asking_vs_fair_pct: r1(((asking - p.fair) / p.fair) * 100) } : {}),
    },
    verification: {
      signals: rep.verification.signals.filter((s) => s.name !== "asking_far_below_range"),
    },
    costs: costs(asking, rate, taxPct, rep.costs.monthly.hoa, rep.costs.unknowns),
  };
}

function comps(h: Home): Comp[] {
  return fixtureHomes()
    .filter(
      (o) =>
        o.zpid !== h.zpid &&
        o.home_type === h.home_type &&
        o.price !== null &&
        o.living_area !== null &&
        h.living_area !== null &&
        Math.abs((o.beds ?? 0) - (h.beds ?? 0)) <= 1 &&
        Math.abs(o.living_area - h.living_area) <= 0.3 * h.living_area,
    )
    .map((o) => ({ o, d: haversineKm(h.lat, h.lon, o.lat, o.lon) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8)
    .map(({ o, d }) => ({
      zpid: o.zpid,
      price: o.price!,
      ppsf: o.ppsf ?? r1(o.price! / o.living_area!),
      dist_km: r2(d),
      beds: o.beds,
      baths: o.baths,
      sqft: o.living_area!,
      home_type: o.home_type ?? undefined,
      lat: o.lat,
      lon: o.lon,
    }));
}

function synthetic(h: Home, idx: number): { report: Report; rate: number; tax: number } {
  const scope = !OUT_OF_SCOPE(idx);
  const fair = scope && h.pred_price !== null ? h.pred_price : "unknown";
  const q10 = scope && h.q10_price !== null ? h.q10_price : "unknown";
  const q90 = scope && h.q90_price !== null ? h.q90_price : "unknown";
  const asking = h.price ?? 0;
  const contributions = h.contributions as { items: { feature: string; label: string; usd: number }[] } | null;
  const receipt =
    typeof fair === "number" && contributions
      ? contributions.items.map((i) => ({ feature: i.feature, label: i.label, usd: i.usd, pct: r1((i.usd / fair) * 100) }))
      : [];
  const cs = scope ? comps(h) : [];
  const nearbySqft = cs.map((c) => c.sqft).sort((a, b) => a - b);
  const medSqft = nearbySqft.length ? nearbySqft[Math.floor(nearbySqft.length / 2)] : null;
  const ratio = medSqft && h.living_area ? h.living_area / medSqft : null;
  const days = 3 + ((idx * 37) % 240);
  const views = 40 + ((idx * 131) % 900);
  const saves = (idx * 7) % 40;
  const hasMls = idx % 19 !== 4;
  const dupPhotos = idx % 41 === 2;
  const type = scope ? h.home_type : "MULTI_FAMILY";

  const signals: Signal[] = [
    dupPhotos
      ? {
          name: "duplicate_photos",
          status: "warning",
          evidence: "2 photos also appear on a listing from a different broker (fixture example).",
          related_zpids: cs.slice(0, 1).map((c) => c.zpid),
        }
      : { name: "duplicate_photos", status: "ok", evidence: "No photo is reused by a listing from a different broker.", related_zpids: [] },
    h.description
      ? { name: "duplicate_description", status: "ok", evidence: "Description is not copied by any listing from a different broker.", related_zpids: [] }
      : { name: "duplicate_description", status: "unknown", evidence: "No description text in the listing, so it can't be checked for copies." },
    hasMls
      ? {
          name: "agent_broker_attribution",
          status: "ok",
          evidence: `Agent Fixture Agent, broker Sample Realty, MLS #${String(9000000 + idx)}. Verify the license at trec.texas.gov.`,
        }
      : { name: "agent_broker_attribution", status: "unknown", evidence: "The listing names no agent, broker or MLS number." },
    ratio === null
      ? { name: "size_vs_comps", status: "unknown", evidence: "Too few comparable homes nearby to compare size." }
      : {
          name: "size_vs_comps",
          status: ratio > 1.8 || ratio < 0.55 ? "warning" : "ok",
          evidence: `${Math.round(h.living_area!).toLocaleString("en-US")} sqft vs median ${medSqft!.toLocaleString("en-US")} sqft for ${cs.length} nearby similar homes (${ratio.toFixed(2)}x).`,
        },
    idx % 67 === 9
      ? {
          name: "engagement_anomaly",
          status: "warning",
          evidence: `${days} days on Zillow, ${views * 6} views, 0 saves (views far above saves for its home type).`,
        }
      : {
          name: "engagement_anomaly",
          status: "ok",
          evidence: `${days} days on Zillow, ${views} views, ${saves} saves (within the normal range for its home type).`,
        },
  ];
  if (idx % 29 === 4) {
    signals.push({ name: "address_disclosure", status: "warning", evidence: "The street number is withheld in the listing." });
  }

  const hoa: number | "unknown" =
    h.home_type === "CONDO" ? 320 + (idx % 9) * 40 : h.home_type === "TOWNHOUSE" ? 140 + (idx % 6) * 30 : idx % 3 === 0 ? 45 + (idx % 5) * 10 : "unknown";
  const rate = 6.5 + (idx % 5) * 0.06;
  const tax = 1.8 + (idx % 8) * 0.1;
  const unknowns = [
    ...(hoa === "unknown" ? ["HOA fee not disclosed in the listing (absence does not mean $0)."] : []),
    "Homeowners insurance: no quote.",
    "Flood insurance: depends on FEMA zone and elevation, check before buying in Houston.",
    "MUD/PID district taxes may not be included in the listed tax rate.",
    "Utilities, maintenance and closing costs are not included.",
  ];
  const street = `${100 + ((h.zpid * 7) % 8900)} ${STREETS[h.zpid % STREETS.length]}`;

  const report: Report = {
    listing: {
      zpid: h.zpid,
      street_address: street,
      city: "Houston",
      state: "TX",
      zipcode: h.zipcode,
      home_type: type,
      beds: h.beds,
      baths: h.baths,
      living_area: h.living_area,
      year_built: h.year_built,
      lot_acres: h.home_type === "CONDO" ? null : r2(0.1 + (idx % 10) * 0.03),
      lat: h.lat,
      lon: h.lon,
      days_on_zillow: days,
      page_views: views,
      favorites: saves,
      agent_name: hasMls ? "Fixture Agent" : null,
      broker_name: hasMls ? "Sample Realty" : null,
      mls_id: hasMls ? String(9000000 + idx) : null,
      photo_count: 8 + (idx % 30),
      date_posted: null,
      hdp_url: null,
      list_price: asking,
    },
    price: {
      asking,
      fair,
      q10,
      q90,
      verdict: !scope ? "unknown" : (h.label ?? "unknown"),
      ...(typeof fair === "number" ? { asking_vs_fair_pct: r1(((asking - fair) / fair) * 100), range_coverage: 0.7998 } : {}),
      ...(!scope ? { reason: "Multi-family listings are outside the model's scope (it covers single-family homes, townhouses and condos)." } : {}),
      receipt,
      comps: cs,
      comps_rule: cs.length ? "same type, beds ±1, sqft ±30%" : null,
    },
    verification: { signals },
    costs: costs(asking, r2(rate), tax, hoa, unknowns),
    sources: [
      { name: "Fixture listing", detail: "Synthetic development data shaped like the Zillow snapshot. Not a real listing." },
      ...SAMPLE.sources.slice(1),
    ],
    limitations: SAMPLE.limitations,
    photos: [], // synthetic listings have no photos; the page shows the labelled illustration
  };
  return { report, rate: r2(rate), tax };
}

function byZpid(zpid: number): { report: Report; rate: number; tax: number } | null {
  if (zpid === SAMPLE.listing.zpid) return { report: SAMPLE, rate: SAMPLE_RATE, tax: SAMPLE_TAX };
  const homes = fixtureHomes();
  const idx = homes.findIndex((h) => h.zpid === zpid);
  return idx < 0 ? null : synthetic(homes[idx], idx);
}

export function report(req: ReportRequest): { status: number; body: unknown } {
  let found: ReturnType<typeof byZpid> = null;
  let matches: { zpid: number; address: string }[] = [];
  if (req.zpid !== undefined) {
    found = byZpid(req.zpid);
  } else if (req.address) {
    const street = req.address.split(",")[0].trim().toLowerCase();
    const all = [
      { zpid: SAMPLE.listing.zpid, address: `${SAMPLE.listing.street_address}, ${SAMPLE.listing.city} ${SAMPLE.listing.zipcode}` },
      ...fixtureHomes().map((h) => ({
        zpid: h.zpid,
        address: `${100 + ((h.zpid * 7) % 8900)} ${STREETS[h.zpid % STREETS.length]}, Houston ${h.zipcode}`,
      })),
    ];
    matches = all
      .filter((a) => a.address.split(",")[0].toLowerCase().includes(street))
      .sort((a, b) => a.address.length - b.address.length)
      .slice(0, 5);
    if (matches.length) found = byZpid(matches[0].zpid);
  }
  if (!found) return { status: 404, body: { detail: "listing not found" } };
  const result = req.asking_price !== undefined ? withAsking(found.report, req.asking_price, found.rate, found.tax) : found.report;
  const out = { ...result, verification: { signals: result.verification.signals.filter((s) => s.name !== "asking_far_below_range") } };
  return { status: 200, body: matches.length > 1 ? { ...out, address_matches: matches } : out };
}
