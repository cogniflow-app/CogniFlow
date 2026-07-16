import { expect, test } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
if (!baseUrl) {
  throw new Error("PLAYWRIGHT_BASE_URL is required for hosted smoke tests.");
}
const hostedOrigin = new URL(baseUrl).origin;

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Readonly<Record<string, unknown>>;
}

const mutationHeaders = {
  "Content-Type": "application/json",
  Origin: hostedOrigin,
  "Sec-Fetch-Site": "same-origin",
  "X-Lumen-CSRF": "1",
} as const;

test.describe("hosted, controlled deployment smoke", () => {
  test("renders the public landing page", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/learn for the long term/i);
    await expect(
      page.getByRole("heading", { level: 1, name: /learn from a foundation you control/i }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonicalHref).not.toBeNull();
    const canonicalUrl = new URL(canonicalHref!, hostedOrigin);
    expect(canonicalUrl.origin).toBe(hostedOrigin);
    expect(canonicalUrl.pathname).toBe("/");
    expect(canonicalUrl.search).toBe("");
    expect(canonicalUrl.hash).toBe("");
  });

  test("reports a safe Vercel beta health projection", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const body = asRecord(await response.json());
    const capabilities = asRecord(body.capabilities);
    expect(body).toMatchObject({
      buildVersion: expect.any(String),
      deploymentProfile: "vercel_beta",
      provider: "vercel",
      runtime: "nodejs",
      status: "ok",
      version: expect.any(String),
    });
    expect(body.buildVersion).toBe(body.version);
    expect(body.buildVersion).not.toBe("development");
    expect(capabilities).toMatchObject({
      childConsentReady: false,
      childProfiles: false,
      freeTextGameChat: false,
      oauthProviders: [],
      parentalConsentMode: "disabled",
      publicChildContent: false,
    });

    for (const forbiddenKey of [
      "appEncryptionKey",
      "databaseUrl",
      "guestTokenSigningKey",
      "privilegedDatabaseAccess",
      "supabaseSecretKey",
    ]) {
      expect(body).not.toHaveProperty(forbiddenKey);
      expect(capabilities).not.toHaveProperty(forbiddenKey);
    }
  });

  test("renders signup, sign-in, and password-recovery pages with OAuth disabled", async ({
    page,
  }) => {
    await page.goto("/auth/sign-up");
    await expect(
      page.getByRole("heading", { level: 2, name: "Create your account" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with/i })).toHaveCount(0);

    await page.goto("/auth/sign-in");
    await expect(page.getByRole("heading", { level: 2, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with/i })).toHaveCount(0);

    await page.goto("/auth/forgot-password");
    await expect(
      page.getByRole("heading", { level: 2, name: "Reset your password" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Send recovery instructions" })).toBeVisible();
  });

  test("redirects protected routes to sign-in with a relative return destination", async ({
    page,
  }) => {
    await page.goto("/app/settings/privacy");
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/u);

    const redirected = new URL(page.url());
    expect(redirected.origin).toBe(hostedOrigin);
    expect(redirected.pathname).toBe("/auth/sign-in");
    expect(redirected.searchParams.get("returnTo")).toBe("/app/settings/privacy");
    await expect(page.getByRole("heading", { level: 2, name: "Sign in" })).toBeVisible();
    await expect(page.getByText(/privacy and data controls/i)).toHaveCount(0);
  });

  test("normalizes an unsafe return destination before rendering auth links", async ({ page }) => {
    await page.goto("/auth/sign-in?returnTo=https%3A%2F%2Fattacker.example%2Fprivate-account-data");

    const magicLinkHref = await page
      .getByRole("link", { name: "Use an email link" })
      .getAttribute("href");
    const signupHref = await page
      .getByRole("link", { name: "Create an account" })
      .getAttribute("href");
    expect(magicLinkHref).not.toBeNull();
    expect(signupHref).not.toBeNull();
    expect(new URL(magicLinkHref!, hostedOrigin).searchParams.get("returnTo")).toBe("/app");
    expect(new URL(signupHref!, hostedOrigin).searchParams.get("returnTo")).toBe("/app");
    expect(`${magicLinkHref}${signupHref}`).not.toContain("attacker.example");
  });

  test("routes incomplete callback and confirmation links to the neutral expired page", async ({
    page,
  }) => {
    for (const route of [
      "/auth/callback?returnTo=https%3A%2F%2Fattacker.example%2Fsteal",
      "/auth/confirm?type=signup&returnTo=%2Fapp",
    ]) {
      await page.goto(route);
      const redirected = new URL(page.url());
      expect(redirected.origin).toBe(hostedOrigin);
      expect(`${redirected.pathname}${redirected.search}`).toBe("/auth/error?reason=expired");
      await expect(
        page.getByRole("heading", { level: 1, name: "That link has expired." }),
      ).toBeVisible();
      await expect(page.getByText("No account changes were made.", { exact: false })).toBeVisible();
    }
  });

  test("initiates recovery for a reserved nonexistent address with a neutral response", async ({
    request,
  }) => {
    const email = `hosted-smoke-${crypto.randomUUID()}@example.invalid`;
    const response = await request.post("/api/auth/email-link", {
      data: { email, intent: "forgot_password", returnTo: "/auth/update-password" },
      headers: mutationHeaders,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = asRecord(await response.json());
    expect(body).toEqual({
      message: "If that address can use this flow, a secure email will arrive shortly.",
      status: "email_sent",
    });
    expect(JSON.stringify(body)).not.toContain(email);

    const pendingCookie = (await response.headersArray()).find(
      ({ name, value }) =>
        name.toLowerCase() === "set-cookie" && value.startsWith("lumen_pending_recovery_intent="),
    )?.value;
    expect(pendingCookie).toBeDefined();
    expect(pendingCookie).toMatch(/(?:^|;\s*)HttpOnly(?:;|$)/iu);
    expect(pendingCookie).toMatch(/(?:^|;\s*)Secure(?:;|$)/iu);
    expect(pendingCookie).toMatch(/(?:^|;\s*)SameSite=Lax(?:;|$)/iu);
    expect(pendingCookie).not.toMatch(/(?:^|;\s*)Domain=/iu);
  });

  test("rejects a mutation from the retired production origin", async ({ request }) => {
    const email = `hosted-smoke-${crypto.randomUUID()}@example.invalid`;
    const response = await request.post("/api/auth/email-link", {
      data: { email, intent: "forgot_password", returnTo: "/auth/update-password" },
      headers: {
        ...mutationHeaders,
        Origin: "https://cogniflow-pearl.vercel.app",
      },
    });

    expect(response.status()).toBe(400);
    const body = asRecord(await response.json());
    expect(body).toMatchObject({ code: "INVALID_INPUT", retryable: true });
    expect(JSON.stringify(body)).not.toContain(email);
  });

  test("signs out an unauthenticated browser without creating a session", async ({ request }) => {
    const response = await request.post("/api/auth/sign-out", {
      data: { scope: "current" },
      headers: mutationHeaders,
    });

    expect(response.status()).toBe(200);
    const body = asRecord(await response.json());
    expect(body.status).toBe("signed_out");
    expect(["application_boundary", "provider_confirmed"]).toContain(body.authSessionInvalidation);
  });

  test("serves defense-in-depth security headers and a site-wide noindex policy", async ({
    request,
  }) => {
    const landing = await request.get("/");
    expect(landing.status()).toBe(200);
    const headers = landing.headers();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["x-robots-tag"]).toContain("nofollow");

    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const policy = (await robots.text()).toLowerCase();
    expect(policy).toMatch(/user-agent:\s*\*/u);
    expect(policy).toMatch(/disallow:\s*\/(?:\s|$)/u);
  });
});
