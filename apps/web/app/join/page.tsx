import type { Metadata } from "next";

import { readPublicViewerContext } from "@/lib/server/public-viewer";

import { JoinPageContent } from "./join-page-content";

export const metadata: Metadata = {
  description:
    "Enter a six-character room code to check whether temporary guest access is available.",
  title: "Check a room code",
};

export default async function JoinPage() {
  return <JoinPageContent viewer={await readPublicViewerContext("/join")} />;
}
