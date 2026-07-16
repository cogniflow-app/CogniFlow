import "./globals.css";

import { brandConfig } from "@lumen/config/brand";
import { readPublicEnvironment } from "@lumen/config/public-env";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { AppearanceProvider } from "@/components/appearance-provider.client";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const appUrl = readPublicEnvironment().appUrl;

const manrope = localFont({
  display: "optional",
  fallback: ["system-ui", "sans-serif"],
  preload: false,
  src: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-manrope",
  weight: "200 800",
});

const newsreader = localFont({
  display: "optional",
  fallback: ["Georgia", "serif"],
  preload: false,
  src: "../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2",
  variable: "--font-newsreader",
  weight: "200 800",
});

export const metadata: Metadata = {
  applicationName: brandConfig.name,
  description:
    "An evolving learning platform for durable recall, adaptive practice, and purposeful games, built on secure account and privacy boundaries.",
  metadataBase: new URL(appUrl),
  openGraph: {
    description:
      "Durable recall, adaptive practice, and purposeful play in one original learning platform.",
    siteName: brandConfig.name,
    title: brandConfig.name,
    type: "website",
  },
  title: {
    default: `${brandConfig.name} · Learn for the long term`,
    template: `%s · ${brandConfig.name}`,
  },
  twitter: {
    card: "summary",
    description: "Durable recall, adaptive practice, and purposeful play.",
    title: brandConfig.name,
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { color: "#f7f8fc", media: "(prefers-color-scheme: light)" },
    { color: "#101422", media: "(prefers-color-scheme: dark)" },
  ],
  width: "device-width",
};

const appearanceScript = `
(() => {
  try {
    const stored = JSON.parse(localStorage.getItem("lumen:appearance:v1") || "{}");
    const preference = ["light", "dark", "system"].includes(stored.color) ? stored.color : "system";
    const dark = preference === "dark" || (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const reduced = Boolean(stored.reduceMotion) || Boolean(stored.seriousMode) || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.colorPreference = preference;
    root.dataset.motion = reduced ? "reduce" : "full";
    root.dataset.seriousMode = String(Boolean(stored.seriousMode));
  } catch {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${newsreader.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
        <AppearanceProvider>
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>
          <SiteHeader />
          {children}
          <SiteFooter />
        </AppearanceProvider>
      </body>
    </html>
  );
}
