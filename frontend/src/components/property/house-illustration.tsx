/**
 * A generic, clearly illustrative house drawing. It is NOT a photo of the listing; the API
 * currently provides no photos, and the caption says so.
 */
export function HouseIllustration({ seed, homeType }: { seed: number; homeType: string | null }) {
  const variant = seed % 3;
  const tall = homeType === "TOWNHOUSE";
  const condo = homeType === "CONDO";
  return (
    <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMax meet" className="h-full w-full" role="img" aria-label="Illustration of a house (not a photo of this listing)">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0b1530" />
          <stop offset="1" stopColor="#1a2943" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#sky)" />
      <g stroke="#43d9e6" strokeOpacity="0.06">
        {Array.from({ length: 23 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 28} x2={i * 28} y1="0" y2="360" />
        ))}
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={`h${i}`} x1="0" x2="640" y1={i * 28} y2={i * 28} />
        ))}
      </g>
      {/* downtown skyline silhouette, generic */}
      <path d="M0 262 h40 v-34 h22 v-52 h18 v52 h26 v-20 h30 v-64 h14 v-16 h10 v16 h14 v84 h24 v-40 h28 v52 H640 V290 H0Z" fill="#22355a" opacity={variant === 1 ? 0.7 : 0.55} transform={variant === 0 ? "translate(380 0)" : variant === 2 ? "translate(200 0)" : undefined} />
      <path d="M0 290 C120 270 220 284 320 276 S520 262 640 280 V360 H0Z" fill="#16223b" />
      <path d="M0 312 C140 300 260 318 380 306 S560 296 640 304 V360 H0Z" fill="#121d33" />
      {/* trees */}
      <g fill="#1d4a5a">
        <circle cx="92" cy="240" r="34" />
        <circle cx="122" cy="226" r="26" />
        <circle cx="548" cy="236" r="30" />
      </g>
      <rect x="104" y="250" width="6" height="40" fill="#304361" />
      <rect x="545" y="252" width="6" height="36" fill="#304361" />
      {condo ? (
        <g>
          <rect x="220" y="96" width="200" height="196" rx="6" fill="#22355a" stroke="#4a6089" strokeWidth="2" />
          {Array.from({ length: 4 }).map((_, r) =>
            Array.from({ length: 4 }).map((__, c) => (
              <rect key={`${r}-${c}`} x={238 + c * 46} y={114 + r * 40} width="28" height="24" rx="3" fill={r === 1 && c === 2 ? "#86e8f0" : "#304361"} />
            )),
          )}
          <rect x="300" y="262" width="40" height="30" rx="3" fill="#43d9e6" />
        </g>
      ) : (
        <g>
          <rect x="216" y={tall ? 128 : 168} width="208" height={tall ? 164 : 124} rx="6" fill="#22355a" stroke="#4a6089" strokeWidth="2" />
          <path
            d={tall ? "M202 134 L320 64 L438 134 Z" : "M196 174 L320 96 L444 174 Z"}
            fill="#43d9e6"
            stroke="#2b9fb0"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <rect x="300" y="226" width="40" height="66" rx="4" fill="#090f1f" />
          <circle cx="332" cy="260" r="2.5" fill="#43d9e6" />
          <rect x="240" y={tall ? 152 : 196} width="40" height="34" rx="4" fill="#86e8f0" fillOpacity="0.85" />
          <rect x="360" y={tall ? 152 : 196} width="40" height="34" rx="4" fill={variant === 1 ? "#86e8f0" : "#304361"} />
          {tall && (
            <>
              <rect x="240" y="206" width="40" height="34" rx="4" fill="#304361" />
              <rect x="360" y="206" width="40" height="34" rx="4" fill="#86e8f0" fillOpacity="0.85" />
            </>
          )}
          {variant === 2 && <rect x="372" y={tall ? 74 : 112} width="18" height="34" fill="#4a6089" />}
        </g>
      )}
      <path d="M300 292 C300 312 280 330 268 360 H372 C360 330 340 312 340 292Z" fill="#1a2943" />
    </svg>
  );
}
