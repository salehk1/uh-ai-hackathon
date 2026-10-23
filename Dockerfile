# One Fly machine runs both services:
#   Next.js frontend  0.0.0.0:8080 (public)   -> its /api/* adapter proxies to
#   FastAPI backend   127.0.0.1:8000 (internal only)

# ---- frontend build ----
FROM node:24-slim AS web
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/

# ---- runtime ----
FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/app/.hf
WORKDIR /app

# libgomp: LightGBM's OpenMP runtime; libstdc++6: node
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 && rm -rf /var/lib/apt/lists/*

COPY requirements-serve.txt .
RUN pip install -r requirements-serve.txt
# Bake the description encoder into the image so /predict never downloads it at request time
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY features.py receipt.py spatial.py load.py ./
COPY db/ db/
COPY api/ api/
COPY results/ results/
COPY data/features.parquet data/gwr_coefs.parquet data/predictions.parquet data/listing_details.parquet data/listing_photos.parquet data/
COPY data/models/ data/models/

COPY --from=web /usr/local/bin/node /usr/local/bin/node
COPY --from=web /web/.next/standalone /app/web
COPY start.sh ./

ENV BACKEND_API_URL=http://127.0.0.1:8000
EXPOSE 8080
CMD ["bash", "start.sh"]
