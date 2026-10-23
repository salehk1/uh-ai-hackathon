"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { CircleHelp, ListChecks } from "lucide-react";
import type { OrUnknown, Report } from "@/lib/api/schemas";
import { usd } from "@/lib/format";
import { costUnknownReason, isKnown } from "@/lib/report";
import { Card } from "../ui";
import { UnknownValue } from "./primitives";

type Row = { key: "mortgage" | "tax" | "hoa" | "insurance"; label: string; sub: string; value: OrUnknown; color: string };

/** Question 3: what it costs per month. Unknown items stay unknown; the total covers known items only. */
export function CostsSection({ costs }: { costs: Report["costs"] }) {
  const m = costs.monthly;
  const rows: Row[] = [
    { key: "mortgage", label: "Mortgage", sub: "Principal + interest, 30-yr fixed, 20% down", value: m.mortgage, color: "bg-brand" },
    { key: "tax", label: "Property tax", sub: "From the listed tax rate", value: m.tax, color: "bg-mint" },
    { key: "hoa", label: "HOA", sub: "As disclosed in the listing", value: m.hoa, color: "bg-amber" },
    { key: "insurance", label: "Insurance", sub: "Homeowners policy", value: m.insurance, color: "bg-slate" },
  ];
  const known = rows.filter((r) => isKnown(r.value));
  const unknown = rows.filter((r) => !isKnown(r.value));
  const reason = (k: Row["key"]) => (k === "mortgage" ? undefined : costUnknownReason(k, costs.unknowns));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
      <Card className="p-5 sm:p-6">
        <StackedBar known={known} unknownCount={unknown.length} total={m.total_known} />
        <table className="tabular mt-5 w-full border-collapse text-left text-[14px]">
          <caption className="sr-only">Monthly cost breakdown</caption>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line/70">
                <th scope="row" className="py-2.5 pr-3 font-normal">
                  <span className="flex items-center gap-2 text-ink">
                    <span className={clsx("size-2.5 shrink-0 rounded-sm", isKnown(r.value) ? r.color : "border border-dashed border-line-strong bg-surface-2")} aria-hidden />
                    {r.label}
                  </span>
                  <span className="ml-4.5 block text-xs text-ink-3">{r.sub}</span>
                </th>
                <td className="py-2.5 text-right align-top">
                  {isKnown(r.value) ? <span className="font-medium text-ink">{usd(r.value)}<span className="text-ink-3">/mo</span></span> : <UnknownValue reason={reason(r.key)} />}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/80">
              <th scope="row" className="pt-3 pr-3 font-semibold text-ink">
                Total of known items
                {unknown.length > 0 && (
                  <span className="block text-xs font-normal text-ink-3">
                    Excludes {unknown.map((r) => r.label.toLowerCase()).join(" and ")}, which {unknown.length === 1 ? "is" : "are"} unknown
                  </span>
                )}
              </th>
              <td className="pt-3 text-right align-top text-[18px] font-semibold text-ink">
                {usd(m.total_known)}
                <span className="text-[13px] font-normal text-ink-3">/mo</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="grid gap-5">
        <Card className="p-5 sm:p-6">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <ListChecks className="size-4 text-brand" aria-hidden /> Assumptions
          </h3>
          <List items={costs.assumptions} empty="No assumptions were returned." />
        </Card>
        <Card className="p-5 sm:p-6">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <CircleHelp className="size-4 text-ink-3" aria-hidden /> What we don&apos;t know
          </h3>
          <List items={costs.unknowns} empty="Nothing listed as unknown." />
        </Card>
      </div>
    </div>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="mt-2 text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-ink-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-[0.55em] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

/** Known items sized by value; each unknown item gets a fixed grey hatched placeholder, not a guessed size. */
function StackedBar({ known, unknownCount, total }: { known: Row[]; unknownCount: number; total: number }) {
  const placeholderShare = unknownCount ? Math.min(22, unknownCount * 9) : 0;
  return (
    <figure aria-label="Monthly costs as a stacked bar; the table below lists the same values.">
      <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {known.map((r, i) => (
          <motion.div
            key={r.key}
            className={clsx("h-full first:rounded-l-full", r.color)}
            initial={{ width: 0 }}
            animate={{ width: `${((r.value as number) / total) * (100 - placeholderShare)}%` }}
            transition={{ delay: 0.05 + i * 0.06, duration: 0.35 }}
          />
        ))}
        {Array.from({ length: unknownCount }, (_, i) => (
          <div
            key={i}
            className="h-full flex-1 bg-[repeating-linear-gradient(135deg,#d8d4c8_0_3px,#efece4_3px_6px)] last:rounded-r-full"
          />
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        {known.map((r) => (
          <span key={r.key} className="inline-flex items-center gap-1.5">
            <span className={clsx("h-2.5 w-3.5 rounded-sm", r.color)} aria-hidden /> {r.label}
          </span>
        ))}
        {unknownCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 rounded-sm bg-[repeating-linear-gradient(135deg,#d8d4c8_0_2px,#efece4_2px_4px)]" aria-hidden /> Unknown (not to scale)
          </span>
        )}
      </figcaption>
    </figure>
  );
}
