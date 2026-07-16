import { oauthProviderNameSchema } from "@lumen/auth/providers";
import { getServerEnvironment } from "@lumen/config/server-env";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { asRecord, buildAuthCallbackUrl } from "@/lib/server/auth-route-helpers";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const body = asRecord(await readBoundedJson(request));
    if (!body || Object.keys(body).length !== 1) throw new Error("INVALID_INPUT");
    const provider = oauthProviderNameSchema.parse(body.provider);
    const configuredProvider = provider === "microsoft" ? "azure" : provider;
    if (!getServerEnvironment().enabledOAuthProviders.includes(configuredProvider)) {
      return apiError(404, {
        code: "FORBIDDEN",
        message: "That provider is not configured.",
        retryable: false,
      });
    }
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    if (!userData.user)
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again before connecting a provider.",
        retryable: false,
      });
    await assertSelfLearnerMutation(request, userData.user.id);
    const { data, error } = await database.client.auth.linkIdentity({
      provider: configuredProvider,
      options: {
        redirectTo: buildAuthCallbackUrl("authentication", "/app/settings/connections?linked=1"),
        ...(configuredProvider === "azure" ? { scopes: "email" } : {}),
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) {
      return apiError(400, {
        code: "INVALID_INPUT",
        message:
          "That provider could not be connected. Account linking may need to be enabled by the owner.",
        retryable: true,
      });
    }
    return database.applyCookies(apiSuccess({ next: data.url }));
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "That provider could not be connected.",
      retryable: true,
    });
  }
}
