import { getPublicCapabilities } from "@lumen/config/server-capabilities";
import { Badge, PageHeader } from "@lumen/ui";
import type { Metadata } from "next";

import {
  CancelDeletionAction,
  DeletionRequestAction,
  ExportRequestAction,
} from "@/components/settings/privacy-data-actions.client";
import { PrivacyPreferencesForm } from "@/components/settings/privacy-preferences-form.client";
import { requireAccountContext } from "@/lib/server/account-context";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Privacy and data" };

function readableDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export default async function PrivacySettingsPage() {
  const account = await requireAccountContext({
    requireSelfLearner: true,
    returnTo: "/app/settings/privacy",
  });
  const client = await createNextServerDatabaseClient();
  const [exportResult, deletionResult] = await Promise.all([
    client
      .from("data_export_jobs")
      .select("id,status,result_available,requested_at,completed_at,expires_at")
      .order("requested_at", { ascending: false })
      .limit(5),
    client
      .from("deletion_jobs")
      .select("id,status,requested_at,execute_after,cancelled_at")
      .order("requested_at", { ascending: false })
      .limit(5),
  ]);
  if (exportResult.error || deletionResult.error) {
    throw new Error("PRIVACY_JOB_STATUS_UNAVAILABLE");
  }
  const exports = exportResult.data ?? [];
  const deletions = deletionResult.data ?? [];
  const activeDeletion = deletions.find((job) => ["processing", "queued"].includes(job.status));
  const retention = getPublicCapabilities().privacyRetention;

  return (
    <>
      <PageHeader
        description="Control account defaults, inspect real request state, and understand configured retention windows."
        eyebrow="Account settings"
        title="Privacy and data"
      />
      <div className="grid gap-5">
        <PrivacyPreferencesForm initial={account.privacy} />

        <section className="settings-card" aria-labelledby="retention-heading">
          <h2 className="m-0 text-xl" id="retention-heading">
            Retention in this deployment
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-[var(--color-text-muted)]">Audit evidence</dt>
              <dd className="m-0 font-bold">{retention.auditEventDays} days</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-text-muted)]">Export download window</dt>
              <dd className="m-0 font-bold">{retention.exportDownloadDays} days</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--color-text-muted)]">Deletion grace period</dt>
              <dd className="m-0 font-bold">{retention.deletionGraceDays} days</dd>
            </div>
          </dl>
        </section>

        <section className="settings-card" aria-labelledby="export-heading">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 className="m-0 text-xl" id="export-heading">
                Data export
              </h2>
              <p className="mt-2 mb-0 text-sm text-[var(--color-text-muted)]">
                The request and job status are live. Phase 01 queues the portable JSON archive job;
                download assembly remains isolated behind the job boundary.
              </p>
            </div>
            <ExportRequestAction />
          </div>
          {exports.length > 0 ? (
            <ul className="mt-5 grid gap-3 p-0" aria-label="Recent export jobs">
              {exports.map((job) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-3"
                  key={job.id}
                >
                  <span>
                    <strong>Requested {readableDate(job.requested_at)}</strong>
                    <br />
                    <small className="text-[var(--color-text-muted)]">
                      {job.result_available ? "Archive available" : "Archive not yet available"}
                    </small>
                  </span>
                  <Badge
                    tone={
                      job.status === "completed"
                        ? "success"
                        : job.status === "failed"
                          ? "danger"
                          : "info"
                    }
                  >
                    {job.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 mb-0 text-sm text-[var(--color-text-muted)]">
              No export requests yet.
            </p>
          )}
        </section>

        <section
          className="settings-card border-[color-mix(in_srgb,var(--color-danger)_30%,var(--color-border))]"
          aria-labelledby="deletion-heading"
        >
          <h2 className="m-0 text-xl" id="deletion-heading">
            Account deletion
          </h2>
          {activeDeletion ? (
            <div className="mt-4">
              <Badge tone="warning">{activeDeletion.status}</Badge>
              <p className="mt-3 mb-0">
                Deletion is scheduled after{" "}
                <strong>{readableDate(activeDeletion.execute_after)}</strong>. You may cancel during
                the grace period after a fresh password check.
              </p>
              <CancelDeletionAction deletionJobId={activeDeletion.id} />
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                A verified request enters a {retention.deletionGraceDays}-day grace period. Learner
                profile sessions are revoked immediately; final removal is owned by the deletion
                worker.
              </p>
              <DeletionRequestAction />
            </>
          )}
        </section>
      </div>
    </>
  );
}
