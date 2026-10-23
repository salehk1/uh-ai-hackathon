"use client";

import clsx from "clsx";
import Link from "next/link";
import { LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium select-none whitespace-nowrap " +
  "transition-[background-color,color,box-shadow,transform,border-color] duration-150 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-forest text-white shadow-sm hover:bg-forest-2 hover:shadow-md",
  secondary: "bg-surface text-ink border border-line shadow-sm hover:border-line-strong hover:bg-sage-tint",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  quiet: "text-forest hover:bg-sage-tint underline-offset-4 hover:underline",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return clsx(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={clsx("rounded-[var(--radius-card)] border border-line bg-surface shadow-sm", className)} {...rest} />;
}

export function SectionHeading({ eyebrow, title, id, children }: { eyebrow?: string; title: string; id?: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      {eyebrow && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{eyebrow}</p>}
      <h2 id={id} className="text-xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {children && <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden />;
}

export function ErrorState({
  title = "Couldn't load this",
  message,
  onRetry,
  compact,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={clsx(
        "flex gap-3 rounded-2xl border border-danger/25 bg-danger-soft/60 text-sm text-ink",
        compact ? "p-3" : "p-4",
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-ink-2">{message}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
            <RotateCcw className="size-3.5" aria-hidden /> Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function Notice({ icon, children, tone = "neutral" }: { icon?: ReactNode; children: ReactNode; tone?: "neutral" | "caution" }) {
  return (
    <div
      className={clsx(
        "flex gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed",
        tone === "caution" ? "border-ochre/30 bg-ochre-soft/60 text-ink" : "border-line bg-surface-2/60 text-ink-2",
      )}
    >
      {icon && <span className="mt-0.5 shrink-0 text-ink-3">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="tabular mt-1 text-lg font-semibold tracking-tight text-ink">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full font-medium transition-[background-color,color,box-shadow] duration-150",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3.5 text-[13px]",
              on ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink shadow-sm transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-3/70 hover:border-line-strong focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/15 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15 disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
