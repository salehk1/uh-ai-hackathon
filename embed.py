"""Embed listing descriptions with all-MiniLM-L6-v2 -> data/desc_emb.npz (zpid, emb[384])."""
import sys
import time

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

inp = sys.argv[1] if len(sys.argv) > 1 else "data/features.parquet"
out = sys.argv[2] if len(sys.argv) > 2 else "data/desc_emb.npz"
df = pd.read_parquet(inp, columns=["zpid", "description"])
t = time.time()
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cpu")
emb = model.encode(df.description.fillna("").tolist(), batch_size=128, normalize_embeddings=True,
                   show_progress_bar=False).astype(np.float32)
np.savez(out, zpid=df.zpid.to_numpy(), emb=emb)
print(f"embedded {len(df)} descriptions -> {emb.shape} in {time.time() - t:.0f}s")
