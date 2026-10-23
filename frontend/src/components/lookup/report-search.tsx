"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, inputClass } from "../ui";

/** Street address or zpid → straight to the report. A bare number is treated as a zpid. */
export function ReportSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return setError("Enter an address or zpid");
    setError(null);
    if (/^\d{4,12}$/.test(v)) router.push(`/property/${v}`);
    else router.push(`/lookup?${new URLSearchParams({ q: v })}`);
  };
  return (
    <form role="search" onSubmit={submit} className={className} noValidate>
      <label htmlFor="report-search" className="mb-1.5 block text-[13px] font-medium text-ink-2">
        Look up a listing
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            id="report-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Street address or zpid, e.g. 932 Bennington St"
            className={clsx(inputClass, "pl-9")}
            autoComplete="off"
            autoFocus={autoFocus}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "report-search-error" : undefined}
          />
        </div>
        <Button type="submit" variant="primary">
          Report
        </Button>
      </div>
      {error && (
        <p id="report-search-error" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
