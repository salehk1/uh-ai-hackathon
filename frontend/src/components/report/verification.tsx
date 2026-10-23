import Link from "next/link";
import { ShieldQuestion } from "lucide-react";
import type { Signal } from "@/lib/api/schemas";
import { signalLabel } from "@/lib/report";
import { Card } from "../ui";
import { StatusChip } from "./primitives";

/**
 * Question 2: does the listing check out? One row per signal, each standing alone:
 * status, plain-language name, and the backend's evidence sentence verbatim. No total, no meter.
 */
export function VerificationSection({ signals }: { signals: Signal[] }) {
  return (
    <Card className="overflow-hidden">
      {signals.length === 0 ? (
        <p className="p-5 text-sm text-ink-3">No verification signals were returned for this listing.</p>
      ) : (
        <ul className="divide-y divide-line">
          {signals.map((s) => (
            <li key={s.name} className="grid gap-x-4 gap-y-1.5 px-5 py-4 sm:grid-cols-[7.5rem_minmax(0,15rem)_1fr] sm:items-baseline sm:px-6">
              <div>
                <StatusChip status={s.status} />
              </div>
              <h3 className="text-[14px] font-semibold text-ink">{signalLabel(s.name)}</h3>
              <div className="text-[13.5px] leading-relaxed text-ink-2">
                <p>{s.evidence}</p>
                {s.related_zpids && s.related_zpids.length > 0 && (
                  <p className="mt-1.5 text-[12.5px] text-ink-3">
                    Also appears on{" "}
                    {s.related_zpids.map((z, i) => (
                      <span key={z}>
                        {i > 0 && ", "}
                        <Link href={`/property/${z}`} className="tabular font-medium text-brand underline underline-offset-2">
                          listing {z}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-2 border-t border-line bg-surface-2/60 px-5 py-3 text-[12.5px] text-ink-2 sm:px-6">
        <ShieldQuestion className="size-4 shrink-0 text-ink-3" aria-hidden />
        Evidence for a human to check, not a fraud score.
      </p>
    </Card>
  );
}
