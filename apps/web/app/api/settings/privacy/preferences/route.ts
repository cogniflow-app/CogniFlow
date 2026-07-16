import { updatePrivacyPreferencesInputSchema } from "@lumen/auth/privacy";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = updatePrivacyPreferencesInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Review the privacy choices and try again.",
        retryable: false,
      });
    }
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    if (!userData.user) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to update privacy choices.",
        retryable: false,
      });
    }
    await assertSelfLearnerMutation(request, userData.user.id);
    const preferences = parsed.data.preferences;
    const { error } = await database.client.rpc("current_update_privacy_preferences", {
      p_allow_product_updates: preferences.allowProductUpdates,
      p_allow_social_interactions: preferences.allowSocialInteractions,
      p_default_content_private: preferences.defaultContentPrivate,
      p_first_party_analytics: preferences.analytics === "first_party_product",
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) throw new Error("PRIVACY_UPDATE_FAILED");
    return database.applyCookies(apiSuccess({ message: "Privacy choices saved." }));
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "Privacy choices could not be saved.",
      retryable: true,
    });
  }
}
