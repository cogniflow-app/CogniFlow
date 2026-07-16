import { accountAppearanceInputSchema } from "@lumen/auth/profiles";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest, RequestSecurityError } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = accountAppearanceInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Review the appearance preferences and try again.",
        retryable: false,
      });
    }

    const database = createNextRouteDatabaseContext(request);
    const { data: userData, error: userError } = await database.client.auth.getUser();
    if (userError || !userData.user) {
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to save account appearance.",
        retryable: false,
      });
    }

    await assertSelfLearnerMutation(request, userData.user.id);
    const [profileResult, learnerResult] = await Promise.all([
      database.client
        .from("profiles")
        .select("display_name,handle,learning_goals,locale,study_day_start,timezone")
        .eq("id", userData.user.id)
        .single(),
      database.client
        .from("learner_profiles")
        .select("settings")
        .eq("owner_account_id", userData.user.id)
        .eq("kind", "self")
        .single(),
    ]);
    if (profileResult.error || !profileResult.data || learnerResult.error || !learnerResult.data) {
      throw new Error("APPEARANCE_PROFILE_UNAVAILABLE");
    }

    const profile = profileResult.data;
    const settings =
      typeof learnerResult.data.settings === "object" &&
      learnerResult.data.settings !== null &&
      !Array.isArray(learnerResult.data.settings)
        ? learnerResult.data.settings
        : {};
    const readingStyle =
      settings.reading_style === "increased_spacing" ? "increased_spacing" : "standard";
    const preferences = parsed.data;
    const { error } = await database.client.rpc("current_update_profile", {
      p_display_name: profile.display_name ?? "",
      p_handle: profile.handle ?? "",
      p_idempotency_key: crypto.randomUUID(),
      p_learning_goals: profile.learning_goals,
      p_locale: profile.locale,
      p_reading_style: readingStyle,
      p_reduced_motion: preferences.reduceMotion,
      p_serious_mode: preferences.seriousMode,
      p_study_day_start: profile.study_day_start,
      p_theme: preferences.theme,
      p_timezone: profile.timezone,
    });
    if (error) throw new Error("APPEARANCE_SAVE_FAILED");

    return database.applyCookies(
      apiSuccess({
        preferences: {
          color: preferences.theme,
          reduceMotion: preferences.reduceMotion,
          seriousMode: preferences.seriousMode,
        },
        status: "saved",
      }),
    );
  } catch (error) {
    const forbidden =
      error instanceof Error &&
      ["LEARNER_CONTEXT_UNAVAILABLE", "MANAGED_LEARNER_ACTIVE"].includes(error.message);
    if (forbidden)
      return apiError(403, {
        code: "FORBIDDEN",
        message: "Account appearance cannot be changed from a managed learner session.",
        retryable: false,
      });
    const invalidRequest =
      error instanceof RequestSecurityError ||
      (error instanceof Error &&
        ["INVALID_CONTENT_TYPE", "INVALID_JSON", "PAYLOAD_TOO_LARGE"].includes(error.message));
    if (invalidRequest)
      return apiError(error instanceof Error && error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
        code: "INVALID_INPUT",
        message: "Appearance preferences could not be saved.",
        retryable: false,
      });
    return apiError(500, {
      code: "INTERNAL",
      message: "Appearance preferences could not be saved.",
      retryable: true,
    });
  }
}
