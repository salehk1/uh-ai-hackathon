/**
 * Normalize /chat `visuals`. The backend emits three types with tool-specific shapes:
 *  - map:     a FeatureCollection (from `search` or `map`)
 *  - bar:     { labels, series: [{ name, values }] } (from `compare` or `stats`)
 *  - receipt: get_home → { zpid, price, items, gwr_price, total }
 *             predict  → { items, gwr_price, total, pred_price }
 *  - report:  the full /report object (from the `report` tool), shown as a compact card
 * Anything else becomes an "unsupported" visual that renders a small local notice.
 */
import { z } from "zod";
import { receiptItemSchema, reportSchema, verdictSchema, type Receipt, type Report } from "./api/schemas";

export type MapPoint = {
  lon: number;
  lat: number;
  zpid: number | null;
  zipcode: string | null;
  price: number | null;
  label: "high" | "low" | "expected" | null;
};

export type ChatVisual =
  | { type: "map"; points: MapPoint[]; dropped: number }
  | { type: "bar"; labels: string[]; series: { name: string; values: (number | null)[] }[] }
  | {
      type: "receipt";
      source: "listing" | "prediction";
      receipt: Receipt;
      zpid: number | null;
      askingPrice: number | null;
      predPrice: number | null;
    }
  | { type: "report"; report: Report }
  | { type: "unsupported"; reason: string };

const finite = z.number().finite();

const pointSchema = z.object({
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([finite, finite]) }),
  properties: z
    .object({
      zpid: z.number().int().nullish(),
      zipcode: z.string().nullish(),
      price: finite.nullish(),
      label: verdictSchema.nullish(),
    })
    .passthrough()
    .nullish(),
});

const barSchema = z.object({
  labels: z.array(z.union([z.string(), z.number()])),
  series: z.array(z.object({ name: z.string(), values: z.array(finite.nullable()) })).min(1),
});

const receiptVisualSchema = z.object({
  items: z.array(receiptItemSchema).min(1),
  gwr_price: finite,
  total: finite,
  zpid: z.number().int().optional(),
  price: finite.nullable().optional(),
  pred_price: finite.optional(),
});

export function normalizeVisual(raw: unknown): ChatVisual {
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    return { type: "unsupported", reason: "Visual had no type" };
  }
  const { type, data } = raw as { type: unknown; data: unknown };

  if (type === "map") {
    const fc = data as { features?: unknown };
    if (!fc || !Array.isArray(fc.features)) return { type: "unsupported", reason: "Map visual had no features" };
    const points: MapPoint[] = [];
    let dropped = 0;
    for (const f of fc.features) {
      const p = pointSchema.safeParse(f);
      if (!p.success) {
        dropped++;
        continue;
      }
      const [lon, lat] = p.data.geometry.coordinates;
      const props = p.data.properties ?? {};
      points.push({
        lon,
        lat,
        zpid: props.zpid ?? null,
        zipcode: props.zipcode ?? null,
        price: props.price ?? null,
        label: props.label ?? null,
      });
    }
    return { type: "map", points, dropped };
  }

  if (type === "bar") {
    const b = barSchema.safeParse(data);
    if (!b.success) return { type: "unsupported", reason: "Bar chart data was malformed" };
    const n = b.data.labels.length;
    if (b.data.series.some((s) => s.values.length !== n)) {
      return { type: "unsupported", reason: "Bar chart labels and values had different lengths" };
    }
    return { type: "bar", labels: b.data.labels.map(String), series: b.data.series };
  }

  if (type === "receipt") {
    const r = receiptVisualSchema.safeParse(data);
    if (!r.success) return { type: "unsupported", reason: "Receipt data was malformed" };
    const d = r.data;
    const isListing = d.zpid !== undefined;
    return {
      type: "receipt",
      source: isListing ? "listing" : "prediction",
      receipt: { items: d.items, gwr_price: d.gwr_price, total: d.total },
      zpid: d.zpid ?? null,
      askingPrice: isListing ? (d.price ?? null) : null,
      predPrice: d.pred_price ?? (isListing ? null : d.total),
    };
  }

  if (type === "report") {
    const r = reportSchema.safeParse(data);
    if (!r.success) return { type: "unsupported", reason: "Report data was malformed" };
    return { type: "report", report: r.data };
  }

  return { type: "unsupported", reason: `Unsupported visual type "${String(type)}"` };
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** The backend keeps the last ten history messages; send no more than that. */
export function historyForRequest(turns: ChatTurn[]): ChatTurn[] {
  return turns.slice(-10);
}

/** Lightweight, HTML-free text structure for model output: paragraphs, bullet lists and **bold** runs. */
export type TextBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export function textBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    const bullets = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
    if (bullets) blocks.push({ kind: "ul", items: lines.map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")) });
    else blocks.push({ kind: "p", text: lines.join(" ") });
  }
  return blocks;
}

export function boldRuns(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((s) => (s.startsWith("**") && s.endsWith("**") ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false }));
}
