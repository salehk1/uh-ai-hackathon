# Houston Housing "Price Receipt"

UH AI Hackathon, Track 2. For every Houston listing we predict a **fair price**, itemize **why**
with location-specific contributions (a "receipt"), flag homes as **over- or underpriced**, and
expose it all to an LLM agent that runs analyses and returns maps and charts.

## Problem

A list price tells a buyer nothing about *why* a home costs what it does. The same extra bathroom
or school-rating point is worth very different amounts in River Oaks vs. Katy. We want a price
model that is (1) honestly validated across space, (2) explainable per home in dollars, and
(3) queryable in plain English.

## Data

`houston_housing_market_2024.json`: 6.7 GB JSON array of 25,945 Zillow listings, streamed
with `ijson` (never loaded whole). After cleaning (single-family, townhouse and condo only;
price > 0; living area > 300 sqft; inside the Houston metro bbox; $/sqft trimmed at the 1st/99th
percentiles of $92 and $666), **21,659 homes** remain.

Target: `log(price / livingArea)`. Features: size, lot acres, beds, baths, age, home type,
HOA, tax rate, mean school rating, haversine km to Downtown, the Galleria and the Texas Medical
Center, regex text flags (pool, renovated, new construction, "never flooded", garage, acreage),
and an out-of-fold kNN spatial lag. Zestimate and rentZestimate are **never** used as features
because they would leak the answer. They appear only as a benchmark.

## Method

| Step | What | Where |
|---|---|---|
| Spatial block CV | 5 folds made from a ~2 km lat/lon grid. Whole blocks are held out together, so the model never "sees" a neighbor of a test home. | `spatial.block_folds` |
| kNN spatial lag | Mean log $/sqft of the 15 nearest homes, excluding the home itself, computed **from training-fold homes only** inside CV | `train.lag_for` |
| Moran's I | kNN (k=15) row-standardized weights, with a 99-permutation test | q: `moran`, `moranperm` |
| GWR | Adaptive bisquare kernel over the k nearest homes, with k chosen by spatial CV from {50, 100, 200}. A weighted least-squares fit at every home on standardized [livingArea, age, school_mean, dist_downtown, beds, baths] gives one set of local coefficients per home. | q: `gwr` (`inv` / `mmu`) |
| Models | A: global hedonic OLS · B: GWR · C: LightGBM (all features + spatial lag + lat/lon) | `train.py` |

**All spatial statistics run in q via PyKX** (`spatial.py`). A scipy KD-tree only finds neighbor
indices. The numpy fallback is checked against q to 1e-13 and runs automatically if q is
unavailable. The full GWR bandwidth search plus final fit over 21.7k homes takes about 11 s in q.

### Spatial structure (Moran's I, kNN k=15)

| Series | Moran's I | perm. p |
|---|---|---|
| log $/sqft | **0.562** | < 0.01 |
| Global OLS residuals | 0.433 | < 0.01 |
| GWR residuals | **0.054** | < 0.01 |

Price per sqft is strongly clustered. A global model leaves most of that clustering in its
errors. GWR's local coefficients absorb about 88% of it, which is why location-specific
receipts make sense. The local coefficients vary widely: the school-rating effect ranges from
−0.87 to +3.7 log points per SD across the city, and the downtown-distance effect flips sign
between neighborhoods.

## Leaderboard (5-fold spatial block CV, metrics on price in $)

![leaderboard](results/leaderboard.png)

| Model | MAE | MAPE | R² | Residual Moran's I (OOF) |
|---|---|---|---|---|
| A: Global hedonic OLS | $110,374 | 20.0% | 0.725 | 0.455 |
| B: GWR (k=200, q) | $86,799 | 15.7% | 0.814 | 0.208 |
| **C: LightGBM + spatial lag** | **$65,698** | **11.7%** | **0.882** | 0.232 |
| Zestimate (benchmark, 20,392 rows) | $17,778 | 3.4% | 0.990 | n/a |

**Reading the Zestimate row honestly:** for homes *on the market*, Zillow's Zestimate
incorporates the list price itself, so its 3.4% error against list price is not a like-for-like
comparison. Our models never see the list price of the home they score, or of any home in the
same 2 km block. The fair comparison is our three models against each other. Against the
Zestimate, the point is that our prices are independent: a large gap between list price and our
fair price is a signal, while a Zestimate that tracks the list price is not.

## Price receipt

The published fair price for each home is the **out-of-fold** LightGBM prediction, so a listing
never prices itself. The receipt itemizes it with the home's local GWR coefficients:

```
Neighborhood baseline ($148/sqft × sqft)   $286,980
Size (1,943 sqft)                            +4,475
Age (6 yrs)                                 +11,791
Schools (avg 4.7/10)                         +4,133
Location (20.4 km to Downtown)              +11,976
Bedrooms (4)                                   +309
Bathrooms (3)                                  +526
Other features & ML adjustment              −24,536
--------------------------------------------------
Fair price                                 $295,654   (list $450,000 → overpriced +52%)
```

Each line is local coefficient × standardized feature, converted from log space to $ with the
logarithmic-mean (LMDI) decomposition, so the lines sum **exactly** to the predicted price.
`residual_pct = (list − predicted)/predicted`. Above +10% is labeled overpriced, below −10% is
underpriced, and anything else is fair. Result: 4,491 overpriced, 4,562 underpriced, 12,606 fair.

## Agent

`POST /chat` runs a tool-calling loop on **Qwen/Qwen3-32B via Featherless** (OpenAI SDK) with
at most 5 tool steps. The tools are the API endpoints themselves. The system prompt restricts
answers to tool results and requires cited numbers. The response is
`{text, visuals: [{type: "map"|"bar"|"receipt", data}], tool_calls, mode}`. If native tool
calling fails, the agent falls back to JSON-mode tool selection (`{"tool":..,"args":..}`). Both
paths are tested.

| Endpoint | Purpose |
|---|---|
| `GET /health` | DB row count and compute engine |
| `GET /home/{zpid}` | Listing and its receipt |
| `POST /predict` | Fair price and receipt for a hypothetical home (saved LightGBM model, nearest home's GWR coefficients) |
| `POST /search` | Top 20 by filters (price, beds, zip, radius, label), most underpriced first |
| `GET /compare?zips=77002,77019` | Median $/sqft, % over/underpriced, mean school rating |
| `GET /map?metric=residual_pct\|ppsf\|label&zip=` | GeoJSON points (cap 3000) |
| `GET /stats` | Leaderboard and Moran's I |
| `POST /chat` | The agent |

## How to run

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
# .env: FEATHERLESS_API_KEY, SUPABASE_URL, SUPABASE_DB_URL (session pooler URL if your network is IPv4-only)
# raw data: unzip into data/raw/houston_housing_market_2024.json
python extract.py        # Phase 1: stream JSON to data/homes.parquet        (~1 min)
python features.py       # Phase 2: clean + features                          (seconds)
python analysis_q.py     # Phase 3: lag, Moran's I, GWR in q                  (~12 s)
python train.py          # Phase 4: CV leaderboard, predictions, receipts     (~30 s)
python load.py           # Phase 5: schema + COPY into Supabase               (~3 s)
uvicorn api.main:app --port 8000          # Phase 6
python api/test_api.py                    # smoke-test every endpoint
```

Every step accepts a sample input for quick iteration
(`extract.py --limit 500 --out data/homes_sample.parquet`, then `--tag _sample` for Phases 3 and 4).

## Limitations

- These are list prices, not sale prices. "Overpriced" means relative to comparable listings.
- A single 2024 snapshot with no time dynamics.
- The text flags are simple regexes.
- Receipt line items explain the GWR component. Whatever LightGBM adds on top is shown as one
  "ML adjustment" line rather than being hidden.
