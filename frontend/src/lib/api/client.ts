"use client";

import type { z } from "zod";

export type DataSource = "live" | "fixtures" | "none";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly source: DataSource,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Sourced<T> = { data: T; source: DataSource };

function detailOf(body: unknown, status: number): { detail: string; code: string } {
  if (body && typeof body === "object") {
    const b = body as { detail?: unknown; code?: unknown };
    const code = typeof b.code === "string" ? b.code : `http_${status}`;
    if (typeof b.detail === "string") return { detail: b.detail, code };
    // FastAPI validation errors: detail is a list of { loc, msg }
    if (Array.isArray(b.detail) && b.detail[0] && typeof b.detail[0].msg === "string") {
      return { detail: `Invalid request: ${b.detail[0].msg}`, code: "invalid_request" };
    }
  }
  return { detail: `Request failed (HTTP ${status})`, code: `http_${status}` };
}

/** Fetch a same-origin adapter route and validate the payload against the expected contract. */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit & { json?: unknown } = {},
): Promise<Sourced<z.infer<S>>> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      method: json !== undefined ? "POST" : (rest.method ?? "GET"),
      headers: json !== undefined ? { "content-type": "application/json" } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Couldn't reach this app's server.", 0, "network", "none");
  }
  const source = (res.headers.get("x-data-source") as DataSource | null) ?? "none";
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok) {
    const { detail, code } = detailOf(body, res.status);
    throw new ApiError(detail, res.status, code, source);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    console.error(`[api] ${path} returned an unexpected shape`, parsed.error.issues.slice(0, 5));
    throw new ApiError(
      `The API response didn't match the expected format (${issue?.path.join(".") || "root"}: ${issue?.message}).`,
      res.status,
      "invalid_response",
      source,
    );
  }
  return { data: parsed.data, source };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
