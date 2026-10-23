/**
 * DEVELOPMENT FIXTURES — SYNTHETIC DATA. Not real listings, prices or model output.
 *
 * A deterministic, seeded dataset shaped exactly like the `homes` table so the UI can be
 * built and tested without the private backend artifacts. Values follow the backend's
 * rules (range labels from q10/q90, receipts that reconcile to the total) so the UI's
 * contract handling is exercised, but none of the numbers describe real homes.
 * Only served when DATA_SOURCE=fixtures; the UI shows a persistent banner in that mode.
 */
import type { Home, Receipt, Verdict } from "@/lib/api/schemas";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximate ZIP centroids and a synthetic base $/sqft for each (illustrative only). */
export const FIXTURE_ZIPS: { zip: string; lat: number; lon: number; ppsf: number; spread: number }[] = [
  { zip: "77002", lat: 29.756, lon: -95.365, ppsf: 285, spread: 0.012 },
  { zip: "77003", lat: 29.749, lon: -95.346, ppsf: 245, spread: 0.012 },
  { zip: "77004", lat: 29.725, lon: -95.363, ppsf: 230, spread: 0.016 },
  { zip: "77005", lat: 29.718, lon: -95.423, ppsf: 395, spread: 0.012 },
  { zip: "77006", lat: 29.741, lon: -95.39, ppsf: 330, spread: 0.01 },
  { zip: "77007", lat: 29.772, lon: -95.411, ppsf: 275, spread: 0.014 },
  { zip: "77008", lat: 29.799, lon: -95.411, ppsf: 300, spread: 0.016 },
  { zip: "77009", lat: 29.793, lon: -95.367, ppsf: 225, spread: 0.016 },
  { zip: "77019", lat: 29.752, lon: -95.412, ppsf: 420, spread: 0.01 },
  { zip: "77024", lat: 29.77, lon: -95.513, ppsf: 340, spread: 0.02 },
  { zip: "77025", lat: 29.689, lon: -95.434, ppsf: 255, spread: 0.014 },
  { zip: "77027", lat: 29.74, lon: -95.446, ppsf: 360, spread: 0.01 },
  { zip: "77030", lat: 29.704, lon: -95.401, ppsf: 310, spread: 0.01 },
  { zip: "77035", lat: 29.652, lon: -95.478, ppsf: 165, spread: 0.016 },
  { zip: "77036", lat: 29.698, lon: -95.54, ppsf: 140, spread: 0.018 },
  { zip: "77042", lat: 29.74, lon: -95.558, ppsf: 175, spread: 0.016 },
  { zip: "77043", lat: 29.805, lon: -95.561, ppsf: 190, spread: 0.016 },
  { zip: "77055", lat: 29.797, lon: -95.494, ppsf: 235, spread: 0.018 },
  { zip: "77056", lat: 29.745, lon: -95.468, ppsf: 330, spread: 0.01 },
  { zip: "77057", lat: 29.742, lon: -95.49, ppsf: 260, spread: 0.01 },
  { zip: "77063", lat: 29.734, lon: -95.522, ppsf: 180, spread: 0.014 },
  { zip: "77077", lat: 29.751, lon: -95.633, ppsf: 165, spread: 0.02 },
  { zip: "77079", lat: 29.774, lon: -95.597, ppsf: 200, spread: 0.018 },
  { zip: "77080", lat: 29.816, lon: -95.523, ppsf: 185, spread: 0.018 },
  { zip: "77084", lat: 29.825, lon: -95.66, ppsf: 130, spread: 0.024 },
  { zip: "77088", lat: 29.88, lon: -95.453, ppsf: 125, spread: 0.02 },
  { zip: "77096", lat: 29.672, lon: -95.484, ppsf: 215, spread: 0.014 },
  { zip: "77098", lat: 29.735, lon: -95.415, ppsf: 345, spread: 0.008 },
  { zip: "77339", lat: 30.05, lon: -95.19, ppsf: 145, spread: 0.03 },
  { zip: "77381", lat: 30.174, lon: -95.499, ppsf: 175, spread: 0.03 },
  { zip: "77429", lat: 29.983, lon: -95.663, ppsf: 145, spread: 0.03 },
  { zip: "77449", lat: 29.836, lon: -95.735, ppsf: 128, spread: 0.03 },
  { zip: "77479", lat: 29.577, lon: -95.635, ppsf: 170, spread: 0.03 },
  { zip: "77494", lat: 29.74, lon: -95.83, ppsf: 165, spread: 0.03 },
  { zip: "77546", lat: 29.513, lon: -95.198, ppsf: 150, spread: 0.03 },
  { zip: "77584", lat: 29.54, lon: -95.32, ppsf: 140, spread: 0.03 },
];

const DOWNTOWN = { lat: 29.7604, lon: -95.3698 };

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

const INTERVAL_LO = 0.82; // synthetic q10 / q50
const INTERVAL_HI = 1.21; // synthetic q90 / q50

/** Mirrors receipt.py: baseline + GWR-style items (LMDI split) + "other" ML adjustment, reconciled. */
export function synthReceipt(input: {
  sqft: number;
  basePpsf: number;
  age: number;
  school: number;
  distDowntown: number;
  beds: number;
  baths: number;
  finalPrice: number;
  rand: () => number;
}): Receipt {
  const { sqft, basePpsf, age, school, distDowntown, beds, baths, finalPrice, rand } = input;
  const z = {
    livingArea: (sqft - 2100) / 900,
    age: (age - 30) / 20,
    school_mean: (school - 6) / 1.6,
    dist_downtown: (distDowntown - 22) / 13,
    bedrooms: (beds - 3.4) / 0.9,
    bathrooms: (baths - 2.5) / 0.8,
  };
  const betas = {
    livingArea: -0.05 + rand() * 0.04,
    age: -0.08 + rand() * 0.06,
    school_mean: 0.03 + rand() * 0.1,
    dist_downtown: -0.12 + rand() * 0.1,
    bedrooms: -0.04 + rand() * 0.05,
    bathrooms: 0.0 + rand() * 0.06,
  };
  const labels: Record<keyof typeof z, string> = {
    livingArea: `Size (${Math.round(sqft).toLocaleString("en-US")} sqft)`,
    age: `Age (${Math.round(age)} yrs)`,
    school_mean: `Schools (avg ${school.toFixed(1)}/10)`,
    dist_downtown: `Location (${distDowntown.toFixed(1)} km to Downtown)`,
    bedrooms: `Bedrooms (${Math.round(beds)})`,
    bathrooms: `Bathrooms (${baths})`,
  };
  const keys = Object.keys(z) as (keyof typeof z)[];
  const c = keys.map((k) => betas[k] * z[k]);
  const L = c.reduce((s, v) => s + v, 0);
  const base = sqft * basePpsf;
  const gwr = sqft * basePpsf * Math.exp(L);
  const factor = Math.abs(L) > 1e-9 ? (gwr - base) / L : base;
  const items = [
    { feature: "baseline", label: `Neighborhood baseline ($${Math.round(basePpsf)}/sqft)`, usd: Math.round(base) },
    ...keys.map((k, i) => ({
      feature: k,
      label: labels[k],
      usd: Math.round(c[i] * factor),
      local_coef: Math.round(betas[k] * 1e4) / 1e4,
    })),
    {
      feature: "other",
      label: "Other features & ML adjustment (pool, lot, HOA, text flags)",
      usd: Math.round(finalPrice - gwr),
    },
  ];
  const total = Math.round(finalPrice);
  items[0].usd += total - items.reduce((s, i) => s + i.usd, 0);
  return { items, gwr_price: Math.round(gwr), total };
}

function label(price: number, q10: number, q90: number): Verdict {
  return price > q90 ? "high" : price < q10 ? "low" : "expected";
}

const ADJ = ["Updated", "Bright", "Spacious", "Well-kept", "Quiet", "Corner-lot", "Light-filled"];
const FEAT = ["open kitchen", "covered patio", "primary suite downstairs", "new roof", "fenced yard", "two-car garage"];

function build(): Home[] {
  const rand = mulberry32(20241023);
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const homes: Home[] = [];
  let zpid = 90_000_001;
  for (const z of FIXTURE_ZIPS) {
    const n = 34 + Math.floor(rand() * 22);
    for (let i = 0; i < n; i++) {
      const lat = z.lat + gauss() * z.spread;
      const lon = z.lon + gauss() * z.spread * 1.15;
      const r = rand();
      const type = z.ppsf > 280 && r < 0.3 ? "CONDO" : r < 0.22 ? "TOWNHOUSE" : r < 0.27 ? "CONDO" : "SINGLE_FAMILY";
      const sqft = Math.round(
        Math.min(7800, Math.max(520, Math.exp(Math.log(type === "CONDO" ? 1250 : type === "TOWNHOUSE" ? 1900 : 2300) + gauss() * 0.32))),
      );
      const beds = type === "CONDO" ? 1 + Math.round(rand() * 2) : Math.max(2, Math.min(6, Math.round(sqft / 650 + gauss() * 0.5)));
      const baths = Math.max(1, Math.round((beds * 0.8 + gauss() * 0.4) * 2) / 2);
      const yearBuilt = Math.round(Math.min(2024, Math.max(1925, 1985 + gauss() * 22)));
      const school = Math.round(Math.min(9.6, Math.max(2.2, 5.8 + (z.ppsf - 220) / 90 + gauss() * 0.9)) * 10) / 10;
      const dist = haversineKm(lat, lon, DOWNTOWN.lat, DOWNTOWN.lon);
      const typeAdj = type === "CONDO" ? 0.9 : type === "TOWNHOUSE" ? 0.97 : 1;
      const pred = Math.round(sqft * z.ppsf * typeAdj * Math.exp(gauss() * 0.08));
      const q10 = Math.round(pred * INTERVAL_LO);
      const q90 = Math.round(pred * INTERVAL_HI);
      const price = Math.round((pred * Math.exp(gauss() * 0.15)) / 1000) * 1000;
      const basePpsf = z.ppsf * (0.92 + rand() * 0.16);
      const receipt = synthReceipt({
        sqft,
        basePpsf,
        age: 2024 - yearBuilt,
        school,
        distDowntown: dist,
        beds,
        baths,
        finalPrice: pred,
        rand,
      });
      const idx = homes.length;
      homes.push({
        zpid: zpid++,
        lat: Math.round(lat * 1e6) / 1e6,
        lon: Math.round(lon * 1e6) / 1e6,
        zipcode: z.zip,
        home_type: type,
        price,
        living_area: sqft,
        beds,
        baths,
        // A few deliberate unknowns so null handling is always exercised.
        year_built: idx % 97 === 5 ? null : yearBuilt,
        school_mean: idx % 61 === 7 ? null : school,
        pred_price: pred,
        q10_price: q10,
        q90_price: q90,
        residual_pct: (price - pred) / pred,
        label: label(price, q10, q90),
        contributions: idx % 211 === 13 ? null : receipt,
        description:
          idx % 37 === 3
            ? null
            : `[Synthetic fixture text] ${ADJ[idx % ADJ.length]} ${type === "CONDO" ? "condo" : type === "TOWNHOUSE" ? "townhome" : "home"} with ${beds} bedrooms, ${FEAT[idx % FEAT.length]} and ${FEAT[(idx + 2) % FEAT.length]}. This paragraph stands in for the listing description stored in the homes table.`,
        ppsf: Math.round((price / sqft) * 10) / 10,
      });
    }
  }
  return homes;
}

let cache: Home[] | null = null;
export function fixtureHomes(): Home[] {
  return (cache ??= build());
}
