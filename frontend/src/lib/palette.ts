/** Literal colors for canvas/SVG contexts that can't read CSS variables (MapLibre paint, chart fills). Mirrors globals.css. */
export const C = {
  ink: "#f2f6ff",
  ink2: "#aabad1",
  ink3: "#8c9db8",
  line: "#304361",
  lineStrong: "#4a6089",
  surface: "#121d33",
  surface2: "#1a2943",
  canvas: "#090f1f",
  sky: "#0d1830",
  brand: "#43d9e6",
  brand2: "#86e8f0",
  onBrand: "#061219",
  violet: "#927aff",
  brandSoft: "#103041",
  amber: "#e9a23b",
  amberSoft: "#2c2414",
  slate: "#6e86ab",
  slateSoft: "#1c2a42",
  neutral: "#5d6f8c",
  vLow: "#4f8dff",
  vExpected: "#8f9bb0",
  vHigh: "#f2645c",
} as const;

/** Verdict colors. Always paired with text/icons; never the only cue. */
export const VERDICT_COLOR = { high: C.vHigh, low: C.vLow, expected: C.vExpected } as const;

/** Diverging stops for residual_pct (fraction): below estimate → blue, near → grey, above → red. Ends brightest on the dark map. */
export const RESIDUAL_STOPS: [number, string][] = [
  [-0.3, "#3d7bff"],
  [-0.12, "#7fa6ee"],
  [0, "#8f9bb0"],
  [0.12, "#ef9087"],
  [0.3, "#ff5548"],
];

/** Sequential stops for asking $/sqft (single cyan hue, dim → bright on the dark map). */
export const PPSF_STOPS: [number, string][] = [
  [100, "#2f6690"],
  [175, "#2b8aa8"],
  [250, "#33b2c8"],
  [350, "#43d9e6"],
  [500, "#b8f5fa"],
];
