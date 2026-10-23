import { describe, expect, it } from "vitest";
import { reportRequestSchema, reportSchema, type Report } from "@/lib/api/schemas";
import { normalizeVisual } from "@/lib/chat";
import { costUnknownReason, reportReceipt, vsFairSentence, warnings } from "@/lib/report";
import { reconciles } from "@/lib/receipt";
import { fixtureHomes } from "@/server/fixtures/dataset";
import { report } from "@/server/fixtures/report";
import sample from "@/server/fixtures/sample-report.json";

const parse = (body: unknown) => reportSchema.parse(body);

describe("/report contract", () => {
  it("the contract's sample response validates", () => {
    const r = parse(sample);
    expect(r.price.verdict).toBe("low");
    expect(r.costs.monthly.hoa).toBe("unknown");
  });

  it("the receipt sums exactly to the fair price", () => {
    const rc = reportReceipt(parse(sample).price)!;
    expect(reconciles(rc)).toBe(true);
    expect(rc.total).toBe(572314);
  });

  it("every synthetic fixture report validates and keeps its rules", () => {
    for (const h of fixtureHomes().slice(0, 300)) {
      const r = parse(report({ zpid: h.zpid }).body);
      const p = r.price;
      if (p.verdict === "unknown") {
        expect(p.fair).toBe("unknown");
        expect(p.reason).toBeTruthy();
      } else if (typeof p.q10 === "number" && typeof p.q90 === "number") {
        expect(p.verdict).toBe(p.asking > p.q90 ? "high" : p.asking < p.q10 ? "low" : "expected");
      }
      const m = r.costs.monthly;
      const known = [m.mortgage, m.tax, m.hoa, m.insurance].filter((v): v is number => typeof v === "number");
      expect(m.total_known).toBeCloseTo(known.reduce((a, b) => a + b, 0), 1);
      expect(m.insurance).toBe("unknown");
    }
  });

  it("an offer recomputes verdict and costs, not the fair price", () => {
    const base = parse(report({ zpid: 27866230 }).body);
    const offer = parse(report({ zpid: 27866230, asking_price: 450000 }).body);
    expect(offer.price.fair).toBe(base.price.fair);
    expect(offer.price.verdict).toBe("expected");
    expect(offer.costs.monthly.mortgage).toBeGreaterThan(base.costs.monthly.mortgage);
    expect(warnings(offer.verification.signals).map((s) => s.name)).not.toContain("asking_far_below_range");
  });

  it("address lookups return matches, 404 and 400 shapes", () => {
    const many = parse(report({ address: "Fixture St" }).body);
    expect(many.address_matches!.length).toBeGreaterThan(1);
    expect(report({ address: "No Such Rd" }).status).toBe(404);
    expect(reportRequestSchema.safeParse({}).success).toBe(false);
  });

  it("helpers never invent numbers", () => {
    const r = parse(sample) as Report;
    expect(vsFairSentence(r.price.asking_vs_fair_pct)).toBe("Asking is 47.6% below the fair price");
    expect(costUnknownReason("hoa", r.costs.unknowns)).toMatch(/HOA fee not disclosed/);
    expect(vsFairSentence(undefined)).toBeNull();
  });

  it("the report chat visual renders as a card, not unsupported", () => {
    expect(normalizeVisual({ type: "report", data: sample }).type).toBe("report");
    expect(normalizeVisual({ type: "report", data: { nope: 1 } }).type).toBe("unsupported");
  });
});
