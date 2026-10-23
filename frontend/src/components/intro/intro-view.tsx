"use client";

import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { prefetchExplore } from "@/lib/api/queries";
import { readStorage, useBrowserValue } from "@/lib/use-browser-value";
import { BaseMap } from "../map/base-map";
import { Button } from "../ui";

const SKIP_KEY = "hpr:skip-intro";
const QUESTIONS = ["Is the price fair?", "Does it check out?", "What will it cost monthly?"];
const FINAL = { center: [-95.369, 29.756] as [number, number], zoom: 14.4, pitch: 60, bearing: -32 };

/**
 * A short (~4 s) camera approach over Houston on the same MapLibre renderer as explore.
 * Explore and Skip work immediately; reduced-motion users get a still composition; a map
 * failure falls back to a static backdrop without blocking anything.
 */
export function IntroView() {
  const router = useRouter();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const reduced = !!useReducedMotion();
  const stored = useBrowserValue(() => readStorage("local", SKIP_KEY) === "1", false);
  const [override, setRemember] = useState<boolean | null>(null);
  const remember = override ?? stored;
  const exploreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (readStorage("local", SKIP_KEY) === "1" && sp.get("intro") !== "1") {
      router.replace("/explore");
      return;
    }
    prefetchExplore(qc);
    router.prefetch("/explore");
    exploreRef.current?.focus({ preventScroll: true });
  }, [qc, router, sp]);

  const go = () => {
    try {
      if (remember) localStorage.setItem(SKIP_KEY, "1");
      else localStorage.removeItem(SKIP_KEY);
    } catch {
      /* storage unavailable */
    }
    router.push("/explore");
  };

  return (
    <div className="blueprint relative flex-1 overflow-hidden">
      <BaseMap
        className="absolute inset-0"
        interactive={false}
        label="Aerial map of Houston"
        view={reduced ? { ...FINAL, zoom: 12.4, pitch: 45 } : { center: [-95.42, 29.78], zoom: 8.6, pitch: 0, bearing: 0 }}
        onLoad={(m) => {
          if (reduced) return;
          const t = window.setTimeout(() => m.flyTo({ ...FINAL, duration: 4200, curve: 1.3, essential: false }), 250);
          const onVis = () => (document.hidden ? m.stop() : undefined);
          document.addEventListener("visibilitychange", onVis);
          return () => {
            window.clearTimeout(t);
            document.removeEventListener("visibilitychange", onVis);
          };
        }}
      />
      {/* midnight scrim on the text side only; the map stays clear on the right */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(9_15_31/0.92)_0%,rgb(9_15_31/0.6)_36%,rgb(9_15_31/0)_58%)] max-md:bg-[linear-gradient(0deg,rgb(9_15_31/0.97)_0%,rgb(9_15_31/0.85)_48%,rgb(9_15_31/0)_82%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgb(9_15_31/0.8),transparent)]" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-4 sm:px-10 sm:pt-6">
        <span className="font-display text-[17px] font-bold tracking-tight text-ink">
          Quant<span className="text-brand">House</span>
        </span>
        <Button variant="secondary" size="sm" onClick={go} className="bg-surface/90 backdrop-blur">
          Skip intro
        </Button>
      </div>

      <div className="relative z-10 flex h-full items-end px-5 pb-10 sm:px-10 md:items-center md:pb-0">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: reduced ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[38rem]"
        >
          <h1 className="font-display text-[46px] font-bold leading-[0.98] tracking-[-0.035em] text-ink sm:text-[76px]">
            Quant<span className="text-brand">House</span>
          </h1>
          <ol className="mt-6 grid max-w-[32rem] gap-2 sm:grid-cols-3">
            {QUESTIONS.map((q, i) => (
              <li key={q} className="flex items-baseline gap-2 rounded-[12px] border border-line bg-surface/85 px-3 py-2.5 backdrop-blur">
                <span className="tabular font-display text-[12px] font-bold text-brand">0{i + 1}</span>
                <span className="text-[13.5px] font-semibold leading-snug text-ink">{q}</span>
              </li>
            ))}
          </ol>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Button ref={exploreRef} variant="primary" size="lg" onClick={go} className="shadow-md">
              Explore the map <ArrowRight className="size-4" aria-hidden />
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 rounded border-line-strong accent-[var(--brand)]"
              />
              Skip the intro next time
            </label>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
