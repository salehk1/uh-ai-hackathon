/**
 * Runtime contracts for the FastAPI backend (api/main.py on `backend`; /report per docs/REPORT_SCHEMA.json).
 * Response schemas validate what the browser receives; request schemas are shared by
 * the UI forms and the Next.js adapter so only known, sane fields are forwarded.
 */
import { z } from "zod";

const num = z.number().finite();
const nullableNum = num.nullable();

export const VERDICTS = ["high", "low", "expected"] as const;
export const verdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof verdictSchema>;

export const HOME_TYPES = ["SINGLE_FAMILY", "TOWNHOUSE", "CONDO"] as const;
export type HomeType = (typeof HOME_TYPES)[number];

export const MAP_METRICS = ["residual_pct", "ppsf", "label"] as const;
export const mapMetricSchema = z.enum(MAP_METRICS);
export type MapMetric = z.infer<typeof mapMetricSchema>;

// ---------------------------------------------------------------- shared response pieces
export const receiptItemSchema = z.object({
  feature: z.string(),
  label: z.string(),
  usd: num,
  local_coef: num.optional(),
});
export type ReceiptItem = z.infer<typeof receiptItemSchema>;

export const receiptSchema = z.object({
  items: z.array(receiptItemSchema).min(1),
  gwr_price: num,
  total: num,
});
export type Receipt = z.infer<typeof receiptSchema>;

export const healthSchema = z.object({
  ok: z.boolean(),
  homes: z.number().int().nonnegative(),
  engine: z.enum(["q", "numpy"]),
});
export type Health = z.infer<typeof healthSchema>;

/** /home/{zpid}. `contributions` is validated separately so a bad receipt is reported, not hidden. */
export const homeSchema = z.object({
  zpid: z.number().int(),
  lat: num,
  lon: num,
  zipcode: z.string().nullable(),
  home_type: z.string().nullable(),
  price: nullableNum,
  living_area: nullableNum,
  beds: nullableNum,
  baths: nullableNum,
  year_built: nullableNum,
  school_mean: nullableNum,
  pred_price: nullableNum,
  q10_price: nullableNum,
  q90_price: nullableNum,
  residual_pct: nullableNum,
  label: verdictSchema.nullable(),
  contributions: z.unknown(),
  description: z.string().nullable(),
  ppsf: nullableNum,
});
export type Home = z.infer<typeof homeSchema>;

export const searchHomeSchema = z.object({
  zpid: z.number().int(),
  lat: num,
  lon: num,
  zipcode: z.string().nullable(),
  home_type: z.string().nullable(),
  price: nullableNum,
  pred_price: nullableNum,
  q10_price: nullableNum,
  q90_price: nullableNum,
  residual_pct: nullableNum,
  label: verdictSchema.nullable(),
  living_area: nullableNum,
  beds: nullableNum,
  baths: nullableNum,
  year_built: nullableNum,
  school_mean: nullableNum,
  ppsf: nullableNum,
  dist_km: nullableNum,
});
export type SearchHome = z.infer<typeof searchHomeSchema>;

export const searchResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  order: z.string(),
  homes: z.array(searchHomeSchema).max(20),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const mapPropertiesSchema = z.object({
  zpid: z.number().int(),
  zipcode: z.string().nullable(),
  price: nullableNum,
  pred_price: nullableNum,
  q10_price: nullableNum,
  q90_price: nullableNum,
  residual_pct: nullableNum,
  label: verdictSchema.nullable(),
  ppsf: nullableNum,
  // string in label mode, number otherwise
  value: z.union([num, verdictSchema]).nullable(),
});
export type MapProperties = z.infer<typeof mapPropertiesSchema>;

export const mapFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([num, num]), // [lon, lat]
  }),
  properties: mapPropertiesSchema,
});
export type MapFeature = z.infer<typeof mapFeatureSchema>;

export const mapResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  metric: mapMetricSchema,
  features: z.array(mapFeatureSchema),
});
export type MapResponse = z.infer<typeof mapResponseSchema>;

export const compareRowSchema = z.object({
  zipcode: z.string(),
  n: z.number().int().nonnegative(),
  median_ppsf: nullableNum,
  median_price: nullableNum,
  pct_high: nullableNum, // already a percentage number (12.3 = 12.3%)
  pct_low: nullableNum,
  mean_school: nullableNum,
});
export type CompareRow = z.infer<typeof compareRowSchema>;

export const compareResponseSchema = z.object({
  zips: z.array(compareRowSchema),
  missing: z.array(z.string()),
});
export type CompareResponse = z.infer<typeof compareResponseSchema>;

export const predictResponseSchema = z.object({
  pred_price: num,
  q10_price: num,
  q90_price: num,
  ppsf: num, // MODEL price per sqft (not asking)
  nearest_zpid: z.number().int(),
  receipt: receiptSchema,
});
export type PredictResponse = z.infer<typeof predictResponseSchema>;

const leaderboardEntrySchema = z
  .object({
    MAE: nullableNum.optional(),
    MAPE: nullableNum.optional(), // percentage number
    R2: nullableNum.optional(), // fraction
    MAPE_zestimate_rows: nullableNum.optional(),
    moran_resid_oof: nullableNum.optional(),
  })
  .passthrough();

export const statsSchema = z
  .object({
    n: z.number().int(),
    n_zestimate: z.number().int().optional(),
    cv: z.unknown().optional(),
    best_model: z.string(),
    published_model: z.string(),
    gwr_k: z.number().optional(),
    config: z.unknown().optional(),
    intervals: z
      .object({
        target: num,
        coverage_raw_q10_q90: nullableNum.optional(),
        coverage_calibrated: nullableNum.optional(),
        coverage_calibrated_by_home_type: z.record(z.string(), nullableNum).optional(),
        calibration: z.string().optional(),
        coverage_raw_by_home_type: z.record(z.string(), nullableNum).optional(),
        final_widening_log: z.unknown().optional(), // number (older model) or { home_type: log widening }
        median_width_pct: nullableNum.optional(),
        verdict_counts: z.record(z.string(), z.number()).optional(),
      })
      .passthrough(),
    leaderboard: z.record(z.string(), leaderboardEntrySchema),
    spatial: z
      .object({
        engine: z.string().optional(),
        moran_log_ppsf: z.unknown().optional(),
        moran_ols_resid_insample: z.unknown().optional(),
        moran_gwr_resid_insample: z.unknown().optional(),
        gwr_k: z.number().optional(),
        gwr_cv_rmse: z.unknown().optional(), // { "50": rmse, "100": rmse, ... } by bandwidth
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type Stats = z.infer<typeof statsSchema>;

export const chatResponseSchema = z.object({
  text: z.string(),
  visuals: z.array(z.unknown()),
  tool_calls: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()).default({}) })),
  mode: z.string(),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

// ---------------------------------------------------------------- /report (due-diligence report)
/** Several fields are the literal string "unknown" instead of a number. That is an answer, not a gap. */
export const UNKNOWN = "unknown" as const;
const orUnknown = z.union([num, z.literal(UNKNOWN)]);
export type OrUnknown = z.infer<typeof orUnknown>;

export const REPORT_VERDICTS = ["high", "expected", "low", "unknown"] as const;
export type ReportVerdict = (typeof REPORT_VERDICTS)[number];

const optNum = num.nullish();
const optStr = z.string().nullish();

export const reportListingSchema = z
  .object({
    zpid: z.number().int(),
    street_address: optStr,
    city: optStr,
    state: optStr,
    zipcode: optStr,
    home_type: optStr,
    beds: optNum,
    baths: optNum,
    living_area: optNum,
    year_built: optNum,
    lot_acres: optNum,
    lat: optNum,
    lon: optNum,
    days_on_zillow: optNum,
    page_views: optNum,
    favorites: optNum,
    agent_name: optStr,
    broker_name: optStr,
    mls_id: optStr,
    photo_count: optNum,
    date_posted: optStr,
    hdp_url: optStr,
    list_price: optNum,
  })
  .passthrough();
export type ReportListing = z.infer<typeof reportListingSchema>;

export const reportReceiptItemSchema = z.object({
  feature: z.string(),
  label: z.string().optional(),
  usd: num,
  pct: num,
});

export const compSchema = z.object({
  zpid: z.number().int(),
  price: num,
  ppsf: num,
  dist_km: num,
  beds: nullableNum,
  baths: nullableNum,
  sqft: num,
  home_type: z.string().optional(),
  lat: num.optional(),
  lon: num.optional(),
});
export type Comp = z.infer<typeof compSchema>;

export const SIGNAL_NAMES = [
  "asking_far_below_range",
  "duplicate_photos",
  "duplicate_description",
  "agent_broker_attribution",
  "size_vs_comps",
  "engagement_anomaly",
  "address_disclosure",
] as const;

export const signalSchema = z.object({
  name: z.string(), // known names in SIGNAL_NAMES; unknown names still render with their raw id
  status: z.enum(["ok", "warning", "unknown"]),
  evidence: z.string(),
  related_zpids: z.array(z.number().int()).optional(),
});
export type Signal = z.infer<typeof signalSchema>;
export type SignalStatus = Signal["status"];

/** One of the listing's own photos, as scraped (Zillow CDN). `thumb_url` ~800px wide; `full_url` the largest copy. */
const PHOTO_HOSTS = ["photos.zillowstatic.com"];
const photoUrl = z
  .string()
  .url()
  .refine((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && PHOTO_HOSTS.includes(x.hostname);
    } catch {
      return false;
    }
  }, "Unexpected photo host");
export const listingPhotoSchema = z.object({
  thumb_url: photoUrl,
  full_url: photoUrl,
  full_width: num.optional(),
  caption: z.string().nullish(),
});
export type ListingPhoto = z.infer<typeof listingPhotoSchema>;

export const reportSchema = z.object({
  listing: reportListingSchema,
  price: z.object({
    asking: num,
    fair: orUnknown,
    q10: orUnknown,
    q90: orUnknown,
    verdict: z.enum(REPORT_VERDICTS),
    asking_vs_fair_pct: num.optional(), // already a percentage (-47.6 = 47.6% below)
    range_coverage: num.optional(), // fraction, a property of the model
    reason: z.string().optional(),
    receipt: z.array(reportReceiptItemSchema),
    comps: z.array(compSchema).max(8),
    comps_rule: z.string().nullish(),
  }),
  verification: z.object({ signals: z.array(signalSchema) }),
  costs: z.object({
    monthly: z.object({
      mortgage: num,
      tax: orUnknown,
      hoa: orUnknown,
      insurance: orUnknown,
      total_known: num,
    }),
    assumptions: z.array(z.string()).default([]),
    unknowns: z.array(z.string()).default([]),
  }),
  sources: z.array(z.object({ name: z.string(), detail: z.string().optional(), license: z.string().optional() })),
  limitations: z.array(z.string()),
  address_matches: z.array(z.object({ zpid: z.number().int(), address: z.string() })).optional(),
  // Additive: older backends omit it. Invalid entries are dropped rather than failing the whole report.
  photos: z
    .array(z.unknown())
    .optional()
    .transform((xs) => (xs ?? []).flatMap((x) => {
      const p = listingPhotoSchema.safeParse(x);
      return p.success ? [p.data] : [];
    })),
});
export type Report = z.infer<typeof reportSchema>;

// ---------------------------------------------------------------- requests (UI + adapter)
const zip = z.string().regex(/^\d{5}$/, "ZIP codes have five digits");
const lat = num.min(-90).max(90);
const lon = num.min(-180).max(180);

export const searchRequestSchema = z
  .object({
    max_price: num.positive().max(100_000_000).optional(),
    min_beds: num.min(0).max(20).optional(),
    zipcode: zip.optional(),
    near_lat: lat.optional(),
    near_lon: lon.optional(),
    radius_km: num.positive().max(100).optional(),
    label: verdictSchema.optional(),
  })
  .strict()
  .refine((s) => (s.near_lat === undefined) === (s.near_lon === undefined), {
    message: "Latitude and longitude must be provided together",
    path: ["near_lat"],
  });
export type SearchRequest = z.infer<typeof searchRequestSchema>;

/** The model is anchored to 2024 listings; later build years are out of scope. */
export const MODEL_YEAR = 2024;

export const predictRequestSchema = z
  .object({
    living_area: num.positive("Living area must be positive").max(30_000, "Living area looks too large"),
    beds: num.min(0, "Beds can't be negative").max(20),
    baths: num.min(0, "Baths can't be negative").max(20),
    year_built: num
      .int("Use a whole year")
      .min(1850, "Year looks too early")
      .max(MODEL_YEAR, `The model covers homes built up to ${MODEL_YEAR}`),
    lat,
    lon,
    home_type: z.enum(HOME_TYPES).optional(),
    lot_size_acres: num.positive().max(1000).optional(),
    monthly_hoa: num.min(0, "HOA can't be negative").max(20_000).optional(),
    school_mean: num.min(0, "Use 0–10").max(10, "Use 0–10").optional(),
    pool: z.boolean().optional(),
    renovated: z.boolean().optional(),
    new_construction: z.boolean().optional(),
    no_flood: z.boolean().optional(),
    garage: z.boolean().optional(),
    acreage: z.boolean().optional(),
    description: z.string().max(4000).optional(),
  })
  .strict();
export type PredictRequest = z.infer<typeof predictRequestSchema>;

export const reportRequestSchema = z
  .object({
    zpid: z.number().int().positive().optional(),
    address: z.string().trim().min(3, "Enter a street address").max(200).optional(),
    asking_price: num.positive("Offer must be positive").max(100_000_000).optional(),
  })
  .strict()
  .refine((r) => r.zpid !== undefined || r.address !== undefined, { message: "Enter an address or zpid", path: ["address"] });
export type ReportRequest = z.infer<typeof reportRequestSchema>;

export const compareRequestSchema = z.array(zip).min(1).max(8);

export const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
      .max(10)
      .optional(),
    mode: z.enum(["auto", "json"]).optional(),
  })
  .strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;
