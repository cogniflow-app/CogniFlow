import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountAppearanceHydrator } from "../components/account-appearance-hydrator.client";
import { AppearanceControls } from "../components/appearance-controls.client";
import { AppearanceProvider } from "../components/appearance-provider.client";
import { ProfileSettingsForm } from "../components/settings/profile-settings-form.client";
import { resolveActiveAppearancePreferences } from "../lib/appearance";

describe("appearance preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-changing");
    document.documentElement.removeAttribute("data-color-preference");
    document.documentElement.removeAttribute("data-motion");
    document.documentElement.removeAttribute("data-serious-mode");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("hydrates the active managed learner over stale browser preferences", async () => {
    window.localStorage.setItem(
      "lumen:appearance:v1",
      JSON.stringify({ color: "light", reduceMotion: false, seriousMode: false }),
    );

    render(
      <AppearanceProvider>
        <AccountAppearanceHydrator
          preferences={{ color: "dark", reduceMotion: false, seriousMode: true }}
        />
        <AppearanceControls />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(document.documentElement).toHaveAttribute("data-motion", "reduce");
      expect(document.documentElement).toHaveAttribute("data-serious-mode", "true");
    });

    await userEvent.click(screen.getByText("Appearance"));
    expect(screen.getByLabelText("Color theme")).toHaveValue("dark");
    expect(screen.getByLabelText("Serious mode")).toBeChecked();
    expect(window.localStorage.getItem("lumen:appearance:v1")).toBe(
      JSON.stringify({ color: "dark", reduceMotion: false, seriousMode: true }),
    );
  });

  it("keeps operating-system reduced motion authoritative", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      })),
    );

    render(
      <AppearanceProvider>
        <AccountAppearanceHydrator
          preferences={{ color: "system", reduceMotion: false, seriousMode: false }}
        />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-motion", "reduce");
      expect(document.documentElement).toHaveAttribute("data-serious-mode", "false");
    });
  });

  it("applies a successful profile settings save immediately", async () => {
    const fetch = vi.fn().mockResolvedValue({
      json: async () => ({ message: "Profile saved." }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetch);

    render(
      <ProfileSettingsForm
        initial={{
          displayName: "Ada Learner",
          handle: "ada_learner",
          learningGoals: [],
          locale: "en-US",
          preferences: {
            readingStyle: "standard",
            reduceMotion: true,
            seriousMode: false,
            theme: "dark",
          },
          studyDayStartMinutes: 240,
          timeZone: "America/Chicago",
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(screen.getByText("Profile saved.")).toBeVisible();
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(document.documentElement).toHaveAttribute("data-motion", "reduce");
      expect(document.documentElement).toHaveAttribute("data-serious-mode", "false");
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/profile",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

describe("active learner preference ownership", () => {
  it("uses account preferences for self and managed settings for a child", () => {
    const profile = { reducedMotion: false, seriousMode: false, theme: "light" as const };

    expect(
      resolveActiveAppearancePreferences({
        learner: {
          kind: "self",
          settings: { reduced_motion: true, serious_mode: true, theme: "dark" },
        },
        profile,
      }),
    ).toEqual({ color: "light", reduceMotion: false, seriousMode: false });

    expect(
      resolveActiveAppearancePreferences({
        learner: {
          kind: "child",
          settings: { reduced_motion: false, serious_mode: true, theme: "dark" },
        },
        profile,
      }),
    ).toEqual({ color: "dark", reduceMotion: false, seriousMode: true });
  });

  it("fails closed to low stimulation when managed settings are missing", () => {
    expect(
      resolveActiveAppearancePreferences({
        learner: { kind: "school_managed", settings: {} },
        profile: { reducedMotion: false, seriousMode: false, theme: "dark" },
      }),
    ).toEqual({ color: "system", reduceMotion: true, seriousMode: true });
  });
});
