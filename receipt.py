"""Price receipt: itemize a predicted price into location-specific GWR contributions in $.

Log-ppsf model: price = sqft * exp(b0 + sum_j b_j z_j). The baseline is sqft * exp(b0), i.e.
the neighborhood's $/sqft for a metro-average home, times this home's sqft. Each feature's log
contribution c_j = b_j z_j is converted to $ with the logarithmic mean (LMDI), so the items sum
exactly to the GWR price. Any gap to the final model's price is shown as its own line.
"""
import numpy as np

LABELS = {
    "livingArea": lambda r: f"Size ({r['livingArea']:,.0f} sqft)",
    "age": lambda r: f"Age ({r['age']:.0f} yrs)",
    "school_mean": lambda r: f"Schools (avg {r['school_mean']:.1f}/10)",
    "dist_downtown": lambda r: f"Location ({r['dist_downtown']:.1f} km to Downtown)",
    "bedrooms": lambda r: f"Bedrooms ({r['bedrooms']:.0f})",
    "bathrooms": lambda r: f"Bathrooms ({r['bathrooms']:g})",
}


def build(raw, z, betas, vars_, final_price=None):
    """raw: dict of raw feature values; z: standardized values; betas: [b0, b_1..b_p]."""
    sqft = float(raw["livingArea"])
    b0 = float(betas[0])
    c = np.asarray(betas[1:], float) * np.asarray(z, float)
    base = sqft * np.exp(b0)
    gwr_price = sqft * np.exp(b0 + c.sum())
    L = c.sum()
    factor = (gwr_price - base) / L if abs(L) > 1e-9 else base
    items = [{"feature": "baseline", "label": f"Neighborhood baseline (${np.exp(b0):,.0f}/sqft)", "usd": round(base, 0)}]
    for v, cj, bj in zip(vars_, c, betas[1:]):
        items.append({"feature": v, "label": LABELS[v](raw), "usd": round(float(cj * factor), 0),
                      "local_coef": round(float(bj), 4)})
    total = gwr_price
    if final_price is not None:
        items.append({"feature": "other", "label": "Other features & ML adjustment (pool, lot, HOA, text flags)",
                      "usd": round(float(final_price - gwr_price), 0)})
        total = final_price
    # Absorb rounding so the receipt sums to the displayed total exactly.
    items[0]["usd"] += round(total, 0) - sum(i["usd"] for i in items)
    return {"items": items, "gwr_price": round(float(gwr_price), 0), "total": round(float(total), 0)}
