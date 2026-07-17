interface WorkerError {
  readonly message: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: WorkerError | null;
}

interface StorageRemovalResult {
  readonly data?: readonly unknown[] | null;
  readonly error: WorkerError | null;
}

export interface MediaDeletionClient {
  readonly rpc: (
    functionName: string,
    arguments_: Readonly<Record<string, unknown>>,
  ) => PromiseLike<RpcResult>;
  readonly storage: {
    readonly from: (bucket: string) => {
      readonly remove: (paths: readonly string[]) => PromiseLike<StorageRemovalResult>;
    };
  };
}

export interface MediaDeletionBatchOptions {
  readonly leaseSeconds?: number;
  readonly limit?: number;
  readonly workerId: string;
}

export interface MediaDeletionBatchResult {
  readonly claimed: number;
  readonly deleted: number;
  readonly retryQueued: number;
}

interface ClaimedDeletion {
  readonly leaseToken: string;
  readonly mediaAssetId: string;
  readonly storageBucket: string;
  readonly storagePath: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

function claimedDeletions(value: unknown): readonly ClaimedDeletion[] {
  if (!Array.isArray(value)) throw new Error("The media deletion claim response was invalid.");
  return value.map((item) => {
    const row = record(item);
    const mediaAssetId = row?.media_asset_id;
    const leaseToken = row?.lease_token;
    const storageBucket = row?.storage_bucket;
    const storagePath = row?.storage_path;
    if (
      typeof mediaAssetId !== "string" ||
      !uuidPattern.test(mediaAssetId) ||
      typeof leaseToken !== "string" ||
      !uuidPattern.test(leaseToken) ||
      typeof storageBucket !== "string" ||
      storageBucket.length < 1 ||
      storageBucket.length > 100 ||
      typeof storagePath !== "string" ||
      storagePath.length < 1 ||
      storagePath.length > 500
    ) {
      throw new Error("The media deletion claim row was invalid.");
    }
    return Object.freeze({ leaseToken, mediaAssetId, storageBucket, storagePath });
  });
}

function boundedErrorMessage(error: WorkerError): string {
  const normalized = error.message
    .normalize("NFKC")
    .replaceAll(/[\r\n\t]+/gu, " ")
    .trim();
  return (normalized || "Storage deletion failed.").slice(0, 1000);
}

export async function processMediaDeletionBatch(
  client: MediaDeletionClient,
  options: MediaDeletionBatchOptions,
): Promise<MediaDeletionBatchResult> {
  if (!uuidPattern.test(options.workerId))
    throw new Error("A valid worker identifier is required.");
  const limit = integerInRange(options.limit, 25, 1, 100);
  const leaseSeconds = integerInRange(options.leaseSeconds, 300, 30, 900);
  const claim = await client.rpc("admin_claim_due_media_deletions", {
    p_lease_seconds: leaseSeconds,
    p_limit: limit,
    p_worker_id: options.workerId,
  });
  if (claim.error) throw new Error(`Media deletion claim failed: ${claim.error.message}`);
  const rows = claimedDeletions(claim.data);
  let deleted = 0;
  let retryQueued = 0;

  for (const row of rows) {
    const removal = await client.storage.from(row.storageBucket).remove([row.storagePath]);
    const storageError = removal.error ? boundedErrorMessage(removal.error) : null;
    const completion = await client.rpc("admin_complete_media_deletion", {
      p_error: storageError,
      p_lease_token: row.leaseToken,
      p_media_asset_id: row.mediaAssetId,
      p_succeeded: storageError === null,
    });
    if (completion.error) {
      throw new Error(`Media deletion completion failed: ${completion.error.message}`);
    }
    const completionStatus = record(completion.data)?.status;
    const expectedStatus = storageError ? "queued" : "completed";
    if (completionStatus !== expectedStatus) {
      throw new Error(`Media deletion completion returned ${String(completionStatus)}.`);
    }
    if (storageError) retryQueued += 1;
    else deleted += 1;
  }

  return Object.freeze({ claimed: rows.length, deleted, retryQueued });
}
