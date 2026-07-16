import { updateAccountProfileInputSchema } from "@lumen/auth/profiles";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { zodFieldErrors } from "@/lib/server/auth-route-helpers";
import { assertSelfLearnerMutation } from "@/lib/server/learner-context";
import { assertTrustedMutationRequest } from "@/lib/server/request-security";
import { createNextRouteDatabaseContext } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedMutationRequest(request);
    const parsed = updateAccountProfileInputSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) {
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: zodFieldErrors(parsed.error.issues),
        message: "Review the profile fields and try again.",
        retryable: false,
      });
    }
    const database = createNextRouteDatabaseContext(request);
    const { data: userData } = await database.client.auth.getUser();
    if (!userData.user)
      return apiError(401, {
        code: "UNAUTHENTICATED",
        message: "Sign in again to update your profile.",
        retryable: false,
      });
    await assertSelfLearnerMutation(request, userData.user.id);
    const [profileResult, learnerResult] = await Promise.all([
      database.client.from("profiles").select("*").eq("id", userData.user.id).single(),
      database.client
        .from("learner_profiles")
        .select("settings")
        .eq("owner_account_id", userData.user.id)
        .eq("kind", "self")
        .single(),
    ]);
    if (profileResult.error || !profileResult.data || learnerResult.error || !learnerResult.data)
      throw new Error("PROFILE_UNAVAILABLE");
    const input = parsed.data;
    const current = profileResult.data;
    const settings =
      typeof learnerResult.data.settings === "object" &&
      learnerResult.data.settings !== null &&
      !Array.isArray(learnerResult.data.settings)
        ? learnerResult.data.settings
        : {};
    const preferences = input.preferences;
    const { error } = await database.client.rpc("current_update_profile", {
      p_display_name: input.displayName ?? current.display_name ?? "",
      p_handle: input.handle ?? current.handle ?? "",
      p_idempotency_key: crypto.randomUUID(),
      p_learning_goals: input.learningGoals ?? current.learning_goals,
      p_locale: input.locale ?? current.locale,
      p_reading_style:
        preferences?.readingStyle ??
        (settings.reading_style === "increased_spacing" ? "increased_spacing" : "standard"),
      p_reduced_motion: preferences?.reduceMotion ?? current.reduced_motion,
      p_serious_mode: preferences?.seriousMode ?? current.serious_mode,
      p_study_day_start: input.studyDayStartMinutes ?? current.study_day_start,
      p_theme: preferences?.theme ?? current.theme,
      p_timezone: input.timeZone ?? current.timezone,
    });
    if (error) {
      const conflict = error.code === "23505";
      return apiError(conflict ? 409 : 400, {
        code: conflict ? "CONFLICT" : "INVALID_INPUT",
        message: conflict
          ? "That handle is unavailable. Choose another."
          : "Profile changes could not be saved.",
        retryable: !conflict,
      });
    }
    return database.applyCookies(apiSuccess({ message: "Profile saved." }));
  } catch {
    return apiError(400, {
      code: "INVALID_INPUT",
      message: "Profile changes could not be saved.",
      retryable: true,
    });
  }
}
