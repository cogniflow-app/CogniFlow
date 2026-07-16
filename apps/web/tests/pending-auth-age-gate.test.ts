// @vitest-environment node

import { createEnvironmentFixture } from "@lumen/test-utils";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  onboardingAgeGateCookieName,
  pendingAuthAgeGateCookieName,
  pendingRecoveryIntentCookieName,
} from "../lib/server/cookies";
import {
  attachPendingAuthAgeGate,
  attachVerifiedOnboardingAgeGate,
  issueOAuthAgeGate,
  issuePasswordSignupAgeGate,
  issueVerifiedOnboardingAgeGate,
  pendingPasswordGateMatchesEmail,
  readPendingAuthAgeGate,
  readRequestOnboardingAgeGate,
} from "../lib/server/pending-auth-age-gate";
import {
  attachPendingRecoveryIntent,
  issuePendingRecoveryIntent,
  readPendingRecoveryIntent,
} from "../lib/server/recovery-intent";

const now = new Date("2026-07-15T18:00:00.000Z");

function requestWithCookie(url: string, name: string, value: string): NextRequest {
  return new NextRequest(url, { headers: { Cookie: `${name}=${value}` } });
}

describe("signed auth age gates", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(createEnvironmentFixture())) {
      vi.stubEnv(name, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("binds an OAuth signup age to provider, callback nonce, and safe return target", async () => {
    const issued = await issueOAuthAgeGate(
      { ageBand: "teen", intent: "sign_up", provider: "google", returnTo: "/app/today" },
      now,
    );
    const response = attachPendingAuthAgeGate(NextResponse.json({ ok: true }), issued);
    const cookie = response.cookies.get(pendingAuthAgeGateCookieName);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");

    const callback = requestWithCookie(
      `http://127.0.0.1:3100/auth/callback?ageGate=${issued.callbackNonce}`,
      pendingAuthAgeGateCookieName,
      issued.token,
    );
    await expect(
      readPendingAuthAgeGate(
        callback,
        issued.callbackNonce,
        { flow: "oauth", provider: "google" },
        now,
      ),
    ).resolves.toMatchObject({ ageBand: "teen", returnTo: "/app/today" });
    await expect(
      readPendingAuthAgeGate(
        callback,
        issued.callbackNonce,
        { flow: "oauth", provider: "github" },
        now,
      ),
    ).resolves.toBeNull();
    await expect(
      readPendingAuthAgeGate(callback, `${issued.callbackNonce}x`, undefined, now),
    ).resolves.toBeNull();
  });

  it("binds password signup to the normalized email subject and expires quickly", async () => {
    const issued = await issuePasswordSignupAgeGate(
      { ageBand: "adult", email: " Learner@Example.TEST ", returnTo: "/app" },
      now,
    );
    const callback = requestWithCookie(
      "http://127.0.0.1:3100/auth/callback",
      pendingAuthAgeGateCookieName,
      issued.token,
    );
    const gate = await readPendingAuthAgeGate(
      callback,
      issued.callbackNonce,
      { flow: "password_signup", provider: null },
      now,
    );
    expect(gate).not.toBeNull();
    await expect(pendingPasswordGateMatchesEmail(gate!, "learner@example.test")).resolves.toBe(
      true,
    );
    await expect(pendingPasswordGateMatchesEmail(gate!, "other@example.test")).resolves.toBe(false);
    await expect(
      readPendingAuthAgeGate(
        callback,
        issued.callbackNonce,
        undefined,
        new Date(now.getTime() + 16 * 60 * 1000),
      ),
    ).resolves.toBeNull();
  });

  it("issues an HttpOnly onboarding gate bound to one authenticated account", async () => {
    const accountId = "11111111-1111-4111-8111-111111111111";
    const issued = await issueVerifiedOnboardingAgeGate(
      { accountId, ageBand: "teen", returnTo: "https://attacker.example/steal" },
      now,
    );
    const response = attachVerifiedOnboardingAgeGate(NextResponse.json({ ok: true }), issued);
    const cookie = response.cookies.get(onboardingAgeGateCookieName);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
    const request = requestWithCookie(
      "http://127.0.0.1:3100/api/onboarding",
      onboardingAgeGateCookieName,
      issued.token,
    );
    await expect(readRequestOnboardingAgeGate(request, accountId, now)).resolves.toMatchObject({
      ageBand: "teen",
      returnTo: "/app",
    });
    await expect(
      readRequestOnboardingAgeGate(request, "22222222-2222-4222-8222-222222222222", now),
    ).resolves.toBeNull();
  });

  it("binds password recovery to a signed nonce and normalized email subject", async () => {
    const issued = await issuePendingRecoveryIntent(
      { email: " Learner@Example.TEST ", returnTo: "/app/settings/security" },
      now,
    );
    const response = attachPendingRecoveryIntent(NextResponse.json({ ok: true }), issued);
    const cookie = response.cookies.get(pendingRecoveryIntentCookieName);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax" });
    const callback = requestWithCookie(
      `http://127.0.0.1:3100/auth/callback?recoveryState=${issued.callbackNonce}`,
      pendingRecoveryIntentCookieName,
      issued.token,
    );

    await expect(
      readPendingRecoveryIntent(callback, issued.callbackNonce, "learner@example.test", now),
    ).resolves.toMatchObject({ returnTo: "/app/settings/security" });
    await expect(
      readPendingRecoveryIntent(callback, `${issued.callbackNonce}x`, "learner@example.test", now),
    ).resolves.toBeNull();
    await expect(
      readPendingRecoveryIntent(callback, issued.callbackNonce, "other@example.test", now),
    ).resolves.toBeNull();
    await expect(
      readPendingRecoveryIntent(
        callback,
        issued.callbackNonce,
        "learner@example.test",
        new Date(now.getTime() + 16 * 60 * 1000),
      ),
    ).resolves.toBeNull();
  });
});
