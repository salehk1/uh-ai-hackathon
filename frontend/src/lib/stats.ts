import type { Stats } from "./api/schemas";

/**
 * The published model's leaderboard row. metrics.json names it in `published_model`, but the
 * leaderboard key can differ (at 2dc86a1 the row is keyed by `best_model`), so resolve it explicitly.
 */
export function publishedKey(s: Pick<Stats, "leaderboard" | "published_model" | "best_model">): string | null {
  const keys = Object.keys(s.leaderboard);
  if (keys.includes(s.published_model)) return s.published_model;
  return keys.find((k) => /published/i.test(k)) ?? (keys.includes(s.best_model) ? s.best_model : null);
}
