import { connection } from "next/server";
import { dataMode, json } from "@/server/backend";

/** Which data source the adapter is serving. Only the host is exposed, never credentials or paths. */
export async function GET() {
  await connection();
  const m = dataMode();
  if (m.kind === "live") return json({ mode: "live", backend_host: m.base.host }, 200, "live");
  if (m.kind === "fixtures") return json({ mode: "fixtures" }, 200, "fixtures");
  return json({ mode: "unconfigured", reason: m.reason }, 200, "none");
}
