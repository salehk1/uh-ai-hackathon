"use client";

/* eslint-disable @next/next/no-img-element -- listing photos come straight from the Zillow CDN; no optimizer proxy */
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Expand, ImageOff, Info, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ListingPhoto } from "@/lib/api/schemas";
import { HouseIllustration } from "./house-illustration";

const ATTRIBUTION = "Listing photos via Zillow (Houston Housing Market 2024 snapshot)";

/**
 * The listing's own photos (from /report `photos`). Mount with `key={zpid}` so nothing carries over
 * between properties. Broken images are dropped; with no usable photo it falls back to a labelled illustration.
 */
export function PhotoGallery({
  photos,
  zpid,
  homeType,
  photoCount,
}: {
  photos: ListingPhoto[];
  zpid: number;
  homeType: string | null;
  photoCount: number | null;
}) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const usable = photos.filter((p) => !broken.has(p.thumb_url));
  const n = usable.length;
  const i = n ? Math.min(index, n - 1) : 0;
  const markBroken = (url: string) => setBroken((b) => new Set(b).add(url));
  const go = (d: number) => n && setIndex((i + d + n) % n);

  if (!n) return <Fallback zpid={zpid} homeType={homeType} photoCount={photoCount} hadPhotos={photos.length > 0} />;

  const cur = usable[i];
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    go(e.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <figure
      className="flex flex-col gap-2"
      role="region"
      aria-roledescription="carousel"
      aria-label={`Listing photos, ${n} total`}
      onKeyDown={onKey}
    >
      <div className="group relative aspect-[3/2] overflow-hidden rounded-[18px] border border-line bg-sky">
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="block size-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand"
          aria-label={`Open photo ${i + 1} of ${n} full size`}
        >
          <StagePhoto
            key={cur.thumb_url}
            photo={cur}
            alt={cur.caption ?? `Listing photo ${i + 1} of ${n}`}
            onBroken={() => markBroken(cur.thumb_url)}
          />
        </button>
        {n > 1 && (
          <>
            <NavButton side="left" onClick={() => go(-1)} />
            <NavButton side="right" onClick={() => go(1)} />
          </>
        )}
        <span className="tabular pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white" aria-live="polite">
          {i + 1} / {n}
        </span>
        <Expand className="pointer-events-none absolute right-2.5 top-2.5 size-7 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </div>

      {n > 1 && (
        <ol className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Photo thumbnails">
          {usable.map((p, k) => (
            <li key={p.thumb_url} className="shrink-0 snap-start">
              <Thumb photo={p} active={k === i} label={`Show photo ${k + 1} of ${n}`} onSelect={() => setIndex(k)} onBroken={() => markBroken(p.thumb_url)} />
            </li>
          ))}
        </ol>
      )}

      <figcaption className="flex items-start gap-1.5 text-[11.5px] leading-snug text-ink-3">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          Actual listing photos ({n}
          {isFinite(photoCount ?? NaN) && photoCount! > n ? ` of ${photoCount}` : ""}). {ATTRIBUTION}.
        </span>
      </figcaption>

      {viewerOpen && (
        <Viewer photos={usable} index={i} onIndex={setIndex} onClose={() => setViewerOpen(false)} />
      )}
    </figure>
  );
}

// The stage is 3:2. Listing photos range from 3:4 portraits to 2.1:1 panoramas, so only photos close
// to the frame's shape fill it (light crop); the rest are shown whole over a blurred copy of themselves.
const STAGE_RATIO = 3 / 2;
const MAX_COVER_STRETCH = 1.2;

function fillsStage(w: number, h: number) {
  const r = w / h / STAGE_RATIO;
  return r <= MAX_COVER_STRETCH && r >= 1 / MAX_COVER_STRETCH;
}

/**
 * One photo on the stage. `thumb_url` is nominally 800px wide (sometimes an upscale of a smaller original),
 * `full_url` is the largest copy and never upscaled, so the browser picks by rendered size and pixel density.
 */
function StagePhoto({ photo, alt, onBroken }: { photo: ListingPhoto; alt: string; onBroken: () => void }) {
  const [fit, setFit] = useState<"cover" | "contain" | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  const measure = (img: HTMLImageElement) => setFit(fillsStage(img.naturalWidth, img.naturalHeight) ? "cover" : "contain");
  // A cached image can finish before hydration, in which case onLoad never fires.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth) measure(img);
  }, []);
  return (
    <>
      {fit === "contain" && (
        <img
          src={photo.thumb_url}
          alt=""
          aria-hidden
          decoding="async"
          className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl"
        />
      )}
      <img
        ref={ref}
        src={photo.thumb_url}
        srcSet={`${photo.thumb_url} 800w, ${photo.full_url} ${photo.full_width ?? 1536}w`}
        sizes="(min-width: 1024px) 560px, calc(100vw - 2rem)"
        alt={alt}
        fetchPriority="high"
        decoding="async"
        onLoad={(e) => measure(e.currentTarget)}
        onError={onBroken}
        className={clsx(
          "relative size-full object-center transition-opacity duration-200",
          fit === "cover" ? "object-cover" : "object-contain",
          fit ? "opacity-100" : "opacity-0",
        )}
      />
    </>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={clsx(
        "absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        side === "left" ? "left-2.5" : "right-2.5",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

function Thumb({ photo, active, label, onSelect, onBroken }: { photo: ListingPhoto; active: boolean; label: string; onSelect: () => void; onBroken: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-current={active || undefined}
      className={clsx(
        "block h-14 w-[84px] overflow-hidden rounded-[10px] border-2 transition sm:h-16 sm:w-24",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        active ? "border-brand" : "border-transparent opacity-70 hover:opacity-100",
      )}
    >
      <img src={photo.thumb_url} alt="" loading="lazy" decoding="async" className="size-full object-cover object-center" onError={onBroken} />
    </button>
  );
}

/** Full-size viewer: native modal dialog (focus trap, Escape to close), whole photo visible. */
function Viewer({ photos, index, onIndex, onClose }: { photos: ListingPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [fullFailed, setFullFailed] = useState<ReadonlySet<string>>(() => new Set());
  const n = photos.length;
  const p = photos[index];
  const go = (d: number) => onIndex((index + d + n) % n);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
      }}
      aria-label={`Photo ${index + 1} of ${n}`}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/92 p-0 text-white backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="tabular">
            {index + 1} / {n}
          </span>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close photo viewer"
            className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 px-2 pb-2 sm:px-16" onClick={(e) => e.target === e.currentTarget && onClose()}>
          <img
            key={p.full_url}
            src={fullFailed.has(p.full_url) ? p.thumb_url : p.full_url}
            alt={p.caption ?? `Listing photo ${index + 1} of ${n}`}
            decoding="async"
            className="size-full object-contain"
            onError={() => setFullFailed((s) => new Set(s).add(p.full_url))}
          />
          {n > 1 && (
            <>
              <NavButton side="left" onClick={() => go(-1)} />
              <NavButton side="right" onClick={() => go(1)} />
            </>
          )}
        </div>
        <p className="px-4 pb-3 text-center text-[12px] text-white/70">
          {p.caption ? `${p.caption} · ` : ""}
          {ATTRIBUTION}
        </p>
      </div>
    </dialog>
  );
}

function Fallback({ zpid, homeType, photoCount, hadPhotos }: { zpid: number; homeType: string | null; photoCount: number | null; hadPhotos: boolean }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative aspect-[3/2] overflow-hidden rounded-[18px] border border-line bg-sky">
        <HouseIllustration seed={zpid} homeType={homeType} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-[11.5px] font-medium text-ink-2 shadow-sm backdrop-blur">
          <ImageOff className="size-3" aria-hidden /> Illustration, not a listing photo
        </span>
      </div>
      <figcaption className="flex items-start gap-1.5 text-[11.5px] leading-snug text-ink-3">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          {hadPhotos
            ? "The listing's photos couldn't be loaded, so this is a generic illustration."
            : `No listing photos in the dataset snapshot${isFinite(photoCount ?? NaN) && photoCount ? ` (Zillow reports ${photoCount})` : ""}; this is a generic illustration.`}
        </span>
      </figcaption>
    </figure>
  );
}
