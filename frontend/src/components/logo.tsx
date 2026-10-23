/** QuantHouse mark: a gabled roof whose base is a torn receipt edge, with a price line through the middle. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--ink)" />
      <path d="M7 14.5 16 7l9 7.5V25l-1.8-1.3-1.8 1.3-1.8-1.3-1.8 1.3-1.8-1.3-1.8 1.3-1.8-1.3L9 25l-2-1.3z" fill="var(--brand)" />
      <path d="M7 14.5 16 7l9 7.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 16.5h9" stroke="var(--mint)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11.5 19.8h5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
