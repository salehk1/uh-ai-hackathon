import { describe, expect, it } from "vitest";
import type { Receipt } from "@/lib/api/schemas";
import { itemSum, parseReceipt, reconciles, waterfall } from "@/lib/receipt";

// Shape produced by receipt.py: baseline, six GWR items (some negative), "other" ML adjustment.
const R: Receipt = {
  items: [
    { feature: "baseline", label: "Neighborhood baseline ($262/sqft)", usd: 738674 },
    { feature: "livingArea", label: "Size (2,820 sqft)", usd: -16420, local_coef: -0.025 },
    { feature: "age", label: "Age (7 yrs)", usd: 58264, local_coef: -0.06 },
    { feature: "school_mean", label: "Schools (avg 5.9/10)", usd: -2329, local_coef: 0.044 },
    { feature: "dist_downtown", label: "Location (4.5 km to Downtown)", usd: 94000, local_coef: -0.1 },
    { feature: "bedrooms", label: "Bedrooms (4)", usd: -15000, local_coef: -0.02 },
    { feature: "bathrooms", label: "Bathrooms (4)", usd: 88000, local_coef: 0.03 },
    { feature: "other", label: "Other features & ML adjustment (pool, lot, HOA, text flags)", usd: -230164 },
  ],
  gwr_price: 945189,
  total: 715025,
};

describe("receipt", () => {
  it("reconciles exactly, including negative lines and the ML adjustment", () => {
    expect(itemSum(R.items)).toBe(715025);
    expect(reconciles(R)).toBe(true);
  });
  it("flags a receipt whose items don't sum to the total", () => {
    expect(reconciles({ ...R, total: 700000 })).toBe(false);
  });
  it("builds a waterfall whose last running value equals the total", () => {
    const steps = waterfall(R);
    expect(steps[0]).toMatchObject({ kind: "baseline", start: 0, end: 738674 });
    expect(steps.find((s) => s.key.startsWith("livingArea"))).toMatchObject({ start: 738674, end: 722254 });
    expect(steps.at(-2)).toMatchObject({ kind: "adjustment", end: 715025 });
    expect(steps.at(-1)).toMatchObject({ kind: "total", start: 0, end: 715025 });
  });
  it("parses valid, missing, stringified and malformed stored receipts explicitly", () => {
    expect(parseReceipt(R).status).toBe("ok");
    expect(parseReceipt(JSON.stringify(R)).status).toBe("ok");
    expect(parseReceipt(null).status).toBe("missing");
    const bad = parseReceipt({ items: [{ feature: "baseline", label: "x", usd: "12" }], gwr_price: 1, total: 1 });
    expect(bad.status).toBe("invalid");
    expect(parseReceipt({ items: [], gwr_price: 1, total: 1 }).status).toBe("invalid");
  });
});
