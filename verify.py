"""Step 3 prep: per-listing evidence for the due-diligence report -> data/listing_details.parquet.

Runs over ALL raw listings (not just the modeled ones) so duplicate detection sees everything.
Evidence only, no scores: each field is later turned into an ok/warning/unknown signal by api/report.py.
Usage: python verify.py [--homes data/homes.parquet] [--extra data/listing_extra.parquet]
"""
import argparse
import re

import numpy as np
import pandas as pd

MIN_DESC_CHARS = 80   # shorter descriptions are too generic to call duplicates
MAX_LIST = 10         # cap stored zpid lists


def shared(df, key_col, explode=False):
    """For each zpid: other zpids sharing a key, split by same vs. different broker."""
    k = df[["zpid", "broker_name", key_col]].copy()
    if explode:
        k = k.explode(key_col)
    k = k.dropna(subset=[key_col]).drop_duplicates(["zpid", key_col])
    pairs = k.merge(k, on=key_col, suffixes=("", "_o"))
    pairs = pairs[pairs.zpid != pairs.zpid_o].drop_duplicates(["zpid", "zpid_o"])
    same = pairs.broker_name.fillna("?").str.lower() == pairs.broker_name_o.fillna("?").str.lower()
    g_same = pairs[same].groupby("zpid").zpid_o.agg(lambda s: sorted(s)[:MAX_LIST])
    g_diff = pairs[~same].groupby("zpid").zpid_o.agg(lambda s: sorted(s)[:MAX_LIST])
    n_same = pairs[same].groupby("zpid").size()
    n_diff = pairs[~same].groupby("zpid").size()
    return g_same, g_diff, n_same, n_diff


def engagement_z(d):
    """Robust z-score of log page views vs. what days-on-market predicts (by home type)."""
    ok = d.daysOnZillow.notna() & d.pageViewCount.notna()
    x, v = np.log1p(d.daysOnZillow.clip(lower=0)), np.log1p(d.pageViewCount.clip(lower=0))
    z = pd.Series(np.nan, index=d.index)
    for _, idx in d[ok].groupby("homeType").groups.items():
        if len(idx) < 50:
            continue
        b = np.polyfit(x[idx], v[idx], 1)
        r = v[idx] - np.polyval(b, x[idx])
        mad = np.median(np.abs(r - np.median(r))) * 1.4826
        z[idx] = (r - np.median(r)) / (mad or 1)
    return z


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--homes", default="data/homes.parquet")
    ap.add_argument("--extra", default="data/listing_extra.parquet")
    ap.add_argument("--out", default="data/listing_details.parquet")
    args = ap.parse_args()
    h = pd.read_parquet(args.homes)
    e = pd.read_parquet(args.extra)
    d = h.merge(e, on="zpid", how="inner")
    d["desc_key"] = (d.description.fillna("").str.lower().map(lambda s: re.sub(r"[^a-z0-9]+", " ", s).strip())
                     .where(lambda s: s.str.len() >= MIN_DESC_CHARS))

    ps, pdf, pns, pnd = shared(d, "photo_ids", explode=True)
    ds, ddf, dns, dnd = shared(d, "desc_key")
    d = d.set_index("zpid")
    d["dup_photo_same_broker_n"] = pns.reindex(d.index).fillna(0).astype(int)
    d["dup_photo_other_broker_n"] = pnd.reindex(d.index).fillna(0).astype(int)
    d["dup_photo_other_broker_zpids"] = pdf.reindex(d.index)
    d["dup_desc_same_broker_n"] = dns.reindex(d.index).fillna(0).astype(int)
    d["dup_desc_other_broker_n"] = dnd.reindex(d.index).fillna(0).astype(int)
    d["dup_desc_other_broker_zpids"] = ddf.reindex(d.index)
    d["n_photo_ids"] = d.photo_ids.str.len().fillna(0).astype(int)
    d = d.reset_index()
    d["engagement_z"] = engagement_z(d).round(2)
    d["has_description"] = d.desc_key.notna()

    cols = ["zpid", "street_address", "city", "state", "zipcode", "latitude", "longitude", "homeType", "price",
            "livingArea", "bedrooms", "bathrooms", "yearBuilt", "lotSize_acres", "monthlyHoaFee", "propertyTaxRate",
            "daysOnZillow", "pageViewCount", "favoriteCount", "home_status", "hdp_url", "date_posted", "scraped_at",
            "agent_name", "agent_license", "agent_phone", "broker_name", "mls_name", "mls_id", "photo_count",
            "n_photo_ids", "rate_30yr", "rate_15yr", "annual_insurance_zillow", "is_undisclosed_address",
            "has_bad_geocode", "has_description", "dup_photo_same_broker_n", "dup_photo_other_broker_n",
            "dup_photo_other_broker_zpids", "dup_desc_same_broker_n", "dup_desc_other_broker_n",
            "dup_desc_other_broker_zpids", "engagement_z"]
    out = d[cols]
    out.to_parquet(args.out, index=False)
    print("shape:", out.shape)
    print("photos shared w/ other broker:", int((out.dup_photo_other_broker_n > 0).sum()),
          "| same broker only:", int(((out.dup_photo_same_broker_n > 0) & (out.dup_photo_other_broker_n == 0)).sum()))
    print("descriptions shared w/ other broker:", int((out.dup_desc_other_broker_n > 0).sum()),
          "| same broker only:", int(((out.dup_desc_same_broker_n > 0) & (out.dup_desc_other_broker_n == 0)).sum()))
    print("|engagement_z| > 3:", int((out.engagement_z.abs() > 3).sum()), "of", int(out.engagement_z.notna().sum()))
    print("missing agent name:", int(out.agent_name.isna().sum()), "| missing license:", int(out.agent_license.isna().sum()))


if __name__ == "__main__":
    main()
