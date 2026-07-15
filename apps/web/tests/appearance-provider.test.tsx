import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AppearanceControls } from "../components/appearance-controls.client";
import { AppearanceProvider } from "../components/appearance-provider.client";

describe("appearance preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-changing");
    document.documentElement.removeAttribute("data-motion");
    document.documentElement.removeAttribute("data-serious-mode");
  });

  it("applies and persists explicit theme, motion, and serious-mode choices", async () => {
    const user = userEvent.setup();
    render(
      <AppearanceProvider>
        <AppearanceControls />
      </AppearanceProvider>,
    );

    await user.click(screen.getByText("Appearance"));
    await user.selectOptions(screen.getByLabelText("Color theme"), "dark");
    await user.click(screen.getByLabelText("Reduce motion"));
    await user.click(screen.getByLabelText("Serious mode"));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(document.documentElement).toHaveAttribute("data-motion", "reduce");
      expect(document.documentElement).toHaveAttribute("data-serious-mode", "true");
      expect(document.documentElement).not.toHaveAttribute("data-theme-changing");
    });

    expect(window.localStorage.getItem("lumen:appearance:v1")).toContain('"seriousMode":true');
  });
});
