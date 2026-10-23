"""Stream the raw JSON for each listing's own photo URLs (originalPhotos -> mixedSources.jpeg).

Keeps the scraped URLs as-is (no URLs rebuilt from photo IDs). One row per photo, in listing order.
Usage: python extract_photos.py [--limit N] [--out data/listing_photos.parquet]
"""
import argparse
from urllib.parse import urlparse

import ijson
import pandas as pd

RAW = "data/raw/houston_housing_market_2024.json"
HOSTS = {"photos.zillowstatic.com"}
THUMB_W = 800  # preview size; the largest available jpeg is kept for the full-size viewer


def valid(url):
    u = urlparse(url or "")
    return u.scheme == "https" and u.hostname in HOSTS


def photos(item):
    out = []
    for p in item.get("originalPhotos") or []:
        srcs = [s for s in (((p or {}).get("mixedSources") or {}).get("jpeg") or [])
                if valid(s.get("url")) and s.get("width")]
        if not srcs:
            continue
        srcs.sort(key=lambda s: s["width"])
        thumb = next((s for s in srcs if s["width"] >= THUMB_W), srcs[-1])
        full = srcs[-1]
        out.append({"thumb_url": thumb["url"], "full_url": full["url"], "full_width": int(full["width"]),
                    "caption": (p.get("caption") or "").strip() or None})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default="data/listing_photos.parquet")
    args = ap.parse_args()
    rows, seen = [], set()
    with open(RAW, "rb") as f:
        for i, item in enumerate(ijson.items(f, "item", use_float=True)):
            if args.limit and i >= args.limit:
                break
            zpid = int(item["zpid"])
            if zpid in seen:
                continue
            seen.add(zpid)
            rows += [{"zpid": zpid, "idx": k, **p} for k, p in enumerate(photos(item))]
    # Sorted, small row groups: the API reads one listing via row-group statistics instead of loading all
    df = pd.DataFrame(rows).sort_values(["zpid", "idx"])
    df.to_parquet(args.out, index=False, compression="zstd", row_group_size=8192)
    n = df.groupby("zpid").size()
    print(f"listings: {len(seen)}  with photos: {len(n)}  photos: {len(df)}  median/listing: {n.median():.0f}")


if __name__ == "__main__":
    main()
