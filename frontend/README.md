# Houston Price Receipt — frontend

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind 4 · MapLibre GL 6 + OpenFreeMap · TanStack Query · Zod · Motion.
Requires Node ≥ 20.9 (developed on Node 24).

## Run it

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

`.env.local` decides where data comes from (server-only; never `NEXT_PUBLIC_`):

| Setting | Effect |
|---|---|
| `DATA_SOURCE=fixtures` | **Placeholder mode.** Deterministic synthetic listings shaped exactly like the backend's responses. A banner says so on every page. |
| `BACKEND_API_URL=http://127.0.0.1:8000` | Live mode: proxies the teammate's FastAPI service. Failures show errors; they never fall back to fixtures. |

See `.env.example`. Run only **one** `next dev` per checkout; two dev servers sharing `.next/` trigger each other's file watchers and reload in a loop.

## Routes

| Route | What it is |
|---|---|
| `/` | Skippable Houston flyover intro (still image with reduced motion; "skip next time" stored locally; replay at `/?intro=1`) |
| `/explore` | Map (up to 3,000 sampled points, clustered) + filters + up to 20 search results, synced hover/selection; all state in the URL |
| `/property/[zpid]` | Full report: identity, price vs. range, range graphic, receipt waterfall + table, ZIP context, nearby listings, description, method notes |
| `/compare` | ZIP comparison chart (one metric at a time) + table; missing ZIPs stay visible |
| `/estimate` | Hypothetical-home form with map picker → estimate, range, receipt; optional asking price compared in the browser only |
| `/methodology` | Evaluation figures read from `/stats` (`results/metrics.json`) |
| Analyst sheet | Opens from the header or "Ask about this home"; renders map/bar/receipt visuals |

## Structure

```
src/app/api/*            same-origin adapter: allowlisted ops → FastAPI or fixtures
src/server/backend.ts    data-source selection, timeouts, x-data-source header
src/server/fixtures/     placeholder dataset + handlers mirroring api/main.py
src/lib/api/             Zod contracts, typed fetch, TanStack Query hooks
src/lib/                 formatters, verdict rules, receipt math, chat normalization
src/components/          ui primitives, map, explore, property, receipt, compare, estimate, analyst, intro
tests/                   contract tests (vitest)
scripts/verify-live.mjs  live adapter ↔ backend check (refuses to pass in fixture mode)
```

## Checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run verify:live -- http://localhost:3000 http://127.0.0.1:8000   # once the API is running
```

## Backend gaps (not faked in the UI)

- No address, photo, agent or listing-evidence fields in `homes`; `api/report.py` (referenced by `verify.py`) isn't committed. The report shows an illustration and one "evidence not available" note.
- `/stats`: `published_model` ("LightGBM q50 + calibrated q10/q90") isn't a leaderboard key; the UI resolves the row dynamically (`src/lib/stats.ts`).
- Running the API needs the private `.env` (`SUPABASE_DB_URL`, `FEATHERLESS_API_KEY`) and the ignored `data/` artifacts.
- `/chat` has no auth or rate limit; agree a demo limit before deploying publicly.
