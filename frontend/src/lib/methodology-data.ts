/**
 * Recorded training history for the "How it works" page. Copied verbatim from
 * results/experiments.json on the `backend` branch (not served by /stats). Refresh when it changes.
 */
export const LEARNING_CURVE: {
  train_frac: number;
  n_train: number;
  MAPE: number;
}[] = [
  { train_frac: 0.1, n_train: 1732, MAPE: 13.361 },
  { train_frac: 0.25, n_train: 4331, MAPE: 12.128 },
  { train_frac: 0.5, n_train: 8663, MAPE: 11.619 },
  { train_frac: 0.75, n_train: 12995, MAPE: 11.371 },
  { train_frac: 1.0, n_train: 17327, MAPE: 11.07 },
];

export const OPTUNA = {
  trials: 40,
  best_MAPE: 11.481,
  default_MAPE: 11.652,
  minutes: 20.8,
  history: [
    11.652, 11.76, 12.147, 11.862, 11.532, 11.597, 11.645, 11.672, 11.6, 11.714,
    11.512, 11.529, 11.525, 11.554, 11.523, 11.614, 11.554, 11.776, 11.679,
    11.576, 11.585, 11.523, 11.514, 11.532, 11.584, 11.574, 11.515, 11.492,
    11.563, 11.495, 11.481, 11.557, 11.509, 11.509, 11.523, 11.522, 11.492,
    11.539, 11.522, 11.549,
  ],
} as {
  trials: number;
  best_MAPE: number;
  default_MAPE: number;
  minutes: number;
  history: number[];
};

export const ERROR_BY_TYPE: { type: string; MAPE: number; n: number }[] = [
  { type: "SINGLE_FAMILY", MAPE: 10.43, n: 19543 },
  { type: "TOWNHOUSE", MAPE: 13.25, n: 989 },
  { type: "CONDO", MAPE: 20.22, n: 1127 },
];

/** Worked example: the receipt published with the /report contract sample (932 Bennington St). */
export const EXAMPLE_RECEIPT = [
  {
    feature: "baseline",
    label: "Neighborhood baseline ($174/sqft)",
    usd: 516994.0,
    pct: 90.3,
  },
  {
    feature: "livingArea",
    label: "Size (2,976 sqft)",
    usd: -27285.0,
    pct: -4.8,
  },
  { feature: "age", label: "Age (84 yrs)", usd: 20973.0, pct: 3.7 },
  {
    feature: "school_mean",
    label: "Schools (avg 5.0/10)",
    usd: -11876.0,
    pct: -2.1,
  },
  {
    feature: "dist_downtown",
    label: "Location (6.9 km to Downtown)",
    usd: 147477.0,
    pct: 25.8,
  },
  { feature: "bedrooms", label: "Bedrooms (4)", usd: -26030.0, pct: -4.5 },
  { feature: "bathrooms", label: "Bathrooms (3)", usd: 177.0, pct: 0.0 },
  {
    feature: "other",
    label: "Other features & ML adjustment (pool, lot, HOA, text flags)",
    usd: -48116.0,
    pct: -8.4,
  },
];
export const EXAMPLE_FAIR = 572314.0;
