import { connection } from "next/server";
import { chatRequestSchema } from "@/lib/api/schemas";
import { badRequest, run } from "@/server/backend";
import { readJson } from "@/server/request";
import * as fx from "@/server/fixtures/handlers";

// The backend runs a tool loop with several 60 s provider calls; allow for that on hosts that honor it.
export const maxDuration = 180;

export async function POST(req: Request) {
  await connection();
  const parsed = chatRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid message");
  const body = parsed.data;
  return run(req, { path: "/chat", method: "POST", body }, () => fx.chat(body.message, req.signal), { long: true });
}
