import { describe, expect, it } from "vitest";

import {
  emailPasswordSignInInputSchema,
  emailPasswordSignUpInputSchema,
  magicLinkSignInInputSchema,
  passwordResetInputSchema,
  pendingAuthAgeGateSchema,
  recoverySessionIntentSchema,
  reauthenticationProofSchema,
  reauthenticationRequestSchema,
  signOutInputSchema,
  verifiedOnboardingAgeGateSchema,
} from "../src/auth-inputs";

const proof = {
  proofId: "11111111-1111-4111-8111-111111111111",
  proofToken: "server-issued-proof-token-1234",
} as const;

describe("authentication inputs", () => {
  it("normalizes email and an allowed relative return URL", () => {
    expect(
      emailPasswordSignUpInputSchema.parse({
        ageBand: "adult",
        email: "  Learner@Example.COM ",
        password: "correct horse battery staple",
        returnTo: "/app/settings?tab=profile",
      }),
    ).toEqual({
      ageBand: "adult",
      email: "learner@example.com",
      password: "correct horse battery staple",
      returnTo: "/app/settings?tab=profile",
    });
  });

  it("carries under-13 selection to the server before account creation", () => {
    const parsed = emailPasswordSignUpInputSchema.parse({
      ageBand: "under_13",
      email: "learner@example.com",
      password: "correct horse battery staple",
    });

    expect(parsed.ageBand).toBe("under_13");
  });

  it("rejects an unselected age band and weak new password", () => {
    expect(
      emailPasswordSignUpInputSchema.safeParse({
        ageBand: "unknown",
        email: "learner@example.com",
        password: "short",
      }).success,
    ).toBe(false);
  });

  it("does not apply new-password length policy to an existing credential", () => {
    expect(
      emailPasswordSignInInputSchema.safeParse({
        email: "learner@example.com",
        password: "legacy",
      }).success,
    ).toBe(true);
    expect(
      emailPasswordSignInInputSchema.safeParse({
        email: "learner@example.com",
        password: "line one\nline two",
      }).success,
    ).toBe(true);
  });

  it("falls back safely when a magic-link return destination is hostile", () => {
    expect(
      magicLinkSignInInputSchema.parse({
        email: "learner@example.com",
        returnTo: "https://attacker.example/steal",
      }).returnTo,
    ).toBe("/app");
  });

  it("accepts reset input without a client-invented recovery proof", () => {
    expect(
      passwordResetInputSchema.parse({
        password: "a new strong password",
        passwordConfirmation: "a new strong password",
      }),
    ).toEqual({
      password: "a new strong password",
      passwordConfirmation: "a new strong password",
    });
  });

  it("defines server-held recovery intent rather than a client verification boolean", () => {
    const intent = {
      version: 1,
      purpose: "password_recovery",
      accountId: "11111111-1111-4111-8111-111111111111",
      issuedAt: "2026-07-15T17:00:00Z",
      expiresAt: "2026-07-15T17:15:00Z",
      nonceHash: "a".repeat(64),
    } as const;

    expect(recoverySessionIntentSchema.parse(intent)).toEqual(intent);
    expect(recoverySessionIntentSchema.safeParse({ ...intent, verified: true }).success).toBe(
      false,
    );
    expect(
      recoverySessionIntentSchema.safeParse({
        ...intent,
        expiresAt: "2026-07-15T16:59:00Z",
      }).success,
    ).toBe(false);
  });

  it("requires signed age-gate state to be internally consistent", () => {
    const base = {
      version: 1,
      purpose: "pending_auth_age_gate",
      expiresAt: "2026-07-15T17:15:00Z",
      flowNonceHash: "a".repeat(64),
      issuedAt: "2026-07-15T17:00:00Z",
      returnTo: "/app",
      subjectHash: null,
    } as const;
    expect(
      pendingAuthAgeGateSchema.safeParse({
        ...base,
        ageBand: "teen",
        flow: "oauth",
        intent: "sign_up",
        provider: "google",
      }).success,
    ).toBe(true);
    expect(
      pendingAuthAgeGateSchema.safeParse({
        ...base,
        ageBand: null,
        flow: "oauth",
        intent: "sign_up",
        provider: "google",
      }).success,
    ).toBe(false);
    expect(
      pendingAuthAgeGateSchema.safeParse({
        ...base,
        ageBand: "adult",
        flow: "oauth",
        intent: "sign_up",
        provider: "google",
        role: "admin",
      }).success,
    ).toBe(false);
  });

  it("binds a verified onboarding age gate to an account and eligible band", () => {
    const gate = {
      version: 1,
      purpose: "verified_onboarding_age_gate",
      accountId: "11111111-1111-4111-8111-111111111111",
      ageBand: "teen",
      expiresAt: "2026-07-15T17:15:00Z",
      issuedAt: "2026-07-15T17:00:00Z",
      nonceHash: "b".repeat(64),
      returnTo: "/app",
    } as const;
    expect(verifiedOnboardingAgeGateSchema.parse(gate)).toEqual(gate);
    expect(
      verifiedOnboardingAgeGateSchema.safeParse({ ...gate, ageBand: "under_13" }).success,
    ).toBe(false);
  });

  it("rejects mismatched reset passwords", () => {
    const result = passwordResetInputSchema.safeParse({
      password: "a new strong password",
      passwordConfirmation: "a different password",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["passwordConfirmation"]);
  });

  it("requires credential material for reauthentication, never a client boolean", () => {
    expect(
      reauthenticationRequestSchema.safeParse({ method: "password", verified: true }).success,
    ).toBe(false);
    expect(
      reauthenticationRequestSchema.safeParse({
        method: "password",
        password: "existing credential",
      }).success,
    ).toBe(true);
  });

  it("accepts only a server-issued proof shape for destructive mutations", () => {
    expect(reauthenticationProofSchema.parse(proof)).toEqual(proof);
    expect(
      reauthenticationProofSchema.safeParse({ proofId: proof.proofId, verified: true }).success,
    ).toBe(false);
  });

  it("requires a password only for all-device sign-out", () => {
    expect(signOutInputSchema.parse({ scope: "current" })).toEqual({ scope: "current" });
    expect(signOutInputSchema.parse({ password: "existing credential", scope: "all" })).toEqual({
      password: "existing credential",
      scope: "all",
    });
    expect(signOutInputSchema.safeParse({ scope: "all" }).success).toBe(false);
    expect(
      signOutInputSchema.safeParse({ password: "unnecessary credential", scope: "current" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown input keys at the trust boundary", () => {
    expect(
      emailPasswordSignInInputSchema.safeParse({
        email: "learner@example.com",
        password: "credential",
        role: "admin",
      }).success,
    ).toBe(false);
  });
});
