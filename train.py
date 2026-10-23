"""Phase 4: spatial block CV over OLS / GWR / LightGBM, calibrated quantile ranges, receipts.

Usage: python train.py [--in data/features.parquet] [--tag ""]
Writes results/metrics.json, results/leaderboard.png, data/predictions.parquet, data/models/*.
If results/best_config.json exists (written by experiments.py), its LightGBM params and text
embedding choice are used for the published models; rows in results/experiments.json are merged
into the leaderboard.
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

BASE_COLS = FEATURES + ["latitude", "longitude"]
LGB_FEATURES = BASE_COLS + ["spatial_lag"]
LGB_PARAMS = dict(objective="regression", learning_rate=0.03, num_leaves=63, min_child_samples=20,
                  feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1)
LGB_ROUNDS = 1200
OLS_FEATURES = [f for f in FEATURES if f != "type_SINGLE_FAMILY"]  # reference category
QUANTILES = {"q10": 0.1, "q50": 0.5, "q90": 0.9}
TARGET_COVERAGE = 0.8
N_PCA = 16


def lag_for(xy, y, tr, te, k):
    """Spatial lag from training-fold neighbors only (self excluded for training rows)."""
    lag_tr = sp.spatial_lag(y[tr], sp.knn(xy[tr], xy[tr], k, exclude_self=True)[1])
    lag_te = sp.spatial_lag(y[tr], sp.knn(xy[tr], xy[te], k)[1])
    return lag_tr, lag_te


def pca_extra(emb, n=N_PCA):
    """Per-fold PCA of description embeddings (fit on training rows only)."""
    from sklearn.decomposition import PCA

    def f(tr, te):
        p = PCA(n, random_state=0).fit(emb[tr])
        return p.transform(emb[tr]), p.transform(emb[te])
    return f


def cv_lgb(X, y, xy, folds, params=LGB_PARAMS, rounds=LGB_ROUNDS, use_lag=True, extra=None, k_lag=15):
    """Out-of-fold LightGBM predictions under the spatial block folds.

    X: base feature matrix; the spatial lag and optional extra(tr, te) features are recomputed per
    fold from training rows only, so nothing about a test home's price leaks in.
    """
    oof = np.empty(len(y))
    for f in range(folds.max() + 1):
        tr, te = np.where(folds != f)[0], np.where(folds == f)[0]
        A_tr, A_te = X[tr], X[te]
        if use_lag:
            lag_tr, lag_te = lag_for(xy, y, tr, te, k_lag)
            A_tr, A_te = np.c_[A_tr, lag_tr], np.c_[A_te, lag_te]
        if extra is not None:
            e_tr, e_te = extra(tr, te)
            A_tr, A_te = np.c_[A_tr, e_tr], np.c_[A_te, e_te]
        oof[te] = lgb.train(params, lgb.Dataset(A_tr, y[tr]), rounds).predict(A_te)
    return np.clip(oof, y.min(), y.max())


def metrics(price, pred):
    err = pred - price
    return {"MAE": round(float(np.abs(err).mean()), 0),
            "MAPE": round(float((np.abs(err) / price).mean() * 100), 2),
            "R2": round(float(1 - (err ** 2).sum() / ((price - price.mean()) ** 2).sum()), 4)}


def board_row(price, pred_price, has_z, resid=None, nn=None):
    r = {**metrics(price, pred_price), "MAPE_zestimate_rows": metrics(price[has_z], pred_price[has_z])["MAPE"]}
    r["moran_resid_oof"] = None if resid is None else sp.morans_i(resid, nn, n_perm=19)["I"]
    return r


def load_config():
    p = Path("results/best_config.json")
    cfg = json.loads(p.read_text()) if p.exists() else {}
    return {"params": {**LGB_PARAMS, **cfg.get("params", {})}, "rounds": cfg.get("rounds", LGB_ROUNDS),
            "text_emb": cfg.get("text_emb", False), "source": str(p) if p.exists() else "defaults"}


def load_emb(df):
    z = np.load("data/desc_emb.npz")
    pos = pd.Series(np.arange(len(z["zpid"])), index=z["zpid"])
    return z["emb"][pos.loc[df.zpid].to_numpy()]


def calibrate(lo, hi, y, folds, target=TARGET_COVERAGE):
    """Conformalized quantile regression, cross-fold: each fold's widening constant comes only
    from the other folds' conformity scores, so the reported coverage is out-of-sample."""
    s = np.maximum(lo - y, y - hi)
    lo_c, hi_c, adj = lo.copy(), hi.copy(), {}
    for f in range(folds.max() + 1):
        o = s[folds != f]
        qf = np.quantile(o, min(1.0, target * (1 + 1 / len(o))))
        te = folds == f
        lo_c[te] -= qf
        hi_c[te] += qf
        adj[int(f)] = round(float(qf), 4)
    q_all = float(np.quantile(s, min(1.0, target * (1 + 1 / len(s)))))
    return lo_c, hi_c, adj, q_all


def coverage(lo, hi, y):
    return round(float(((y >= lo) & (y <= hi)).mean()), 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/features.parquet")
    ap.add_argument("--tag", default="")
    args = ap.parse_args()
    t0 = time.time()
    df = pd.read_parquet(args.inp)
    meta = json.loads(Path(f"data/gwr_meta{args.tag}.json").read_text())
    cfg = load_config()
    y, sqft, price = df.y.to_numpy(), df.livingArea.to_numpy(), df.price.to_numpy()
    xy = sp.xy_km(df.latitude, df.longitude)
    folds = sp.block_folds(xy)
    k_lag, k_gwr = meta["k_lag"], meta["k_best"]
    Xl = df[BASE_COLS].to_numpy(float)
    extra = pca_extra(load_emb(df)) if cfg["text_emb"] else None
    print(f"config: {cfg['source']} text_emb={cfg['text_emb']}")

    oof = {}
    Xo = np.c_[np.ones(len(df)), df[OLS_FEATURES].to_numpy(float)]
    oof["OLS"] = np.empty(len(df))
    for f in range(folds.max() + 1):
        tr, te = np.where(folds != f)[0], np.where(folds == f)[0]
        beta, *_ = np.linalg.lstsq(Xo[tr], y[tr], rcond=None)
        oof["OLS"][te] = Xo[te] @ beta
    Z, _ = sp.standardize(df, meta["vars"], {k: tuple(v) for k, v in meta["stats"].items()})
    oof["GWR"] = gwr_predict_oof(Z, y, xy, folds, k_gwr)
    oof["LightGBM"] = cv_lgb(Xl, y, xy, folds, LGB_PARAMS, LGB_ROUNDS, k_lag=k_lag)
    for m in ("OLS", "GWR"):  # keep predictions inside the (trimmed) training range of log ppsf
        oof[m] = np.clip(oof[m], y.min(), y.max())

    # Quantile models -> calibrated q10/q90 range and a median "fair" price
    qo = {}
    for name, a in QUANTILES.items():
        qo[name] = cv_lgb(Xl, y, xy, folds, {**cfg["params"], "objective": "quantile", "alpha": a},
                          cfg["rounds"], extra=extra, k_lag=k_lag)
        print(f"  quantile {name} done", flush=True)
    q50 = qo["q50"]
    lo_raw, hi_raw = np.minimum(qo["q10"], q50), np.maximum(qo["q90"], q50)
    lo, hi, adj, q_all = calibrate(lo_raw, hi_raw, y, folds)
    oof["LightGBM q50 (published fair price)"] = q50

    has_z = (df.zestimate > 0).to_numpy()
    _, nn = sp.knn(xy, xy, k_lag, exclude_self=True)
    board = {m: board_row(price, sqft * np.exp(p), has_z, y - p, nn) for m, p in oof.items()}
    exp_path = Path(f"results/experiments{args.tag}.json")
    if exp_path.exists():
        board.update(json.loads(exp_path.read_text())["rows"])
    zm = metrics(price[has_z], df.zestimate.to_numpy()[has_z])
    board["Zestimate (benchmark)"] = {**zm, "MAPE_zestimate_rows": zm["MAPE"], "moran_resid_oof": None}

    verdict = np.select([y > hi, y < lo], ["high", "low"], "expected")
    by_type = {t: coverage(lo[m], hi[m], y[m]) for t in df.homeType.unique() for m in [(df.homeType == t).to_numpy()]}
    intervals = {"target": TARGET_COVERAGE, "coverage_raw_q10_q90": coverage(lo_raw, hi_raw, y),
                 "coverage_calibrated": coverage(lo, hi, y), "coverage_calibrated_by_home_type": by_type,
                 "calibration": "cross-fold conformalized quantile regression (log ppsf)",
                 "fold_widening_log": adj, "final_widening_log": round(q_all, 4),
                 "median_width_pct": round(float(np.median(np.exp(hi - lo) - 1) * 100), 1),
                 "verdict_counts": pd.Series(verdict).value_counts().to_dict()}
    best = min((m for m in board if "Zestimate" not in m), key=lambda m: board[m]["MAPE"])
    out = {"n": len(df), "n_zestimate": int(has_z.sum()), "cv": "5-fold spatial block CV (2km grid)",
           "best_model": best, "published_model": "LightGBM q50 + calibrated q10/q90", "gwr_k": k_gwr,
           "config": {k: v for k, v in cfg.items() if k != "source"}, "intervals": intervals, "leaderboard": board}
    Path("results").mkdir(exist_ok=True)
    Path(f"results/metrics{args.tag}.json").write_text(json.dumps(out, indent=2))
    print_board(board)
    print(f"intervals: {json.dumps({k: intervals[k] for k in ('coverage_raw_q10_q90', 'coverage_calibrated', 'median_width_pct', 'verdict_counts')})}")
    plot(board, f"results/leaderboard{args.tag}.png")

    # Final models on all rows (for /predict). OOF predictions are what we publish per listing.
    models = Path("data/models")
    models.mkdir(parents=True, exist_ok=True)
    lag_all = sp.spatial_lag(y, nn)
    A = np.c_[Xl, lag_all]
    lgb.train(LGB_PARAMS, lgb.Dataset(A, y), LGB_ROUNDS).save_model(models / f"lgbm{args.tag}.txt")
    A_q, pca_info = A, None
    if cfg["text_emb"]:
        from sklearn.decomposition import PCA
        emb = load_emb(df)
        pca = PCA(N_PCA, random_state=0).fit(emb)
        A_q = np.c_[A, pca.transform(emb)]
        np.savez(models / f"pca{args.tag}.npz", components=pca.components_, mean=pca.mean_)
        pca_info = {"n": N_PCA, "file": f"pca{args.tag}.npz"}
    for name, a in QUANTILES.items():
        lgb.train({**cfg["params"], "objective": "quantile", "alpha": a}, lgb.Dataset(A_q, y),
                  cfg["rounds"]).save_model(models / f"lgbm_{name}{args.tag}.txt")
    beta_all, *_ = np.linalg.lstsq(Xo, y, rcond=None)
    (models / f"meta{args.tag}.json").write_text(json.dumps(
        {"best_model": best, "lgb_features": LGB_FEATURES, "ols_features": OLS_FEATURES,
         "ols_beta": beta_all.tolist(), "interval_widening_log": q_all, "text_emb_pca": pca_info,
         "y_range": [float(y.min()), float(y.max())], **meta}, indent=2))

    pred_price = sqft * np.exp(q50)
    coefs = pd.read_parquet(f"data/gwr_coefs{args.tag}.parquet").set_index("zpid").loc[df.zpid]
    bcols = [f"b_{c}" for c in ["intercept"] + meta["vars"]]
    B = coefs[bcols].to_numpy()
    raws = df[meta["vars"]].to_dict("records")
    contribs = [json.dumps(receipt.build(raws[i], Z[i], B[i], meta["vars"], pred_price[i])) for i in range(len(df))]
    res = (price - pred_price) / pred_price
    pred = df.assign(pred_price=pred_price.round(0), q10_price=(sqft * np.exp(lo)).round(0),
                     q90_price=(sqft * np.exp(hi)).round(0), residual_pct=res.round(4),
                     label=verdict, contributions=contribs)
    pred.to_parquet(f"data/predictions{args.tag}.parquet", index=False)
    print("verdicts:", pred.label.value_counts().to_dict())
    print(f"done in {time.time() - t0:.1f}s")


def print_board(board):
    print(f"\n{'model':<44}{'MAE $':>10}{'MAPE %':>9}{'R2':>8}{'MAPE(z rows)':>14}{'resid I':>9}")
    for m, r in board.items():
        mi = "" if r.get("moran_resid_oof") is None else f"{r['moran_resid_oof']:.3f}"
        print(f"{m:<44}{r['MAE']:>10,.0f}{r['MAPE']:>9.2f}{r['R2']:>8.3f}{r['MAPE_zestimate_rows']:>14.2f}{mi:>9}")


def plot(board, path):
    ink, muted, grid, surface = "#1f1f1e", "#6b6a66", "#e6e5e1", "#fcfcfb"
    names = list(board)
    vals = [board[m]["MAPE_zestimate_rows"] for m in names]
    colors = ["#a3a29d" if "Zestimate" in m else "#2a78d6" for m in names]
    fig, ax = plt.subplots(figsize=(8, 1.2 + 0.42 * len(names)), dpi=150, facecolor=surface)
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
