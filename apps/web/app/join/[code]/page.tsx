import { joinCodeSchema } from "@lumen/auth/guests";
import type { Metadata } from "next";

import { readPublicViewerContext } from "@/lib/server/public-viewer";

import { JoinPageContent } from "../join-page-content";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Check room code",
};

export default async function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const parsed = joinCodeSchema.safeParse(code);
  const initialJoinCode = parsed.success ? parsed.data : "";
  const fallback = initialJoinCode ? `/join/${initialJoinCode}` : "/join";
  return (
    <JoinPageContent
      initialJoinCode={initialJoinCode}
      viewer={await readPublicViewerContext(fallback)}
    />
  );
}
