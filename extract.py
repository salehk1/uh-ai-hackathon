"""Phase 1: stream the raw Zillow JSON array into data/homes.parquet.

Usage: python extract.py [--limit N]
"""
import argparse
import re
from pathlib import Path

import ijson
import numpy as np
import pandas as pd

RAW = Path("data/raw/houston_housing_market_2024.json")
OUT = Path("data/homes.parquet")

SCALARS = ["zpid", "price", "livingArea", "bedrooms", "bathrooms", "yearBuilt", "homeType",
           "zipcode", "latitude", "longitude", "monthlyHoaFee", "propertyTaxRate", "zestimate",
           "rentZestimate", "daysOnZillow", "pageViewCount", "favoriteCount", "description"]
SQFT_PER_ACRE = 43560.0


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return np.nan


def parse_lot(value, units=None):
    """Return acres from a number or a string like '7,405 sqft' / '0.25 Acres'."""
    if value is None:
        return np.nan
    if isinstance(value, (int, float)):
        v = float(value)
        u = (units or "").lower()
        if "acre" in u:
            return v
        if "sq" in u or "ft" in u:
            return v / SQFT_PER_ACRE
        # Unitless: Zillow lotSize is sqft; tiny values are acres.
        return v if v < 100 else v / SQFT_PER_ACRE
    s = str(value).lower().replace(",", "")
    m = re.search(r"([\d.]+)", s)
    if not m:
        return np.nan
    v = float(m.group(1))
    if "acre" in s:
        return v
    return v / SQFT_PER_ACRE if ("sq" in s or "ft" in s or v >= 100) else v


def get(item, key):
    v = item.get(key)
    if v is None and isinstance(item.get("resoFacts"), dict):
        v = item["resoFacts"].get(key)
    if v is None and isinstance(item.get("address"), dict) and key == "zipcode":
        v = item["address"].get("zipcode")
    return v


def row(item):
    r = {k: get(item, k) for k in SCALARS}
    for k in SCALARS:
        if k not in ("homeType", "zipcode", "description"):
            r[k] = num(r[k])
    r["zipcode"] = None if r["zipcode"] is None else str(r["zipcode"])[:5]
    ratings = [num(s.get("rating")) for s in (item.get("schools") or []) if isinstance(s, dict)]
    ratings = [x for x in ratings if not np.isnan(x)]
    r["school_mean"] = float(np.mean(ratings)) if ratings else np.nan
    rf = item.get("resoFacts") or {}
    lot = parse_lot(rf.get("lotSize"))
    if np.isnan(lot):
        lot = parse_lot(item.get("lotSize"))
    if np.isnan(lot):
        lot = parse_lot(item.get("lotAreaValue"), item.get("lotAreaUnits"))
    r["lotSize_acres"] = lot
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    rows = []
    with open(RAW, "rb") as f:
        for i, item in enumerate(ijson.items(f, "item", use_float=True)):
            if args.limit and i >= args.limit:
                break
            rows.append(row(item))
            if i and i % 2000 == 0:
                print(f"  {i} items", flush=True)
    df = pd.DataFrame(rows).drop_duplicates("zpid")
    df["zpid"] = df["zpid"].astype("Int64")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(args.out, index=False)
    print("shape:", df.shape)
    print("null rate:\n" + df.isna().mean().round(3).to_string())


if __name__ == "__main__":
    main()
