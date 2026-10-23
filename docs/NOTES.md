# Reference notes: TheAdaptoid/2024-Ai4Good-Submission

Read-only skim of https://github.com/TheAdaptoid/2024-Ai4Good-Submission (≤10 min). Nothing was
executed and no code was copied. These notes are ideas only.

## What it is
An AI4Good 2024 entry for detecting **rental scams**. It flags listings a bad actor might post to
lure victims. The stack is Python with a NiceGUI web app (a listing page and an admin page) and
analysis notebooks.

## Their approach
- A linear regression gives an expected price. The gap between actual and expected is turned into
  a **Z-score**, and a listing is flagged when it is unusually *low*.
- **Move-in lead time** (listing date to move-in date) is a second signal. Very short lead times
  are flagged because scammers create urgency.
- Thresholds come from a 95% interval computed **per building type**.
- No accuracy, precision or recall is reported. The author wished they had a larger, multimodal
  dataset.

## What we already cover (and do differently)
- **Price-too-low lure:** our `asking_far_below_range` signal uses the *calibrated* q10 from
  quantile models under spatial CV, rather than a global regression Z-score. We report measured
  coverage of 80.0%, not an assumed normal interval.
- **Per-type baselines:** our comps use the same home type, beds ±1 and sqft ±30%. Our GWR
  baseline is per neighborhood, which is finer-grained than per building type.

## Ideas worth borrowing
1. **Urgency / timing signal.** We have no move-in date (these are for-sale listings), but
   `datePosted`, `daysOnZillow` and `priceHistory` (in the raw JSON, not yet extracted) would allow
   a "relisted repeatedly" or "price cut sharply right after posting" check. This could be a
   future `listing_history` signal.
2. **Report the deviation magnitude, not just a flag.** We already show `asking_vs_fair_pct` and
   the asking-to-q10 ratio in the evidence text. Keep it visible in the UI.
3. **Admin / human review queue.** A page listing every warning signal for a moderator to triage
   would be easy to add on top of `listing_details` (filter `dup_*_other_broker_n > 0` or
   `|engagement_z| > 3`).
4. **Explain each flag in plain language.** Each of our signals already carries an `evidence`
   string. Keep it that way, and avoid adding any probability score (also a team rule).

## Not adopting
- Global 95% Z-score thresholds. A price distribution that is spatially autocorrelated
  (Moran's I = 0.56 here) breaks the i.i.d. assumption behind them.
- Stock photos in the UI. We show real listing data only.
