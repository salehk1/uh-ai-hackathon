"""Smoke test every endpoint. Usage: python api/test_api.py [base_url]"""
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
c = httpx.Client(base_url=BASE, timeout=180)


def check(name, r, fn=lambda j: ""):
    ok = r.status_code == 200
    print(f"{'PASS' if ok else 'FAIL'} {name:<28} {r.status_code}  {fn(r.json()) if ok else r.text[:200]}")
    return r.json() if ok else None


check("GET /health", c.get("/health"), lambda j: j)
s = check("POST /search", c.post("/search", json={"max_price": 400000, "min_beds": 3, "label": "low",
                                                 "near_lat": 29.7604, "near_lon": -95.3698, "radius_km": 10}),
          lambda j: f"{j['count']} homes, top residual {j['homes'][0]['residual_pct'] if j['homes'] else None}")
zpid = s["homes"][0]["zpid"] if s and s["homes"] else 0
h = check(f"GET /home/{zpid}", c.get(f"/home/{zpid}"),
          lambda j: f"list ${j['price']:,.0f} pred ${j['pred_price']:,.0f} {j['label']}; receipt sums to "
                    f"${sum(i['usd'] for i in j['contributions']['items']):,.0f}")
check("POST /predict", c.post("/predict", json={"living_area": 2000, "beds": 3, "baths": 2, "year_built": 2005,
                                                "lat": 29.80, "lon": -95.40}),
      lambda j: f"${j['pred_price']:,} ({j['ppsf']}/sqft), {len(j['receipt']['items'])} receipt lines")
check("GET /compare", c.get("/compare", params={"zips": "77002,77019,77494"}),
      lambda j: [(z["zipcode"], z["median_ppsf"], z["pct_high"]) for z in j["zips"]])
check("GET /map", c.get("/map", params={"metric": "ppsf"}), lambda j: f"{len(j['features'])} points")
check("GET /map?zip", c.get("/map", params={"metric": "label", "zip": "77019"}), lambda j: f"{len(j['features'])} points")
check("GET /stats", c.get("/stats"), lambda j: f"best={j['best_model']}")
import json as _json  # noqa: E402
from pathlib import Path  # noqa: E402

import jsonschema  # noqa: E402

SCHEMA = _json.loads((Path(__file__).resolve().parents[1] / "docs/REPORT_SCHEMA.json").read_text())


def report_ok(j):
    jsonschema.validate(j, SCHEMA)
    p = j["price"]
    s = {x["status"] for x in j["verification"]["signals"]}
    rsum = sum(i["usd"] for i in p["receipt"])
    assert not p["receipt"] or abs(rsum - p["fair"]) <= 1, "receipt must sum to fair"
    ph = j["photos"]
    assert all(q["thumb_url"].startswith("https://photos.zillowstatic.com/fp/") for q in ph)
    return (f"photos={len(ph)} verdict={p['verdict']} fair={p['fair']} q10={p['q10']} q90={p['q90']} comps={len(p['comps'])} "
            f"signals={sorted(s)} total_known=${j['costs']['monthly']['total_known']:,.0f} schema=valid")


check(f"POST /report zpid={zpid}", c.post("/report", json={"zpid": zpid}), report_ok)
check("POST /report address", c.post("/report", json={"address": "932 Bennington St, Houston, TX"}), report_ok)
check("POST /report asking override", c.post("/report", json={"zpid": zpid, "asking_price": 2_000_000}),
      lambda j: report_ok(j) + f" (override verdict={j['price']['verdict']})")
check("POST /report unmodeled (lot)", c.post("/report", json={"zpid": 351551042}), report_ok)
r = c.post("/report", json={"address": "no such street 99999"})
print(f"{'PASS' if r.status_code == 404 else 'FAIL'} {'POST /report not found':<28} {r.status_code}")
t = time.time()
check("POST /chat (report tool)", c.post("/chat", json={"message": "Give me the due-diligence report for 932 Bennington St."}),
      lambda j: f"[{j['mode']}] tools={[x['tool'] for x in j['tool_calls']]} visuals={[v['type'] for v in j['visuals']]} "
                f"{time.time() - t:.0f}s\n     -> {j['text'][:400]}")
for mode in ["auto", "json"]:
    t = time.time()
    check(f"POST /chat ({mode})", c.post("/chat", json={"message": "Compare 77019 and 77002 on price per sqft, "
                                                        "and which has more listings priced high?", "mode": mode}),
          lambda j: f"[{j['mode']}] tools={[x['tool'] for x in j['tool_calls']]} visuals="
                    f"{[v['type'] for v in j['visuals']]} {time.time() - t:.0f}s\n     -> {j['text'][:300]}")
