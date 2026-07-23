import { PageShell } from "@lumen/ui";
import type { Metadata } from "next";

import { OfflineDashboard } from "@/components/offline/offline-dashboard.client";
import { requireAccountContext } from "@/lib/server/account-context";

export const metadata: Metadata = {
  description: "Manage offline decks, pending work, browser storage, devices, and conflicts.",
  title: "Offline & sync",
};

export default async function OfflineAndSyncPage() {
  await requireAccountContext({ returnTo: "/app/offline" });
  return (
    <PageShell width="wide">
      <OfflineDashboard />
    </PageShell>
  );
}
