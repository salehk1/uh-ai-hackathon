"""Phase 4: spatial block CV over OLS / GWR / LightGBM, Zestimate benchmark, final predictions + receipts.

Usage: python train.py [--in data/features.parquet] [--tag ""]
Writes results/metrics.json, results/leaderboard.png, data/predictions.parquet, data/models/*.
"""
import argparse
import json
import time
from pathlib import Path

import lightgbm as lgb
import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import receipt  # noqa: E402
import spatial as sp  # noqa: E402
from analysis_q import gwr_predict_oof  # noqa: E402
from features import FEATURES  # noqa: E402

LGB_FEATURES = FEATURES + ["latitude", "longitude", "spatial_lag"]
LGB_PARAMS = dict(objective="regression", learning_rate=0.03, num_leaves=63, min_child_samples=20,
                  feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1)
LGB_ROUNDS = 1200
OLS_FEATURES = [f for f in FEATURES if f != "type_SINGLE_FAMILY"]  # reference category


def lag_for(xy, y, tr, te, k):
    """Spatial lag from training-fold neighbors only (self excluded for training rows)."""
    lag_tr = sp.spatial_lag(y[tr], sp.knn(xy[tr], xy[tr], k, exclude_self=True)[1])
    lag_te = sp.spatial_lag(y[tr], sp.knn(xy[tr], xy[te], k)[1])
    return lag_tr, lag_te


def metrics(price, pred):
    err = pred - price
    return {"MAE": round(float(np.abs(err).mean()), 0),
            "MAPE": round(float((np.abs(err) / price).mean() * 100), 2),
            "R2": round(float(1 - (err ** 2).sum() / ((price - price.mean()) ** 2).sum()), 4)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/features.parquet")
    ap.add_argument("--tag", default="")
    args = ap.parse_args()
    t0 = time.time()
    df = pd.read_parquet(args.inp)
    meta = json.loads(Path(f"data/gwr_meta{args.tag}.json").read_text())
    y, sqft, price = df.y.to_numpy(), df.livingArea.to_numpy(), df.price.to_numpy()
    xy = sp.xy_km(df.latitude, df.longitude)
    folds = sp.block_folds(xy)
    k_lag, k_gwr = meta["k_lag"], meta["k_best"]

    oof = {m: np.empty(len(df)) for m in ["OLS", "GWR", "LightGBM"]}
    Xo = np.c_[np.ones(len(df)), df[OLS_FEATURES].to_numpy(float)]
    Xl = df[FEATURES + ["latitude", "longitude"]].to_numpy(float)
    for f in range(folds.max() + 1):
        tr, te = np.where(folds != f)[0], np.where(folds == f)[0]
        beta, *_ = np.linalg.lstsq(Xo[tr], y[tr], rcond=None)
        oof["OLS"][te] = Xo[te] @ beta
        lag_tr, lag_te = lag_for(xy, y, tr, te, k_lag)
        booster = lgb.train(LGB_PARAMS, lgb.Dataset(np.c_[Xl[tr], lag_tr], y[tr]), LGB_ROUNDS)
        oof["LightGBM"][te] = booster.predict(np.c_[Xl[te], lag_te])
        print(f"  fold {f}: n_test={len(te)}", flush=True)
    Z, _ = sp.standardize(df, meta["vars"], {k: tuple(v) for k, v in meta["stats"].items()})
    oof["GWR"] = gwr_predict_oof(Z, y, xy, folds, k_gwr)
    for m in oof:  # keep predictions inside the (trimmed) training range of log ppsf
        oof[m] = np.clip(oof[m], y.min(), y.max())

    # Metrics on price ($), plus Zestimate benchmark on the rows that have one
    has_z = (df.zestimate > 0).to_numpy()
    _, nn = sp.knn(xy, xy, k_lag, exclude_self=True)
    board = {}
    for m, p in oof.items():
        pp = sqft * np.exp(p)
        board[m] = {**metrics(price, pp), "MAPE_zestimate_rows": metrics(price[has_z], pp[has_z])["MAPE"],
                    "moran_resid_oof": sp.morans_i(y - p, nn, n_perm=19)["I"]}
    zm = metrics(price[has_z], df.zestimate.to_numpy()[has_z])
    board["Zestimate (benchmark)"] = {**zm, "MAPE_zestimate_rows": zm["MAPE"], "moran_resid_oof": None}
    best = min(oof, key=lambda m: board[m]["MAPE"])
    out = {"n": len(df), "n_zestimate": int(has_z.sum()), "cv": "5-fold spatial block CV (2km grid)",
           "best_model": best, "gwr_k": k_gwr, "leaderboard": board}
    Path("results").mkdir(exist_ok=True)
    Path(f"results/metrics{args.tag}.json").write_text(json.dumps(out, indent=2))

    print(f"\n{'model':<24}{'MAE $':>10}{'MAPE %':>9}{'R2':>8}{'MAPE(z rows)':>14}{'resid I':>9}")
    for m, r in board.items():
        mi = "" if r["moran_resid_oof"] is None else f"{r['moran_resid_oof']:.3f}"
        print(f"{m:<24}{r['MAE']:>10,.0f}{r['MAPE']:>9.2f}{r['R2']:>8.3f}{r['MAPE_zestimate_rows']:>14.2f}{mi:>9}")
    print(f"best: {best}  (zestimate rows: {has_z.sum()})")
    plot(board, f"results/leaderboard{args.tag}.png")

    # Final model on all rows (for /predict) — OOF predictions are what we publish per listing.
    models = Path("data/models")
    models.mkdir(parents=True, exist_ok=True)
    lag_all = sp.spatial_lag(y, nn)
    lgb.train(LGB_PARAMS, lgb.Dataset(np.c_[Xl, lag_all], y), LGB_ROUNDS).save_model(models / f"lgbm{args.tag}.txt")
    beta_all, *_ = np.linalg.lstsq(Xo, y, rcond=None)
    (models / f"meta{args.tag}.json").write_text(json.dumps(
        {"best_model": best, "lgb_features": LGB_FEATURES, "ols_features": OLS_FEATURES,
         "ols_beta": beta_all.tolist(), **meta}, indent=2))

    pred_price = sqft * np.exp(oof[best])
    coefs = pd.read_parquet(f"data/gwr_coefs{args.tag}.parquet").set_index("zpid").loc[df.zpid]
    bcols = [f"b_{c}" for c in ["intercept"] + meta["vars"]]
    B = coefs[bcols].to_numpy()
    raws = df[meta["vars"]].to_dict("records")
    contribs = [json.dumps(receipt.build(raws[i], Z[i], B[i], meta["vars"], pred_price[i])) for i in range(len(df))]
    res = (price - pred_price) / pred_price
    pred = df.assign(pred_price=pred_price.round(0), residual_pct=res.round(4),
                     label=np.select([res > 0.10, res < -0.10], ["overpriced", "underpriced"], "fair"),
                     contributions=contribs)
    pred.to_parquet(f"data/predictions{args.tag}.parquet", index=False)
    print("labels:", pred.label.value_counts().to_dict())
    print(f"done in {time.time() - t0:.1f}s")


def plot(board, path):
    ink, muted, grid, surface = "#1f1f1e", "#6b6a66", "#e6e5e1", "#fcfcfb"
    names = list(board)
    vals = [board[m]["MAPE_zestimate_rows"] for m in names]
    colors = ["#a3a29d" if "Zestimate" in m else "#2a78d6" for m in names]
    fig, ax = plt.subplots(figsize=(7, 3.2), dpi=150, facecolor=surface)
    ax.set_facecolor(surface)
    bars = ax.barh(names[::-1], vals[::-1], color=colors[::-1], height=0.55, edgecolor=surface, linewidth=2)
    for b, v in zip(bars, vals[::-1]):
        ax.text(v + max(vals) * 0.01, b.get_y() + b.get_height() / 2, f"{v:.1f}%", va="center", color=ink, fontsize=9)
    ax.set_xlabel("MAPE on list price (%), rows with a Zestimate; lower is better", color=muted, fontsize=8)
    ax.set_title("Spatial-block CV: fair-price error vs Zestimate", color=ink, fontsize=11, loc="left")
    ax.tick_params(colors=muted, labelsize=9, length=0)
    ax.xaxis.grid(True, color=grid, linewidth=0.8)
    ax.set_axisbelow(True)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xlim(0, max(vals) * 1.15)
    fig.tight_layout()
    fig.savefig(path, facecolor=surface)


if __name__ == "__main__":
    main()
