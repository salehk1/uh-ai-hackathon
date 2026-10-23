# Frontend handoff

## Latest frontend
- Branch `frontend`. The latest code commit is `4d71858`, "Frontend: midnight dark theme and simplified intro". This file is committed on top of it.
- The branch builds on `278c8ed`, the commit `backend` already merged in `b7d555e`.
- Since then it adds:
  - `26fb54b`: a daylight redesign.
  - `4d71858`: a dark navy/cyan theme, a dark map with visible 3D buildings, an intro that shows only "QuantHouse", and no logo mark.
- These changes don't touch backend code or API calls.

### Checks run on `4d71858` (fixtures mode)
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` (vitest) | pass, 43/43 |
| `npx next build` | pass, all routes built |
| Docker image / `next build` with `output: "standalone"` | **not run** (that config lives only on `backend`) |
| `npm run verify:live` against the real API | **not run** |

## Merging into `backend`
`frontend` doesn't touch `next.config.ts`, the `Dockerfile`, `start.sh`, `fly.toml` or the deploy files. A merge from `backend` should apply cleanly:

```bash
git checkout backend
git merge origin/frontend
```

After merging, confirm that `frontend/next.config.ts` still has:
- `output: "standalone"`
- the `/backend/:path*` → `http://127.0.0.1:8000/:path*` rewrite

If Git reports a conflict there, keep the `backend` side. Also keep the `backend` versions of the root `README.md`, `Dockerfile` and `start.sh`.

## Fixtures → live data
Data source settings are read on the server only, from `frontend/.env.local` (that file is gitignored).

| Mode | `.env.local` |
|---|---|
| Fixtures (current) | `DATA_SOURCE=fixtures` |
| Live, local API | delete `DATA_SOURCE` (or set it to `live`), then `BACKEND_API_URL=http://127.0.0.1:8000` |
| Live, from a laptop against production | `BACKEND_API_URL=https://quanthouse.casa/backend` |
| Production container | `BACKEND_API_URL=http://127.0.0.1:8000`, set in the image/Fly env |

- **`BACKEND_API_URL` is required in live mode.** If it's missing or invalid, every `/api/*` route returns a "not configured" error. Live failures never fall back to fixtures.
- **Never prefix these with `NEXT_PUBLIC_`.**
- **Restart `next dev` after changing `.env.local`.**
- **Check that fixture mode is off:** the yellow "Development fixtures" banner should disappear, and `/api/health` should answer with `x-data-source: live`.

## Unfinished / placeholder
- **Fixture data:** everything shown in fixtures mode is synthetic, from `src/server/fixtures/` (street names like "Fixture St", no Zillow links). It is labelled with a banner.
- **Training history on `/methodology`:** the leaderboard, learning curve and Optuna trials come from the hardcoded `src/lib/methodology-data.ts`. Only the headline numbers come from `/stats`. Update that file if the models are retrained.
- **Unknown costs:** cost items with no value show as grey hatched placeholders, not estimates.
- **Map console warnings:** the map shows harmless console warnings about two missing icons in the OpenFreeMap dark style.
- **Map timeout:** the map gives up after 12 s and shows a fallback. A slow first load can hit this; reloading fixes it.

## Still to check with real data
1. **Run the live check:** start the API and `next dev` in live mode, then run `npm run verify:live`. It confirms that every route returns `x-data-source: live` and that `/search` → `/home` results match the API exactly.
2. **Check real reports:** open `/property/<zpid>` for a few real listings. Check:
   - the price verdict, range and receipt against the API's `/report` JSON;
   - that the comps map pins sit in the right places;
   - verification warnings, including the case where there are none;
   - monthly costs with missing tax/HOA values.
3. **Check address lookup:** `/lookup?q=<address>` should cover three cases: one match, several matches, and no match.
4. **Check the AI analyst:** check that answers cite the tools that actually ran and that the numbers match the report. Also test:
   - slow replies (the adapter waits up to 150 s);
   - how the error state looks when the LLM is unavailable;
   - that no API keys reach the browser.
5. **Check the other pages:** `/compare` and `/estimate` against live `/compare` and `/predict`.
6. **Check the production build:** build and run the Docker image locally, then check `/api/health` and one full report.
