import { brandConfig } from "@lumen/config/brand";
import type { Metadata } from "next";

import { OfflineShell } from "@/components/offline/offline-shell.client";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Offline",
};

export default function OfflineFallbackPage() {
  return (
    <main className="offline-shell-page" id="main-content">
      <OfflineShell />
      <p className="offline-shell__brand">
        {brandConfig.name} keeps private projections in this browser.
      </p>
    </main>
  );
}
