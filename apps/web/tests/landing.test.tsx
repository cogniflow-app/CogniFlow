import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LandingPage from "../app/page";

describe("public landing page", () => {
  it("renders the product truthfully with working implemented destinations", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { level: 1, name: /make knowledge stay/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /explore the app foundation/i })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: /understand account access/i })).toHaveAttribute(
      "href",
      "/auth",
    );
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
