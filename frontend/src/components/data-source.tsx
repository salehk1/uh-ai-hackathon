"use client";

import { FlaskConical, PlugZap } from "lucide-react";
import { useHealth, useSource } from "@/lib/api/queries";
import { useBrowserValue } from "@/lib/use-browser-value";

/**
 * The source is fetched in the browser, and a query cache that already holds it would render
 * differently from the server HTML. Render nothing until hydration is done.
 */
const useHydrated = () => useBrowserValue(() => true, false);

/** Persistent notice whenever the app is NOT showing live backend data. */
export function DataSourceBanner() {
  const { data } = useSource();
  const hydrated = useHydrated();
  if (!hydrated || !data) return null;
  if (data.mode === "live") return (
    <div className="border-b border-line bg-surface px-4 py-2 text-center text-xs text-ink-2">
      Connected API · historical dataset. Recorded asking prices from June 2024, not current availability, Zestimates or closed-sale prices.
    </div>
  );
  if (data.mode === "fixtures") {
    return (
      <div role="status" className="border-b border-amber/30 bg-amber-soft text-[13px] text-ink">
        <div className="mx-auto flex max-w-[1440px] items-start gap-2 px-4 py-2 sm:px-6">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-ink" aria-hidden />
          <p>
            <strong className="font-semibold">Development fixtures.</strong>{" "}
            <span className="sm:hidden">Synthetic test data, not real listings.</span>
            <span className="hidden sm:inline">
              Listings, prices, receipts and analyst replies are synthetic test data, not real Houston homes or model output.
              Methodology figures come from the committed <code className="text-[12px]">results/</code> files.
            </span>
          </p>
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className="border-b border-danger/25 bg-danger-soft text-[13px] text-ink">
      <div className="mx-auto flex max-w-[1440px] items-start gap-2 px-4 py-2 sm:px-6">
        <PlugZap className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <p>
          <strong className="font-semibold">No data source configured.</strong> {data.reason}. Set{" "}
          <code className="text-[12px]">BACKEND_API_URL</code> in <code className="text-[12px]">frontend/.env.local</code>.
        </p>
      </div>
    </div>
  );
}

export function DataSourcePill() {
  const { data } = useSource();
  const health = useHealth();
  const hydrated = useHydrated();
  if (!hydrated || !data) return null;
  if (data.mode === "fixtures")
    return (
      <span className="hidden shrink-0 items-center gap-1 rounded-full border border-amber/30 bg-amber-soft px-2.5 py-1 text-[11.5px] font-semibold text-amber-ink sm:inline-flex">
        <FlaskConical className="size-3" aria-hidden /> Fixture data
      </span>
    );
  if (data.mode === "live") {
    // /health checks the API and its database row count; it doesn't cover the chat provider.
    const down = health.isError;
    return (
      <span
        className="hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] font-medium text-ink-3 lg:inline-flex"
        title={down ? `Can't reach ${data.backend_host}` : `Connected to ${data.backend_host}`}
      >
        <span className={`size-1.5 rounded-full ${down ? "bg-danger" : health.isSuccess ? "bg-brand" : "bg-line-strong"}`} aria-hidden />
        {down ? "API offline" : health.isSuccess ? "Connected API · historical dataset" : "Connecting API"}
      </span>
    );
  }
  return null;
}
