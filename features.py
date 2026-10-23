"""Phase 2: clean homes.parquet and build model features -> data/features.parquet.

Usage: python features.py [--in data/homes.parquet] [--out data/features.parquet]
"""
import argparse

import numpy as np
import pandas as pd

HOME_TYPES = ["SINGLE_FAMILY", "TOWNHOUSE", "CONDO"]
BBOX = dict(lat=(29.0, 30.7), lon=(-96.3, -94.6))  # Houston metro
POIS = {"downtown": (29.7604, -95.3698), "galleria": (29.7390, -95.4631), "tmc": (29.7069, -95.4011)}
TEXT_FLAGS = {
    "pool": r"\bpool\b",
    "renovated": r"\b(?:renovat|updated|remodel)",
    "new_construction": r"new construction|newly built|brand new",
    "no_flood": r"(?:no|never) (?:flood|flooded|flooding)|did not flood|didn't flood",
    "garage": r"\bgarage\b",
    "acreage": r"\bacreage\b|\bacres?\b",
}
# Zestimate / rentZestimate are benchmark-only and must never appear here.
NUMERIC = ["livingArea", "lotSize_acres", "bedrooms", "bathrooms", "age", "monthlyHoaFee",
           "propertyTaxRate", "school_mean"] + [f"dist_{k}" for k in POIS]
FEATURES = NUMERIC + [f"type_{t}" for t in HOME_TYPES] + [f"flag_{k}" for k in TEXT_FLAGS]


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def build(df):
    n0 = len(df)
    df = df[df.homeType.isin(HOME_TYPES) & (df.price > 0) & (df.livingArea > 300)
            & df.latitude.between(*BBOX["lat"]) & df.longitude.between(*BBOX["lon"])].copy()
    df["ppsf"] = df.price / df.livingArea
    lo, hi = df.ppsf.quantile([0.01, 0.99])
    df = df[df.ppsf.between(lo, hi)].copy()
    df["y"] = np.log(df.ppsf)

    df["age"] = (2024 - df.yearBuilt).clip(lower=0)
    df["monthlyHoaFee"] = df.monthlyHoaFee.fillna(0)
    for c in ["lotSize_acres", "bedrooms", "bathrooms"]:
        df[c] = df[c].fillna(df.groupby("homeType")[c].transform("median"))
    df["age"] = df.age.fillna(df.age.median())
    for k, (la, lo_) in POIS.items():
        df[f"dist_{k}"] = haversine_km(df.latitude, df.longitude, la, lo_)
    for t in HOME_TYPES:
        df[f"type_{t}"] = (df.homeType == t).astype(int)
    desc = df.description.fillna("").str.lower()
    for k, pat in TEXT_FLAGS.items():
        df[f"flag_{k}"] = desc.str.contains(pat, regex=True).astype(int)
    print(f"kept {len(df)}/{n0} rows; ppsf trim [{lo:.0f}, {hi:.0f}]")
    return df.reset_index(drop=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/homes.parquet")
    ap.add_argument("--out", default="data/features.parquet")
    args = ap.parse_args()
    df = build(pd.read_parquet(args.inp))
    df.to_parquet(args.out, index=False)
    print("homeType:", df.homeType.value_counts().to_dict())
    print("y (log ppsf): mean %.3f sd %.3f" % (df.y.mean(), df.y.std()))
    print("feature null rate:\n" + df[FEATURES].isna().mean().round(3).to_string())
    print("flag rates:", df[[f"flag_{k}" for k in TEXT_FLAGS]].mean().round(3).to_dict())


if __name__ == "__main__":
    main()
