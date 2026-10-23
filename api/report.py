"""Single-listing due-diligence report: three separate questions, evidence only, no invented scores.

1. price         - is the asking price reasonable vs. a calibrated 80% fair-price range?
2. verification  - do listing facts hold up (duplicates, agent, size vs. comps, engagement)?
3. costs         - what will it cost per month, and what is unknown?
Missing evidence is reported as "unknown", never guessed.
"""
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DOWN_PAYMENT = 0.20
TERM_MONTHS = 360
FAR_BELOW_Q10 = 0.85        # asking < 85% of q10 -> warning
SIZE_RATIO = (0.5, 2.0)     # sqft vs. median of same-bed neighbors
MIN_SQFT_PER_BED = 200
ENGAGEMENT_Z = 3.0
N_COMPS = 8


def _num(v):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else float(v)


def _model_info():
    m = json.loads((ROOT / "results/metrics.json").read_text())
    return m.get("intervals", {}), m


def comps(ref, tree, xy_fn, lat, lon, home_type, beds, sqft, zpid):
    """8 nearest similar homes: same type, beds ±1, sqft ±30%; relaxed if too few."""
    _, idx = tree.query(xy_fn([lat], [lon])[0], k=min(400, len(ref)))
    cand = ref.iloc[idx]
    cand = cand[cand.zpid != zpid]
    rules = [("same type, beds ±1, sqft ±30%", 0.3, 1, True), ("same type, beds ±1, sqft ±50%", 0.5, 1, True),
             ("any type, beds ±2, sqft ±50%", 0.5, 2, False)]
    for desc, tol, bd, same_type in rules:
        m = np.ones(len(cand), bool)
        if sqft:
            m &= (cand.livingArea.between(sqft * (1 - tol), sqft * (1 + tol))).to_numpy()
        if beds is not None:
            m &= (np.abs(cand.bedrooms - beds) <= bd).to_numpy()
        if same_type and home_type:
            m &= (cand.homeType == home_type).to_numpy()
        sel = cand[m].head(N_COMPS)
        if len(sel) >= N_COMPS or desc == rules[-1][0]:
            break
    from features import haversine_km
    out = [{"zpid": int(r.zpid), "price": float(r.price), "ppsf": round(float(r.price / r.livingArea), 1),
            "dist_km": round(float(haversine_km(lat, lon, r.latitude, r.longitude)), 2),
            "beds": _num(r.bedrooms), "baths": _num(r.bathrooms), "sqft": float(r.livingArea),
            "home_type": r.homeType, "lat": float(r.latitude), "lon": float(r.longitude)} for r in sel.itertuples()]
    return out, desc


def same_bed_neighbors(ref, tree, xy_fn, lat, lon, beds, n=30):
    _, idx = tree.query(xy_fn([lat], [lon])[0], k=min(400, len(ref)))
    c = ref.iloc[idx]
    return c[c.bedrooms == beds].head(n)


def verification(d, home, asking, q10, ref, tree, xy_fn):
    sig = []

    # 1. Asking far below the fair range
    if asking is None or q10 is None:
        sig.append({"name": "asking_far_below_range", "status": "unknown",
                    "evidence": "No calibrated fair range for this listing (outside the price model's scope)."})
    else:
        ratio = asking / q10
        sig.append({"name": "asking_far_below_range", "status": "warning" if ratio < FAR_BELOW_Q10 else "ok",
                    "evidence": f"Asking ${asking:,.0f} is {ratio:.0%} of the low end of the fair range (q10 ${q10:,.0f}); "
                                f"warning below {FAR_BELOW_Q10:.0%}. Prices far under comparable homes are a common lure in listing scams."})

    # 2. Duplicate photos / description across other listings
    if not d.get("n_photo_ids"):
        sig.append({"name": "duplicate_photos", "status": "unknown", "evidence": "No photos in the listing snapshot."})
    else:
        other, same = d["dup_photo_other_broker_n"], d["dup_photo_same_broker_n"]
        ids = d.get("dup_photo_other_broker_zpids") or []
        sig.append({"name": "duplicate_photos", "status": "warning" if other else "ok",
                    "evidence": (f"{other} other listing(s) from a different broker reuse photos from this one (e.g. zpid {', '.join(map(str, ids[:5]))})."
                                 if other else "No photo is reused by a listing from a different broker.")
                                + (f" {same} listing(s) from the same broker share photos (typical for builder plans)." if same else ""),
                    "related_zpids": ids})
    if not d.get("has_description"):
        sig.append({"name": "duplicate_description", "status": "unknown", "evidence": "Description missing or too short to compare."})
    else:
        other, same = d["dup_desc_other_broker_n"], d["dup_desc_same_broker_n"]
        ids = d.get("dup_desc_other_broker_zpids") or []
        sig.append({"name": "duplicate_description", "status": "warning" if other else "ok",
                    "evidence": (f"Identical description appears on {other} listing(s) from a different broker (e.g. zpid {', '.join(map(str, ids[:5]))})."
                                 if other else "Description is not copied by any listing from a different broker.")
                                + (f" {same} same-broker listing(s) share it." if same else ""),
                    "related_zpids": ids})

    # 3. Agent / broker attribution
    missing = [lab for k, lab in [("agent_name", "agent name"), ("agent_license", "agent license number"),
                                  ("broker_name", "broker")] if not d.get(k)]
    sig.append({"name": "agent_broker_attribution", "status": "warning" if missing else "ok",
                "evidence": (f"Missing: {', '.join(missing)}." if missing else
                             f"Agent {d['agent_name']} ({d['agent_license']}), broker {d['broker_name']}"
                             + (f", MLS {d['mls_name']} #{d['mls_id']}." if d.get("mls_id") else ".")
                             + " Verify the license at trec.texas.gov.")})

    # 4. Size / beds vs. comparable homes
    sqft, beds = _num(d.get("living_area")), _num(d.get("beds"))
    if not sqft or beds is None or d.get("lat") is None:
        sig.append({"name": "size_vs_comps", "status": "unknown", "evidence": "Square footage or bedroom count not reported."})
    else:
        nb = same_bed_neighbors(ref, tree, xy_fn, d["lat"], d["lon"], beds)
        issues, ev = [], []
        if beds > 0 and sqft / beds < MIN_SQFT_PER_BED:
            issues.append(f"only {sqft / beds:.0f} sqft per bedroom")
        if len(nb) >= 5:
            med = float(nb.livingArea.median())
            r = sqft / med
            ev.append(f"{sqft:,.0f} sqft vs median {med:,.0f} sqft for {len(nb)} nearby {beds:.0f}-bed homes ({r:.2f}x)")
            if not SIZE_RATIO[0] <= r <= SIZE_RATIO[1]:
                issues.append(f"size is {r:.2f}x the local {beds:.0f}-bed median")
        sig.append({"name": "size_vs_comps", "status": "warning" if issues else ("ok" if len(nb) >= 5 else "unknown"),
                    "evidence": "; ".join(issues + ev) + "." if (issues or ev) else
                    f"Fewer than 5 nearby {beds:.0f}-bed homes to compare."})

    # 5. Days on market vs. views / favorites
    z, dom, views, favs = _num(d.get("engagement_z")), _num(d.get("days_on_zillow")), _num(d.get("page_views")), _num(d.get("favorites"))
    if z is None or dom is None or views is None:
        sig.append({"name": "engagement_anomaly", "status": "unknown", "evidence": "Days on market or page views not reported."})
    else:
        issues = []
        if abs(z) > ENGAGEMENT_Z:
            issues.append(f"page views are {'far above' if z > 0 else 'far below'} typical for {dom:.0f} days on market (robust z={z:+.1f})")
        if favs is not None and favs > views:
            issues.append("more favorites than page views")
        sig.append({"name": "engagement_anomaly", "status": "warning" if issues else "ok",
                    "evidence": f"{dom:.0f} days on Zillow, {views:,.0f} views, {favs or 0:,.0f} saves"
                                + (f": {'; '.join(issues)}." if issues else " (within the normal range for its home type).")})

    if d.get("is_undisclosed_address") or d.get("has_bad_geocode"):
        sig.append({"name": "address_disclosure", "status": "warning",
                    "evidence": "Zillow marks the address as undisclosed or badly geocoded."})
    return sig


def costs(d, asking, median_rate):
    assumptions, unknowns = [], []
    rate = _num(d.get("rate_30yr"))
    if rate is None:
        rate = median_rate
        assumptions.append(f"Listing had no mortgage rate; used the snapshot median 30-yr fixed rate of {rate:.3f}%.")
    else:
        assumptions.append(f"30-yr fixed rate {rate:.3f}% (Zillow Home Loans rate shown on the listing, snapshot {str(d.get('scraped_at'))[:10]}).")
    principal = asking * (1 - DOWN_PAYMENT)
    r = rate / 100 / 12
    mortgage = principal * r * (1 + r) ** TERM_MONTHS / ((1 + r) ** TERM_MONTHS - 1)
    assumptions.append(f"{DOWN_PAYMENT:.0%} down (${asking * DOWN_PAYMENT:,.0f}); loan ${principal:,.0f}; principal and interest only; no PMI at 20% down.")

    tax_rate = _num(d.get("property_tax_rate"))
    if tax_rate is None:
        tax = "unknown"
        unknowns.append("Property tax rate not reported.")
    else:
        tax = round(tax_rate / 100 * asking / 12, 2)
        assumptions.append(f"Property tax = {tax_rate:.2f}% x asking price / 12. Actual tax uses the appraised value, and rates change yearly.")

    hoa = _num(d.get("monthly_hoa"))
    if hoa is None:
        hoa = "unknown"
        unknowns.append("HOA fee not disclosed in the listing (absence does not mean $0).")
    else:
        assumptions.append(f"HOA ${hoa:,.0f}/month as listed.")

    ins = _num(d.get("annual_insurance_zillow"))
    unknowns.append("Homeowners insurance: no quote" + (f" (Zillow shows an unverified estimate of ${ins:,.0f}/yr, not included)." if ins else "."))
    unknowns += ["Flood insurance: depends on FEMA zone and elevation, check before buying in Houston.",
                 "MUD/PID district taxes may not be included in the listed tax rate.",
                 "Utilities, maintenance and closing costs are not included."]
    known = [round(mortgage, 2)] + [v for v in (tax, hoa) if v != "unknown"]
    return {"monthly": {"mortgage": round(mortgage, 2), "tax": tax, "hoa": hoa, "insurance": "unknown",
                        "total_known": round(sum(known), 2)},
            "assumptions": assumptions, "unknowns": unknowns}


def build(d, home, asking_override, ref, tree, xy_fn, median_rate):
    """d: listing_details row (dict); home: homes row (dict) or None if not modeled."""
    intervals, metrics = _model_info()
    asking = float(asking_override) if asking_override else _num(d.get("price"))
    listing = {k: d.get(k) for k in ("zpid", "street_address", "city", "state", "zipcode", "home_type", "beds", "baths",
                                     "living_area", "year_built", "lot_acres", "lat", "lon", "days_on_zillow",
                                     "page_views", "favorites", "agent_name", "broker_name", "mls_id", "photo_count",
                                     "date_posted", "hdp_url")}
    listing["list_price"] = _num(d.get("price"))
    if listing.get("hdp_url") and listing["hdp_url"].startswith("/"):
        listing["hdp_url"] = "https://www.zillow.com" + listing["hdp_url"]

    comp_list, comp_rule = ([], None)
    if d.get("lat") is not None:
        comp_list, comp_rule = comps(ref, tree, xy_fn, d["lat"], d["lon"], d.get("home_type"), _num(d.get("beds")),
                                     _num(d.get("living_area")), d["zpid"])
    if home:
        fair, q10, q90 = home["pred_price"], home["q10_price"], home["q90_price"]
        verdict = "high" if asking > q90 else "low" if asking < q10 else "expected"
        items = home["contributions"]["items"]
        receipt = [{"feature": i["feature"], "label": i["label"], "usd": i["usd"],
                    "pct": round(100 * i["usd"] / fair, 1)} for i in items]
        price = {"asking": asking, "fair": fair, "q10": q10, "q90": q90, "verdict": verdict,
                 "asking_vs_fair_pct": round(100 * (asking - fair) / fair, 1),
                 "range_coverage": intervals.get("coverage_calibrated"), "receipt": receipt}
    else:
        q10 = None
        price = {"asking": asking, "fair": "unknown", "q10": "unknown", "q90": "unknown", "verdict": "unknown",
                 "reason": "Listing is outside the price model's scope (only single-family, townhouse and condo "
                           "listings with valid size and location are modeled).", "receipt": []}
    price["comps"] = comp_list
    price["comps_rule"] = comp_rule

    sources = [
        {"name": "Zillow listing snapshot", "detail": f"Houston Housing Market 2024 dataset (Kaggle), scraped {str(d.get('scraped_at'))[:10]}",
         "license": "CC BY-NC-SA 4.0"},
        {"name": "Fair-price range", "detail": f"LightGBM quantile models (q10/q50/q90), 5-fold spatial block CV, cross-fold conformal "
                                               f"calibration; out-of-fold coverage {intervals.get('coverage_calibrated', 'n/a')} (target 0.80)"},
        {"name": "Price receipt", "detail": f"Geographically weighted regression (k={metrics.get('gwr_k')}, computed in q/kdb+); "
                                            "items sum to the fair price"},
        {"name": "Comparable homes", "detail": "Nearest listings in the same snapshot (asking prices, not sales)"},
        {"name": "Mortgage rate", "detail": "Zillow Home Loans 30-yr fixed rate embedded in the listing"},
    ]
    limitations = [
        "Asking prices only; no closed-sale prices. 'Fair' means consistent with comparable listings.",
        "One snapshot (June 2024); no market trend adjustment.",
        "The 80% range is calibrated per home type across Houston; individual neighborhoods may be covered more or less often.",
        "Verification signals are evidence for a human to check, not a fraud score.",
        "No inspection, title, flood-zone, or permit data.",
    ]
    return {"listing": listing, "price": price,
            "verification": {"signals": verification(d, home, asking, q10, ref, tree, xy_fn)},
            "costs": costs(d, asking, median_rate), "sources": sources, "limitations": limitations}
