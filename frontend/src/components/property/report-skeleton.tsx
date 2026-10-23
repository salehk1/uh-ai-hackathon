import { Skeleton } from "../ui";

export function ReportSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6" aria-busy aria-label="Loading property report">
      <Skeleton className="h-5 w-40" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Skeleton className="aspect-[16/9] rounded-[22px]" />
        <div className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-44 rounded-[22px]" />
        </div>
      </div>
      <Skeleton className="mt-6 h-72 rounded-[22px]" />
    </div>
  );
}
