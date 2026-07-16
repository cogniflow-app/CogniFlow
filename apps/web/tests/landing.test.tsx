import { render, screen } from "@testing-library/react";
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
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
