"""Phase 3: spatial analysis in q via PyKX — kNN spatial lag, Moran's I, GWR.

Usage: python analysis_q.py [--in data/features.parquet] [--tag ""]
Writes data/gwr_coefs.parquet, data/gwr_meta.json, results/spatial.json.
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

import spatial as sp

K_LAG = 15
K_GWR = [50, 100, 200]


def gwr_predict_oof(Z, y, xy, folds, k):
    """Out-of-fold GWR: each test home's local model uses only training-fold neighbors."""
    X = sp.design(Z)
    pred = np.empty(len(y))
    for f in np.unique(folds):
        tr, te = np.where(folds != f)[0], np.where(folds == f)[0]
        d, i = sp.knn(xy[tr], xy[te], k)
        B = sp.gwr_fit(X[tr], y[tr], i, sp.bisquare(d))
        pred[te] = (X[te] * B).sum(1)
    return pred


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/features.parquet")
    ap.add_argument("--tag", default="")
    args = ap.parse_args()
    t0 = time.time()
    df = pd.read_parquet(args.inp)
    y = df.y.to_numpy()
    xy = sp.xy_km(df.latitude, df.longitude)
    folds = sp.block_folds(xy)
    print(f"engine: {'q (PyKX)' if sp.Q else 'numpy fallback'}; n={len(df)}; fold sizes {np.bincount(folds).tolist()}")

    # Spatial lag + Moran's I on log ppsf (k=15, self excluded)
    _, nn = sp.knn(xy, xy, K_LAG, exclude_self=True)
    lag = sp.spatial_lag(y, nn)
    moran_y = sp.morans_i(y, nn)
    print(f"Moran's I log ppsf: {moran_y}; corr(y, lag)={np.corrcoef(y, lag)[0, 1]:.3f}")

    # GWR bandwidth by spatial-block CV
    Z, stats = sp.standardize(df, sp.GWR_VARS)
    cv = {}
    for k in K_GWR:
        if k >= len(df) * 0.5:
            continue
        p = gwr_predict_oof(Z, y, xy, folds, k)
        cv[k] = float(np.sqrt(np.mean((y - p) ** 2)))
        print(f"  GWR k={k}: OOF RMSE(log ppsf)={cv[k]:.4f}")
    k_best = min(cv, key=cv.get)

    # Final local coefficients per home (self excluded, so a listing never prices itself)
    X = sp.design(Z)
    d, i = sp.knn(xy, xy, k_best, exclude_self=True)
    B = sp.gwr_fit(X, y, i, sp.bisquare(d))
    gwr_fit = (X * B).sum(1)

    # Global OLS residuals vs GWR residuals: does GWR soak up the spatial autocorrelation?
    beta_ols, *_ = np.linalg.lstsq(X, y, rcond=None)
    res_ols = y - X @ beta_ols
    res_gwr = y - gwr_fit
    moran_ols = sp.morans_i(res_ols, nn)
    moran_gwr = sp.morans_i(res_gwr, nn)
    print(f"Moran's I OLS residuals: {moran_ols}")
    print(f"Moran's I GWR residuals: {moran_gwr}")

    cols = ["intercept"] + sp.GWR_VARS
    coefs = pd.DataFrame(B, columns=[f"b_{c}" for c in cols])
    coefs.insert(0, "zpid", df.zpid.values)
    coefs["gwr_fit"] = gwr_fit
    coefs["spatial_lag"] = lag
    out = Path(f"data/gwr_coefs{args.tag}.parquet")
    coefs.to_parquet(out, index=False)

    meta = {"k_best": int(k_best), "vars": sp.GWR_VARS, "stats": stats, "k_lag": K_LAG}
    Path(f"data/gwr_meta{args.tag}.json").write_text(json.dumps(meta, indent=2))
    Path("results").mkdir(exist_ok=True)
    report = {"engine": "q" if sp.Q else "numpy", "n": len(df), "moran_log_ppsf": moran_y,
              "moran_ols_resid_insample": moran_ols, "moran_gwr_resid_insample": moran_gwr,
              "gwr_cv_rmse": cv, "gwr_k": int(k_best),
              "gwr_coef_summary": coefs[[f"b_{c}" for c in cols]].describe().loc[["mean", "std", "min", "max"]].round(4).to_dict()}
    Path(f"results/spatial{args.tag}.json").write_text(json.dumps(report, indent=2))
    print(f"k_best={k_best}; wrote {out}; coef means:\n{coefs[[f'b_{c}' for c in cols]].mean().round(4).to_string()}")
    print(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
