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
} as const;

/** Verdict colors. Always paired with text/icons; never the only cue. */
export const VERDICT_COLOR = { high: C.ochre, low: C.slate, expected: C.sage } as const;

/** Diverging stops for residual_pct (fraction): below estimate → slate, near → sage-grey, above → ochre. */
export const RESIDUAL_STOPS: [number, string][] = [
  [-0.3, "#3f5f7e"],
  [-0.12, "#7f9bb4"],
  [0, "#c9cfc2"],
  [0.12, "#d3a865"],
  [0.3, "#9c6a22"],
];

/** Sequential stops for asking $/sqft. */
export const PPSF_STOPS: [number, string][] = [
  [100, "#e3ece4"],
  [175, "#b4cdb9"],
  [250, "#7fa48a"],
  [350, "#4e7c62"],
  [500, "#24483a"],
];
