"""Phase 5: apply db/schema.sql and bulk-load data/predictions.parquet into Supabase with COPY.

Usage: python load.py [--in data/predictions.parquet] [--limit N]
"""
import argparse
import os
from pathlib import Path

import pandas as pd
import psycopg
from dotenv import load_dotenv

COLS = {"zpid": "zpid", "latitude": "lat", "longitude": "lon", "zipcode": "zipcode", "homeType": "home_type",
        "price": "price", "livingArea": "living_area", "bedrooms": "beds", "bathrooms": "baths",
        "yearBuilt": "year_built", "school_mean": "school_mean", "pred_price": "pred_price",
        "q10_price": "q10_price", "q90_price": "q90_price",
        "residual_pct": "residual_pct", "label": "label", "contributions": "contributions",
        "description": "description"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/predictions.parquet")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    load_dotenv(".env")
    df = pd.read_parquet(args.inp)[list(COLS)].rename(columns=COLS)
    if args.limit:
        df = df.head(args.limit)
    df = df.astype(object).where(df.notna(), None)
    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as conn:
        conn.execute(Path("db/schema.sql").read_text())
        with conn.cursor() as cur, cur.copy(f"copy homes ({', '.join(COLS.values())}) from stdin") as cp:
            for row in df.itertuples(index=False):
                cp.write_row(row)
        conn.commit()
        n = conn.execute("select count(*) from homes").fetchone()[0]
        by = conn.execute("select label, count(*) from homes group by 1 order by 1").fetchall()
    print(f"loaded {n} rows (expected {len(df)}): {dict(by)}")
    assert n == len(df)


if __name__ == "__main__":
    main()
