"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, MapPinned } from "lucide-react";
import { useEffect } from "react";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useReport } from "@/lib/api/queries";
import { BackLink, NotFound } from "../property/property-report";
import { ReportSkeleton } from "../property/report-skeleton";
import { Card, ErrorState } from "../ui";
import { ReportSearch } from "./report-search";

/** Resolves a typed address with POST /report {address}; one match opens its report, several ask "Did you mean…". */
export function LookupView() {
  const q = useSearchParams().get("q")?.trim() ?? "";
  const router = useRouter();
  const r = useReport(q ? { address: q } : null);
  const matches = r.data?.data.address_matches;
  const single = r.data && (!matches || matches.length <= 1) ? r.data.data.listing.zpid : null;

  useEffect(() => {
    if (single !== null) router.replace(`/property/${single}`);
  }, [single, router]);

  if (!q) {
    return (
      <Shell>
        <Card className="p-6">
          <h1 className="text-lg font-semibold text-ink">Enter an address or zpid</h1>
          <ReportSearch className="mt-4" autoFocus />
        </Card>
      </Shell>
    );
  }
  if (r.isPending || single !== null) return <ReportSkeleton />;
  if (r.isError) {
    if (r.error instanceof ApiError && r.error.status === 404) return <NotFound backHref="/explore" message={`No listing matches “${q}”.`} />;
    return (
      <Shell>
        <ErrorState
          title={r.error instanceof ApiError && r.error.status === 400 ? "Enter an address or zpid" : "Couldn't look up that address"}
          message={errorMessage(r.error)}
          onRetry={() => r.refetch()}
        />
        <ReportSearch className="mt-5" />
      </Shell>
    );
  }
  return (
    <Shell>
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-ink">Did you mean…</h1>
        <p className="mt-1 text-sm text-ink-2">“{q}” matches several listings.</p>
        <ul className="mt-4 divide-y divide-line">
          {matches!.map((m) => (
            <li key={m.zpid}>
              <Link href={`/property/${m.zpid}`} className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-brand-tint">
                <MapPinned className="size-4 shrink-0 text-brand" aria-hidden />
                <span className="flex-1 text-[14px] text-ink">{m.address}</span>
                <span className="tabular text-xs text-ink-3">{m.zpid}</span>
                <ArrowUpRight className="size-4 text-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <ReportSearch className="mt-5" />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8 sm:px-6">
      <BackLink href="/explore" />
      <div className="mt-6">{children}</div>
    </div>
  );
}
