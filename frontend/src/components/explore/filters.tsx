"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import type { Verdict } from "@/lib/api/schemas";
import { Button, inputClass } from "../ui";
import { visibleZipDraft } from "./zip-draft";
import { hasFilters, LANDMARKS, type ExploreFilters } from "./explore-state";

const PRICE_OPTIONS = [250_000, 350_000, 500_000, 750_000, 1_000_000, 1_500_000];
const RADII = [2, 5, 10, 20];

type NearKey = "" | keyof typeof LANDMARKS | "custom";

function nearKey(f: ExploreFilters): NearKey {
  if (!f.near) return "";
  const hit = (Object.keys(LANDMARKS) as (keyof typeof LANDMARKS)[]).find(
    (k) => Math.abs(LANDMARKS[k].lat - f.near!.lat) < 1e-3 && Math.abs(LANDMARKS[k].lon - f.near!.lon) < 1e-3,
  );
  return hit ?? "custom";
}

export function Filters({
  filters,
  onChange,
  onReset,
  mapCenter,
}: {
  filters: ExploreFilters;
  onChange: (f: ExploreFilters) => void;
  onReset: () => void;
  mapCenter: () => { lat: number; lon: number } | null;
}) {
  const [draft, setDraft] = useState({ origin: filters.zip ?? "", value: filters.zip ?? "", editing: false });
  // An in-progress edit wins over a late URL update from the previous submission.
  const zipDraft = visibleZipDraft(draft, filters.zip ?? "");
  const zipInvalid = zipDraft !== "" && !/^\d{5}$/.test(zipDraft);
  const nk = nearKey(filters);

  const set = (patch: Partial<ExploreFilters>) => onChange({ ...filters, ...patch });

  return (
    <form
      className="grid grid-cols-2 gap-x-3 gap-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!zipInvalid) set({ zip: zipDraft || undefined });
      }}
      aria-label="Search filters"
    >
      <Select
        id="f-price"
        label="Max asking price"
        value={filters.maxPrice?.toString() ?? ""}
        onChange={(v) => set({ maxPrice: v ? Number(v) : undefined })}
        options={[{ value: "", label: "Any" }, ...PRICE_OPTIONS.map((p) => ({ value: String(p), label: p >= 1e6 ? `$${p / 1e6}M` : `$${p / 1e3}K` }))]}
      />
      <Select
        id="f-beds"
        label="Min bedrooms"
        value={filters.minBeds?.toString() ?? ""}
        onChange={(v) => set({ minBeds: v ? Number(v) : undefined })}
        options={[{ value: "", label: "Any" }, ...[1, 2, 3, 4, 5].map((b) => ({ value: String(b), label: `${b}+` }))]}
      />
      <Select
        id="f-label"
        label="Price vs. estimated range"
        value={filters.label ?? ""}
        onChange={(v) => set({ label: (v || undefined) as Verdict | undefined })}
        options={[
          { value: "", label: "Any" },
          { value: "low", label: "Below range" },
          { value: "expected", label: "Within range" },
          { value: "high", label: "Above range" },
        ]}
      />
      <div>
        <label htmlFor="f-zip" className="mb-1.5 block text-[13px] font-medium text-ink-2">
          ZIP code
        </label>
        <input
          id="f-zip"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="e.g. 77019"
          maxLength={5}
          className={inputClass}
          value={zipDraft}
          aria-invalid={zipInvalid}
          aria-describedby={zipInvalid ? "f-zip-error" : undefined}
          onFocus={() => setDraft({ origin: filters.zip ?? "", value: zipDraft, editing: true })}
          onChange={(e) => setDraft({ origin: filters.zip ?? "", value: e.target.value.replace(/\D/g, ""), editing: true })}
          onBlur={() => {
            setDraft({ origin: filters.zip ?? "", value: zipDraft, editing: false });
            if (!zipInvalid && zipDraft !== (filters.zip ?? "")) set({ zip: zipDraft || undefined });
          }}
        />
        {zipInvalid && (
          <p id="f-zip-error" className="mt-1 text-xs text-danger">
            Five digits
          </p>
        )}
      </div>
      <Select
        id="f-near"
        label="Near"
        value={nk}
        onChange={(v) => {
          if (!v) return set({ near: undefined });
          if (v === "custom") {
            const c = mapCenter();
            return c ? set({ near: c }) : undefined;
          }
          const l = LANDMARKS[v as keyof typeof LANDMARKS];
          set({ near: { lat: l.lat, lon: l.lon } });
        }}
        options={[
          { value: "", label: "Anywhere" },
          { value: "downtown", label: "Downtown" },
          { value: "galleria", label: "Galleria" },
          { value: "tmc", label: "Texas Medical Center" },
          { value: "custom", label: nk === "custom" ? "Selected map area" : "Current map center" },
        ]}
      />
      <Select
        id="f-radius"
        label="Within"
        value={String(filters.radiusKm)}
        disabled={!filters.near}
        onChange={(v) => set({ radiusKm: Number(v) })}
        options={RADII.map((r) => ({ value: String(r), label: `${r} km` }))}
      />
      <div className="col-span-2 flex items-center justify-between pt-0.5">
        <p className="text-xs text-ink-3">Filters apply as you change them.</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft({ origin: "", value: "", editing: false }); onReset(); }} disabled={!hasFilters(filters)}>
          <RotateCcw className="size-3.5" aria-hidden /> Reset filters
        </Button>
      </div>
      <button type="submit" hidden />
    </form>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <select
        id={id}
        className={`${inputClass} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23626a63' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
