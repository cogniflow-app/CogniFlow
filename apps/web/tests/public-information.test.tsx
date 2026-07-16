import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CopyrightPage from "../app/copyright/page";
import PrivacyPage from "../app/privacy/page";
import SafetyPage from "../app/safety/page";
import TermsPage from "../app/terms/page";
import { SiteFooter } from "../components/site-footer";

const pages = [
  { component: PrivacyPage, current: "Privacy", heading: /your data should serve your learning/i },
  { component: TermsPage, current: "Terms", heading: /clear rules for a shared learning space/i },
  { component: SafetyPage, current: "Safety", heading: /learning should feel focused/i },
  {
    component: CopyrightPage,
    current: "Copyright",
    heading: /create, import, and share responsibly/i,
  },
] as const;

describe("public information pages", () => {
  it.each(pages)(
    "renders $current with public cross-navigation",
    ({ component: Page, current, heading }) => {
      render(<Page />);

      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      expect(screen.getByRole("navigation", { name: "Public information" })).toBeVisible();
      expect(screen.getByRole("link", { name: current })).toHaveAttribute("aria-current", "page");
      expect(screen.getByText(/last updated july 15, 2026/i)).toBeVisible();
    },
  );

  it("links every policy surface from the global footer", () => {
    render(<SiteFooter />);

    const policies = screen.getByRole("navigation", { name: "Policies" });
    expect(policies).toBeVisible();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Safety" })).toHaveAttribute("href", "/safety");
    expect(screen.getByRole("link", { name: "Copyright" })).toHaveAttribute("href", "/copyright");
  });
});
