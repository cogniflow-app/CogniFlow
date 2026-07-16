import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LandingPage from "../app/page";

describe("public landing page", () => {
  it("renders the product truthfully with working implemented destinations", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /learn from a foundation you control/i }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    expect(screen.getByRole("link", { name: /^sign in$/i })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
    const principlesHeading = screen.getByRole("heading", {
      level: 2,
      name: "Product principles",
    });
    expect(principlesHeading).toBeVisible();
    expect(principlesHeading.closest(".lumen-page-container")).not.toBeNull();

    const principlesSection = principlesHeading.closest("section");
    expect(principlesSection).not.toBeNull();
    if (!principlesSection) throw new Error("The product-principles heading needs a section.");
    expect(within(principlesSection).getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(within(principlesSection).getAllByRole("heading", { level: 2 })).toEqual([
      principlesHeading,
    ]);

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(
      screen.queryAllByText(/(?:in )?later phases|phase\s*0?1|implementation phase/i),
    ).toHaveLength(0);
  });
});
