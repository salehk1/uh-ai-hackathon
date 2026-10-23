import { describe, expect, it } from "vitest";
import { fitRequestSchema } from "@/lib/api/fit";
import { report } from "@/server/fixtures/report";
import { reportSchema } from "@/lib/api/schemas";

describe("selected recommendation contract", () => {
  it("accepts explicit constraints and disables stretch by default", () => {
    const p = fitRequestSchema.parse({ max_price: 350000, zipcodes: ["77407"], priorities: ["schools"] });
    expect(p.stretch_percent).toBe(0);
    expect(p.zipcodes).toEqual(["77407"]);
  });
  it("rejects bad budgets, priorities, ZIP types and excessive stretch", () => {
    for (const p of [{max_price:-1}, {max_price:100000,priorities:[]}, {max_price:100000,zipcodes:[77407]}, {max_price:100000,stretch_percent:21}]) {
      expect(fitRequestSchema.safeParse(p).success).toBe(false);
    }
  });
  it("keeps low prices separate from independent listing checks in fixture mode too", () => {
    const base = reportSchema.parse(report({zpid:27866230}).body);
    const offer = reportSchema.parse(report({zpid:27866230,asking_price:1}).body);
    expect(base.verification.signals.some((s) => s.name === "asking_far_below_range")).toBe(false);
    expect(offer.verification.signals).toEqual(base.verification.signals);
  });
});
