import type { Metadata } from "next";

import { readPublicViewerContext } from "@/lib/server/public-viewer";

import { JoinPageContent } from "./join-page-content";

export const metadata: Metadata = {
  description: "Check an active room code and join as an ephemeral game guest.",
  title: "Join a game",
};

export default async function JoinPage() {
  return <JoinPageContent viewer={await readPublicViewerContext("/join")} />;
}
