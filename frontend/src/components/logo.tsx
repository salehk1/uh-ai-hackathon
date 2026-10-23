/** A simple roofline-over-receipt mark. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--forest)" />
      <path d="M8 15.5 16 9l8 6.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 14v9.5l1.6-1 1.7 1 1.7-1 1.7 1 1.7-1 1.6 1V14" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13.5 17.2h5M13.5 19.8h3.2" stroke="var(--sage)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
