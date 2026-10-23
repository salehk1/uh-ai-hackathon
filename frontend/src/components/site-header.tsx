"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { useAnalyst } from "./analyst/analyst-context";
import { DataSourcePill } from "./data-source";
import { Logo } from "./logo";

export const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/compare", label: "Compare ZIPs" },
  { href: "/estimate", label: "Estimate a home" },
  { href: "/methodology", label: "Methodology" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const { openAnalyst } = useAnalyst();
  if (pathname === "/") return null;
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <Link href="/explore" className="flex shrink-0 items-center gap-2 rounded-lg pr-2 text-ink" aria-label="Houston Price Receipt home">
          <Logo className="size-7" />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Houston Price Receipt</span>
        </Link>
        <nav aria-label="Primary" className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
          {NAV.map((n) => {
            const on = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={clsx(
                  "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
                  on ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
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
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-sm transition-colors duration-150 hover:border-line-strong hover:bg-sage-tint active:scale-[0.98]"
        >
          <MessageSquareText className="size-4 text-forest" aria-hidden />
          <span className="hidden md:inline">Ask the analyst</span>
          <span className="md:hidden">Ask</span>
        </button>
      </div>
    </header>
  );
}
