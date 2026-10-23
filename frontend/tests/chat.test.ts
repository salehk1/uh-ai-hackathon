import { describe, expect, it } from "vitest";
import { boldRuns, historyForRequest, normalizeVisual, textBlocks } from "@/lib/chat";

const items = [
  { feature: "baseline", label: "b", usd: 400000 },
  { feature: "other", label: "o", usd: 10000 },
];

describe("chat visual normalization", () => {
  it("normalizes the get_home receipt shape", () => {
    const v = normalizeVisual({ type: "receipt", data: { zpid: 12, price: 399000, items, gwr_price: 400000, total: 410000 } });
    expect(v).toMatchObject({ type: "receipt", source: "listing", zpid: 12, askingPrice: 399000 });
  });
  it("normalizes the predict receipt shape", () => {
    const v = normalizeVisual({ type: "receipt", data: { items, gwr_price: 400000, total: 410000, pred_price: 410000 } });
    expect(v).toMatchObject({ type: "receipt", source: "prediction", zpid: null, askingPrice: null, predPrice: 410000 });
  });
  it("normalizes bar data and rejects mismatched lengths", () => {
    expect(normalizeVisual({ type: "bar", data: { labels: ["77002", "77019"], series: [{ name: "median $/sqft", values: [280, null] }] } })).toMatchObject({ type: "bar" });
    expect(normalizeVisual({ type: "bar", data: { labels: ["a", "b"], series: [{ name: "x", values: [1] }] } }).type).toBe("unsupported");
  });
  it("keeps valid map points ([lon, lat]) and counts malformed ones", () => {
    const v = normalizeVisual({
      type: "map",
      data: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [-95.4, 29.7] }, properties: { zpid: 1, label: "low", price: 1 } },
          { type: "Feature", geometry: { type: "Point", coordinates: ["x", 29.7] }, properties: {} },
        ],
      },
    });
    expect(v).toMatchObject({ type: "map", dropped: 1, points: [{ lon: -95.4, lat: 29.7, zpid: 1, label: "low" }] });
  });
  it("contains unknown or malformed visuals locally", () => {
    expect(normalizeVisual({ type: "scatter3d", data: {} }).type).toBe("unsupported");
    expect(normalizeVisual(null).type).toBe("unsupported");
    expect(normalizeVisual({ type: "receipt", data: { items: "nope" } }).type).toBe("unsupported");
  });
  it("sends at most the last ten history messages", () => {
    const turns = Array.from({ length: 14 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: String(i) }));
    expect(historyForRequest(turns).map((t) => t.content)).toEqual(["4", "5", "6", "7", "8", "9", "10", "11", "12", "13"]);
  });
  it("structures model text without HTML", () => {
    expect(textBlocks("Intro line\n\n- a\n- b")).toEqual([{ kind: "p", text: "Intro line" }, { kind: "ul", items: ["a", "b"] }]);
    expect(boldRuns("x **y** <b>z</b>")).toEqual([{ text: "x ", bold: false }, { text: "y", bold: true }, { text: " <b>z</b>", bold: false }]);
  });
});
