import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareResponseSchema, healthSchema, homeSchema, mapResponseSchema, predictResponseSchema, searchResponseSchema, statsSchema,
} from "@/lib/api/schemas";
import { parseReceipt, reconciles } from "@/lib/receipt";
import { publishedKey } from "@/lib/stats";
import { fixtureHomes } from "@/server/fixtures/dataset";
import * as fx from "@/server/fixtures/handlers";

describe("development fixtures mirror the backend contract", () => {
  it("every fixture response validates against the live schemas", async () => {
    expect(healthSchema.safeParse(fx.health().body).success).toBe(true);
    expect(searchResponseSchema.safeParse(fx.search({ min_beds: 3 }).body).success).toBe(true);
    expect(mapResponseSchema.safeParse(fx.map("label", null).body).success).toBe(true);
    expect(compareResponseSchema.safeParse(fx.compare(["77002", "99999"]).body).success).toBe(true);
    expect(predictResponseSchema.safeParse(fx.predict({ living_area: 2000, beds: 3, baths: 2, year_built: 2005, lat: 29.8, lon: -95.4 }).body).success).toBe(true);
    expect(statsSchema.safeParse((await fx.stats()).body).success).toBe(true);
    for (const h of fixtureHomes().slice(0, 50)) expect(homeSchema.safeParse(h).success).toBe(true);
  });
  it("labels follow q10/q90 and receipts reconcile", () => {
    for (const h of fixtureHomes()) {
      const expected = h.price! > h.q90_price! ? "high" : h.price! < h.q10_price! ? "low" : "expected";
      expect(h.label).toBe(expected);
      const r = parseReceipt(h.contributions);
      if (r.status === "ok") expect(reconciles(r.receipt)).toBe(true);
      else expect(r.status).toBe("missing");
    }
  });
  it("compare keeps missing ZIPs visible instead of zero rows", () => {
    const r = fx.compare(["77002", "99999"]).body as { zips: { zipcode: string }[]; missing: string[] };
    expect(r.zips.map((z) => z.zipcode)).toEqual(["77002"]);
    expect(r.missing).toEqual(["99999"]);
  });
  it("search is ordered by lowest residual and capped at 20", () => {
    const r = fx.search({}).body as { homes: { residual_pct: number }[] };
    expect(r.homes).toHaveLength(20);
    expect([...r.homes].sort((a, b) => a.residual_pct - b.residual_pct)).toEqual(r.homes);
  });
  it("prediction outside coverage is a 400, not a clamped success", () => {
    expect(fx.predict({ living_area: 2000, beds: 3, baths: 2, year_built: 2005, lat: 32.8, lon: -96.8 }).status).toBe(400);
  });
});

describe("committed results/metrics.json", () => {
  const metrics = statsSchema.parse(JSON.parse(readFileSync(new URL("../../results/metrics.json", import.meta.url), "utf8")));
  it("validates and resolves the published model's leaderboard row dynamically", () => {
    const key = publishedKey(metrics);
    expect(key).not.toBeNull();
    expect(metrics.leaderboard[key!].MAPE).toBeCloseTo(11.59);
    expect(metrics.leaderboard[key!].MAE).toBe(66261);
  });
});
