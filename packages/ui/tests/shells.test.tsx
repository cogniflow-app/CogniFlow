import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell, PageContainer, PageHeader, PageShell } from "../src";

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
    expect(screen.getByTestId("page-shell")).toHaveClass(
      "lumen-page-container",
      "lumen-page-container--reading",
      "py-8",
      "lg:py-12",
    );
  });

  it.each(["reading", "content", "site", "wide"] as const)(
    "provides a public-safe %s page container width",
    (width) => {
      render(
        <PageContainer className="custom-container" data-testid="page-container" width={width}>
          Page content
        </PageContainer>,
      );

      expect(screen.getByTestId("page-container")).toHaveClass(
        "lumen-page-container",
        `lumen-page-container--${width}`,
        "custom-container",
      );
    },
  );

  it("uses the site width for a container without an explicit variant", () => {
    render(<PageContainer data-testid="page-container">Page content</PageContainer>);

    expect(screen.getByTestId("page-container")).toHaveClass("lumen-page-container--site");
  });
});
