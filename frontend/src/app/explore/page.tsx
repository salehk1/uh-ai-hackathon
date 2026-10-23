import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreView } from "@/components/explore/explore-view";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="flex-1 skeleton rounded-none" aria-label="Loading explore view" />}>
      <ExploreView />
    </Suspense>
  );
}
