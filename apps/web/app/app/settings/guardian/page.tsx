import { Badge, PageHeader } from "@lumen/ui";
import type { Metadata } from "next";

import { ConsentRevokeAction } from "@/components/settings/consent-revoke-action.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Guardian controls" };

function readableDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export default async function GuardianSettingsPage() {
  const account = await requireAccountContext({
    requireSelfLearner: true,
    returnTo: "/app/settings/guardian",
  });
  const client = await createNextServerDatabaseClient();
  const [relationshipResult, consentResult] = await Promise.all([
    client
      .from("guardian_relationships")
      .select("id,learner_profile_id,status,created_at,activated_at,revoked_at")
      .order("created_at", { ascending: false }),
    client
      .from("consent_records")
      .select(
        "id,learner_profile_id,consent_type,action,policy_version,verification_method,prior_consent_record_id,reason,recorded_at",
      )
      .order("recorded_at", { ascending: false }),
  ]);
  if (relationshipResult.error || consentResult.error)
    throw new Error("GUARDIAN_STATUS_UNAVAILABLE");
  const records = consentResult.data ?? [];
  const revokedGrantIds = new Set(
    records
      .map((record) => record.prior_consent_record_id)
      .filter((value): value is string => Boolean(value)),
  );
  const learnerNames = new Map(
    account.learnerProfiles.map((learner) => [
      learner.id,
      learner.displayName ?? learner.pseudonym,
    ]),
  );

  return (
    <>
      <PageHeader
        eyebrow="Account settings"
        title="Guardian controls"
        description="Guardian relationships and consent are server-authorized records. Revocation is appended as a new event; the original evidence is never rewritten."
      />
      <div className="grid gap-5">
        <section className="settings-card" aria-labelledby="relationships-heading">
          <h2 className="m-0 text-xl" id="relationships-heading">
            Relationships
          </h2>
          {(relationshipResult.data ?? []).length > 0 ? (
            <ul className="mt-4 grid gap-3 p-0">
              {(relationshipResult.data ?? []).map((relationship) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-3"
                  key={relationship.id}
                >
                  <span>
                    <strong>
                      {learnerNames.get(relationship.learner_profile_id) ?? "Managed learner"}
                    </strong>
                    <br />
                    <small className="text-[var(--color-text-muted)]">
                      Created {readableDate(relationship.created_at)}
                    </small>
                  </span>
                  <Badge
                    tone={
                      relationship.status === "active"
                        ? "success"
                        : relationship.status === "revoked"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {relationship.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 mb-0 text-sm text-[var(--color-text-muted)]">
              No guardian relationships are recorded for this account.
            </p>
          )}
        </section>
        <section className="settings-card" aria-labelledby="consent-history-heading">
          <h2 className="m-0 text-xl" id="consent-history-heading">
            Append-only consent history
          </h2>
          {records.length > 0 ? (
            <ul className="mt-4 grid gap-3 p-0">
              {records.map((record) => {
                const activeGrant = record.action === "granted" && !revokedGrantIds.has(record.id);
                return (
                  <li
                    className="rounded-xl border border-[var(--color-border)] p-4"
                    key={record.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <strong>{record.consent_type.replaceAll("_", " ")}</strong>
                        <br />
                        <small className="text-[var(--color-text-muted)]">
                          {record.policy_version} · {record.verification_method} ·{" "}
                          {readableDate(record.recorded_at)}
                        </small>
                      </span>
                      <Badge
                        tone={
                          record.action === "revoked"
                            ? "danger"
                            : activeGrant
                              ? "success"
                              : "neutral"
                        }
                      >
                        {record.action === "revoked"
                          ? "revoked"
                          : activeGrant
                            ? "active"
                            : "superseded"}
                      </Badge>
                    </div>
                    {record.reason && <p className="mt-2 mb-0 text-sm">Reason: {record.reason}</p>}
                    {activeGrant &&
                      ["child_profile", "guardian_account"].includes(record.consent_type) && (
                        <ConsentRevokeAction consentRecordId={record.id} />
                      )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 mb-0 text-sm text-[var(--color-text-muted)]">
              No consent evidence is recorded.
            </p>
          )}
        </section>
        <section className="settings-card">
          <h2 className="m-0 text-xl">School-managed access boundary</h2>
          <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
            School-managed learner profiles and teacher-observer grants require an authorized school
            service path. This account screen cannot self-assert a school role, learner identifier,
            or authorization proof.
          </p>
        </section>
      </div>
    </>
  );
}
