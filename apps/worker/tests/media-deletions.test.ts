import { describe, expect, it, vi } from "vitest";

import { processMediaDeletionBatch, type MediaDeletionClient } from "../src/media-deletions";

const workerId = "0190d9f0-0000-7000-8000-000000000001";
const assetId = "0190d9f0-0000-7000-8000-000000000002";
const leaseToken = "0190d9f0-0000-7000-8000-000000000003";

function client(
  storageError: { readonly message: string; readonly statusCode?: string } | null,
  completionStatus?: string,
  storageData: readonly unknown[] | null = storageError ? null : [{ name: "private/object.png" }],
) {
  const resolvedCompletionStatus =
    completionStatus ?? (storageError === null ? "completed" : "queued");
  const rpc = vi
    .fn<MediaDeletionClient["rpc"]>()
    .mockResolvedValueOnce({
      data: [
        {
          lease_token: leaseToken,
          media_asset_id: assetId,
          storage_bucket: "lumen-content-media",
          storage_path: "private/object.png",
        },
      ],
      error: null,
    })
    .mockResolvedValueOnce({
      data: { status: resolvedCompletionStatus },
      error: null,
    });
  const remove = vi.fn().mockResolvedValue({ data: storageData, error: storageError });
  return {
    client: { rpc, storage: { from: vi.fn(() => ({ remove })) } } satisfies MediaDeletionClient,
    remove,
    rpc,
  };
}

describe("physical media deletion worker", () => {
  it("removes the leased private object and completes its durable job", async () => {
    const fixture = client(null);

    await expect(
      processMediaDeletionBatch(fixture.client, { leaseSeconds: 60, limit: 10, workerId }),
    ).resolves.toEqual({ claimed: 1, deleted: 1, retryQueued: 0 });

    expect(fixture.remove).toHaveBeenCalledWith(["private/object.png"]);
    expect(fixture.rpc).toHaveBeenNthCalledWith(2, "admin_complete_media_deletion", {
      p_error: null,
      p_lease_token: leaseToken,
      p_media_asset_id: assetId,
      p_succeeded: true,
    });
  });

  it("records a bounded retry instead of reporting physical deletion on Storage failure", async () => {
    const fixture = client({ message: "provider\nfailed" });

    await expect(processMediaDeletionBatch(fixture.client, { workerId })).resolves.toEqual({
      claimed: 1,
      deleted: 0,
      retryQueued: 1,
    });
    expect(fixture.rpc).toHaveBeenNthCalledWith(
      2,
      "admin_complete_media_deletion",
      expect.objectContaining({ p_error: "provider failed", p_succeeded: false }),
    );
  });

  it("completes an already-absent key when bulk Storage removal reports an empty success", async () => {
    const fixture = client(null, undefined, []);

    await expect(processMediaDeletionBatch(fixture.client, { workerId })).resolves.toEqual({
      claimed: 1,
      deleted: 1,
      retryQueued: 0,
    });
    expect(fixture.rpc).toHaveBeenNthCalledWith(
      2,
      "admin_complete_media_deletion",
      expect.objectContaining({ p_error: null, p_succeeded: true }),
    );
  });

  it("requeues a typed 404 because it can describe a missing bucket rather than an object", async () => {
    const fixture = client({ message: "Object not found", statusCode: "404" });

    await expect(processMediaDeletionBatch(fixture.client, { workerId })).resolves.toEqual({
      claimed: 1,
      deleted: 0,
      retryQueued: 1,
    });
    expect(fixture.rpc).toHaveBeenNthCalledWith(
      2,
      "admin_complete_media_deletion",
      expect.objectContaining({ p_error: "Object not found", p_succeeded: false }),
    );
  });

  it("does not infer missing-object success from provider prose", async () => {
    const fixture = client({ message: "Object not found" });

    await expect(processMediaDeletionBatch(fixture.client, { workerId })).resolves.toEqual({
      claimed: 1,
      deleted: 0,
      retryQueued: 1,
    });
  });

  it("rejects a completion status that contradicts the Storage outcome", async () => {
    const fixture = client(null, "queued");

    await expect(processMediaDeletionBatch(fixture.client, { workerId })).rejects.toThrow(
      "returned queued",
    );
  });

  it("rejects unbounded operator input before claiming work", async () => {
    const fixture = client(null);

    await expect(
      processMediaDeletionBatch(fixture.client, { limit: 101, workerId }),
    ).rejects.toThrow("between 1 and 100");
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});
