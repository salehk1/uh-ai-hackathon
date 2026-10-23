/** Literal colors for canvas/SVG contexts that can't read CSS variables (MapLibre paint, chart fills). Mirrors globals.css. */
export const C = {
  ink: "#142b45",
  ink3: "#596f84",
  line: "#d4e0ec",
  surface: "#ffffff",
  canvas: "#f3f7fc",
  sky: "#d7eaf6",
  brand: "#176b78",
  brand2: "#11515c",
  mint: "#7fc4b4",
  brandSoft: "#e0f1f2",
  amber: "#b7791f",
  amberSoft: "#fbf0dc",
  slate: "#4f6d8a",
  slateSoft: "#e3eaf1",
  neutral: "#afc2d5",
  vLow: "#2f6fb3",
  vExpected: "#8d99a6",
  vHigh: "#c0443a",
} as const;

/** Verdict colors. Always paired with text/icons; never the only cue. */
export const VERDICT_COLOR = { high: C.vHigh, low: C.vLow, expected: C.vExpected } as const;

/** Diverging stops for residual_pct (fraction): below estimate → blue, near → grey, above → red. */
export const RESIDUAL_STOPS: [number, string][] = [
  [-0.3, "#1f5694"],
  [-0.12, "#7ea7d4"],
  [0, "#c6ced6"],
  [0.12, "#e08f86"],
  [0.3, "#982f27"],
];

/** Sequential stops for asking $/sqft (single teal hue, light → dark). */
export const PPSF_STOPS: [number, string][] = [
  [100, "#d9eff0"],
  [175, "#a3d3d4"],
  [250, "#5fa9b0"],
  [350, "#24808c"],
  [500, "#0f4a54"],
];
