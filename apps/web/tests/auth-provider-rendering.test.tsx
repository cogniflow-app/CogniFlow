import { createEnvironmentFixture } from "@lumen/test-utils";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "../components/auth/auth-form.client";
import { getConfiguredAuthProviders } from "../lib/server/auth-providers";

function stubProviderEnvironment(overrides: Readonly<Record<string, string>> = {}) {
  const environment = createEnvironmentFixture({
    AUTH_OAUTH_AZURE_ENABLED: "false",
    AUTH_OAUTH_GITHUB_ENABLED: "false",
    AUTH_OAUTH_GOOGLE_ENABLED: "false",
    ...overrides,
  });
  for (const [name, value] of Object.entries(environment)) {
    vi.stubEnv(name, value);
  }
}

describe("configured authentication providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders no OAuth controls when no provider is configured", () => {
    stubProviderEnvironment();
    const providers = getConfiguredAuthProviders();

    expect(providers.map(({ id }) => id)).toEqual(["email_password", "magic_link"]);
    render(<AuthForm mode="sign_in" providers={providers} returnTo="/app" />);
    expect(screen.queryByRole("button", { name: /continue with/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  it("renders only enabled OAuth controls and uses the public Microsoft label", () => {
    stubProviderEnvironment({
      AUTH_OAUTH_AZURE_ENABLED: "true",
      AUTH_OAUTH_GITHUB_ENABLED: "false",
      AUTH_OAUTH_GOOGLE_ENABLED: "true",
    });
    const providers = getConfiguredAuthProviders();

    expect(providers.map(({ id }) => id)).toEqual([
      "email_password",
      "magic_link",
      "google",
      "microsoft",
    ]);
    render(<AuthForm mode="sign_in" providers={providers} returnTo="/app" />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Microsoft" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue with GitHub" })).not.toBeInTheDocument();
  });

  it("does not expose signup credentials or providers before an eligible age is selected", () => {
    stubProviderEnvironment({ AUTH_OAUTH_GOOGLE_ENABLED: "true" });

    render(<AuthForm mode="sign_up" providers={getConfiguredAuthProviders()} returnTo="/app" />);

    expect(screen.queryByRole("textbox", { name: "Email address" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
  });
});
