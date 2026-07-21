import { expect, type Page } from "@playwright/test";

interface LocalAccountOptions {
  readonly displayName: string;
  readonly emailPrefix: string;
  readonly handlePrefix: string;
  readonly returnTo: string;
}

interface CreatedAuthUser {
  readonly id?: string;
}

function requireLocalTestEnvironment(): { secretKey: string; supabaseUrl: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("The local Supabase test environment is unavailable.");
  }

  const hostname = new URL(supabaseUrl).hostname;
  if (process.env.DEPLOYMENT_PROFILE !== "test" || !["127.0.0.1", "localhost"].includes(hostname)) {
    throw new Error("The local account fixture is restricted to the local test environment.");
  }
  return { secretKey, supabaseUrl };
}

function serviceHeaders(secretKey: string): HeadersInit {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Provisions an already-onboarded local author through the service-only test
 * boundary, then signs in through the real application form. Product-layout
 * scenarios do not need to consume the provider's deliberately low email
 * signup allowance; the dedicated smoke test continues to exercise signup.
 */
export async function provisionAndSignInLocalAuthor(
  page: Page,
  options: LocalAccountOptions,
): Promise<void> {
  const { secretKey, supabaseUrl } = requireLocalTestEnvironment();
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const email = `${options.emailPrefix}-${suffix}@example.test`;
  const password = `Local-only-password-${suffix}`;
  const handle = `${options.handlePrefix}_${suffix.slice(0, 12)}`;
  const headers = serviceHeaders(secretKey);

  const createResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    body: JSON.stringify({ email, email_confirm: true, password }),
    headers,
    method: "POST",
  });
  if (!createResponse.ok) {
    throw new Error(`The local Auth fixture could not be created (${createResponse.status}).`);
  }
  const created = (await createResponse.json()) as CreatedAuthUser;
  if (!created.id) {
    throw new Error("The local Auth fixture did not return an account identifier.");
  }

  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/rpc/admin_complete_current_account_onboarding`,
    {
      body: JSON.stringify({
        p_actor_account_id: created.id,
        p_age_band: "adult",
        p_display_name: options.displayName,
        p_handle: handle,
        p_idempotency_key: crypto.randomUUID(),
        p_learning_goals: [],
        p_locale: "en-US",
        p_reading_style: "standard",
        p_reduced_motion: false,
        p_serious_mode: false,
        p_study_day_start: 240,
        p_theme: "system",
        p_timezone: "America/Chicago",
      }),
      headers,
      method: "POST",
    },
  );
  if (!profileResponse.ok) {
    throw new Error(
      `The local profile fixture could not be completed (${profileResponse.status}).`,
    );
  }

  const octet = 20 + (Number.parseInt(suffix.slice(0, 2), 16) % 200);
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": `192.0.2.${String(octet)}` });
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(options.returnTo)}`);
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(options.returnTo, { timeout: 20_000 });
}
