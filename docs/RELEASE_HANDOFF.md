# Integrated QuantHouse release

Prepared October 23, 2026. Combines backend `cb0c33b` and frontend `aec18e2`, including the midnight theme. The existing Fly deployment architecture is preserved: public Next.js on port 8080, internal FastAPI on 8000, and the existing Supabase data/model pipeline.

## Checks completed

- Frontend tests: 43/43 passed after updating a stale model-results assertion to the newly committed backend metrics. The test also distinguishes the published quantile model from the best point-prediction model.
- ESLint and TypeScript: passed.
- Production Next.js build with `output: "standalone"`: passed. Its standalone server was started locally in live mode against the existing remote API.
- Existing `verify-live.mjs`: passed against that standalone server. Search, home, receipt reconciliation, map coordinates, ZIP comparison, prediction, out-of-coverage and stats checks passed with `x-data-source: live`.
- Final report/address/offer and AI checks are recorded in the release PR.

These checks do not constitute a local Docker/Python-image build or a production deployment. No Docker runtime or Fly authentication was available on the review Mac. The existing remote API was still serving its old test site when reviewed; its models can differ from the newer files in this release.

## Hosting owner: finish deployment

The GitHub repository had no `FLY_API_TOKEN` Actions secret when checked. The hosting owner must either:

1. Create an app-scoped deploy token for the existing Fly app `quanthouse`, save it privately as `FLY_API_TOKEN` in this repository's Actions secrets, then run the **Deploy to Fly.io** workflow on main; or
2. Pull the merged main branch on the owner's authenticated machine and run `fly deploy --remote-only` from the repo root.

Do not paste credentials into chat, commit them, or create a second unrelated hosting project.

Keep `DATA_SOURCE` unset or set to `live`. In the combined container `BACKEND_API_URL=http://127.0.0.1:8000` is already provided by the Dockerfile. A leftover `DATA_SOURCE=fixtures` Fly secret would override real data; check environment names privately before release.

The release step is the existing `python load.py --if-changed`, so review database loading behavior and take the normal project backup precautions before deploying changed model/data files. Do not manually run the destructive loader as a frontend setup step.

## Verify after deployment

- `https://quanthouse.casa/` shows the dark QuantHouse frontend, rather than the old FastAPI test page.
- `/api/source` reports `live` and `/api/health` is healthy.
- A real listing report opens, receipt items reconcile, and changing an offer changes the monthly calculation without altering the model estimate.
- Address lookup, comparison, estimator and one actual AI response work on a second device.
- Run `node frontend/scripts/verify-live.mjs https://quanthouse.casa https://quanthouse.casa/backend` and explicitly check `/api/report`, which is not covered by that script.
- Verify the deployed model statistics correspond to the committed release files; pre-release remote checks used the previous deployment.

The browser-control connection was unavailable during this release check, so visual browser inspection remains required. Property photos are still clearly labeled illustrations because the API provides counts rather than image URLs. Missing costs/evidence remain unknown; they are not failed integrations to replace with invented values.
