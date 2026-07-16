import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountContext } from "../lib/server/account-context";

const mocks = vi.hoisted(() => ({
  readServerOnboardingAgeGate: vi.fn(),
  requireAccountContext: vi.fn(),
}));

vi.mock("@/lib/server/account-context", () => ({
  requireAccountContext: mocks.requireAccountContext,
}));

vi.mock("@/lib/server/pending-auth-age-gate", () => ({
  readServerOnboardingAgeGate: mocks.readServerOnboardingAgeGate,
}));

import OnboardingPage from "../app/onboarding/page";

const accountId = "11111111-1111-4111-8111-111111111111";
const selfLearner = {
  ageBand: "unknown",
  avatarSeed: "self-seed",
  displayName: null,
  id: "22222222-2222-4222-8222-222222222222",
  kind: "self",
  ownerAccountId: accountId,
  pseudonym: "New learner",
  settings: {},
  status: "active",
} as const;
const incompleteAccount: AccountContext = {
  activeLearner: selfLearner,
  activeProfileSession: null,
  capabilities: ["learn", "create", "host", "teach"],
  email: "new-account@example.test",
  emailVerified: true,
  identities: [],
  learnerProfiles: [selfLearner],
  privacy: {
    allowProductUpdates: false,
    allowSocialInteractions: false,
    defaultContentPrivate: true,
    firstPartyAnalytics: true,
  },
  profile: {
    accountStatus: "onboarding",
    ageBand: "unknown",
    displayName: null,
    handle: null,
    id: accountId,
    learningGoals: [],
    locale: "en-US",
    onboardingCompletedAt: null,
    reducedMotion: false,
    seriousMode: false,
    studyDayStart: 240,
    theme: "system",
    timezone: "America/Chicago",
  },
};

describe("onboarding surface", () => {
  beforeEach(() => {
    mocks.requireAccountContext.mockResolvedValue(incompleteAccount);
    mocks.readServerOnboardingAgeGate.mockResolvedValue({
      accountId,
      ageBand: "adult",
      expiresAt: "2026-07-15T18:30:00Z",
      issuedAt: "2026-07-15T18:00:00Z",
      nonceHash: "a".repeat(64),
      purpose: "verified_onboarding_age_gate",
      returnTo: "/app",
      version: 1,
    });
  });

  it("exposes the privacy-minimizing setup fields with accessible names", async () => {
    render(
      await OnboardingPage({
        searchParams: Promise.resolve({ returnTo: "https://attacker.example/redirect" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Make the workspace yours." }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Display name" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Handle" })).toBeRequired();
    expect(screen.getByText("18 or older")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Age range" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Locale" })).toHaveValue("en-US");
    expect(screen.getByRole("textbox", { name: "Time zone" })).toHaveValue("America/Chicago");
    expect(screen.getByRole("spinbutton", { name: "Study day starts" })).toHaveValue(240);
    expect(screen.getByRole("button", { name: "Finish account setup" })).toBeVisible();
    expect(screen.queryByLabelText(/birthday|school|address|phone/i)).not.toBeInTheDocument();
    expect(screen.getByText(/age range, not your exact birthday/i)).toBeVisible();
    expect(mocks.requireAccountContext).toHaveBeenCalledWith({
      allowIncompleteOnboarding: true,
      returnTo: "/onboarding",
    });
  });

  it("announces required identity errors without sending an incomplete form", async () => {
    const user = userEvent.setup();
    render(await OnboardingPage({ searchParams: Promise.resolve({ returnTo: "/app" }) }));

    await user.click(screen.getByRole("button", { name: "Finish account setup" }));

    expect(await screen.findByText("Enter a display name")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Choose a handle")).toHaveAttribute("role", "alert");
  });

  it("requires a neutral age choice when no account-bound gate is present", async () => {
    mocks.readServerOnboardingAgeGate.mockResolvedValue(null);
    render(await OnboardingPage({ searchParams: Promise.resolve({ returnTo: "/app" }) }));

    expect(screen.getByRole("combobox", { name: "Age range" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Continue" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Display name" })).not.toBeInTheDocument();
    expect(screen.getByText(/not your exact birthday/i)).toBeVisible();
  });
});
