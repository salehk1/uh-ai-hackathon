/**
 * Same-origin adapter to the FastAPI service. The browser only ever talks to /api/*;
 * this module builds every upstream URL itself from a fixed allowlist of operations,
 * forwards only validated fields, and labels each response with its data source.
 *
 * Data source (server-only env):
 *   BACKEND_API_URL=http://127.0.0.1:8000   → live (default when set)
 *   DATA_SOURCE=fixtures                     → synthetic development fixtures, explicitly opted in
 * A live failure is reported as an error. It never falls back to fixtures.
 */
import "server-only";
import type { FixtureResult } from "./fixtures/handlers";

export type DataMode =
  | { kind: "live"; base: URL }
  | { kind: "fixtures" }
  | { kind: "unconfigured"; reason: string };

export function dataMode(): DataMode {
  const src = process.env.DATA_SOURCE?.trim().toLowerCase();
  if (src === "fixtures") return { kind: "fixtures" };
  if (src && src !== "live") return { kind: "unconfigured", reason: `DATA_SOURCE must be "live" or "fixtures", got "${src}"` };
  const raw = process.env.BACKEND_API_URL?.trim();
  if (!raw) return { kind: "unconfigured", reason: "BACKEND_API_URL is not set" };
  try {
    const base = new URL(raw);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error();
    return { kind: "live", base };
  } catch {
    return { kind: "unconfigured", reason: "BACKEND_API_URL is not a valid http(s) URL" };
  }
}

export type Source = "live" | "fixtures";

export function json(body: unknown, status: number, source: Source | "none") {
  return Response.json(body, {
    status,
    headers: { "x-data-source": source, "cache-control": "no-store" },
  });
}

export function badRequest(detail: string) {
  return json({ detail, code: "invalid_request" }, 400, "none");
}

type Upstream = { path: string; method: "GET" | "POST"; query?: Record<string, string>; body?: unknown };

const TIMEOUTS = { default: 20_000, chat: 150_000 } as const;

async function live(base: URL, up: Upstream, signal: AbortSignal, timeoutMs: number) {
  const url = new URL(up.path.replace(/^\//, ""), base.href.endsWith("/") ? base : new URL(base.href + "/"));
  for (const [k, v] of Object.entries(up.query ?? {})) url.searchParams.set(k, v);
  const timeout = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: up.method,
      headers: up.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: up.body !== undefined ? JSON.stringify(up.body) : undefined,
      signal: AbortSignal.any([signal, timeout]),
      cache: "no-store",
    });
  } catch (e) {
    if (timeout.aborted) return json({ detail: "The housing API took too long to respond.", code: "backend_timeout" }, 504, "live");
    if (signal.aborted) return json({ detail: "Request cancelled.", code: "cancelled" }, 499, "live");
    console.error(`[adapter] ${up.method} ${up.path} unreachable:`, (e as Error).message);
    return json({ detail: "Couldn't reach the housing API.", code: "backend_unreachable" }, 502, "live");
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ detail: `The housing API returned a non-JSON response (HTTP ${res.status}).`, code: "bad_upstream" }, 502, "live");
  }
  return json(body, res.status, "live");
}

/** Run one allowlisted operation in the configured mode. */
export async function run(
  req: Request,
  up: Upstream,
  fixture: () => FixtureResult | Promise<FixtureResult>,
  opts: { long?: boolean } = {},
): Promise<Response> {
  const mode = dataMode();
  if (mode.kind === "unconfigured") {
    return json({ detail: `Frontend adapter isn't configured: ${mode.reason}.`, code: "not_configured" }, 503, "none");
  }
  if (mode.kind === "fixtures") {
    try {
      const r = await fixture();
      return json(r.body, r.status, "fixtures");
    } catch (e) {
      if ((e as Error).name === "AbortError") return json({ detail: "Request cancelled.", code: "cancelled" }, 499, "fixtures");
      throw e;
    }
  }
  return live(mode.base, up, req.signal, opts.long ? TIMEOUTS.chat : TIMEOUTS.default);
}
