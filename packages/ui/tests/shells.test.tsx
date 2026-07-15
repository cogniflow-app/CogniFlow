import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell, PageHeader, PageShell } from "../src";

describe("page and application shells", () => {
  it("composes navigation, utility content, a focus target, and a labelled page header", () => {
    render(
      <AppShell
        navigation={<nav aria-label="Workspace">Decks</nav>}
        utility={<aside aria-label="Session status">Synced</aside>}
      >
        <PageShell data-testid="page-shell" width="reading">
          <PageHeader
            actions={<button type="button">Start review</button>}
            description="A representative workspace heading."
            eyebrow="Private library"
            title="Biology foundations"
          />
          <p>Page content</p>
        </PageShell>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Session status" })).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("heading", { level: 1, name: "Biology foundations" })).toBeVisible();
    expect(screen.getByText("A representative workspace heading.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start review" })).toBeVisible();
    expect(screen.getByTestId("page-shell")).toHaveClass("max-w-3xl");
  });
});
