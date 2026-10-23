import { Suspense } from "react";
import { IntroView } from "@/components/intro/intro-view";

export default function Home() {
  return (
    <Suspense fallback={<div className="flex-1 bg-canvas" />}>
      <IntroView />
    </Suspense>
  );
}
