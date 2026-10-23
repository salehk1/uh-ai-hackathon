"use client";

import { FlaskConical, PlugZap } from "lucide-react";
import { useHealth, useSource } from "@/lib/api/queries";

/** Persistent notice whenever the app is NOT showing live backend data. */
export function DataSourceBanner() {
  const { data } = useSource();
  if (!data || data.mode === "live") return null;
  if (data.mode === "fixtures") {
    return (
      <div role="status" className="border-b border-ochre/30 bg-ochre-soft text-[13px] text-ink">
        <div className="mx-auto flex max-w-[1440px] items-start gap-2 px-4 py-2 sm:px-6">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-ochre-ink" aria-hidden />
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
  if (!data) return null;
  if (data.mode === "fixtures")
    return (
      <span className="hidden shrink-0 items-center gap-1 rounded-full border border-ochre/30 bg-ochre-soft px-2.5 py-1 text-[11.5px] font-semibold text-ochre-ink sm:inline-flex">
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
        <span className={`size-1.5 rounded-full ${down ? "bg-danger" : health.isSuccess ? "bg-forest" : "bg-line-strong"}`} aria-hidden />
        {down ? "API offline" : health.isSuccess ? `Live API · ${health.data.data.homes.toLocaleString("en-US")} homes` : "Live API"}
      </span>
    );
  }
  return null;
}
