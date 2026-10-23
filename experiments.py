"""Step 2: training improvements, each scored as a leaderboard row under the same spatial block CV.

Usage: python experiments.py [--stages ablation,text,optuna,combined,breakdown,curve] [--trials 40] [--tag ""]
Rows accumulate in results/experiments.json (train.py merges them into metrics.json);
the winning LightGBM config goes to results/best_config.json.
"""
import argparse
import json
import time
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import spatial as sp  # noqa: E402
from train import BASE_COLS, LGB_PARAMS, LGB_ROUNDS, board_row, cv_lgb, load_emb, pca_extra  # noqa: E402

INK, MUTED, GRID, SURFACE, BLUE = "#1f1f1e", "#6b6a66", "#e6e5e1", "#fcfcfb", "#2a78d6"
STAGES = ["ablation", "text", "optuna", "combined", "breakdown", "curve"]


class Ctx:
    def __init__(self, inp, tag):
        self.tag = tag
        self.df = pd.read_parquet(inp)
        self.y = self.df.y.to_numpy()
        self.sqft, self.price = self.df.livingArea.to_numpy(), self.df.price.to_numpy()
        self.xy = sp.xy_km(self.df.latitude, self.df.longitude)
        self.folds = sp.block_folds(self.xy)
        self.has_z = (self.df.zestimate > 0).to_numpy()
        self.nn = sp.knn(self.xy, self.xy, 15, exclude_self=True)[1]
        self.path = Path(f"results/experiments{tag}.json")
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {"rows": {}, "notes": {}}

    def X(self, drop=()):
        return self.df[[c for c in BASE_COLS if c not in drop]].to_numpy(float)

    def mape(self, p):
        pp = self.sqft * np.exp(p)
        return float((np.abs(pp - self.price) / self.price).mean() * 100)

    def row(self, name, p, **extra):
        r = board_row(self.price, self.sqft * np.exp(p), self.has_z, self.y - p, self.nn)
        self.state["rows"][name] = {**r, **extra}
        self.save()
        print(f"  {name:<46} MAPE {r['MAPE']:.2f}  MAE {r['MAE']:,.0f}  R2 {r['R2']:.3f}", flush=True)
        return r

    def save(self):
        self.path.write_text(json.dumps(self.state, indent=2))


def base_pred(c):
    cache = Path(f"data/oof_base{c.tag}.npy")
    if cache.exists():
        return np.load(cache)
    p = cv_lgb(c.X(), c.y, c.xy, c.folds)
    np.save(cache, p)
    return p


def stage_ablation(c):
    base = c.mape(base_pred(c))
    flags = [b for b in BASE_COLS if b.startswith("flag_")]
    for name, kw in [("LightGBM − spatial lag", {"use_lag": False}),
                     ("LightGBM − text flags", {"drop": flags}),
                     ("LightGBM − schools", {"drop": ["school_mean"]})]:
        p = cv_lgb(c.X(kw.get("drop", ())), c.y, c.xy, c.folds, use_lag=kw.get("use_lag", True))
        c.row(name, p, delta_MAPE_vs_full=round(c.mape(p) - base, 2))


def stage_text(c):
    base = c.mape(base_pred(c))
    p = cv_lgb(c.X(), c.y, c.xy, c.folds, extra=pca_extra(load_emb(c.df, c.tag)))
    c.row("LightGBM + MiniLM text (PCA 16)", p, delta_MAPE_vs_full=round(c.mape(p) - base, 2))


def stage_optuna(c, trials):
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)

    def objective(t):
        params = {**LGB_PARAMS,
                  "num_leaves": t.suggest_int("num_leaves", 15, 255, log=True),
                  "learning_rate": t.suggest_float("learning_rate", 0.01, 0.1, log=True),
                  "min_child_samples": t.suggest_int("min_child_samples", 5, 100, log=True),
                  "feature_fraction": t.suggest_float("feature_fraction", 0.4, 1.0)}
        m = c.mape(cv_lgb(c.X(), c.y, c.xy, c.folds, params))
        print(f"    trial {t.number:>2}: MAPE {m:.3f} {t.params}", flush=True)
        return m

    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=42))
    study.enqueue_trial({k: LGB_PARAMS[k] for k in ("num_leaves", "learning_rate", "min_child_samples", "feature_fraction")})
    t0 = time.time()
    study.optimize(objective, n_trials=trials)
    best = {**LGB_PARAMS, **study.best_params}
    p = cv_lgb(c.X(), c.y, c.xy, c.folds, best)
    c.state["notes"]["optuna"] = {"trials": trials, "best_params": study.best_params, "best_MAPE": round(study.best_value, 3),
                                  "default_MAPE": round(study.trials[0].value, 3), "minutes": round((time.time() - t0) / 60, 1),
                                  "history": [round(t.value, 3) for t in study.trials]}
    c.row(f"LightGBM tuned (Optuna, {trials} trials)", p, delta_MAPE_vs_full=round(c.mape(p) - c.mape(base_pred(c)), 2))
    np.save(f"data/oof_tuned{c.tag}.npy", p)


def stage_combined(c):
    """Pick the published config: tuned params if they helped, text embeddings if they helped."""
    rows, base = c.state["rows"], c.mape(base_pred(c))
    tuned = c.state["notes"].get("optuna", {}).get("best_params")
    params = {**LGB_PARAMS, **(tuned or {})}
    text_lift = rows.get("LightGBM + MiniLM text (PCA 16)", {}).get("delta_MAPE_vs_full", 0)
    use_text = text_lift < 0
    p = cv_lgb(c.X(), c.y, c.xy, c.folds, params, extra=pca_extra(load_emb(c.df, c.tag)) if use_text else None)
    name = "LightGBM tuned" + (" + text" if use_text else "")
    if name != "LightGBM tuned":
        c.row(name, p, delta_MAPE_vs_full=round(c.mape(p) - base, 2))
    chosen = {"params": {k: params[k] for k in ("num_leaves", "learning_rate", "min_child_samples", "feature_fraction")},
              "rounds": LGB_ROUNDS, "text_emb": bool(use_text)}
    if c.mape(p) >= base:  # nothing beat the defaults: keep them
        chosen = {"params": {}, "rounds": LGB_ROUNDS, "text_emb": False}
    chosen["chosen_MAPE"] = round(min(c.mape(p), base), 3)
    Path("results/best_config.json").write_text(json.dumps(chosen, indent=2))
    np.save(f"data/oof_best{c.tag}.npy", p if c.mape(p) < base else base_pred(c))
    print("  best config:", chosen)


def _style(ax):
    ax.set_facecolor(SURFACE)
    ax.tick_params(colors=MUTED, labelsize=8, length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_axisbelow(True)


def stage_breakdown(c):
    best = Path(f"data/oof_best{c.tag}.npy")
    p = np.load(best) if best.exists() else base_pred(c)
    ape = np.abs(c.sqft * np.exp(p) - c.price) / c.price * 100
    d = pd.DataFrame({"ape": ape, "type": c.df.homeType.values,
                      "decile": pd.qcut(c.price, 10, labels=False) + 1, "price": c.price})
    by_type = d.groupby("type").agg(MAPE=("ape", "mean"), n=("ape", "size")).sort_values("MAPE")
    by_dec = d.groupby("decile").agg(MAPE=("ape", "mean"), lo=("price", "min"), hi=("price", "max"), n=("ape", "size"))
    c.state["notes"]["error_breakdown"] = {
        "by_home_type": by_type.round(2).reset_index().to_dict("records"),
        "by_price_decile": by_dec.round(2).reset_index().to_dict("records")}
    c.save()
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 3.6), dpi=150, facecolor=SURFACE,
                                 gridspec_kw={"width_ratios": [1, 2.2]})
    for ax in (a1, a2):
        _style(ax)
    bars = a1.barh(by_type.index, by_type.MAPE, color=BLUE, height=0.55)
    for b, (v, n) in zip(bars, by_type[["MAPE", "n"]].to_numpy()):
        a1.text(v + 0.3, b.get_y() + b.get_height() / 2, f"{v:.1f}%  (n={int(n):,})", va="center", fontsize=8, color=INK)
    a1.set_xlim(0, by_type.MAPE.max() * 1.6)
    a1.xaxis.grid(True, color=GRID, linewidth=0.8)
    a1.set_title("MAPE by home type", loc="left", fontsize=10, color=INK)
    labels = [f"D{i}\n${lo / 1e3:,.0f}–{hi / 1e3:,.0f}k" for i, lo, hi in zip(by_dec.index, by_dec.lo, by_dec.hi)]
    bars = a2.bar(labels, by_dec.MAPE, color=BLUE, width=0.6)
    for b, v in zip(bars, by_dec.MAPE):
        a2.text(b.get_x() + b.get_width() / 2, v + 0.3, f"{v:.1f}%", ha="center", fontsize=8, color=INK)
    a2.yaxis.grid(True, color=GRID, linewidth=0.8)
    a2.tick_params(axis="x", labelsize=6.5)
    a2.set_title("MAPE by list-price decile", loc="left", fontsize=10, color=INK)
    a2.set_ylabel("MAPE (%)", color=MUTED, fontsize=8)
    fig.suptitle("Where the fair-price model errs (out-of-fold, spatial block CV)", x=0.01, ha="left", fontsize=11, color=INK)
    fig.tight_layout()
    fig.savefig(f"results/error_breakdown{c.tag}.png", facecolor=SURFACE)
    print(by_type.round(2).to_string(), "\n", by_dec[["MAPE", "n"]].round(2).to_string())


def stage_curve(c):
    cfg = json.loads(Path("results/best_config.json").read_text()) if Path("results/best_config.json").exists() else {}
    params = {**LGB_PARAMS, **cfg.get("params", {})}
    extra = pca_extra(load_emb(c.df, c.tag)) if cfg.get("text_emb") else None
    fracs = [0.1, 0.25, 0.5, 0.75, 1.0]
    pts = []
    for fr in fracs:
        m = c.mape(cv_lgb(c.X(), c.y, c.xy, c.folds, params, extra=extra, train_frac=fr))
        n_train = int(np.mean([(c.folds != f).sum() for f in range(5)]) * fr)
        pts.append({"train_frac": fr, "n_train": n_train, "MAPE": round(m, 3)})
        print(f"  frac {fr:.2f} (n≈{n_train:,}): MAPE {m:.2f}", flush=True)
    c.state["notes"]["learning_curve"] = pts
    c.save()
    hist = c.state["notes"].get("optuna", {}).get("history")
    fig, axes = plt.subplots(1, 2 if hist else 1, figsize=(10 if hist else 5.5, 3.4), dpi=150, facecolor=SURFACE)
    axes = np.atleast_1d(axes)
    for ax in axes:
        _style(ax)
        ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    a = axes[0]
    a.plot([q["n_train"] for q in pts], [q["MAPE"] for q in pts], color=BLUE, lw=2, marker="o", ms=6)
    for q in pts:
        a.annotate(f"{q['MAPE']:.1f}%", (q["n_train"], q["MAPE"]), textcoords="offset points", xytext=(0, 7),
                   ha="center", fontsize=8, color=INK)
    a.set_xlabel("training homes per fold", color=MUTED, fontsize=8)
    a.set_ylabel("OOF MAPE (%)", color=MUTED, fontsize=8)
    a.set_title("Learning curve (spatial block CV)", loc="left", fontsize=10, color=INK)
    if hist:
        b = axes[1]
        best = np.minimum.accumulate(hist)
        b.plot(range(1, len(hist) + 1), hist, color="#a3a29d", lw=0, marker="o", ms=4, label="trial")
        b.plot(range(1, len(hist) + 1), best, color=BLUE, lw=2, label="best so far")
        b.set_xlabel("Optuna trial", color=MUTED, fontsize=8)
        b.set_title("Optuna search (OOF MAPE %)", loc="left", fontsize=10, color=INK)
        b.legend(frameon=False, fontsize=8, labelcolor=INK)
    fig.tight_layout()
    fig.savefig(f"results/learning_curve{c.tag}.png", facecolor=SURFACE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/features.parquet")
    ap.add_argument("--tag", default="")
    ap.add_argument("--stages", default=",".join(STAGES))
    ap.add_argument("--trials", type=int, default=40)
    args = ap.parse_args()
    c = Ctx(args.inp, args.tag)
    for s in args.stages.split(","):
        t = time.time()
        print(f"== {s}", flush=True)
        if s == "optuna":
            stage_optuna(c, args.trials)
        else:
            globals()[f"stage_{s}"](c)
        print(f"   ({time.time() - t:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
