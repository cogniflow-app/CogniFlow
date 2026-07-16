"use client";

import { usePathname } from "next/navigation";

import type { DeckSummary } from "@/lib/content/view-models";

const tabs = [
  { label: "Overview", suffix: "" },
  { label: "Notes", suffix: "/edit" },
  { label: "Generated cards", suffix: "/cards" },
  { label: "History", suffix: "/history" },
  { label: "Settings", suffix: "/settings" },
] as const;

export function DeckNavigation({
  deck,
}: {
  readonly deck: Pick<DeckSummary, "id" | "role" | "status">;
}) {
  const pathname = usePathname() ?? "";
  const root = `/app/decks/${deck.id}`;
  const canEdit =
    deck.status === "active" &&
    (deck.role === "owner" || deck.role === "manager" || deck.role === "editor");
  const canManage = deck.status === "active" && (deck.role === "owner" || deck.role === "manager");
  const visibleTabs = tabs.filter(
    (tab) => (tab.label !== "Notes" || canEdit) && (tab.label !== "Settings" || canManage),
  );
  return (
    <nav aria-label="Deck" className="deck-tabs">
      {visibleTabs.map((tab) => {
        const href = `${root}${tab.suffix}`;
        const current = tab.suffix ? pathname.startsWith(href) : pathname === root;
        return (
          <a aria-current={current ? "page" : undefined} href={href} key={tab.label}>
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
