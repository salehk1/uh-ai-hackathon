/** Literal colors for canvas/SVG contexts that can't read CSS variables (MapLibre paint, chart fills). */
export const C = {
  ink: "#1d221f",
  ink3: "#626a63",
  line: "#e2ddd0",
  surface: "#ffffff",
  forest: "#2e5a45",
  sage: "#8fae96",
  sageSoft: "#e3ece4",
  ochre: "#b98535",
  ochreSoft: "#f6ead3",
  slate: "#4f6d8a",
  slateSoft: "#e3eaf1",
  neutral: "#b8b3a4",
  vLow: "#3a6ea5",
  vExpected: "#9a9d96",
  vHigh: "#b8483b",
} as const;

/** Verdict colors. Always paired with text/icons; never the only cue. */
export const VERDICT_COLOR = { high: C.vHigh, low: C.vLow, expected: C.vExpected } as const;

/** Diverging stops for residual_pct (fraction): below estimate → blue, near → grey, above → red. */
export const RESIDUAL_STOPS: [number, string][] = [
  [-0.3, "#2b5689"],
  [-0.12, "#7fa3cb"],
  [0, "#c9cac4"],
  [0.12, "#d98f83"],
  [0.3, "#93342a"],
];

/** Sequential stops for asking $/sqft. */
export const PPSF_STOPS: [number, string][] = [
  [100, "#e3ece4"],
  [175, "#b4cdb9"],
  [250, "#7fa48a"],
  [350, "#4e7c62"],
  [500, "#24483a"],
];
