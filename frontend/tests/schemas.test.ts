import { describe, expect, it } from "vitest";
import { homeSchema, mapResponseSchema, predictRequestSchema, predictResponseSchema, searchRequestSchema, searchResponseSchema } from "@/lib/api/schemas";

const feature = (value: unknown) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [-95.41, 29.75] },
  properties: { zpid: 1, zipcode: "77019", price: 1, pred_price: 1, q10_price: 1, q90_price: 1, residual_pct: 0.1, label: "high", ppsf: 200.5, value },
});

describe("response contracts", () => {
  it("accepts numeric and label map values, and nulls", () => {
    for (const [metric, value] of [["residual_pct", 0.1], ["ppsf", 200.5], ["label", "high"], ["ppsf", null]] as const) {
      expect(mapResponseSchema.safeParse({ type: "FeatureCollection", metric, features: [feature(value)] }).success).toBe(true);
    }
  });
  it("rejects a malformed map feature rather than guessing", () => {
    const bad = { type: "FeatureCollection", metric: "ppsf", features: [{ ...feature(1), geometry: { type: "Point", coordinates: [-95.4] } }] };
    expect(mapResponseSchema.safeParse(bad).success).toBe(false);
  });
  it("accepts a /home row with unknown fields as null", () => {
    const home = {
      zpid: 5, lat: 29.7, lon: -95.4, zipcode: null, home_type: null, price: null, living_area: null, beds: null, baths: null,
      year_built: null, school_mean: null, pred_price: null, q10_price: null, q90_price: null, residual_pct: null, label: null,
      contributions: null, description: null, ppsf: null,
    };
    expect(homeSchema.safeParse(home).success).toBe(true);
    expect(homeSchema.safeParse({ ...home, label: "overpriced" }).success).toBe(false);
  });
  it("caps /search at 20 homes", () => {
    const h = { zpid: 1, lat: 0, lon: 0, zipcode: "77002", home_type: "CONDO", price: 1, pred_price: 1, q10_price: 1, q90_price: 1, residual_pct: 0, label: "expected", living_area: 1, beds: 1, baths: 1, year_built: 2000, school_mean: 5, ppsf: 1, dist_km: null };
    expect(searchResponseSchema.safeParse({ count: 20, order: "x", homes: Array(20).fill(h) }).success).toBe(true);
    expect(searchResponseSchema.safeParse({ count: 21, order: "x", homes: Array(21).fill(h) }).success).toBe(false);
  });
  it("keeps /predict ppsf (model) as its own field", () => {
    const r = predictResponseSchema.parse({ pred_price: 500000, q10_price: 400000, q90_price: 600000, ppsf: 250, nearest_zpid: 7, receipt: { items: [{ feature: "baseline", label: "b", usd: 500000 }], gwr_price: 500000, total: 500000 } });
    expect(r.ppsf).toBe(250);
  });
});

describe("request validation", () => {
  const ok = { living_area: 2000, beds: 3, baths: 2, year_built: 2005, lat: 29.8, lon: -95.4 };
  it("accepts the README example", () => expect(predictRequestSchema.safeParse(ok).success).toBe(true));
  it("rejects future build years beyond the 2024 model anchor", () => expect(predictRequestSchema.safeParse({ ...ok, year_built: 2030 }).success).toBe(false));
  it("rejects nonpositive area, negative rooms/fees and bad school ratings", () => {
    expect(predictRequestSchema.safeParse({ ...ok, living_area: 0 }).success).toBe(false);
    expect(predictRequestSchema.safeParse({ ...ok, beds: -1 }).success).toBe(false);
    expect(predictRequestSchema.safeParse({ ...ok, monthly_hoa: -5 }).success).toBe(false);
    expect(predictRequestSchema.safeParse({ ...ok, school_mean: 11 }).success).toBe(false);
    expect(predictRequestSchema.safeParse({ ...ok, home_type: "MANSION" }).success).toBe(false);
  });
  it("rejects unknown fields so only allowlisted fields reach the backend", () => {
    expect(predictRequestSchema.safeParse({ ...ok, asking_price: 1 }).success).toBe(false);
    expect(searchRequestSchema.safeParse({ min_price: 1 }).success).toBe(false);
  });
  it("requires latitude and longitude together for proximity search", () => {
    expect(searchRequestSchema.safeParse({ near_lat: 29.7 }).success).toBe(false);
    expect(searchRequestSchema.safeParse({ near_lat: 29.7, near_lon: -95.3, radius_km: 5 }).success).toBe(true);
  });
  it("treats ZIP as a five-digit string", () => {
    expect(searchRequestSchema.safeParse({ zipcode: "77019" }).success).toBe(true);
    expect(searchRequestSchema.safeParse({ zipcode: 77019 }).success).toBe(false);
    expect(searchRequestSchema.safeParse({ zipcode: "7701" }).success).toBe(false);
  });
});
