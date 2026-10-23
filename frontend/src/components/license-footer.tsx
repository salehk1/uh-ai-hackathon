/** Required by the dataset license; shown on every page. */
export function LicenseFooter() {
  return (
    <footer className="shrink-0 border-t border-line/80 bg-canvas px-4 py-1.5 text-center text-[11px] leading-snug text-ink-3 sm:px-6">
      Data: Houston Housing Market 2024 (Zillow via Kaggle),{" "}
      <a
        href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-ink"
      >
        CC BY-NC-SA 4.0
      </a>
      . Non-commercial project.
    </footer>
  );
}
