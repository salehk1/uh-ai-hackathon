import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { Suspense } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { DataSourceBanner } from "@/components/data-source";
import { LicenseFooter } from "@/components/license-footer";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";

const ui = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "QuantHouse", template: "%s · QuantHouse" },
  description:
    "A due-diligence report for a Houston listing: is the price reasonable, does the listing check out, and what will it cost per month?",
};

export const viewport: Viewport = { themeColor: "#f6f4ee", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable}`}>
      <body className="flex h-dvh flex-col overflow-hidden">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-forest px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <Providers>
          <DataSourceBanner />
          <Suspense fallback={<div className="h-14 border-b border-line/80" />}>
            <SiteHeader />
          </Suspense>
          <main id="main" className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </main>
          <LicenseFooter />
        </Providers>
      </body>
    </html>
  );
}
