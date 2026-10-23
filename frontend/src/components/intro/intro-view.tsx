"use client";

import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { prefetchExplore } from "@/lib/api/queries";
import { readStorage, useBrowserValue } from "@/lib/use-browser-value";
import { BaseMap } from "../map/base-map";
import { Logo } from "../logo";
import { Button } from "../ui";

const SKIP_KEY = "hpr:skip-intro";
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
    <div className="relative flex-1 overflow-hidden bg-canvas">
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
      {/* soft wash so text stays legible over any tile */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(246,244,238,0.94)_0%,rgba(246,244,238,0.78)_34%,rgba(246,244,238,0)_68%)] max-md:bg-[linear-gradient(0deg,rgba(246,244,238,0.96)_0%,rgba(246,244,238,0.85)_45%,rgba(246,244,238,0.1)_80%)]" />

      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <Button variant="secondary" size="sm" onClick={go} className="shadow-md">
          Skip intro
        </Button>
      </div>

      <div className="relative z-10 flex h-full items-end px-5 pb-10 sm:px-10 md:items-center md:pb-0">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: reduced ? 0 : 0.35 }}
          className="max-w-[34rem]"
        >
          <div className="flex items-center gap-2.5">
            <Logo className="size-9" />
            <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-forest">Houston · 2024 listings</span>
          </div>
          <h1 className="mt-5 font-display text-[44px] leading-[1.02] tracking-tight text-ink sm:text-[64px]">Houston Price Receipt</h1>
          <p className="mt-4 max-w-[30rem] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
            See how a listing&apos;s asking price compares with a spatially validated model estimate, and read the itemized,
            neighborhood-specific receipt behind it.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Button ref={exploreRef} variant="primary" size="lg" onClick={go} className="shadow-md">
              Explore <ArrowRight className="size-4" aria-hidden />
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 rounded border-line-strong accent-[var(--forest)]"
              />
              Skip the intro next time
            </label>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
