import type { Metadata } from "next";
import { Suspense } from "react";
import { PropertyReport } from "@/components/property/property-report";
import { ReportSkeleton } from "@/components/property/report-skeleton";

export const metadata: Metadata = { title: "Property report" };

export default function PropertyPage({ params }: { params: Promise<{ zpid: string }> }) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <PropertyReport params={params} />
    </Suspense>
  );
}
