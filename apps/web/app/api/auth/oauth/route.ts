import { signupAgeBandSchema } from "@lumen/auth";
import { oauthProviderNameSchema } from "@lumen/auth/providers";
import { normalizeReturnUrl } from "@lumen/auth/redirects";
import { getServerEnvironment } from "@lumen/config/server-env";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { asRecord, buildAuthCallbackUrl } from "@/lib/server/auth-route-helpers";
import { attachPendingAuthAgeGate, issueOAuthAgeGate } from "@/lib/server/pending-auth-age-gate";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const candidate = asRecord(await readBoundedJson(request));
    if (
      !candidate ||
      Object.keys(candidate).some(
        (key) => !["ageBand", "intent", "provider", "returnTo"].includes(key),
      ) ||
      (candidate.intent !== "sign_in" && candidate.intent !== "sign_up")
    ) {
      throw new Error("INVALID_INPUT");
    }
    let ageBand: "adult" | "teen" | undefined;
    if (candidate.intent === "sign_up") {
      const parsedAgeBand = signupAgeBandSchema.safeParse(candidate.ageBand);
      if (!parsedAgeBand.success) throw new Error("INVALID_INPUT");
      if (parsedAgeBand.data === "under_13") {
        return apiSuccess({ next: "/auth/guardian-required", status: "guardian_required" });
      }
      ageBand = parsedAgeBand.data;
    }
    const provider = oauthProviderNameSchema.parse(candidate.provider);
    const configuredProvider = provider === "microsoft" ? "azure" : provider;
    if (!getServerEnvironment().enabledOAuthProviders.includes(configuredProvider)) {
      return apiError(404, {
        code: "FORBIDDEN",
        message: "That sign-in provider is not configured.",
        retryable: false,
      });
    }
    const returnTo = normalizeReturnUrl(candidate.returnTo);
    let pendingAgeGate: Awaited<ReturnType<typeof issueOAuthAgeGate>>;
    if (candidate.intent === "sign_up") {
      if (!ageBand) throw new Error("INVALID_INPUT");
      pendingAgeGate = await issueOAuthAgeGate({
        ageBand,
        intent: "sign_up",
        provider,
        returnTo,
      });
    } else {
      pendingAgeGate = await issueOAuthAgeGate({ intent: "sign_in", provider, returnTo });
    }
    const database = createNextRouteDatabaseContext(request);
    const { data, error } = await database.client.auth.signInWithOAuth({
      provider: configuredProvider,
      options: {
        redirectTo: buildAuthCallbackUrl("authentication", returnTo, {
          callbackNonce: pendingAgeGate.callbackNonce,
          flow: "oauth",
          provider,
        }),
        ...(configuredProvider === "azure" ? { scopes: "email" } : {}),
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) {
      return apiError(400, {
        code: "INVALID_INPUT",
        message: "That provider could not start. Try another sign-in method.",
        retryable: true,
      });
    }
    return attachPendingAuthAgeGate(
      database.applyCookies(apiSuccess({ next: data.url, status: "provider_redirect" })),
      pendingAgeGate,
    );
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "That provider could not start. Try another sign-in method.",
      retryable: true,
    });
  }
}
