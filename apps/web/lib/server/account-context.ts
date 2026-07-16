import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";

import { deviceCookieName, profileSessionCookieName } from "@/lib/server/cookies";
import { sha256PostgresBytea } from "@/lib/server/crypto";
import { readVerifiedAuthSessionId } from "@/lib/server/auth-session";
import { ensureApplicationAccount } from "@/lib/server/account-provisioning";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

export interface AccountProfileView {
  readonly accountStatus: "active" | "deleted" | "onboarding" | "pending_deletion" | "suspended";
  readonly ageBand: "adult" | "teen" | "unknown";
  readonly displayName: string | null;
  readonly handle: string | null;
  readonly id: string;
  readonly learningGoals: readonly string[];
  readonly locale: string;
  readonly onboardingCompletedAt: string | null;
  readonly reducedMotion: boolean;
  readonly seriousMode: boolean;
  readonly studyDayStart: number;
  readonly theme: "dark" | "light" | "system";
  readonly timezone: string;
}

export interface LearnerProfileView {
  readonly ageBand: "adult" | "teen" | "under_13" | "unknown";
  readonly avatarSeed: string;
  readonly displayName: string | null;
  readonly id: string;
  readonly kind: "child" | "school_managed" | "self";
  readonly ownerAccountId: string;
  readonly pseudonym: string;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly status: "active" | "deleted" | "locked" | "pending_consent" | "suspended";
}

export interface PrivacyPreferenceView {
  readonly allowProductUpdates: boolean;
  readonly allowSocialInteractions: boolean;
  readonly defaultContentPrivate: boolean;
  readonly firstPartyAnalytics: boolean;
}

export interface AccountContext {
  readonly activeProfileSession: {
    readonly deviceId: string | null;
    readonly expiresAt: string;
    readonly id: string;
  } | null;
  readonly activeLearner: LearnerProfileView;
  readonly capabilities: readonly ("create" | "host" | "learn" | "teach")[];
  readonly email: string;
  readonly emailVerified: boolean;
  readonly identities: readonly {
    readonly createdAt: string | null;
    readonly id: string;
    readonly lastSignInAt: string | null;
    readonly provider: string;
  }[];
  readonly learnerProfiles: readonly LearnerProfileView[];
  readonly privacy: PrivacyPreferenceView;
  readonly profile: AccountProfileView;
}

function learnerView(row: {
  age_band: LearnerProfileView["ageBand"];
  avatar_seed: string;
  display_name: string | null;
  id: string;
  kind: LearnerProfileView["kind"];
  owner_account_id: string;
  pseudonym: string;
  settings: unknown;
  status: LearnerProfileView["status"];
}): LearnerProfileView {
  const settings =
    typeof row.settings === "object" && row.settings !== null && !Array.isArray(row.settings)
      ? (row.settings as Readonly<Record<string, unknown>>)
      : {};
  return Object.freeze({
    ageBand: row.age_band,
    avatarSeed: row.avatar_seed,
    displayName: row.display_name,
    id: row.id,
    kind: row.kind,
    ownerAccountId: row.owner_account_id,
    pseudonym: row.pseudonym,
    settings,
    status: row.status,
  });
}

async function readAccountContextUncached(): Promise<AccountContext | null> {
  const client = await createNextServerDatabaseClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData.user;
  if (userError || !user || !user.email) {
    return null;
  }

  const authSessionId = await readVerifiedAuthSessionId(client, user.id);
  await ensureApplicationAccount(user.id);
  const cookieStore = await cookies();
  const requestDeviceId = cookieStore.get(deviceCookieName)?.value;
  if (!requestDeviceId) {
    redirect("/auth/error?reason=session_unavailable");
  }
  const privileged = createPrivilegedDatabaseClient();
  const profileToken = cookieStore.get(profileSessionCookieName)?.value;
  const validToken =
    profileToken && profileToken.length >= 20 && profileToken.length <= 512 ? profileToken : null;
  const { data: sessionRows, error: sessionError } = await privileged.rpc(
    "admin_get_managed_profile_session_context",
    {
      p_actor_account_id: user.id,
      p_auth_session_id: authSessionId,
      p_device_id: requestDeviceId,
      p_token_hash: validToken ? await sha256PostgresBytea(validToken) : "\\x",
    },
  );
  if (sessionError) throw new Error("PROFILE_SESSION_UNAVAILABLE");
  const managedSession = sessionRows?.[0];
  if (managedSession) {
    if (!managedSession.is_active || !managedSession.token_matches) {
      redirect("/auth/profile-locked" as Route);
    }
    const { data: learnerRow, error: learnerError } = await client
      .from("learner_profiles")
      .select(
        "id,kind,owner_account_id,display_name,pseudonym,age_band,avatar_seed,status,settings",
      )
      .eq("id", managedSession.learner_profile_id)
      .eq("owner_account_id", user.id)
      .neq("kind", "self")
      .single();
    if (learnerError || !learnerRow) redirect("/auth/profile-locked" as Route);
    const activeLearner = learnerView(learnerRow);
    return Object.freeze({
      activeProfileSession: Object.freeze({
        deviceId: managedSession.device_id,
        expiresAt: managedSession.expires_at,
        id: managedSession.profile_session_id,
      }),
      activeLearner,
      capabilities: Object.freeze(["learn"] as const),
      email: "",
      emailVerified: false,
      identities: Object.freeze([]),
      learnerProfiles: Object.freeze([activeLearner]),
      privacy: Object.freeze({
        allowProductUpdates: false,
        allowSocialInteractions: false,
        defaultContentPrivate: true,
        firstPartyAnalytics: false,
      }),
      profile: Object.freeze({
        accountStatus: "active",
        ageBand: "unknown",
        displayName: null,
        handle: null,
        id: user.id,
        learningGoals: Object.freeze([]),
        locale: "en",
        onboardingCompletedAt: "managed-session",
        reducedMotion: true,
        seriousMode: true,
        studyDayStart: 240,
        theme: "system",
        timezone: "UTC",
      }),
    });
  }
  if (profileToken) redirect("/auth/profile-locked" as Route);

  const { data: device, error: deviceError } = await client
    .from("devices")
    .select("id")
    .eq("id", requestDeviceId)
    .eq("account_id", user.id)
    .eq("auth_session_id", authSessionId)
    .is("revoked_at", null)
    .maybeSingle();
  if (deviceError || !device) {
    redirect("/auth/error?reason=session_revoked");
  }

  const [profileResult, capabilityResult, learnerResult, privacyResult] = await Promise.all([
    client
      .from("profiles")
      .select(
        "id,handle,display_name,locale,timezone,study_day_start,age_band,account_status,learning_goals,theme,reduced_motion,serious_mode,onboarding_completed_at",
      )
      .eq("id", user.id)
      .single(),
    client
      .from("account_capabilities")
      .select("capability")
      .eq("account_id", user.id)
      .is("revoked_at", null),
    client
      .from("learner_profiles")
      .select(
        "id,kind,owner_account_id,display_name,pseudonym,age_band,avatar_seed,status,settings",
      )
      .neq("status", "deleted")
      .order("created_at", { ascending: true }),
    client.from("privacy_preferences").select("*").eq("account_id", user.id).single(),
  ]);

  if (profileResult.error || !profileResult.data) {
    throw new Error("ACCOUNT_PROFILE_UNAVAILABLE");
  }
  if (capabilityResult.error || learnerResult.error || privacyResult.error || !privacyResult.data) {
    throw new Error("ACCOUNT_CONTEXT_UNAVAILABLE");
  }
  const learners = (learnerResult.data ?? []).map(learnerView);
  const selfLearner = learners.find(
    (learner) => learner.kind === "self" && learner.ownerAccountId === user.id,
  );
  if (!selfLearner) {
    throw new Error("SELF_LEARNER_UNAVAILABLE");
  }
  const profile = profileResult.data;
  const privacy = privacyResult.data;
  return Object.freeze({
    activeProfileSession: null,
    activeLearner: selfLearner,
    capabilities: Object.freeze((capabilityResult.data ?? []).map((row) => row.capability)),
    email: user.email,
    emailVerified: Boolean(user.email_confirmed_at),
    identities: Object.freeze(
      (user.identities ?? []).map((identity) =>
        Object.freeze({
          createdAt: identity.created_at ?? null,
          id: identity.id,
          lastSignInAt: identity.last_sign_in_at ?? null,
          provider: identity.provider,
        }),
      ),
    ),
    learnerProfiles: Object.freeze(learners),
    privacy: Object.freeze({
      allowProductUpdates: privacy.allow_product_updates,
      allowSocialInteractions: privacy.allow_social_interactions,
      defaultContentPrivate: privacy.default_content_private,
      firstPartyAnalytics: privacy.first_party_analytics,
    }),
    profile: Object.freeze({
      accountStatus: profile.account_status,
      ageBand: profile.age_band === "under_13" ? "unknown" : profile.age_band,
      displayName: profile.display_name,
      handle: profile.handle,
      id: profile.id,
      learningGoals: Object.freeze(profile.learning_goals),
      locale: profile.locale,
      onboardingCompletedAt: profile.onboarding_completed_at,
      reducedMotion: profile.reduced_motion,
      seriousMode: profile.serious_mode,
      studyDayStart: profile.study_day_start,
      theme: profile.theme,
      timezone: profile.timezone,
    }),
  });
}

export const readAccountContext = cache(readAccountContextUncached);

export async function readProtectedReturnTo(fallback: string): Promise<string> {
  const value = (await headers()).get("x-lumen-request-path");
  return value?.startsWith("/app") && !value.startsWith("//") && value.length <= 2_048
    ? value
    : fallback;
}

export async function requireAccountContext(options: {
  readonly allowIncompleteOnboarding?: boolean;
  readonly requireSelfLearner?: boolean;
  readonly returnTo: string;
}): Promise<AccountContext> {
  const account = await readAccountContext();
  if (!account) {
    redirect(`/auth/sign-in?returnTo=${encodeURIComponent(options.returnTo)}`);
  }
  if (!options.allowIncompleteOnboarding && !account.profile.onboardingCompletedAt) {
    redirect(`/onboarding?returnTo=${encodeURIComponent(options.returnTo)}`);
  }
  if (["deleted", "suspended"].includes(account.profile.accountStatus)) {
    redirect("/auth/error?reason=account_unavailable");
  }
  if (options.requireSelfLearner && account.activeLearner.kind !== "self") {
    redirect("/app?notice=guardian_controls_required");
  }
  return account;
}
