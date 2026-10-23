import type { Metadata } from "next";
import { Suspense } from "react";
import { EstimateView } from "@/components/estimate/estimate-view";

export const metadata: Metadata = { title: "Estimate a home" };

export default function EstimatePage() {
  return (
    <Suspense fallback={null}>
      <EstimateView />
    </Suspense>
  );
}
