import { connection, type NextRequest } from "next/server";
import { compareRequestSchema } from "@/lib/api/schemas";
import { badRequest, run } from "@/server/backend";
import * as fx from "@/server/fixtures/handlers";

export async function GET(req: NextRequest) {
  await connection();
  const zips = (req.nextUrl.searchParams.get("zips") ?? "").split(",").map((z) => z.trim()).filter(Boolean);
  const parsed = compareRequestSchema.safeParse(zips);
  if (!parsed.success) return badRequest("Provide 1–8 five-digit ZIP codes");
  return run(req, { path: "/compare", method: "GET", query: { zips: parsed.data.join(",") } }, () => fx.compare(parsed.data));
}
