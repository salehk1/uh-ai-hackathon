#!/usr/bin/env node
// Live integration check: the Next.js adapter against the real FastAPI backend.
//
//   node scripts/verify-live.mjs [adapter=http://localhost:3000] [backend=http://127.0.0.1:8000]
//
// Verifies that every adapter route reports `x-data-source: live`, and that the adapter's
// /search → /home results match the backend's own responses exactly (zpid, asking price, receipt).
// Exits non-zero if anything fails, or if the adapter is serving fixtures.
const adapter = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const backend = (process.argv[3] ?? "http://127.0.0.1:8000").replace(/\/$/, "");
let failures = 0;

function report(ok, name, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(40)} ${detail}`);
}

async function get(url, init) {
  const t0 = Date.now();
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return { res, body, ms: Date.now() - t0 };
}

const post = (url, json) => get(url, { method: "POST", body: JSON.stringify(json) });

const src = await get(`${adapter}/api/source`).catch((e) => ({ error: e }));
if (src.error) {
  console.error(`Adapter not reachable at ${adapter}: ${src.error.message}`);
  process.exit(2);
}
if (src.body?.mode !== "live") {
  console.error(`Adapter is in "${src.body?.mode}" mode${src.body?.reason ? ` (${src.body.reason})` : ""}. This is NOT a live verification.`);
  process.exit(3);
}
console.log(`Adapter ${adapter} → backend ${src.body.backend_host}\n`);

const health = await get(`${adapter}/api/health`);
report(health.res.ok && health.body?.ok === true && health.res.headers.get("x-data-source") === "live", "GET /api/health", JSON.stringify(health.body));

const searchBody = { max_price: 400000, min_beds: 3, near_lat: 29.7604, near_lon: -95.3698, radius_km: 10 };
const [aSearch, bSearch] = await Promise.all([post(`${adapter}/api/search`, searchBody), post(`${backend}/search`, searchBody)]);
report(aSearch.res.ok && aSearch.res.headers.get("x-data-source") === "live", "POST /api/search", `${aSearch.body?.count} homes, ${aSearch.ms} ms`);
report(JSON.stringify(aSearch.body) === JSON.stringify(bSearch.body), "search: adapter == backend");

const zpid = aSearch.body?.homes?.[0]?.zpid;
if (zpid) {
  const [aHome, bHome] = await Promise.all([get(`${adapter}/api/home/${zpid}`), get(`${backend}/home/${zpid}`)]);
  report(aHome.res.ok, `GET /api/home/${zpid}`);
  report(JSON.stringify(aHome.body) === JSON.stringify(bHome.body), "home: adapter == backend");
  report(aHome.body?.zpid === zpid && aHome.body?.price === aSearch.body.homes[0].price, "home: zpid + asking price match search row");
  const c = typeof aHome.body?.contributions === "string" ? JSON.parse(aHome.body.contributions) : aHome.body?.contributions;
  const sum = c?.items?.reduce((s, i) => s + i.usd, 0);
  report(c && Math.abs(sum - Math.round(c.total)) < 0.5, "receipt items reconcile to total", `${sum} vs ${c?.total}`);
  const lbl = aHome.body;
  const expected = lbl.price > lbl.q90_price ? "high" : lbl.price < lbl.q10_price ? "low" : "expected";
  report(lbl.label === expected, "label consistent with q10/q90", `${lbl.label}`);
} else {
  report(false, "search returned a home to inspect");
}

const missing = await get(`${adapter}/api/home/1`);
report(missing.res.status === 404, "GET /api/home/1 → 404", String(missing.res.status));

const map = await get(`${adapter}/api/map?metric=label`);
const f = map.body?.features?.[0];
report(map.res.ok && map.body.features.length <= 3000, "GET /api/map?metric=label", `${map.body?.features?.length} points, ${map.ms} ms`);
report(f && Math.abs(f.geometry.coordinates[0]) > 90 && f.geometry.coordinates[1] < 40, "map coordinates are [lon, lat]", JSON.stringify(f?.geometry?.coordinates));

const cmp = await get(`${adapter}/api/compare?zips=77002,77019,77494,00000`);
report(cmp.res.ok && cmp.body?.missing?.includes("00000"), "GET /api/compare (with a missing ZIP)", JSON.stringify(cmp.body?.missing));

const pred = await post(`${adapter}/api/predict`, { living_area: 2000, beds: 3, baths: 2, year_built: 2005, lat: 29.8, lon: -95.4 });
report(pred.res.ok && typeof pred.body?.pred_price === "number", "POST /api/predict", `$${pred.body?.pred_price} (${pred.body?.ppsf}/sqft model)`);
const far = await post(`${adapter}/api/predict`, { living_area: 2000, beds: 3, baths: 2, year_built: 2005, lat: 32.78, lon: -96.8 });
report(far.res.status === 400, "POST /api/predict outside coverage → 400", far.body?.detail);

const stats = await get(`${adapter}/api/stats`);
report(stats.res.ok && stats.body?.leaderboard, "GET /api/stats", `published_model=${stats.body?.published_model}`);

if (process.argv.includes("--chat")) {
  const chat = await post(`${adapter}/api/chat`, { message: "Compare 77019 and 77002 on price per sqft." });
  report(chat.res.ok, "POST /api/chat", `${chat.ms} ms, mode=${chat.body?.mode}, visuals=${chat.body?.visuals?.map((v) => v.type)}`);
} else {
  console.log("SKIP POST /api/chat                          (pass --chat to call the LLM)");
}

console.log(`\n${failures ? `${failures} check(s) failed` : "All live checks passed"}`);
process.exit(failures ? 1 : 0);
