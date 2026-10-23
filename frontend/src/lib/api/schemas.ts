/**
 * Runtime contracts for the FastAPI backend (api/main.py at commit 2dc86a1).
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
        final_widening_log: nullableNum.optional(),
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
  tool_calls: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()) })),
  mode: z.string(),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

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
