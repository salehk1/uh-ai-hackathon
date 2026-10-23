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

describe("report photos (additive field)", () => {
  const z = "https://photos.zillowstatic.com/fp/c6c062dff7216f0715e224ea3c8eb3e8";
  const ok = { thumb_url: `${z}-d_d.jpg`, full_url: `${z}-uncropped_scaled_within_1536_1152.jpg`, full_width: 1536 };
  it("defaults to no photos when an older backend omits the field", () => {
    expect(parse(sample).photos).toEqual([]);
  });
  it("keeps valid photos in order and drops ones from other hosts or with bad URLs", () => {
    const evil = { thumb_url: "https://example.com/x.jpg", full_url: "https://example.com/x.jpg" };
    const insecure = { thumb_url: `http://photos.zillowstatic.com/fp/a.jpg`, full_url: ok.full_url };
    const photos = parse({ ...sample, photos: [ok, evil, insecure, { ...ok, caption: "Kitchen" }, "nope"] }).photos;
    expect(photos).toHaveLength(2);
    expect(photos[1].caption).toBe("Kitchen");
  });
});
