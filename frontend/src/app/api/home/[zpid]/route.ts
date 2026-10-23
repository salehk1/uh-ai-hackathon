import { connection } from "next/server";
import { badRequest, run } from "@/server/backend";
import * as fx from "@/server/fixtures/handlers";

export async function GET(req: Request, ctx: { params: Promise<{ zpid: string }> }) {
  await connection();
  const { zpid } = await ctx.params;
  if (!/^\d{1,12}$/.test(zpid)) return badRequest("Listing ids are whole numbers.");
  const id = Number(zpid);
  return run(req, { path: `/home/${id}`, method: "GET" }, () => fx.home(id));
}
