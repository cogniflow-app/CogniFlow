import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountContext } from "../lib/server/account-context";

const mocks = vi.hoisted(() => ({
  readProtectedReturnTo: vi.fn(),
  readLibrarySnapshot: vi.fn(),
  requireAccountContext: vi.fn(),
}));

vi.mock("@/lib/server/account-context", () => ({
  readProtectedReturnTo: mocks.readProtectedReturnTo,
  requireAccountContext: mocks.requireAccountContext,
}));
vi.mock("@/lib/server/content-repository", () => ({
  readLibrarySnapshot: mocks.readLibrarySnapshot,
}));
vi.mock("next/navigation", () => ({
  useServerInsertedHTML: () => undefined,
  usePathname: () => "/app",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ProtectedAppLayout from "../app/app/layout";
import DashboardPage from "../app/app/page";
import SettingsLayout from "../app/app/settings/layout";
import { AppearanceProvider } from "../components/appearance-provider.client";
import { emptyLibrarySnapshot } from "./fixtures/content";

const accountId = "11111111-1111-4111-8111-111111111111";
const selfLearner = {
  ageBand: "adult",
  avatarSeed: "self-seed",
  displayName: "Guardian account",
  id: "22222222-2222-4222-8222-222222222222",
  kind: "self",
  ownerAccountId: accountId,
  pseudonym: "Steady Heron",
  settings: {},
  status: "active",
} as const;
const childLearner = {
  ageBand: "under_13",
  avatarSeed: "child-seed",
  displayName: "Young learner",
  id: "33333333-3333-4333-8333-333333333333",
  kind: "child",
  ownerAccountId: accountId,
  pseudonym: "Quiet Finch",
  settings: { serious_mode: true },
  status: "active",
} as const;

const childContext: AccountContext = {
  activeLearner: childLearner,
  activeProfileSession: {
    deviceId: "44444444-4444-4444-8444-444444444444",
    expiresAt: "2026-07-15T20:00:00Z",
    id: "55555555-5555-4555-8555-555555555555",
  },
  capabilities: ["learn", "create", "host", "teach"],
  email: "guardian-private@example.test",
  emailVerified: true,
  identities: [],
  learnerProfiles: [selfLearner, childLearner],
  privacy: {
    allowProductUpdates: false,
    allowSocialInteractions: false,
    defaultContentPrivate: true,
    firstPartyAnalytics: false,
  },
  profile: {
    accountStatus: "active",
    ageBand: "adult",
    displayName: "Guardian account",
    handle: "guardian_account",
    id: accountId,
    learningGoals: [],
    locale: "en-US",
    onboardingCompletedAt: "2026-07-15T17:00:00Z",
    reducedMotion: false,
    seriousMode: false,
    studyDayStart: 240,
    theme: "system",
    timezone: "UTC",
  },
};

describe("managed learner account-setting boundary", () => {
  beforeEach(() => {
    mocks.readProtectedReturnTo.mockImplementation(async (fallback: string) => fallback);
    mocks.readLibrarySnapshot.mockResolvedValue(emptyLibrarySnapshot);
    mocks.requireAccountContext.mockResolvedValue(childContext);
  });

  it("shows the active child and guardian exit without account-setting destinations", async () => {
    render(
      <AppearanceProvider>
        {await ProtectedAppLayout({
          children: <div>Child study surface</div>,
        })}
      </AppearanceProvider>,
    );

    expect(screen.getByText("Young learner")).toBeVisible();
    expect(screen.getByText("Managed learner context")).toBeVisible();
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("button", { name: "Guardian exit" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Learner profiles" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Privacy" })).not.toBeInTheDocument();
    expect(screen.queryByText("guardian-private@example.test")).not.toBeInTheDocument();
  });

  it("requires a self learner before rendering any settings layout", async () => {
    mocks.requireAccountContext.mockImplementation(
      async (options: { requireSelfLearner?: boolean }) => {
        if (options.requireSelfLearner) throw new Error("SELF_LEARNER_REQUIRED");
        return childContext;
      },
    );

    await expect(SettingsLayout({ children: <div>Private account settings</div> })).rejects.toThrow(
      "SELF_LEARNER_REQUIRED",
    );
    expect(mocks.requireAccountContext).toHaveBeenCalledWith({
      requireSelfLearner: true,
      returnTo: "/app/settings/profile",
    });
  });

  it("renders managed-learner facts without guardian account or privacy controls", async () => {
    render(await DashboardPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "A clear place to build, Young learner." }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "No decks are available in this learner profile",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/guardian or educator can make authorized content available/i),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create deck" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /folder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review privacy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Privacy defaults" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.queryByText("guardian-private@example.test")).not.toBeInTheDocument();
    expect(mocks.readLibrarySnapshot).not.toHaveBeenCalled();
  });
});
