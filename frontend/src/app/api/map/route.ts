import { connection, type NextRequest } from "next/server";
import { mapMetricSchema } from "@/lib/api/schemas";
import { badRequest, run } from "@/server/backend";
import * as fx from "@/server/fixtures/handlers";

export async function GET(req: NextRequest) {
  await connection();
  const metric = mapMetricSchema.safeParse(req.nextUrl.searchParams.get("metric") ?? "residual_pct");
  if (!metric.success) return badRequest("metric must be residual_pct, ppsf or label");
  const zip = req.nextUrl.searchParams.get("zip");
  if (zip !== null && !/^\d{5}$/.test(zip)) return badRequest("ZIP codes have five digits");
  const query: Record<string, string> = { metric: metric.data };
  if (zip) query.zip = zip;
  return run(req, { path: "/map", method: "GET", query }, () => fx.map(metric.data, zip));
}
