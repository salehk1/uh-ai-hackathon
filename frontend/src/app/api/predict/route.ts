import { connection } from "next/server";
import { predictRequestSchema } from "@/lib/api/schemas";
import { badRequest, run } from "@/server/backend";
import { readJson } from "@/server/request";
import * as fx from "@/server/fixtures/handlers";

export async function POST(req: Request) {
  await connection();
  const parsed = predictRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid home details");
  const body = parsed.data;
  return run(req, { path: "/predict", method: "POST", body }, () => fx.predict(body));
}
