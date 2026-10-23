import { describe, expect, it } from "vitest";
import { visibleZipDraft } from "@/components/explore/zip-draft";
import { listingBounds, shouldFitZip } from "@/lib/map-fit";

describe("ZIP navigation camera", () => {
  it("waits for map and current ZIP data, fits direct navigation", () => {
    expect(shouldFitZip(false, true, "77407", null, false)).toBe(false);
    expect(shouldFitZip(true, false, "77407", null, false)).toBe(false);
    expect(shouldFitZip(true, true, "77407", null, false)).toBe(true);
  });
  it("fits new ZIP once, preserves saved Back view and ignores pans", () => {
    expect(shouldFitZip(true, true, "77005", "77407", false)).toBe(true);
    expect(shouldFitZip(true, true, "77005", "77005", false)).toBe(false);
    expect(shouldFitZip(true, true, "77407", null, true)).toBe(false);
  });
  it("keeps a rapid second ZIP edit when the previous submission updates", () => {
    expect(visibleZipDraft({ origin: "00000", value: "77005", editing: true }, "77407")).toBe("77005");
    expect(visibleZipDraft({ origin: "77407", value: "77407", editing: false }, "77005")).toBe("77005");
  });
  it("handles singleton, empty and invalid coordinates", () => {
    expect(listingBounds([])).toBe(null);
    expect(listingBounds([[NaN, 29], [181, 95]])).toBe(null);
    expect(listingBounds([[-95.4, 29.7]])).toEqual([[-95.4, 29.7], [-95.4, 29.7]]);
    expect(listingBounds([[-95.4, 29.7], [-95.6, 29.9]])).toEqual([[-95.6, 29.7], [-95.4, 29.9]]);
  });
});
