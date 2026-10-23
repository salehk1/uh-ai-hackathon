import { connection } from "next/server";
import { run } from "@/server/backend";
import * as fx from "@/server/fixtures/handlers";

export async function GET(req: Request) {
  await connection();
  return run(req, { path: "/health", method: "GET" }, fx.health);
}
