import type { Metadata } from "next";
import { Suspense } from "react";
import { LookupView } from "@/components/lookup/lookup-view";
import { ReportSkeleton } from "@/components/property/report-skeleton";

export const metadata: Metadata = { title: "Look up a listing" };

export default function LookupPage() {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <LookupView />
    </Suspense>
  );
}
