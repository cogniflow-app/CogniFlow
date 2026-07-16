import { Badge, PageHeader } from "@lumen/ui";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DeviceRevokeAction } from "@/components/settings/device-revoke-action.client";
import { ProfileSessionRevokeAction } from "@/components/settings/profile-session-revoke-action.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { deviceCookieName } from "@/lib/server/cookies";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Devices and sessions" };

function readableDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export default async function DevicesSettingsPage() {
  await requireAccountContext({ requireSelfLearner: true, returnTo: "/app/settings/devices" });
  const currentDeviceId = (await cookies()).get(deviceCookieName)?.value;
  const client = await createNextServerDatabaseClient();
  const [deviceResult, sessionResult, learnerResult] = await Promise.all([
    client
      .from("devices")
      .select(
        "id,display_name,platform,first_seen_at,last_seen_at,last_reauthenticated_at,revoked_at",
      )
      .order("last_seen_at", { ascending: false }),
    client
      .from("profile_sessions")
      .select("id,device_id,learner_profile_id,created_at,expires_at,revoked_at")
      .order("created_at", { ascending: false }),
    client.from("learner_profiles").select("id,display_name,pseudonym"),
  ]);
  if (deviceResult.error || sessionResult.error || learnerResult.error)
    throw new Error("DEVICE_STATUS_UNAVAILABLE");
  const sessions = sessionResult.data ?? [];
  const learnerNames = new Map(
    (learnerResult.data ?? []).map((learner) => [
      learner.id,
      learner.display_name ?? learner.pseudonym,
    ]),
  );

  return (
    <>
      <PageHeader
        eyebrow="Account settings"
        title="Devices and sessions"
        description="Review registered browsers and revoke their learner-profile sessions. Every revoke requires a fresh password check."
      />
      <div className="grid gap-4">
        {(deviceResult.data ?? []).length === 0 ? (
          <section className="settings-card">
            <p className="m-0 text-[var(--color-text-muted)]">
              No registered devices are visible yet. A browser is registered after a completed
              sign-in.
            </p>
          </section>
        ) : (
          (deviceResult.data ?? []).map((device) => {
            const activeSessions = sessions.filter(
              (session) =>
                session.device_id === device.id &&
                !session.revoked_at &&
                Date.parse(session.expires_at) > Date.now(),
            );
            const current = device.id === currentDeviceId;
            return (
              <section
                className="settings-card flex flex-col justify-between gap-5 lg:flex-row lg:items-center"
                key={device.id}
                aria-labelledby={`device-${device.id}`}
              >
                <div className="grid flex-1 gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-lg" id={`device-${device.id}`}>
                      {device.display_name}
                    </h2>
                    {current && <Badge tone="brand">This device</Badge>}
                    {device.revoked_at && <Badge tone="danger">Revoked</Badge>}
                  </div>
                  <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
                    {device.platform} · last seen {readableDate(device.last_seen_at)} ·{" "}
                    {activeSessions.length} active learner{" "}
                    {activeSessions.length === 1 ? "session" : "sessions"}
                  </p>
                  {activeSessions.length > 0 && (
                    <ul
                      className="m-0 grid list-none gap-3 p-0"
                      aria-label="Active learner sessions"
                    >
                      {activeSessions.map((session) => (
                        <li
                          className="grid gap-3 border-t border-[var(--color-border)] pt-3 lg:grid-cols-[1fr_auto] lg:items-end"
                          key={session.id}
                        >
                          <p className="m-0 text-sm">
                            <strong>
                              {learnerNames.get(session.learner_profile_id) ?? "Learner profile"}
                            </strong>
                            <br />
                            <span className="text-[var(--color-text-muted)]">
                              Started {readableDate(session.created_at)} · expires{" "}
                              {readableDate(session.expires_at)}
                            </span>
                          </p>
                          <ProfileSessionRevokeAction profileSessionId={session.id} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {!device.revoked_at && <DeviceRevokeAction deviceId={device.id} />}
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
