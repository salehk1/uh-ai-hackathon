"""Stream the raw JSON again for report-only fields (address, agent/broker, photos, rates).

Kept separate from extract.py so the modeling table stays lean.
Usage: python extract_extra.py [--limit N] [--out data/listing_extra.parquet]
"""
import argparse
import re

import ijson
import numpy as np
import pandas as pd

RAW = "data/raw/houston_housing_market_2024.json"
PHOTO_ID = re.compile(r"/fp/([0-9a-f]{32})")


def photo_ids(item):
    ids = []
    for p in item.get("originalPhotos") or []:
        for src in ((p or {}).get("mixedSources") or {}).get("jpeg") or []:
            m = PHOTO_ID.search(src.get("url") or "")
            if m:
                ids.append(m.group(1))
                break
    return ids


def rate(item, bucket):
    r = ((item.get("mortgageZHLRates") or {}).get(bucket) or {}).get("rate")
    return np.nan if r is None else float(r)


def row(item):
    a = item.get("attributionInfo") or {}
    addr = item.get("address") or {}
    return {
        "zpid": int(item["zpid"]),
        "street_address": addr.get("streetAddress") or item.get("streetAddress"),
        "city": addr.get("city") or item.get("city"),
        "state": addr.get("state") or item.get("state"),
        "home_status": item.get("homeStatus"),
        "hdp_url": item.get("hdpUrl"),
        "date_posted": item.get("datePostedString"),
        "scraped_at": item.get("scrapedAt"),
        "agent_name": a.get("agentName"),
        "agent_license": a.get("agentLicenseNumber"),
        "agent_phone": a.get("agentPhoneNumber"),
        "broker_name": a.get("brokerName") or item.get("brokerageName"),
        "mls_name": a.get("mlsName"),
        "mls_id": item.get("mlsid") or a.get("mlsId"),
        "photo_count": item.get("photoCount"),
        "photo_ids": photo_ids(item),
        "rate_30yr": rate(item, "thirtyYearFixedBucket"),
        "rate_15yr": rate(item, "fifteenYearFixedBucket"),
        "annual_insurance_zillow": item.get("annualHomeownersInsurance"),
        "last_sold_price": item.get("lastSoldPrice"),
        "is_undisclosed_address": item.get("isUndisclosedAddress"),
        "has_bad_geocode": item.get("hasBadGeocode"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default="data/listing_extra.parquet")
    args = ap.parse_args()
    rows = []
    with open(RAW, "rb") as f:
        for i, item in enumerate(ijson.items(f, "item", use_float=True)):
            if args.limit and i >= args.limit:
                break
            rows.append(row(item))
    df = pd.DataFrame(rows).drop_duplicates("zpid")
    for c in ["photo_count", "annual_insurance_zillow", "last_sold_price"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df.to_parquet(args.out, index=False)
    print("shape:", df.shape)
    print("null rate:\n" + df.drop(columns="photo_ids").isna().mean().round(3).to_string())
    print("empty photo lists:", round(float((df.photo_ids.str.len() == 0).mean()), 3))


if __name__ == "__main__":
    main()
