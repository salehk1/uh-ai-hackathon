"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { useAnalyst } from "./analyst/analyst-context";
import { DataSourcePill } from "./data-source";

export const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/compare", label: "Compare ZIPs" },
  { href: "/estimate", label: "Estimate a home" },
  { href: "/methodology", label: "How it works" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const { openAnalyst } = useAnalyst();
  if (pathname === "/") return null;
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/explore" className="shrink-0 rounded-lg pr-2 font-display text-[17px] font-bold tracking-tight text-ink" aria-label="QuantHouse home">
          Quant<span className="text-brand">House</span>
        </Link>
        <nav aria-label="Primary" className="-mx-1 flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {NAV.map((n) => {
            const on = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={clsx(
                  "relative flex shrink-0 items-center px-2.5 text-[13.5px] font-semibold transition-colors duration-150",
                  "after:absolute after:inset-x-2.5 after:bottom-0 after:h-[2.5px] after:rounded-t-full after:transition-colors after:duration-150",
                  on ? "text-ink after:bg-brand" : "text-ink-3 after:bg-transparent hover:text-ink hover:after:bg-line-strong",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <DataSourcePill />
        <button
          type="button"
          onClick={() => openAnalyst()}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-brand px-3.5 text-[13px] font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-2 active:scale-[0.98]"
        >
          <MessageSquareText className="size-4" aria-hidden />
          <span className="hidden md:inline">Ask the analyst</span>
          <span className="md:hidden">Ask</span>
        </button>
      </div>
    </header>
  );
}
