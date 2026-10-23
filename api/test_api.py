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
for mode in ["auto", "json"]:
    t = time.time()
    check(f"POST /chat ({mode})", c.post("/chat", json={"message": "Compare 77019 and 77002 on price per sqft, "
                                                        "and which has more listings priced high?", "mode": mode}),
          lambda j: f"[{j['mode']}] tools={[x['tool'] for x in j['tool_calls']]} visuals="
                    f"{[v['type'] for v in j['visuals']]} {time.time() - t:.0f}s\n     -> {j['text'][:300]}")
