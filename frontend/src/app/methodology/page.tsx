import type { Metadata } from "next";
import { MethodologyView } from "@/components/methodology/methodology-view";

export const metadata: Metadata = { title: "How it works" };

export default function MethodologyPage() {
  return <MethodologyView />;
}
