import { describe, expect, it } from "vitest";
import { pctFromFraction, pctNumber, perSqft, rooms, signedPctFromFraction, signedUsd, usd, usdCompact, UNKNOWN } from "@/lib/format";
import { classifyAgainstRange, deviationSentence, residualFraction } from "@/lib/verdict";

describe("formatters", () => {
  it("formats a residual FRACTION as a signed percentage", () => {
    expect(signedPctFromFraction(0.12)).toBe("+12%");
    expect(signedPctFromFraction(-0.3151)).toBe("−32%");
    expect(signedPctFromFraction(0.0004)).toBe("0%");
  });
  it("keeps already-percentage numbers as they are (compare pct_high / MAPE)", () => {
    expect(pctNumber(12.3)).toBe("12.3%");
    expect(pctNumber(11.59, 2)).toBe("11.59%");
  });
  it("converts coverage fractions to percentages", () => {
    expect(pctFromFraction(0.8121)).toBe("81.2%");
  });
  it("renders null as unknown, never as zero", () => {
    for (const f of [usd, signedUsd, usdCompact, perSqft, rooms, signedPctFromFraction, pctNumber, pctFromFraction]) {
      expect(f(null)).toBe(UNKNOWN);
      expect(f(undefined)).toBe(UNKNOWN);
    }
    expect(usd(Number.NaN)).toBe(UNKNOWN);
  });
  it("formats money", () => {
    expect(usd(451000)).toBe("$451,000");
    expect(signedUsd(-16420)).toBe("−$16,420");
    expect(signedUsd(58264)).toBe("+$58,264");
    expect(usdCompact(1_250_000)).toBe("$1.25M");
    expect(usdCompact(715_025)).toBe("$715K");
  });
});

describe("range verdict", () => {
  const q10 = 400_000;
  const q90 = 600_000;
  it("uses q10/q90 boundaries, inclusive inside the range", () => {
    expect(classifyAgainstRange(600_000, q10, q90)).toBe("expected");
    expect(classifyAgainstRange(600_001, q10, q90)).toBe("high");
    expect(classifyAgainstRange(400_000, q10, q90)).toBe("expected");
    expect(classifyAgainstRange(399_999, q10, q90)).toBe("low");
  });
  it("a 12% deviation inside the range is still 'expected'", () => {
    const pred = 500_000;
    const asking = 560_000;
    expect(residualFraction(asking, pred)).toBeCloseTo(0.12);
    expect(classifyAgainstRange(asking, q10, q90)).toBe("expected");
  });
  it("describes deviation relative to the estimate, not as a probability", () => {
    expect(deviationSentence(0.12)).toBe("Asking is 12% above the model estimate");
    expect(deviationSentence(-0.05)).toBe("Asking is 5% below the model estimate");
    expect(deviationSentence(null)).toBeNull();
  });
});
