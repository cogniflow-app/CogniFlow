import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  createLumenArchive,
  createZip,
  decryptArchive,
  encryptArchive,
  readLumenArchive,
  readLumenArchiveBundle,
  safeUnzip,
  sha256Hex,
} from "../src";
import { portabilityGraph } from "./fixtures";

describe("Lumen archives", () => {
  it("round-trips the versioned graph with checksums", async () => {
    const artifact = await createLumenArchive(portabilityGraph(), { fileName: "biology" });
    const restored = await readLumenArchive(artifact.bytes);
    expect(artifact.fileName).toBe("biology.lumen");
    expect(restored.decks[0]?.notes[0]?.externalId).toBe("note-1");
    expect(restored.reviews).toHaveLength(1);
  });

  it("rejects a graph modified after checksum creation", async () => {
    const artifact = await createLumenArchive(portabilityGraph());
    const files = new Map(safeUnzip(artifact.bytes));
    files.set("data/graph.json", new TextEncoder().encode('{"schemaVersion":1}\n'));
    await expect(readLumenArchive(createZip(files))).rejects.toMatchObject({
      code: "checksum_mismatch",
    });
  });

  it("encrypts with authenticated metadata and uses a neutral failure", async () => {
    const plain = (await createLumenArchive(portabilityGraph())).bytes;
    const encrypted = await encryptArchive(plain, "correct horse battery staple");
    expect(await decryptArchive(encrypted, "correct horse battery staple")).toEqual(plain);
    await expect(decryptArchive(encrypted, "incorrect horse battery staple")).rejects.toMatchObject(
      {
        code: "encrypted_archive_invalid",
        message: "The encrypted archive or passphrase is invalid.",
      },
    );
    const finalByte = encrypted.length - 1;
    encrypted[finalByte] = (encrypted[finalByte] ?? 0) ^ 1;
    await expect(decryptArchive(encrypted, "correct horse battery staple")).rejects.toMatchObject({
      code: "encrypted_archive_invalid",
    });
  });

  it("round-trips every current normalized domain and verified media exactly", async () => {
    const graph = portabilityGraph();
    const mediaBytes = new TextEncoder().encode("synthetic image bytes");
    const mediaSha256 = await sha256Hex(mediaBytes);
    const occurredAt = "2026-07-23T13:00:00.000Z";
    graph.media = [
      {
        altText: "Synthetic diagram",
        byteSize: mediaBytes.byteLength,
        externalId: "media-1",
        fileName: "diagram.png",
        kind: "image",
        mimeType: "image/png",
        sha256: mediaSha256,
      },
    ];
    const note = graph.decks[0]?.notes[0];
    if (!note) throw new Error("fixture note missing");
    note.mediaExternalIds = ["media-1"];
    graph.practice = [
      {
        cardExternalId: "card-1",
        externalId: "practice-1",
        learnerExternalId: "learner-1",
        occurredAt,
        values: { correctness: 1, mode: "written", verdict: "correct" },
      },
    ];
    graph.mastery = [
      {
        cardExternalId: "card-1",
        externalId: "mastery-1",
        learnerExternalId: "learner-1",
        occurredAt,
        values: { evidenceCount: 3, overall: 0.8, stage: "developing" },
      },
    ];
    graph.revisions = [
      {
        createdAt: occurredAt,
        externalId: "revision-1",
        resourceExternalId: "note-1",
        snapshot: { contentHash: "synthetic" },
      },
    ];
    graph.deckVersions = [
      {
        createdAt: occurredAt,
        deckExternalId: "deck-1",
        externalId: "version-1",
        snapshot: { versionNumber: 2 },
      },
    ];
    graph.publications = [{ deckExternalId: "deck-1", visibility: "unlisted" }];
    graph.settings = {
      guideProgress: [{ guideKey: "portability", status: "completed" }],
      learnerProfiles: [{ displayName: "Learner", kind: "self" }],
      privacy: { defaultContentPrivate: true },
      profile: { displayName: "Archive owner", locale: "en" },
      safeOfflineMetadata: [{ protocolVersion: 1 }],
    };
    graph.sourceVersions = {
      application: "phase-06",
      grading: "phase-04",
      learningEngine: "phase-04",
      offlineProtocol: "1",
      scheduler: "ts-fsrs",
    };
    const artifact = await createLumenArchive(graph, {
      mediaFiles: new Map([[mediaSha256, mediaBytes]]),
    });
    const restored = await readLumenArchiveBundle(artifact.bytes);
    expect(restored.graph).toEqual(graph);
    expect(Array.from(restored.mediaFiles.get(mediaSha256) ?? [])).toEqual(Array.from(mediaBytes));
    expect(restored.manifest.entryCounts).toMatchObject({
      cardEntries: 1,
      mastery: 1,
      media: 1,
      practice: 1,
      reviews: 1,
      schedules: 1,
      versions: 2,
    });
  });

  it("requires an exact declared and verified media inventory", async () => {
    const graph = portabilityGraph();
    const bytes = new TextEncoder().encode("media");
    const sha256 = await sha256Hex(bytes);
    graph.media = [
      {
        altText: "",
        byteSize: bytes.byteLength,
        externalId: "media-1",
        fileName: "media.png",
        kind: "image",
        mimeType: "image/png",
        sha256,
      },
    ];
    await expect(createLumenArchive(graph)).rejects.toMatchObject({
      code: "invalid_format",
    });
    await expect(
      createLumenArchive(graph, {
        mediaFiles: new Map([[sha256, new TextEncoder().encode("wrong")]]),
      }),
    ).rejects.toMatchObject({ code: "checksum_mismatch" });
    graph.media = [];
    await expect(
      createLumenArchive(graph, { mediaFiles: new Map([[sha256, bytes]]) }),
    ).rejects.toMatchObject({ code: "invalid_schema" });
  });

  it("rejects missing, extra, future-version, count-mismatched, and secret resources", async () => {
    const artifact = await createLumenArchive(portabilityGraph());
    const missing = new Map(safeUnzip(artifact.bytes));
    missing.delete("profiles/account.json");
    await expect(readLumenArchive(createZip(missing))).rejects.toMatchObject({
      code: "checksum_mismatch",
    });

    const extra = new Map(safeUnzip(artifact.bytes));
    extra.set("unexpected.txt", new TextEncoder().encode("unexpected"));
    await expect(readLumenArchive(createZip(extra))).rejects.toMatchObject({
      code: "checksum_mismatch",
    });

    const future = new Map(safeUnzip(artifact.bytes));
    const manifest = JSON.parse(new TextDecoder().decode(future.get("manifest.json"))) as Record<
      string,
      unknown
    >;
    manifest.archiveVersion = 2;
    const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest)}\n`);
    future.set("manifest.json", manifestBytes);
    const inventory = JSON.parse(new TextDecoder().decode(future.get("checksums.json"))) as {
      files: Record<string, string>;
    };
    inventory.files["manifest.json"] = await sha256Hex(manifestBytes);
    future.set("checksums.json", new TextEncoder().encode(`${JSON.stringify(inventory)}\n`));
    await expect(readLumenArchive(createZip(future))).rejects.toMatchObject({
      code: "invalid_schema",
    });

    const countMismatch = new Map(safeUnzip(artifact.bytes));
    const badManifest = JSON.parse(
      new TextDecoder().decode(countMismatch.get("manifest.json")),
    ) as {
      entryCounts: Record<string, number>;
    };
    badManifest.entryCounts.decks = 99;
    const badManifestBytes = new TextEncoder().encode(`${JSON.stringify(badManifest)}\n`);
    countMismatch.set("manifest.json", badManifestBytes);
    const badInventory = JSON.parse(
      new TextDecoder().decode(countMismatch.get("checksums.json")),
    ) as { files: Record<string, string> };
    badInventory.files["manifest.json"] = await sha256Hex(badManifestBytes);
    countMismatch.set(
      "checksums.json",
      new TextEncoder().encode(`${JSON.stringify(badInventory)}\n`),
    );
    await expect(readLumenArchive(createZip(countMismatch))).rejects.toMatchObject({
      code: "checksum_mismatch",
    });

    const secretGraph = portabilityGraph();
    secretGraph.settings = { nested: { refresh_token: "must-not-leave-account" } };
    await expect(createLumenArchive(secretGraph)).rejects.toMatchObject({
      code: "invalid_schema",
    });
  });
});

describe("ZIP hostile-file boundary", () => {
  it("rejects traversal paths and duplicate destinations", () => {
    expect(() => safeUnzip(zipSync({ "../outside.txt": new TextEncoder().encode("no") }))).toThrow(
      "not relative and safe",
    );
    expect(() =>
      createZip(
        new Map([
          ["de\u0301ck.json", new Uint8Array([1])],
          ["déck.json", new Uint8Array([2])],
        ]),
      ),
    ).toThrow("ambiguous duplicate path");
    expect(() => safeUnzip(zipSync({ "/absolute.txt": new TextEncoder().encode("no") }))).toThrow(
      "invalid path",
    );
    expect(() => safeUnzip(zipSync({ "C:\\device.txt": new TextEncoder().encode("no") }))).toThrow(
      "invalid path",
    );
  });

  it("rejects implausible compression ratios before extraction", () => {
    const archive = zipSync({ "huge.txt": new Uint8Array(200_000) }, { level: 9 });
    expect(() => safeUnzip(archive, { maxCompressionRatio: 10 })).toThrow(
      "unsafe compression ratio",
    );
  });

  it("enforces entry, file, and expanded-size limits", () => {
    const archive = zipSync({
      "one.txt": new Uint8Array(20),
      "two.txt": new Uint8Array(20),
    });
    expect(() => safeUnzip(archive, { maxEntries: 1 })).toThrow("too many entries");
    expect(() => safeUnzip(archive, { maxFileBytes: 10 })).toThrow("entry is too large");
    expect(() => safeUnzip(archive, { maxExpandedBytes: 30 })).toThrow("expands beyond");
  });
});
