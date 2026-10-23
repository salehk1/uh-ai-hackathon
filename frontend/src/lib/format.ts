/** Formatters. Every one returns a visible "unknown" marker for null instead of a fabricated 0. */

export const UNKNOWN = "—";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function usd(v: number | null | undefined): string {
  return ok(v) ? usd0.format(v) : UNKNOWN;
}

/** Signed dollars for receipt lines: +$12,000 / −$4,500. */
export function signedUsd(v: number | null | undefined): string {
  if (!ok(v)) return UNKNOWN;
  if (v === 0) return "$0";
  return `${v > 0 ? "+" : "−"}${usd0.format(Math.abs(v))}`;
}

/** $412K / $1.25M for compact axes and map previews. */
export function usdCompact(v: number | null | undefined): string {
  if (!ok(v)) return UNKNOWN;
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function signedUsdCompact(v: number | null | undefined): string {
  if (!ok(v)) return UNKNOWN;
  if (v === 0) return "$0";
  return `${v > 0 ? "+" : "−"}${usdCompact(Math.abs(v))}`;
}

export function perSqft(v: number | null | undefined): string {
  return ok(v) ? `${usd0.format(v)}/sqft` : UNKNOWN;
}

export function sqft(v: number | null | undefined): string {
  return ok(v) ? `${int.format(v)} sqft` : UNKNOWN;
}

export function count(v: number | null | undefined): string {
  return ok(v) ? int.format(v) : UNKNOWN;
}

/** Beds/baths: 2.5 stays 2.5, 3 stays 3. */
export function rooms(v: number | null | undefined): string {
  return ok(v) ? String(Math.round(v * 10) / 10) : UNKNOWN;
}

/**
 * A FRACTION (0.12) shown as a signed percentage (+12%). Used for residual_pct and
 * anything else the backend returns as a fraction.
 */
export function signedPctFromFraction(v: number | null | undefined, digits = 0): string {
  if (!ok(v)) return UNKNOWN;
  const p = v * 100;
  const r = Number(p.toFixed(digits));
  if (r === 0) return "0%";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(digits)}%`;
}

/** A FRACTION (0.8121) shown as 81.2%. */
export function pctFromFraction(v: number | null | undefined, digits = 1): string {
  return ok(v) ? `${(v * 100).toFixed(digits)}%` : UNKNOWN;
}

/** A number that is ALREADY a percentage (12.3) shown as 12.3%. Do not multiply. */
export function pctNumber(v: number | null | undefined, digits = 1): string {
  return ok(v) ? `${v.toFixed(digits)}%` : UNKNOWN;
}

export function decimal(v: number | null | undefined, digits = 1): string {
  return ok(v) ? v.toFixed(digits) : UNKNOWN;
}

export function year(v: number | null | undefined): string {
  return ok(v) ? String(Math.round(v)) : UNKNOWN;
}

export function homeTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case "SINGLE_FAMILY":
      return "Single-family";
    case "TOWNHOUSE":
      return "Townhouse";
    case "CONDO":
      return "Condo";
    case null:
    case undefined:
      return "Type unknown";
    default:
      return t.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function homeTitle(zipcode: string | null | undefined): string {
  return zipcode ? `Houston home · ZIP ${zipcode}` : "Houston home · ZIP unknown";
}
