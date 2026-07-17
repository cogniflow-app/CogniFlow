import { normalizeAuthenticationReturnUrl } from "@lumen/auth/redirects";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createNextRouteDatabaseContext } from "@/lib/supabase/server";
import {
  deleteRejectedProvisionalAuthUser,
  resolveAuthenticationAgeGate,
} from "@/lib/server/authentication-age-gate";
import {
  attachRecoveryIntent,
  clearPendingRecoveryIntent,
  readPendingRecoveryIntent,
} from "@/lib/server/recovery-intent";
import { applyDeviceCookie, registerRequestDevice } from "@/lib/server/device";
import {
  attachVerifiedOnboardingAgeGate,
  clearPendingAuthAgeGate,
} from "@/lib/server/pending-auth-age-gate";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const intent = request.nextUrl.searchParams.get("intent");
  const returnTo = normalizeAuthenticationReturnUrl(request.nextUrl.searchParams.get("returnTo"));
  if (!code || code.length > 4096) {
    return NextResponse.redirect(new URL("/auth/error?reason=expired", request.url));
  }

  const database = createNextRouteDatabaseContext(request);
  const { error } = await database.client.auth.exchangeCodeForSession(code);
  if (error) {
    return database.applyCookies(
      NextResponse.redirect(new URL("/auth/error?reason=expired", request.url)),
    );
  }
  const { data: userData } = await database.client.auth.getUser();
  if (!userData.user) {
    return database.applyCookies(
      NextResponse.redirect(new URL("/auth/error?reason=expired", request.url)),
    );
  }
  if (intent === "recovery") {
    const pendingRecovery = await readPendingRecoveryIntent(
      request,
      request.nextUrl.searchParams.get("recoveryState"),
      userData.user.email,
    );
    if (!pendingRecovery) {
      await database.client.auth.signOut({ scope: "local" });
      return clearPendingRecoveryIntent(
        clearPendingAuthAgeGate(
          database.applyCookies(
            NextResponse.redirect(new URL("/auth/error?reason=expired", request.url)),
          ),
        ),
      );
    }
    const ageGate = await resolveAuthenticationAgeGate(request, userData.user);
    if (!ageGate.allowed) {
      await database.client.auth.signOut({ scope: "local" });
      try {
        await deleteRejectedProvisionalAuthUser(userData.user.id);
      } catch {
        // Remain signed out and fail closed if provider-side cleanup is unavailable.
      }
      return clearPendingRecoveryIntent(
        clearPendingAuthAgeGate(
          database.applyCookies(
            NextResponse.redirect(new URL("/auth/error?reason=age_gate", request.url)),
          ),
        ),
      );
    }
    const deviceId = await registerRequestDevice(request, userData.user.id, database.client);
    let response = await attachRecoveryIntent(
      NextResponse.redirect(new URL("/auth/update-password", request.url)),
      userData.user.id,
    );
    response = clearPendingRecoveryIntent(response);
    response = clearPendingAuthAgeGate(response);
    if (ageGate.onboardingGate) {
      response = attachVerifiedOnboardingAgeGate(response, ageGate.onboardingGate);
    }
    return applyDeviceCookie(database.applyCookies(response), deviceId);
  }

  if (intent === "reauthentication") {
    // No route currently issues a signed email-reauthentication intent. Reject
    // query-only intent changes so an OAuth callback cannot bypass age gating.
    await database.client.auth.signOut({ scope: "local" });
    return clearPendingAuthAgeGate(
      database.applyCookies(
        NextResponse.redirect(new URL("/auth/error?reason=expired", request.url)),
      ),
    );
  }

  const ageGate = await resolveAuthenticationAgeGate(request, userData.user);
  if (!ageGate.allowed) {
    await database.client.auth.signOut({ scope: "local" });
    try {
      await deleteRejectedProvisionalAuthUser(userData.user.id);
    } catch {
      // Remain signed out and fail closed if provider-side cleanup is temporarily unavailable.
    }
    return clearPendingAuthAgeGate(
      database.applyCookies(
        NextResponse.redirect(new URL("/auth/error?reason=age_gate", request.url)),
      ),
    );
  }

  const deviceId = await registerRequestDevice(request, userData.user.id, database.client);
  const authorizedReturnTo = normalizeAuthenticationReturnUrl(ageGate.returnTo, returnTo);
  const next = ageGate.onboardingGate
    ? `/onboarding?returnTo=${encodeURIComponent(authorizedReturnTo)}`
    : authorizedReturnTo;
  let response = clearPendingAuthAgeGate(
    database.applyCookies(NextResponse.redirect(new URL(next, request.url))),
  );
  if (ageGate.onboardingGate) {
    response = attachVerifiedOnboardingAgeGate(response, ageGate.onboardingGate);
  }
  return applyDeviceCookie(response, deviceId);
}
