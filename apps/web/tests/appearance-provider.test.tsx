import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountAppearanceHydrator } from "../components/account-appearance-hydrator.client";
import { AppearanceControls } from "../components/appearance-controls.client";
import { AppearanceProvider } from "../components/appearance-provider.client";
import { ProfileSettingsForm } from "../components/settings/profile-settings-form.client";
import { resolveActiveAppearancePreferences } from "../lib/appearance";
import { isolateBrowserLearnerContext } from "../lib/auth/cache-isolation.client";

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

  it("keeps theme, stored reduced motion, and serious mode as independent choices", async () => {
    render(
      <AppearanceProvider>
        <AppearanceControls />
      </AppearanceProvider>,
    );
    await userEvent.click(screen.getByText("Appearance"));
    await userEvent.selectOptions(screen.getByLabelText("Color theme"), "light");
    await userEvent.click(screen.getByLabelText("Serious mode"));

    expect(screen.getByLabelText("Color theme")).toHaveValue("light");
    expect(screen.getByLabelText("Reduce motion")).not.toBeChecked();
    expect(screen.getByLabelText("Serious mode")).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute("data-motion", "reduce");

    await userEvent.click(screen.getByLabelText("Serious mode"));
    expect(screen.getByLabelText("Reduce motion")).not.toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-motion", "full");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
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
    expect(document.querySelector("script[data-lumen-account-appearance]")).toBeNull();

    await userEvent.click(screen.getByText("Appearance"));
    expect(screen.getByLabelText("Color theme")).toHaveValue("dark");
    expect(screen.getByLabelText("Serious mode")).toBeChecked();
    expect(window.localStorage.getItem("lumen:appearance:v1")).toBe(
      JSON.stringify({ color: "dark", reduceMotion: false, seriousMode: true }),
    );
  });

  it("persists an authenticated control change and protects it from a stale route projection", async () => {
    let resolveWrite: ((value: { ok: boolean; status: number }) => void) | undefined;
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <AppearanceProvider>
        <AppearanceControls persistToAccount />
      </AppearanceProvider>,
    );

    await userEvent.click(screen.getByText("Appearance"));
    await userEvent.selectOptions(screen.getByLabelText("Color theme"), "dark");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/settings/appearance",
      expect.objectContaining({
        body: JSON.stringify({ reduceMotion: false, seriousMode: false, theme: "dark" }),
        keepalive: true,
        method: "PATCH",
      }),
    );
    expect(window.localStorage.getItem("lumen:appearance:v1")).toContain('"status":"pending"');

    view.rerender(
      <AppearanceProvider>
        <AccountAppearanceHydrator
          preferences={{ color: "system", reduceMotion: false, seriousMode: false }}
        />
        <AppearanceControls persistToAccount />
      </AppearanceProvider>,
    );
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(screen.getByLabelText("Color theme")).toHaveValue("dark");
    });

    await act(async () => resolveWrite?.({ ok: true, status: 200 }));
    await waitFor(() =>
      expect(window.localStorage.getItem("lumen:appearance:v1")).toContain('"status":"confirmed"'),
    );

    view.rerender(
      <AppearanceProvider>
        <AccountAppearanceHydrator
          preferences={{ color: "dark", reduceMotion: false, seriousMode: false }}
        />
        <AppearanceControls persistToAccount />
      </AppearanceProvider>,
    );
    await waitFor(() => {
      expect(window.localStorage.getItem("lumen:appearance:v1")).toBe(
        JSON.stringify({ color: "dark", reduceMotion: false, seriousMode: false }),
      );
    });
  });

  it("synchronizes explicit preferences from another tab", async () => {
    render(
      <AppearanceProvider>
        <AppearanceControls />
      </AppearanceProvider>,
    );

    const next = JSON.stringify({ color: "dark", reduceMotion: true, seriousMode: false });
    window.localStorage.setItem("lumen:appearance:v1", next);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "lumen:appearance:v1", newValue: next }),
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(document.documentElement).toHaveAttribute("data-motion", "reduce");
    });
    await userEvent.click(screen.getByText("Appearance"));
    expect(screen.getByLabelText("Color theme")).toHaveValue("dark");
    expect(screen.getByLabelText("Reduce motion")).toBeChecked();
  });

  it("follows OS color changes only while System is selected", async () => {
    const colorListeners = new Set<() => void>();
    let systemDark = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: (_type: string, listener: () => void) => {
          if (query === "(prefers-color-scheme: dark)") colorListeners.add(listener);
        },
        addListener: () => undefined,
        dispatchEvent: () => false,
        get matches() {
          return query === "(prefers-color-scheme: dark)" && systemDark;
        },
        media: query,
        onchange: null,
        removeEventListener: (_type: string, listener: () => void) => {
          colorListeners.delete(listener);
        },
        removeListener: () => undefined,
      })),
    );
    render(
      <AppearanceProvider>
        <AppearanceControls />
      </AppearanceProvider>,
    );
    await userEvent.click(screen.getByText("Appearance"));
    await userEvent.selectOptions(screen.getByLabelText("Color theme"), "light");

    act(() => {
      systemDark = true;
      for (const listener of colorListeners) listener();
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    await userEvent.selectOptions(screen.getByLabelText("Color theme"), "system");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    act(() => {
      systemDark = false;
      for (const listener of colorListeners) listener();
    });
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("clears account appearance at the sign-out identity boundary", async () => {
    window.localStorage.setItem(
      "lumen:appearance:v1",
      JSON.stringify({ color: "dark", reduceMotion: true, seriousMode: true }),
    );
    render(
      <AppearanceProvider>
        <AppearanceControls />
      </AppearanceProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));

    await isolateBrowserLearnerContext("account_signed_out");

    expect(window.localStorage.getItem("lumen:appearance:v1")).toBeNull();
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-color-preference", "system");
      expect(document.documentElement).toHaveAttribute("data-serious-mode", "false");
    });
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
