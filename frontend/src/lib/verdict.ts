import type { ReportVerdict, Verdict } from "./api/schemas";
import { signedPctFromFraction, usd } from "./format";

export const VERDICT_TEXT: Record<ReportVerdict, { short: string; long: string }> = {
  high: { short: "Above range", long: "Priced above fair range" },
  low: { short: "Below range", long: "Priced below fair range" },
  expected: { short: "Within range", long: "Priced within fair range" },
  unknown: { short: "No verdict", long: "No verdict (outside model scope)" },
};

/**
 * Range verdict exactly as train.py defines it: high = asking > q90, low = asking < q10,
 * otherwise expected. Deviation from the point estimate alone never decides the label.
 * Used only for client-side comparisons (e.g. an asking price typed into the estimator);
 * stored listings use the backend's `label`.
 */
export function classifyAgainstRange(asking: number, q10: number, q90: number): Verdict {
  if (asking > q90) return "high";
  if (asking < q10) return "low";
  return "expected";
}

export function residualFraction(asking: number, predicted: number): number {
  return (asking - predicted) / predicted;
}

/** "12% above the model estimate" — a statement about the estimate, never a probability. */
export function deviationSentence(residual: number | null | undefined): string | null {
  if (typeof residual !== "number" || !Number.isFinite(residual)) return null;
  const pct = signedPctFromFraction(residual).replace(/^[+−]/, "");
  if (pct === "0%") return "Asking price matches the model estimate";
  return `Asking is ${pct} ${residual > 0 ? "above" : "below"} the model estimate`;
}

export function verdictExplanation(
  label: Verdict | null | undefined,
  q10: number | null | undefined,
  q90: number | null | undefined,
): string {
  if (!label) return "No range verdict is recorded for this listing.";
  if (label === "high") return `The asking price is above the top of the estimated range (${usd(q90)}).`;
  if (label === "low")
    return `The asking price is below the bottom of the estimated range (${usd(q10)}). That is a prompt to look closer, not a guaranteed bargain.`;
  return `The asking price falls inside the estimated range (${usd(q10)} – ${usd(q90)}).`;
}
