import { receiptSchema, type Receipt, type ReceiptItem } from "./api/schemas";

export type ReceiptParse =
  | { status: "ok"; receipt: Receipt }
  | { status: "missing" }
  | { status: "invalid"; problem: string };

/** Validate a stored `contributions` blob. Malformed receipts are reported, never silently dropped. */
export function parseReceipt(raw: unknown): ReceiptParse {
  if (raw === null || raw === undefined) return { status: "missing" };
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const r = receiptSchema.safeParse(value);
  if (!r.success) {
    const issue = r.error.issues[0];
    return { status: "invalid", problem: `${issue.path.join(".") || "receipt"}: ${issue.message}` };
  }
  return { status: "ok", receipt: r.data };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function itemSum(items: ReceiptItem[]): number {
  return items.reduce((s, i) => s + i.usd, 0);
}

/** receipt.py absorbs rounding into the baseline so items sum to the rounded total exactly. */
export function reconciles(r: Receipt): boolean {
  return Math.abs(itemSum(r.items) - Math.round(r.total)) < 0.5;
}

export type WaterfallStep = {
  key: string;
  label: string;
  kind: "baseline" | "feature" | "adjustment" | "total";
  usd: number;
  start: number;
  end: number;
};

/** Running totals for a waterfall: baseline bar from 0, each item from the running sum, then the total. */
export function waterfall(r: Receipt): WaterfallStep[] {
  let running = 0;
  const steps: WaterfallStep[] = r.items.map((it, i) => {
    const start = it.feature === "baseline" ? 0 : running;
    const end = start + it.usd;
    running = end;
    return {
      key: `${it.feature}-${i}`,
      label: it.label,
      kind: it.feature === "baseline" ? "baseline" : it.feature === "other" ? "adjustment" : "feature",
      usd: it.usd,
      start,
      end,
    };
  });
  steps.push({ key: "total", label: "Model estimate", kind: "total", usd: r.total, start: 0, end: r.total });
  return steps;
}

/** Shorter label for chart rows; full label stays in the table. */
export function shortLabel(label: string): string {
  return label.replace(/\s*\(pool, lot, HOA, text flags\)/, "").replace(/^Other features & ML adjustment/, "ML adjustment");
}
