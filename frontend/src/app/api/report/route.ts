import { connection } from "next/server";
import { reportRequestSchema } from "@/lib/api/schemas";
import { badRequest, run } from "@/server/backend";
import { readJson } from "@/server/request";
import * as fx from "@/server/fixtures/report";

export async function POST(req: Request) {
  await connection();
  const parsed = reportRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Enter an address or zpid");
  const body = parsed.data;
  return run(req, { path: "/report", method: "POST", body }, () => fx.report(body));
}
