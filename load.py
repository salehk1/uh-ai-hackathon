"""Phase 5: apply db/schema.sql and bulk-load data/predictions.parquet into Supabase with COPY.

Usage: python load.py [--in data/predictions.parquet] [--limit N]
"""
import argparse
import hashlib
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
DETAILS = {"latitude": "lat", "longitude": "lon", "homeType": "home_type", "livingArea": "living_area",
           "bedrooms": "beds", "bathrooms": "baths", "yearBuilt": "year_built", "lotSize_acres": "lot_acres",
           "monthlyHoaFee": "monthly_hoa", "propertyTaxRate": "property_tax_rate", "daysOnZillow": "days_on_zillow",
           "pageViewCount": "page_views", "favoriteCount": "favorites"}


def copy_df(conn, table, df):
    df = df.astype(object).where(df.notna(), None)
    with conn.cursor() as cur, cur.copy(f"copy {table} ({', '.join(df.columns)}) from stdin") as cp:
        for row in df.itertuples(index=False):
            cp.write_row([list(map(int, v)) if hasattr(v, "__len__") and not isinstance(v, str) else v for v in row])


def fingerprint(*paths):
    h = hashlib.sha256()
    for p in paths:
        h.update(Path(p).read_bytes())
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/predictions.parquet")
    ap.add_argument("--details", default="data/listing_details.parquet")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--if-changed", action="store_true",
                    help="skip when the inputs match the last load (Fly release_command runs this on every deploy)")
    args = ap.parse_args()
    load_dotenv(".env")
    fp = fingerprint(args.inp, args.details, "db/schema.sql")
    if args.if_changed:
        with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as conn:
            conn.execute("create table if not exists load_meta (id int primary key, fingerprint text, loaded_at timestamptz)")
            row = conn.execute("select fingerprint from load_meta where id = 1").fetchone()
        if row and row[0] == fp and not args.limit:
            print("predictions unchanged since last load; skipping")
            return
    df = pd.read_parquet(args.inp)[list(COLS)].rename(columns=COLS)
    if args.limit:
        df = df.head(args.limit)
    det = pd.read_parquet(args.details).rename(columns=DETAILS)
    if args.limit:
        det = det[det.zpid.isin(df.zpid)]
    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as conn:
        conn.execute(Path("db/schema.sql").read_text())
        copy_df(conn, "homes", df)
        copy_df(conn, "listing_details", det)
        conn.execute("create table if not exists load_meta (id int primary key, fingerprint text, loaded_at timestamptz)")
        conn.execute("insert into load_meta values (1, %s, now()) on conflict (id) do update "
                     "set fingerprint = excluded.fingerprint, loaded_at = now()", ("limit" if args.limit else fp,))
        conn.commit()
        n = conn.execute("select count(*) from homes").fetchone()[0]
        nd = conn.execute("select count(*) from listing_details").fetchone()[0]
        by = conn.execute("select label, count(*) from homes group by 1 order by 1").fetchall()
    print(f"loaded homes {n} (expected {len(df)}): {dict(by)}; listing_details {nd} (expected {len(det)})")
    assert n == len(df) and nd == len(det)


if __name__ == "__main__":
    main()
