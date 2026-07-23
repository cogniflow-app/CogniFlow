import type { Metadata } from "next";

import { GettingStartedCenter } from "@/components/guides/getting-started-center.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { readGettingStartedSnapshot } from "@/lib/server/guide-repository";

export const metadata: Metadata = { title: "Getting started" };

export default async function GettingStartedPage() {
  const account = await requireAccountContext({ returnTo: "/app/getting-started" });
  const canCreate =
    account.activeLearner.kind === "self" && account.capabilities.includes("create");
  const snapshot = await readGettingStartedSnapshot(
    account.profile.id,
    account.activeLearner.id,
    canCreate,
  );
  return <GettingStartedCenter canCreate={canCreate} snapshot={snapshot} />;
}
