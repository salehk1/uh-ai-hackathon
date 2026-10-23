# Historical listing recommendations

This release contains only the selected recommendation/cost API, ZIP navigation fixes, independent listing-check fixes and historical-data labels. It does not add the separate Find my fit page, its navigation entry/map, model-reliability warnings, local database preview mode or model audit artifacts. The existing photo gallery and deployment configuration are preserved.

## Endpoint

POST `/recommendations` on FastAPI, or `/api/recommendations` through the existing Next.js server adapter. No database migration or new runtime dependencies are required.

```json
{
  "max_price": 350000,
  "monthly_budget": 2600,
  "min_beds": 3,
  "zipcodes": ["77407"],
  "priorities": ["schools", "space"],
  "stretch_percent": 5
}
```

`max_price` is required. Optional fields: `home_type` (SINGLE_FAMILY, TOWNHOUSE, CONDO), `limit` (1–30; default 12). Priorities: `monthly_cost`, `schools`, `space`. ZIPs are five-digit strings. Stretch defaults to **0**, max 20%. The frontend request/response contract is `frontend/src/lib/api/fit.ts`. Fixture-mode requests to this endpoint explicitly return unavailable instead of pretending to recommend real listings.

The API joins the whole modeled homes table to listing details, applies hard constraints and then ranks the eligible records. It does not reuse the first 20 results from `/search`. Within-budget and stretch groups are scored independently. Each selected priority gets equal weight, based on normalized ranks of distinct known values (lower known monthly costs, higher recorded school rating, larger living area). Missing evidence earns no priority credit; missing HOA/tax earns no monthly-cost credit. Ties use recorded asking price, then zpid. Scores are preference rankings, not confidence, safety or bargain probabilities. Model-relative discounts and demographics are not ranking inputs.

Responses contain `within_budget`, `stretch`, group counts before the display limit, property facts, reasons, exact stretch dollars/percentages, cost breakdowns and limitations. A monthly limit excludes homes whose **known subtotal** already exceeds it. Unknown insurance and other costs mean full monthly affordability remains **incomplete**, even when the subtotal is under budget. Mortgage assumptions: 20% down, 30-year fixed, listing rate or snapshot median. Tax uses the disclosed rate; missing HOA is not assumed to be zero. Zero-rate mortgage calculations are supported.

All prices and school ratings refer to the June 2024 listing snapshot. School averages do not establish school assignment or educational quality. No verified dated crime dataset is available, so crime context is explicitly unavailable. Recorded asking prices are distinct from model estimates, current availability, Zestimates and sales.

## Other selected fixes

- Comparison-table Explore links fit the selected ZIP after the map and matching sample are ready. Empty and invalid-coordinate cases show an explicit notice. Singleton zoom is capped at 14. Rapid ZIP edits survive older URL updates. Saved map views on return are preserved; unrelated controls and pans do not repeatedly refit the map.
- Size checks and comparables require the same property type and exclude the subject. Sparse same-type comparables remain sparse instead of switching to other types.
- Asking-price disagreement is removed from independent listing checks in both real and fixture modes. Price comparison remains in the price section; unrelated checks remain unchanged.

## Verification

- Frontend lint, typecheck, tests and production build.
- `python -m unittest discover -s tests -v` covers budget boundaries, full-pool ranking, priorities, stretch, unknown costs, monthly limits, deterministic ties, condo comparisons and independent checks.
- Read-only real-snapshot API integration checks covered 21,659 homes, budget filters, costs, four ZIP cases (260, 65, 1 and 0 locations), validation and preservation of real gallery photos. No shared database was contacted or changed. Live hosted PostgreSQL and AI-provider calls were not tested in this check.

Model weights, predictions, data artifacts, database schema, secrets and hosting configuration are unchanged. Deployment remains a separate step after review/merge.
