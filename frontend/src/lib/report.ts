/**
 * Helpers for the /report payload. Nothing here invents a score: signals stay individual,
 * "unknown" values stay unknown, and every number shown comes from the backend.
 */
import type { OrUnknown, Receipt, Report, Signal } from "./api/schemas";

export const isKnown = (v: OrUnknown | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Plain-language names for the verification signals. Unlisted names fall back to a readable id. */
const SIGNAL_LABEL: Record<string, string> = {
  asking_far_below_range: "Asking price vs. fair range",
  duplicate_photos: "Photos reused by another broker",
  duplicate_description: "Description copied by another broker",
  agent_broker_attribution: "Agent, broker and MLS named",
  size_vs_comps: "Size vs. similar nearby homes",
  engagement_anomaly: "Days listed, views and saves",
  address_disclosure: "Street address disclosed",
};

export function signalLabel(name: string): string {
  return SIGNAL_LABEL[name] ?? name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function warnings(signals: Signal[]): Signal[] {
  return signals.filter((s) => s.status === "warning");
}

/** The report's receipt as the shared Receipt shape: items sum to `fair`; the last item is the ML adjustment. */
export function reportReceipt(price: Report["price"]): Receipt | null {
  if (!isKnown(price.fair) || price.receipt.length === 0) return null;
  const other = price.receipt.find((i) => i.feature === "other")?.usd ?? 0;
  return {
    items: price.receipt.map((i) => ({ feature: i.feature, label: i.label ?? i.feature, usd: i.usd })),
    gwr_price: price.fair - other,
    total: price.fair,
  };
}

/** "47.6% below the fair price". `pct` is already a percentage number. */
export function vsFairSentence(pct: number | undefined): string | null {
  if (pct === undefined || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.05) return "Asking matches the fair price";
  return `Asking is ${Math.abs(pct).toLocaleString("en-US", { maximumFractionDigits: 1 })}% ${pct > 0 ? "above" : "below"} the fair price`;
}

const COST_KEYWORDS = { tax: /tax/i, hoa: /hoa/i, insurance: /insurance/i } as const;

/** The backend's own sentence explaining why a monthly item is unknown, when it gave one. */
export function costUnknownReason(item: keyof typeof COST_KEYWORDS, unknowns: string[]): string {
  return unknowns.find((u) => COST_KEYWORDS[item].test(u)) ?? "Not disclosed in the listing.";
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
}

export function fullAddress(l: Report["listing"]): string | null {
  if (!l.street_address) return null;
  const tail = [l.city, [l.state, l.zipcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return tail ? `${l.street_address}, ${tail}` : l.street_address;
}
