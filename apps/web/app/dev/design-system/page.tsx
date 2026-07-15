import "./design-system.css";

import { Badge } from "@lumen/ui/content";
import { AppShell, PageHeader, PageShell } from "@lumen/ui/shells";
import type { Metadata } from "next";

import { DesignSystemGallery } from "./gallery.client";

export const metadata: Metadata = {
  description: "Developer-only gallery for the accessible component foundation.",
  robots: { follow: false, index: false, nocache: true },
  title: "Design system",
};

export default function DesignSystemPage() {
  return (
    <AppShell>
      <PageShell width="wide">
        <PageHeader
          actions={<Badge tone="info">Responsive</Badge>}
          description="Every primitive below uses representative learning language, visible focus, semantic state, and reduced-motion behavior. This route is excluded from search indexing and is not a product destination."
          eyebrow={
            <div className="flex flex-wrap gap-2">
              <Badge dot tone="brand">
                Developer surface
              </Badge>
              <Badge tone="success">WCAG-minded</Badge>
            </div>
          }
          title="Design system, in context."
        />
        <DesignSystemGallery />
      </PageShell>
    </AppShell>
  );
}
