"""Phase 6: FastAPI backend — tool endpoints over Supabase Postgres + an LLM agent (/chat).

Run from the repo root: uvicorn api.main:app --port 8000
"""
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

import lightgbm as lgb
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import receipt  # noqa: E402
from api import report as report_mod  # noqa: E402
import spatial as sp  # noqa: E402
from features import HOME_TYPES, POIS, TEXT_FLAGS, haversine_km  # noqa: E402

load_dotenv(ROOT / ".env")
pool = ConnectionPool(os.environ["SUPABASE_DB_URL"], min_size=1, max_size=5,
                      kwargs={"row_factory": dict_row, "autocommit": True}, open=True)

# Model artifacts for /predict
META = json.loads((ROOT / "data/models/meta.json").read_text())
BOOSTER = lgb.Booster(model_file=str(ROOT / "data/models/lgbm.txt"))
QBOOST = {q: lgb.Booster(model_file=str(ROOT / f"data/models/lgbm_{q}.txt")) for q in ("q10", "q50", "q90")}
WIDEN = float(META.get("interval_widening_log", 0.0))
REF = pd.read_parquet(ROOT / "data/features.parquet")
COEFS = pd.read_parquet(ROOT / "data/gwr_coefs.parquet").set_index("zpid").loc[REF.zpid]
REF_XY = sp.xy_km(REF.latitude, REF.longitude)
TREE = sp.cKDTree(REF_XY)
Y_RANGE = (float(REF.y.min()), float(REF.y.max()))
STATS = {k: tuple(v) for k, v in META["stats"].items()}
BCOLS = [f"b_{c}" for c in ["intercept"] + META["vars"]]

app = FastAPI(title="Houston Price Receipt")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
STATIC = ROOT / "api/static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


def q(sql, params=()):
    with pool.connection() as c:
        return c.execute(sql, params).fetchall()


def clean(rows):
    return json.loads(json.dumps(rows, default=float))


# ---------------------------------------------------------------- tool endpoints
@app.get("/health")
def health():
    n = q("select count(*) as n from homes")[0]["n"]
    return {"ok": True, "homes": n, "engine": "q" if sp.Q else "numpy"}


@app.get("/home/{zpid}")
def home(zpid: int):
    rows = q("select * from homes where zpid = %s", (zpid,))
    if not rows:
        raise HTTPException(404, f"zpid {zpid} not found")
    return clean(rows[0])


class PredictIn(BaseModel):
    living_area: float
    beds: float
    baths: float
    year_built: float
    lat: float
    lon: float
    home_type: str = "SINGLE_FAMILY"
    lot_size_acres: Optional[float] = None
    monthly_hoa: float = 0
    school_mean: Optional[float] = None
    pool: bool = False
    renovated: bool = False
    new_construction: bool = False
    no_flood: bool = False
    garage: bool = True
    acreage: bool = False
    description: Optional[str] = None


PCA_INFO = META.get("text_emb_pca")
_ENCODER = None


def text_features(desc):
    """PCA'd MiniLM embedding of the description, only if the published models use it."""
    global _ENCODER
    if not PCA_INFO:
        return np.empty((1, 0))
    pca = np.load(ROOT / "data/models" / PCA_INFO["file"])
    if not desc:  # no text: use the training mean, i.e. a zero PCA projection
        return np.zeros((1, PCA_INFO["n"]))
    if _ENCODER is None:
        from sentence_transformers import SentenceTransformer
        _ENCODER = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cpu")
    e = _ENCODER.encode([desc], normalize_embeddings=True)
    return (e - pca["mean"]) @ pca["components"].T


@app.post("/predict")
def predict(p: PredictIn):
    xy = sp.xy_km([p.lat], [p.lon])
    d, nn = TREE.query(xy, k=META["k_lag"])
    nn = nn[0]
    if d[0][0] > 25:
        raise HTTPException(400, "location is outside the Houston coverage area")
    near = REF.iloc[nn]
    ht = p.home_type if p.home_type in HOME_TYPES else "SINGLE_FAMILY"
    raw = {"livingArea": p.living_area, "bedrooms": p.beds, "bathrooms": p.baths,
           "age": max(0.0, 2024 - p.year_built),
           "lotSize_acres": p.lot_size_acres if p.lot_size_acres is not None else float(near.lotSize_acres.median()),
           "monthlyHoaFee": p.monthly_hoa, "propertyTaxRate": float(near.propertyTaxRate.median()),
           "school_mean": p.school_mean if p.school_mean is not None else float(near.school_mean.mean()),
           "latitude": p.lat, "longitude": p.lon, "spatial_lag": float(near.y.mean())}
    for k, (la, lo) in POIS.items():
        raw[f"dist_{k}"] = float(haversine_km(p.lat, p.lon, la, lo))
    for t in HOME_TYPES:
        raw[f"type_{t}"] = int(ht == t)
    for k in TEXT_FLAGS:
        raw[f"flag_{k}"] = int(getattr(p, k))
    x = np.array([[raw[f] for f in META["lgb_features"]]], float)
    x = np.c_[x, text_features(p.description)]
    qs = {k: float(np.clip(b.predict(x)[0], *Y_RANGE)) for k, b in QBOOST.items()}
    q50 = qs["q50"]
    lo, hi = min(qs["q10"], q50) - WIDEN, max(qs["q90"], q50) + WIDEN
    price = p.living_area * np.exp(q50)
    Z, _ = sp.standardize(pd.DataFrame([raw]), META["vars"], STATS)
    betas = COEFS.iloc[nn[0]][BCOLS].to_numpy(float)  # GWR coefficients of the nearest home
    rc = receipt.build(raw, Z[0], betas, META["vars"], price)
    return {"pred_price": round(price), "q10_price": round(p.living_area * np.exp(lo)),
            "q90_price": round(p.living_area * np.exp(hi)), "ppsf": round(price / p.living_area, 1),
            "nearest_zpid": int(REF.zpid.iloc[nn[0]]), "receipt": rc}


class SearchIn(BaseModel):
    max_price: Optional[float] = None
    min_beds: Optional[float] = None
    zipcode: Optional[str] = None
    near_lat: Optional[float] = None
    near_lon: Optional[float] = None
    radius_km: Optional[float] = 5
    label: Optional[str] = None


DIST_SQL = ("6371*2*asin(sqrt(power(sin(radians(lat-%(la)s)/2),2)"
            "+cos(radians(%(la)s))*cos(radians(lat))*power(sin(radians(lon-%(lo)s)/2),2)))")


@app.post("/search")
def search(s: SearchIn):
    where, prm = ["true"], {}
    if s.max_price is not None:
        where.append("price <= %(mp)s"); prm["mp"] = s.max_price
    if s.min_beds is not None:
        where.append("beds >= %(mb)s"); prm["mb"] = s.min_beds
    if s.zipcode:
        where.append("zipcode = %(z)s"); prm["z"] = s.zipcode
    if s.label:
        where.append("label = %(lb)s"); prm["lb"] = s.label
    dist = "null"
    if s.near_lat is not None and s.near_lon is not None:
        prm.update(la=s.near_lat, lo=s.near_lon, r=s.radius_km or 5)
        dist = DIST_SQL
        where.append(f"{DIST_SQL} <= %(r)s")
    rows = q(f"""select zpid, lat, lon, zipcode, home_type, price, pred_price, q10_price, q90_price, residual_pct, label,
                        living_area, beds, baths, year_built, school_mean, round(ppsf::numeric,1) as ppsf,
                        round(({dist})::numeric, 2) as dist_km
                 from homes where {' and '.join(where)} order by residual_pct asc limit 20""", prm)
    return {"count": len(rows), "order": "lowest asking vs fair price first", "homes": clean(rows)}


@app.get("/compare")
def compare(zips: str):
    zl = [z.strip() for z in zips.split(",") if z.strip()]
    rows = q("""select zipcode, count(*) as n,
                       round(percentile_cont(0.5) within group (order by ppsf)::numeric, 1) as median_ppsf,
                       round(percentile_cont(0.5) within group (order by price)::numeric, 0) as median_price,
                       round(100.0*avg((label='high')::int), 1) as pct_high,
                       round(100.0*avg((label='low')::int), 1) as pct_low,
                       round(avg(school_mean)::numeric, 2) as mean_school
                from homes where zipcode = any(%s) group by zipcode order by zipcode""", (zl,))
    return {"zips": clean(rows), "missing": [z for z in zl if z not in {r["zipcode"] for r in rows}]}


@app.get("/map")
def map_(metric: str = Query("residual_pct", pattern="^(residual_pct|ppsf|label)$"), zip: Optional[str] = None):
    rows = q(f"""select zpid, lat, lon, zipcode, price, pred_price, q10_price, q90_price, residual_pct, label, round(ppsf::numeric,1) as ppsf
                 from homes {'where zipcode = %s' if zip else ''} order by random() limit 3000""",
             (zip,) if zip else ())
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
              "properties": {**{k: v for k, v in r.items() if k not in ("lat", "lon")}, "value": r[metric]}}
             for r in clean(rows)]
    return {"type": "FeatureCollection", "metric": metric, "features": feats}


@app.get("/stats")
def stats():
    out = json.loads((ROOT / "results/metrics.json").read_text())
    sp_path = ROOT / "results/spatial.json"
    if sp_path.exists():
        s = json.loads(sp_path.read_text())
        out["spatial"] = {k: s[k] for k in ("engine", "moran_log_ppsf", "moran_ols_resid_insample",
                                             "moran_gwr_resid_insample", "gwr_k", "gwr_cv_rmse")}
    return out


class ReportIn(BaseModel):
    zpid: Optional[int] = None
    address: Optional[str] = None
    asking_price: Optional[float] = None


_MEDIAN_RATE = None


def median_rate():
    global _MEDIAN_RATE
    if _MEDIAN_RATE is None:
        _MEDIAN_RATE = float(q("select percentile_cont(0.5) within group (order by rate_30yr) as r from listing_details")[0]["r"])
    return _MEDIAN_RATE


@app.post("/report")
def report(r: ReportIn):
    """Single-listing due-diligence report (contract: docs/REPORT_SCHEMA.json)."""
    matches = []
    if r.zpid is not None:
        rows = q("select * from listing_details where zpid = %s", (r.zpid,))
    elif r.address:
        street = r.address.split(",")[0].strip()
        rows = q("""select * from listing_details where lower(street_address) like lower(%s)
                    order by length(street_address) limit 5""", (f"%{street}%",))
        matches = [{"zpid": x["zpid"], "address": f"{x['street_address']}, {x['city']} {x['zipcode']}"} for x in rows]
    else:
        raise HTTPException(400, "provide zpid or address")
    if not rows:
        raise HTTPException(404, "listing not found")
    d = clean(rows[0])
    h = q("select * from homes where zpid = %s", (d["zpid"],))
    out = report_mod.build(d, clean(h[0]) if h else None, r.asking_price, REF, TREE, sp.xy_km, median_rate())
    if len(matches) > 1:
        out["address_matches"] = matches
    return out


# ---------------------------------------------------------------- agent
LLM = OpenAI(base_url="https://api.featherless.ai/v1", api_key=os.environ["FEATHERLESS_API_KEY"], timeout=60)
MODEL = "Qwen/Qwen3-32B"
MAX_STEPS = 5
SYSTEM = """/no_think
You are the Houston Price Receipt analyst. You have tools over ~21.7k Houston listings with a
fair-price model (LightGBM, spatial-block CV) and GWR-based price receipts.
Rules: answer ONLY from tool results; cite the specific numbers you got; never invent prices,
zip codes or statistics; if tools don't cover the question, say so. Be concise (<=120 words).
Each home has a calibrated 80% fair-price range [q10, q90] from quantile models.
label/verdict: 'high' = asking above q90, 'low' = asking below q10, else 'expected'.
'residual_pct' = (asking - fair)/fair. Never state a probability or confidence % the tools did not return.
For a single listing use the report tool, and keep its three answers separate: price reasonableness,
listing verification (ok/warning/unknown signals; never turn them into a fraud probability), and
monthly cost (state assumptions; say "unknown" where the report says unknown).
Downtown Houston is at lat 29.7604, lon -95.3698; Galleria 29.7390,-95.4631; Texas Medical Center 29.7069,-95.4011."""


def _fn(name, desc, props, req=()):
    return {"type": "function", "function": {"name": name, "description": desc,
            "parameters": {"type": "object", "properties": props, "required": list(req)}}}


NUM, STR = {"type": "number"}, {"type": "string"}
TOOLS = [
    _fn("get_home", "Get one listing and its price receipt by Zillow id.", {"zpid": {"type": "integer"}}, ["zpid"]),
    _fn("predict", "Predict fair price + receipt for a hypothetical home.",
        {"living_area": NUM, "beds": NUM, "baths": NUM, "year_built": NUM, "lat": NUM, "lon": NUM,
         "home_type": {"type": "string", "enum": HOME_TYPES}, "pool": {"type": "boolean"}},
        ["living_area", "beds", "baths", "year_built", "lat", "lon"]),
    _fn("search", "Find up to 20 listings, lowest asking-vs-fair first.",
        {"max_price": NUM, "min_beds": NUM, "zipcode": STR, "near_lat": NUM, "near_lon": NUM, "radius_km": NUM,
         "label": {"type": "string", "enum": ["high", "low", "expected"]}}),
    _fn("compare", "Compare zip codes: median $/sqft, % priced high/low vs the fair range, mean school rating.",
        {"zips": {"type": "string", "description": "comma-separated, e.g. 77002,77019"}}, ["zips"]),
    _fn("map", "Map listings colored by a metric, optionally for one zip.",
        {"metric": {"type": "string", "enum": ["residual_pct", "ppsf", "label"]}, "zip": STR}),
    _fn("report", "Full due-diligence report for ONE listing (by zpid or street address): price vs calibrated fair "
        "range with receipt and comps, listing verification signals, monthly cost breakdown with unknowns.",
        {"zpid": {"type": "integer"}, "address": STR, "asking_price": NUM}),
    _fn("stats", "Model leaderboard (MAE, MAPE, R2 vs Zestimate) and spatial stats (Moran's I).", {}),
]


def run_tool(name, args):
    """Execute a tool; return (compact result for the LLM, visual for the UI or None)."""
    if name == "get_home":
        h = home(int(args["zpid"]))
        h.pop("description", None)
        return h, {"type": "receipt", "data": {"zpid": h["zpid"], "price": h["price"], **h["contributions"]}}
    if name == "predict":
        r = predict(PredictIn(**args))
        return r, {"type": "receipt", "data": {**r["receipt"], "pred_price": r["pred_price"]}}
    if name == "search":
        r = search(SearchIn(**args))
        gj = {"type": "FeatureCollection", "metric": "residual_pct", "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [h["lon"], h["lat"]]},
             "properties": {**h, "value": h["residual_pct"]}} for h in r["homes"]]}
        return r, {"type": "map", "data": gj}
    if name == "compare":
        r = compare(args["zips"])
        bar = {"labels": [z["zipcode"] for z in r["zips"]],
               "series": [{"name": "median $/sqft", "values": [z["median_ppsf"] for z in r["zips"]]}]}
        return r, {"type": "bar", "data": bar}
    if name == "map":
        gj = map_(args.get("metric", "residual_pct"), args.get("zip"))
        props = pd.DataFrame([f["properties"] for f in gj["features"]])
        summary = {"points": len(props), "metric": gj["metric"]}
        if len(props):
            summary.update(label_counts=props.label.value_counts().to_dict(),
                           median_ppsf=float(props.ppsf.median()),
                           median_residual_pct=float(props.residual_pct.median()))
        return summary, {"type": "map", "data": gj}
    if name == "report":
        r = report(ReportIn(**args))
        slim = {**r, "price": {**r["price"], "comps": [{k: c[k] for k in ("zpid", "price", "ppsf", "dist_km", "beds", "sqft")}
                                                        for c in r["price"]["comps"]]}}
        slim.pop("sources", None)
        return slim, {"type": "report", "data": r}
    if name == "stats":
        r = stats()
        b = r["leaderboard"]
        bar = {"labels": list(b), "series": [{"name": "MAPE %", "values": [v["MAPE_zestimate_rows"] for v in b.values()]}]}
        return r, {"type": "bar", "data": bar}
    raise ValueError(f"unknown tool {name}")


def _strip(text):
    return re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()


def _call_tool_safe(name, args):
    try:
        return run_tool(name, args)
    except HTTPException as e:
        return {"error": e.detail}, None
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}, None


def agent_native(messages):
    visuals, trace = [], []
    for _ in range(MAX_STEPS):
        r = LLM.chat.completions.create(model=MODEL, messages=messages, tools=TOOLS, max_tokens=800, temperature=0.2)
        m = r.choices[0].message
        if not m.tool_calls:
            return _strip(m.content), visuals, trace
        messages.append({"role": "assistant", "content": m.content or "",
                         "tool_calls": [tc.model_dump() for tc in m.tool_calls]})
        for tc in m.tool_calls:
            args = json.loads(tc.function.arguments or "{}")
            res, vis = _call_tool_safe(tc.function.name, args)
            trace.append({"tool": tc.function.name, "args": args})
            if vis:
                visuals.append(vis)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(res, default=float)[:6000]})
    r = LLM.chat.completions.create(model=MODEL, messages=messages + [
        {"role": "user", "content": "Tool budget used up. Answer now from the results above."}], max_tokens=600)
    return _strip(r.choices[0].message.content), visuals, trace


JSON_PROTOCOL = """Reply with ONE JSON object and nothing else. Either
{"tool": "<name>", "args": {...}} to call a tool, or {"final": "<answer>"} when done.
Tools: """ + json.dumps([t["function"] for t in TOOLS])


def agent_json(messages):
    visuals, trace = [], []
    messages = [{"role": "system", "content": SYSTEM + "\n\n" + JSON_PROTOCOL}] + messages[1:]
    for step in range(MAX_STEPS + 1):
        r = LLM.chat.completions.create(model=MODEL, messages=messages, max_tokens=800, temperature=0.1,
                                        response_format={"type": "json_object"})
        text = _strip(r.choices[0].message.content)
        m = re.search(r"\{.*\}", text, re.S)
        try:
            obj = json.loads(m.group(0)) if m else {"final": text}
        except json.JSONDecodeError:
            obj = {"final": text}
        if "final" in obj or "tool" not in obj or step == MAX_STEPS:
            return obj.get("final", text), visuals, trace
        res, vis = _call_tool_safe(obj["tool"], obj.get("args", {}))
        trace.append({"tool": obj["tool"], "args": obj.get("args", {})})
        if vis:
            visuals.append(vis)
        messages += [{"role": "assistant", "content": json.dumps(obj)},
                     {"role": "user", "content": "Tool result: " + json.dumps(res, default=float)[:6000]}]
    return text, visuals, trace


class ChatIn(BaseModel):
    message: str
    history: list[dict] = []
    mode: str = "auto"  # "json" forces the JSON-mode tool-selection fallback


@app.post("/chat")
def chat(c: ChatIn):
    hist = [{"role": h["role"], "content": h["content"]} for h in c.history
            if h.get("role") in ("user", "assistant") and isinstance(h.get("content"), str)][-10:]
    messages = [{"role": "system", "content": SYSTEM}] + hist + [{"role": "user", "content": c.message}]
    mode = "native"
    try:
        if c.mode == "json":
            raise RuntimeError("json mode requested")
        text, visuals, trace = agent_native(list(messages))
    except Exception as e:
        mode = f"json-fallback ({type(e).__name__})"
        text, visuals, trace = agent_json(list(messages))
    return {"text": text, "visuals": visuals, "tool_calls": trace, "mode": mode}
