import { connection } from "next/server";
import { fitRequestSchema } from "@/lib/api/fit";
import { badRequest, run } from "@/server/backend";
import { readJson } from "@/server/request";

export async function POST(req: Request) {
  await connection();
  const p = fitRequestSchema.safeParse(await readJson(req));
  if (!p.success) return badRequest(p.error.issues[0]?.message ?? "Invalid budget preferences");
  return run(req, { path: "/recommendations", method: "POST", body: p.data }, () => ({
    status: 503, body: { detail: "Find my fit requires the real listing API. Fixture recommendations are deliberately unavailable." },
  }));
}
