"""Shared spatial utilities: projection, block CV folds, kNN, and the q (PyKX) math kernels.

Neighbor *search* uses a scipy KD-tree; all statistics (spatial lag, Moran's I, GWR weighted
least squares) run in q. If q execution is unavailable, identical numpy code runs instead.
"""
import logging

import numpy as np
from scipy.spatial import cKDTree

log = logging.getLogger("spatial")
LAT0, LON0 = 29.7604, -95.3698
GWR_VARS = ["livingArea", "age", "school_mean", "dist_downtown", "bedrooms", "bathrooms"]

try:
    import pykx as kx

    kx.q("2+2")
    Q = True
except Exception as e:  # pragma: no cover
    log.warning("PyKX q execution unavailable (%s); using numpy fallback", e)
    Q = False

if Q:
    kx.q("""
    lag:{[y;idx] avg each y idx};
    moran:{[z;idx] z:z-avg z; (sum z*avg each z idx)%sum z*z};
    moranperm:{[z;idx;n] z:z-avg z; d:sum z*z; {[z;idx;d;s] zz:neg[count z]?z; (sum zz*avg each zz idx)%d}[z;idx;d] each til n};
    gwr:{[X;y;idx;w;lam]
      p:count first X; R:lam*"f"$t=/:t:til p; R[0;0]:0f;
      {[X;y;R;i;wi] Xi:X i; Xw:Xi*wi; (inv R+(flip Xw) mmu Xi) mmu (flip Xw) mmu y i}[X;y;R]'[idx;w]};
    """)


def xy_km(lat, lon):
    lat, lon = np.asarray(lat, float), np.asarray(lon, float)
    return np.c_[(lon - LON0) * 111.32 * np.cos(np.radians(LAT0)), (lat - LAT0) * 110.57]


def block_folds(xy, n_folds=5, block_km=2.0, seed=42):
    """Assign ~2km grid blocks to folds at random (all homes in a block share a fold)."""
    bx, by = np.floor(xy[:, 0] / block_km).astype(int), np.floor(xy[:, 1] / block_km).astype(int)
    blocks, inv = np.unique(bx * 100003 + by, return_inverse=True)
    perm = np.random.default_rng(seed).permutation(len(blocks))
    return perm[inv] % n_folds


def knn(ref_xy, query_xy, k, exclude_self=False):
    """Indices/distances of k nearest ref points to each query point (optionally dropping self)."""
    tree = cKDTree(ref_xy)
    d, i = tree.query(query_xy, k=k + (1 if exclude_self else 0))
    if exclude_self:
        d, i = d[:, 1:], i[:, 1:]
    return d, i


def spatial_lag(y_ref, idx):
    if Q:
        return np.asarray(kx.q("lag", np.asarray(y_ref, float), idx.astype(np.int64)).py())
    return y_ref[idx].mean(1)


def morans_i(z, idx, n_perm=99, seed=0):
    """Moran's I with row-standardised kNN weights, plus a permutation p-value."""
    z = np.asarray(z, float)
    idx = idx.astype(np.int64)
    if Q:
        kx.q(f"\\S {seed + 1}")
        i_obs = float(kx.q("moran", z, idx).py())
        perms = np.asarray(kx.q("moranperm", z, idx, n_perm).py())
    else:
        def _m(v):
            v = v - v.mean()
            return float((v * v[idx].mean(1)).sum() / (v * v).sum())
        i_obs = _m(z)
        rng = np.random.default_rng(seed)
        perms = np.array([_m(rng.permutation(z)) for _ in range(n_perm)])
    p = (1 + (np.abs(perms) >= abs(i_obs)).sum()) / (n_perm + 1)
    return {"I": round(i_obs, 4), "expected": round(-1 / (len(z) - 1), 5), "p_perm": round(float(p), 4)}


def bisquare(d):
    """Adaptive bisquare: bandwidth = distance to the furthest returned neighbor (+eps)."""
    h = d[:, -1:] * 1.0001 + 1e-9
    return (1 - (d / h) ** 2) ** 2


def gwr_fit(X_ref, y_ref, idx, w, lam=1e-2):
    """Local WLS at each query point. X_ref includes an intercept column. Returns (m, p) betas."""
    X_ref = np.asarray(X_ref, float)
    y_ref = np.asarray(y_ref, float)
    if Q:
        b = kx.q("gwr", X_ref, y_ref, idx.astype(np.int64), np.asarray(w, float), lam).py()
        return np.asarray(b, float)
    p = X_ref.shape[1]
    R = lam * np.eye(p)
    R[0, 0] = 0
    Xi = X_ref[idx]                                   # m,k,p
    Xw = Xi * w[..., None]
    A = np.einsum("mkp,mkq->mpq", Xw, Xi) + R
    rhs = np.einsum("mkp,mk->mp", Xw, y_ref[idx])
    return np.linalg.solve(A, rhs[..., None])[..., 0]


def standardize(df, cols, stats=None):
    if stats is None:
        stats = {c: (float(df[c].mean()), float(df[c].std())) for c in cols}
    Z = np.column_stack([(df[c].to_numpy(float) - stats[c][0]) / stats[c][1] for c in cols])
    return Z, stats


def design(Z):
    return np.c_[np.ones(len(Z)), Z]
