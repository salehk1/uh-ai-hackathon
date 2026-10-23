import { connection } from "next/server";
import { searchRequestSchema } from "@/lib/api/schemas";
import { badRequest, run } from "@/server/backend";
import { readJson } from "@/server/request";
import * as fx from "@/server/fixtures/handlers";

export async function POST(req: Request) {
  await connection();
  const parsed = searchRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid search");
  const body = parsed.data;
  return run(req, { path: "/search", method: "POST", body }, () => fx.search(body));
}
