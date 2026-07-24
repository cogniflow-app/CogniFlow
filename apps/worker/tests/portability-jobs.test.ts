import { describe, expect, it, vi } from "vitest";

import {
  cleanExpiredPortabilityArtifacts,
  processPortabilityJobBatch,
  type PortabilityWorkerClient,
} from "../src/portability-jobs";

const workerId = "0190d9f0-0000-7000-8000-000000000001";
const queueId = "0190d9f0-0000-7000-8000-000000000002";
const jobId = "0190d9f0-0000-7000-8000-000000000003";
const leaseToken = "0190d9f0-0000-7000-8000-000000000004";
const fingerprint = "a".repeat(64);

function fixture(status = "queued", attemptNumber = 1) {
  const rpc = vi.fn<PortabilityWorkerClient["rpc"]>().mockResolvedValueOnce({
    data: [
      {
        attempt_number: attemptNumber,
        job_id: jobId,
        job_kind: "import",
        lease_token: leaseToken,
        phase: "parse",
        queue_id: queueId,
      },
    ],
    error: null,
  });
  const single = vi.fn().mockResolvedValue({ data: { status }, error: null });
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single,
  };
  const remove = vi.fn().mockResolvedValue({ error: null });
  const storageFrom = vi.fn(() => ({ remove }));
  return {
    client: {
      from: vi.fn(() => query),
      rpc,
      storage: { from: storageFrom },
    } satisfies PortabilityWorkerClient,
    remove,
    rpc,
    storageFrom,
  };
}

describe("portability worker", () => {
  it("records checkpoints and completes a claimed job", async () => {
    const test = fixture();
    test.rpc
      .mockResolvedValueOnce({ data: { processedCount: 20, status: "running" }, error: null })
      .mockResolvedValueOnce({ data: { id: jobId, status: "completed" }, error: null });

    await expect(
      processPortabilityJobBatch(test.client, {
        handler: async ({ checkpoint }) => {
          await checkpoint({
            checkpointKey: "notes:0",
            errorCount: 0,
            ordinal: 0,
            payloadFingerprint: fingerprint,
            phase: "write",
            processedCount: 20,
            totalCount: 20,
            warningCount: 0,
          });
          return { result: "completed" };
        },
        workerId,
      }),
    ).resolves.toEqual({
      cancelled: 0,
      claimed: 1,
      completed: 1,
      failed: 0,
      retryQueued: 0,
    });
    expect(test.rpc).toHaveBeenNthCalledWith(
      2,
      "admin_checkpoint_portability_job",
      expect.objectContaining({ p_checkpoint_key: "notes:0", p_processed_count: 20 }),
    );
  });

  it("honors cancellation before executing a chunk", async () => {
    const test = fixture("cancelling");
    test.rpc.mockResolvedValueOnce({ data: { id: jobId, status: "cancelled" }, error: null });
    const handler = vi.fn();

    await expect(
      processPortabilityJobBatch(test.client, { handler, workerId }),
    ).resolves.toMatchObject({ cancelled: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("requeues a crashed chunk while attempts remain", async () => {
    const test = fixture("running", 2);
    test.rpc.mockResolvedValueOnce({ data: { id: jobId, status: "retryable" }, error: null });

    await expect(
      processPortabilityJobBatch(test.client, {
        handler: async () => {
          throw new Error("private source text must not appear");
        },
        workerId,
      }),
    ).resolves.toMatchObject({ retryQueued: 1 });
    expect(test.rpc).toHaveBeenNthCalledWith(
      2,
      "admin_complete_portability_job",
      expect.objectContaining({
        p_result: "retryable",
        p_safe_error_summary: "The worker stopped safely without recording private source content.",
      }),
    );
  });

  it("fails after the bounded final attempt", async () => {
    const test = fixture("running", 3);
    test.rpc.mockResolvedValueOnce({ data: { id: jobId, status: "failed" }, error: null });

    await expect(
      processPortabilityJobBatch(test.client, {
        handler: async () => {
          throw new Error("boom");
        },
        workerId,
      }),
    ).resolves.toMatchObject({ failed: 1, retryQueued: 0 });
  });

  it("rejects invalid operator bounds before claiming", async () => {
    const test = fixture();
    await expect(
      processPortabilityJobBatch(test.client, {
        handler: async () => ({ result: "completed" }),
        limit: 26,
        workerId,
      }),
    ).rejects.toThrow("between 1 and 25");
    expect(test.rpc).not.toHaveBeenCalled();
  });

  it("preserves completed-with-warning partial results and safe summaries", async () => {
    const test = fixture();
    test.rpc.mockResolvedValueOnce({
      data: { id: jobId, status: "completed_with_warnings" },
      error: null,
    });
    await expect(
      processPortabilityJobBatch(test.client, {
        handler: async () => ({
          result: "completed_with_warnings",
          safeErrorCode: "UNSAFE code/content",
          safeErrorSummary: "Bounded warning\nwithout source rows.",
          warningCount: 2,
        }),
        workerId,
      }),
    ).resolves.toMatchObject({ completed: 1, failed: 0 });
    expect(test.rpc).toHaveBeenNthCalledWith(
      2,
      "admin_complete_portability_job",
      expect.objectContaining({
        p_result: "completed_with_warnings",
        p_safe_error_code: "UNSAFE_code_content",
        p_safe_error_summary: "Bounded warning without source rows.",
        p_warning_count: 2,
      }),
    );
  });

  it("removes claimed Storage objects before confirming metadata deletion", async () => {
    const test = fixture();
    test.rpc.mockReset();
    test.rpc
      .mockResolvedValueOnce({
        data: [
          {
            object_id: jobId,
            object_kind: "upload",
            storage_bucket: "lumen-portability",
            storage_path: `${jobId}/source`,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    await expect(cleanExpiredPortabilityArtifacts(test.client)).resolves.toHaveLength(1);
    expect(test.rpc).toHaveBeenNthCalledWith(1, "admin_claim_portability_object_cleanup", {
      p_limit: 100,
    });
    expect(test.storageFrom).toHaveBeenCalledWith("lumen-portability");
    expect(test.remove).toHaveBeenCalledWith([`${jobId}/source`]);
    expect(test.rpc).toHaveBeenNthCalledWith(2, "admin_confirm_portability_object_deleted", {
      p_object_id: jobId,
      p_object_kind: "upload",
    });
  });

  it("rejects malformed cleanup claims before touching Storage", async () => {
    const test = fixture();
    test.rpc.mockReset();
    test.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(cleanExpiredPortabilityArtifacts(test.client)).rejects.toThrow(
      "response was invalid",
    );
    expect(test.remove).not.toHaveBeenCalled();
  });

  it("leaves metadata unconfirmed when Storage removal fails", async () => {
    const test = fixture();
    test.rpc.mockReset();
    test.rpc.mockResolvedValueOnce({
      data: [
        {
          object_id: jobId,
          object_kind: "artifact",
          storage_bucket: "lumen-portability",
          storage_path: `${jobId}/artifact`,
        },
      ],
      error: null,
    });
    test.remove.mockResolvedValueOnce({ error: { message: "temporarily unavailable" } });

    await expect(cleanExpiredPortabilityArtifacts(test.client)).rejects.toThrow(
      "Storage cleanup failed",
    );
    expect(test.rpc).toHaveBeenCalledTimes(1);
  });
});
