import type { Metadata } from "next";

import { StatisticsDashboard } from "@/components/study/statistics-dashboard";
import { requireAccountContext } from "@/lib/server/account-context";
import { readStudyStatistics } from "@/lib/server/study-repository";

export const metadata: Metadata = { title: "Statistics" };

export default async function StatisticsPage() {
  const account = await requireAccountContext({ returnTo: "/app/stats" });
  const stats = await readStudyStatistics(account.profile.id, account.activeLearner.id);
  return <StatisticsDashboard stats={stats} />;
}
