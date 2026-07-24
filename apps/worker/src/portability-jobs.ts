interface WorkerError {
  readonly message: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: WorkerError | null;
}

interface QueryResult {
  readonly data: unknown;
  readonly error: WorkerError | null;
}

interface StorageRemovalResult {
  readonly error: WorkerError | null;
}

interface PortabilityStatusQuery {
  eq(column: string, value: string): PortabilityStatusQuery;
  select(columns: string): PortabilityStatusQuery;
  single(): PromiseLike<QueryResult>;
}

export interface PortabilityWorkerClient {
  readonly from: (table: "export_jobs" | "import_jobs") => PortabilityStatusQuery;
  readonly rpc: (
    functionName: string,
    arguments_?: Readonly<Record<string, unknown>>,
  ) => PromiseLike<RpcResult>;
  readonly storage: {
    readonly from: (bucket: string) => {
      readonly remove: (paths: readonly string[]) => PromiseLike<StorageRemovalResult>;
    };
  };
}

export type PortabilityJobKind = "export" | "import" | "restore";
export type PortabilityCompletion =
  "cancelled" | "completed" | "completed_with_warnings" | "failed" | "retryable";

export interface ClaimedPortabilityJob {
  readonly attemptNumber: number;
  readonly jobId: string;
  readonly jobKind: PortabilityJobKind;
  readonly leaseToken: string;
  readonly phase: string;
  readonly queueId: string;
}

export interface PortabilityCheckpoint {
  readonly checkpointKey: string;
  readonly errorCount: number;
  readonly ordinal: number;
  readonly payloadFingerprint: string;
  readonly phase: string;
  readonly processedCount: number;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
  readonly totalCount: number;
  readonly warningCount: number;
}

export interface PortabilityHandlerResult {
  readonly errorCount?: number;
  readonly result: Exclude<PortabilityCompletion, "retryable">;
  readonly safeErrorCode?: string;
  readonly safeErrorSummary?: string;
  readonly warningCount?: number;
}

export interface PortabilityJobExecution {
  readonly checkpoint: (checkpoint: PortabilityCheckpoint) => Promise<void>;
  readonly isCancelled: () => Promise<boolean>;
  readonly job: ClaimedPortabilityJob;
}

export type PortabilityJobHandler = (
  execution: PortabilityJobExecution,
) => Promise<PortabilityHandlerResult>;

export interface PortabilityBatchOptions {
  readonly handler: PortabilityJobHandler;
  readonly leaseSeconds?: number;
  readonly limit?: number;
  readonly maximumAttempts?: number;
  readonly workerId: string;
}

export interface PortabilityBatchResult {
  readonly cancelled: number;
  readonly claimed: number;
  readonly completed: number;
  readonly failed: number;
  readonly retryQueued: number;
}

export interface PortabilityCleanupObject {
  readonly objectId: string;
  readonly objectKind: "artifact" | "upload";
  readonly storageBucket: "lumen-portability";
  readonly storagePath: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const fingerprintPattern = /^[a-f0-9]{64}$/u;

function integerInRange(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`Expected an integer between ${String(minimum)} and ${String(maximum)}.`);
  }
  return candidate;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function claimedJobs(value: unknown): readonly ClaimedPortabilityJob[] {
  if (!Array.isArray(value)) throw new Error("The portability claim response was invalid.");
  return value.map((item) => {
    const row = record(item);
    const queueId = row?.queue_id;
    const jobKind = row?.job_kind;
    const jobId = row?.job_id;
    const phase = row?.phase;
    const attemptNumber = row?.attempt_number;
    const leaseToken = row?.lease_token;
    if (
      typeof queueId !== "string" ||
      !uuidPattern.test(queueId) ||
      (jobKind !== "export" && jobKind !== "import" && jobKind !== "restore") ||
      typeof jobId !== "string" ||
      !uuidPattern.test(jobId) ||
      typeof phase !== "string" ||
      phase.length < 1 ||
      phase.length > 80 ||
      typeof attemptNumber !== "number" ||
      !Number.isSafeInteger(attemptNumber) ||
      attemptNumber < 1 ||
      typeof leaseToken !== "string" ||
      !uuidPattern.test(leaseToken)
    ) {
      throw new Error("A portability claim row was invalid.");
    }
    return Object.freeze({
      attemptNumber,
      jobId,
      jobKind,
      leaseToken,
      phase,
      queueId,
    });
  });
}

function safeCode(value: string | undefined, fallback: string) {
  const normalized = value
    ?.normalize("NFKC")
    .replaceAll(/[^A-Za-z0-9_]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .slice(0, 80);
  return normalized || fallback;
}

function safeSummary(value: string | undefined, fallback: string) {
  const normalized = value
    ?.normalize("NFKC")
    .replaceAll(/[\r\n\t]+/gu, " ")
    .trim()
    .slice(0, 500);
  return normalized || fallback;
}

async function isCancelled(client: PortabilityWorkerClient, job: ClaimedPortabilityJob) {
  const table = job.jobKind === "export" ? "export_jobs" : "import_jobs";
  const response = await client.from(table).select("status").eq("id", job.jobId).single();
  if (response.error)
    throw new Error(`Portability cancellation check failed: ${response.error.message}`);
  const status = record(response.data)?.status;
  if (typeof status !== "string") throw new Error("The portability job status was invalid.");
  return status === "cancelling" || status === "cancelled";
}

async function complete(
  client: PortabilityWorkerClient,
  job: ClaimedPortabilityJob,
  result: PortabilityCompletion,
  details: {
    readonly errorCount: number;
    readonly safeErrorCode?: string;
    readonly safeErrorSummary?: string;
    readonly warningCount: number;
  },
) {
  const response = await client.rpc("admin_complete_portability_job", {
    p_error_count: details.errorCount,
    p_job_id: job.jobId,
    p_job_kind: job.jobKind,
    p_lease_token: job.leaseToken,
    p_result: result,
    p_safe_error_code: details.safeErrorCode ?? null,
    p_safe_error_summary: details.safeErrorSummary ?? null,
    p_warning_count: details.warningCount,
  });
  if (response.error) throw new Error(`Portability completion failed: ${response.error.message}`);
  const returnedStatus = record(response.data)?.status;
  if (returnedStatus !== result) {
    throw new Error(`Portability completion returned ${String(returnedStatus)}.`);
  }
}

export async function processPortabilityJobBatch(
  client: PortabilityWorkerClient,
  options: PortabilityBatchOptions,
): Promise<PortabilityBatchResult> {
  if (!uuidPattern.test(options.workerId)) {
    throw new Error("A valid worker identifier is required.");
  }
  const limit = integerInRange(options.limit, 5, 1, 25);
  const leaseSeconds = integerInRange(options.leaseSeconds, 120, 30, 900);
  const maximumAttempts = integerInRange(options.maximumAttempts, 3, 1, 10);
  const claim = await client.rpc("admin_claim_portability_jobs", {
    p_lease_seconds: leaseSeconds,
    p_limit: limit,
    p_worker_id: options.workerId,
  });
  if (claim.error) throw new Error(`Portability claim failed: ${claim.error.message}`);
  const jobs = claimedJobs(claim.data);
  let cancelled = 0;
  let completed = 0;
  let failed = 0;
  let retryQueued = 0;

  for (const job of jobs) {
    try {
      if (await isCancelled(client, job)) {
        await complete(client, job, "cancelled", { errorCount: 0, warningCount: 0 });
        cancelled += 1;
        continue;
      }
      const execution: PortabilityJobExecution = {
        checkpoint: async (checkpoint) => {
          if (!fingerprintPattern.test(checkpoint.payloadFingerprint)) {
            throw new Error("A valid checkpoint fingerprint is required.");
          }
          const response = await client.rpc("admin_checkpoint_portability_job", {
            p_checkpoint_key: checkpoint.checkpointKey,
            p_checkpoint_ordinal: checkpoint.ordinal,
            p_error_count: checkpoint.errorCount,
            p_job_id: job.jobId,
            p_job_kind: job.jobKind,
            p_lease_token: job.leaseToken,
            p_payload_fingerprint: checkpoint.payloadFingerprint,
            p_phase: checkpoint.phase,
            p_processed_count: checkpoint.processedCount,
            p_result_summary: checkpoint.resultSummary ?? {},
            p_total_count: checkpoint.totalCount,
            p_warning_count: checkpoint.warningCount,
          });
          if (response.error) {
            throw new Error(`Portability checkpoint failed: ${response.error.message}`);
          }
        },
        isCancelled: () => isCancelled(client, job),
        job,
      };
      const result = await options.handler(execution);
      await complete(client, job, result.result, {
        errorCount: result.errorCount ?? 0,
        ...(result.safeErrorCode
          ? { safeErrorCode: safeCode(result.safeErrorCode, "PORTABILITY_JOB_FAILED") }
          : {}),
        ...(result.safeErrorSummary
          ? {
              safeErrorSummary: safeSummary(
                result.safeErrorSummary,
                "The portability job stopped safely.",
              ),
            }
          : {}),
        warningCount: result.warningCount ?? 0,
      });
      if (result.result === "cancelled") cancelled += 1;
      else if (result.result === "failed") failed += 1;
      else completed += 1;
    } catch (error) {
      const exhausted = job.attemptNumber >= maximumAttempts;
      await complete(client, job, exhausted ? "failed" : "retryable", {
        errorCount: 1,
        safeErrorCode: safeCode(
          error instanceof Error ? error.name : undefined,
          "PORTABILITY_WORKER_FAILED",
        ),
        safeErrorSummary: "The worker stopped safely without recording private source content.",
        warningCount: 0,
      });
      if (exhausted) failed += 1;
      else retryQueued += 1;
    }
  }

  return Object.freeze({
    cancelled,
    claimed: jobs.length,
    completed,
    failed,
    retryQueued,
  });
}

function cleanupObjects(value: unknown): readonly PortabilityCleanupObject[] {
  if (!Array.isArray(value)) {
    throw new Error("The portability cleanup response was invalid.");
  }
  return value.map((item) => {
    const row = record(item);
    const objectId = row?.object_id;
    const objectKind = row?.object_kind;
    const storageBucket = row?.storage_bucket;
    const storagePath = row?.storage_path;
    if (
      typeof objectId !== "string" ||
      !uuidPattern.test(objectId) ||
      (objectKind !== "artifact" && objectKind !== "upload") ||
      storageBucket !== "lumen-portability" ||
      typeof storagePath !== "string" ||
      storagePath.length < 1 ||
      storagePath.length > 500 ||
      storagePath.startsWith("/") ||
      storagePath.includes("\\") ||
      storagePath.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      throw new Error("A portability cleanup object was invalid.");
    }
    return Object.freeze({ objectId, objectKind, storageBucket, storagePath });
  });
}

export async function cleanExpiredPortabilityArtifacts(
  client: PortabilityWorkerClient,
  limit = 100,
) {
  const boundedLimit = integerInRange(limit, 100, 1, 500);
  const response = await client.rpc("admin_claim_portability_object_cleanup", {
    p_limit: boundedLimit,
  });
  if (response.error) {
    throw new Error(`Portability cleanup failed: ${response.error.message}`);
  }
  const claimed = cleanupObjects(response.data);
  const confirmed: PortabilityCleanupObject[] = [];
  for (const object of claimed) {
    const removal = await client.storage.from(object.storageBucket).remove([object.storagePath]);
    if (removal.error) {
      throw new Error(`Portability Storage cleanup failed: ${removal.error.message}`);
    }
    const confirmation = await client.rpc("admin_confirm_portability_object_deleted", {
      p_object_id: object.objectId,
      p_object_kind: object.objectKind,
    });
    if (confirmation.error || confirmation.data !== true) {
      throw new Error(
        `Portability cleanup confirmation failed: ${
          confirmation.error?.message ?? "object unavailable"
        }`,
      );
    }
    confirmed.push(object);
  }
  return Object.freeze(confirmed);
}
