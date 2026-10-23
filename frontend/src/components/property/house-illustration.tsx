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
          <stop offset="0" stopColor="#eef2ea" />
          <stop offset="1" stopColor="#f6f4ee" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#sky)" />
      <circle cx={variant === 0 ? 520 : 120} cy="78" r="34" fill="#f6ead3" />
      <path d="M0 290 C120 270 220 284 320 276 S520 262 640 280 V360 H0Z" fill="#e3ece4" />
      <path d="M0 312 C140 300 260 318 380 306 S560 296 640 304 V360 H0Z" fill="#d6e3d8" />
      {/* trees */}
      <g fill="#b4cdb9">
        <circle cx="92" cy="240" r="34" />
        <circle cx="122" cy="226" r="26" />
        <circle cx="548" cy="236" r="30" />
      </g>
      <rect x="104" y="250" width="6" height="40" fill="#8a8473" />
      <rect x="545" y="252" width="6" height="36" fill="#8a8473" />
      {condo ? (
        <g>
          <rect x="220" y="96" width="200" height="196" rx="6" fill="#ffffff" stroke="#cfc8b7" strokeWidth="2" />
          {Array.from({ length: 4 }).map((_, r) =>
            Array.from({ length: 4 }).map((__, c) => (
              <rect key={`${r}-${c}`} x={238 + c * 46} y={114 + r * 40} width="28" height="24" rx="3" fill={r === 1 && c === 2 ? "#f6ead3" : "#e3eaf1"} />
            )),
          )}
          <rect x="300" y="262" width="40" height="30" rx="3" fill="#2e5a45" />
        </g>
      ) : (
        <g>
          <rect x="216" y={tall ? 128 : 168} width="208" height={tall ? 164 : 124} rx="6" fill="#ffffff" stroke="#cfc8b7" strokeWidth="2" />
          <path
            d={tall ? "M202 134 L320 64 L438 134 Z" : "M196 174 L320 96 L444 174 Z"}
            fill="#2e5a45"
            stroke="#24483a"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <rect x="300" y="226" width="40" height="66" rx="4" fill="#8fae96" />
          <circle cx="332" cy="260" r="2.5" fill="#24483a" />
          <rect x="240" y={tall ? 152 : 196} width="40" height="34" rx="4" fill="#e3eaf1" />
          <rect x="360" y={tall ? 152 : 196} width="40" height="34" rx="4" fill={variant === 1 ? "#f6ead3" : "#e3eaf1"} />
          {tall && (
            <>
              <rect x="240" y="206" width="40" height="34" rx="4" fill="#e3eaf1" />
              <rect x="360" y="206" width="40" height="34" rx="4" fill="#e3eaf1" />
            </>
          )}
          {variant === 2 && <rect x="372" y={tall ? 74 : 112} width="18" height="34" fill="#cfc8b7" />}
        </g>
      )}
      <path d="M300 292 C300 312 280 330 268 360 H372 C360 330 340 312 340 292Z" fill="#ece8dc" />
    </svg>
  );
}
