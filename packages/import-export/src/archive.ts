import { z } from "zod";

import { PortabilityError } from "./errors";
import {
  PORTABILITY_ARCHIVE_VERSION,
  type ExportArtifact,
  type NormalizedGraph,
  normalizedGraphSchema,
} from "./schemas";
import { canonicalJson, parseSafeJson, safeFileName, sha256Hex } from "./safety";
import { createZip, safeUnzip } from "./zip";

export const archiveManifestSchema = z
  .object({
    applicationVersion: z.string().min(1).max(120),
    archiveVersion: z.literal(PORTABILITY_ARCHIVE_VERSION),
    createdAt: z.string().datetime(),
    entryCounts: z.record(z.string(), z.number().int().nonnegative()),
    gradingVersion: z.string().min(1).max(120),
    graphSchemaVersion: z.literal(1),
    learningEngineVersion: z.string().min(1).max(120),
    mediaCount: z.number().int().nonnegative(),
    noteCount: z.number().int().nonnegative(),
    offlineProtocolVersion: z.string().min(1).max(120),
    resources: z.array(z.string().min(1).max(512)).max(2048),
    schedulerVersion: z.string().min(1).max(120),
    source: z
      .object({
        adapter: z.string().min(1).max(100),
        format: z.string().min(1).max(100),
      })
      .strict(),
    type: z.literal("lumen_portability_archive"),
    warnings: z.number().int().nonnegative(),
    knownLosses: z.number().int().nonnegative(),
  })
  .strict();
export type ArchiveManifest = z.infer<typeof archiveManifestSchema>;

const checksumInventorySchema = z
  .object({
    algorithm: z.literal("SHA-256"),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
  })
  .strict();

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(`${canonicalJson(value)}\n`);
}

function jsonLines(values: readonly unknown[]) {
  return new TextEncoder().encode(
    `${values.map((value) => canonicalJson(value)).join("\n")}${values.length ? "\n" : ""}`,
  );
}

function settingRecord(settings: Readonly<Record<string, unknown>>, key: string) {
  const value = settings[key];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function settingArray(settings: Readonly<Record<string, unknown>>, key: string) {
  const value = settings[key];
  return Array.isArray(value) ? value : [];
}

const secretKeyPattern =
  /(?:^|_)(?:access_token|credential|encrypted_password|password|pin_hash|refresh_token|secret|service_key|service_role|session_token|signed_url)(?:$|_)/iu;

function assertNoSecretFields(value: unknown, path = "settings"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretFields(item, `${path}[${String(index)}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) {
      throw new PortabilityError(
        "invalid_schema",
        `The archive cannot contain credential or secret field ${path}.${key}.`,
      );
    }
    assertNoSecretFields(child, `${path}.${key}`);
  }
}

export async function createLumenArchive(
  graph: NormalizedGraph,
  options: {
    readonly fileName?: string;
    readonly mediaFiles?: ReadonlyMap<string, Uint8Array>;
  } = {},
): Promise<ExportArtifact> {
  const validated = normalizedGraphSchema.parse(graph);
  assertNoSecretFields(validated.settings);
  const files = new Map<string, Uint8Array>();
  files.set("data/graph.json", jsonBytes(validated));
  files.set("profiles/account.json", jsonBytes(settingRecord(validated.settings, "profile")));
  files.set(
    "profiles/learners.json",
    jsonBytes(settingArray(validated.settings, "learnerProfiles")),
  );
  files.set("decks/decks.jsonl", jsonLines(validated.decks));
  files.set(
    "card-entries/card-entries.jsonl",
    jsonLines(validated.decks.flatMap((deck) => deck.notes)),
  );
  files.set(
    "study-cards/study-cards.jsonl",
    jsonLines(
      validated.decks.flatMap((deck) =>
        deck.notes.flatMap((note) =>
          note.generatedCards.map((card) => ({
            ...card,
            noteExternalId: note.externalId ?? note.lineageId ?? null,
          })),
        ),
      ),
    ),
  );
  files.set("note-types/note-types.json", jsonBytes(validated.noteTypes));
  files.set("schedules/schedules.jsonl", jsonLines(validated.schedules));
  files.set("review-logs/review-logs.jsonl", jsonLines(validated.reviews));
  files.set("practice/practice.jsonl", jsonLines(validated.practice));
  files.set("mastery/mastery.jsonl", jsonLines(validated.mastery));
  files.set("versions/content-revisions.jsonl", jsonLines(validated.revisions));
  files.set("versions/deck-versions.jsonl", jsonLines(validated.deckVersions ?? []));
  files.set("settings/settings.json", jsonBytes(validated.settings));
  files.set("privacy/privacy.json", jsonBytes(settingRecord(validated.settings, "privacy")));
  files.set("guides/progress.jsonl", jsonLines(settingArray(validated.settings, "guideProgress")));
  files.set(
    "offline-metadata/sync.json",
    jsonBytes(settingArray(validated.settings, "safeOfflineMetadata")),
  );
  files.set("media/index.json", jsonBytes(validated.media));
  const declaredMediaHashes = new Set(validated.media.map((media) => media.sha256));
  for (const media of validated.media) {
    const bytes = options.mediaFiles?.get(media.sha256);
    if (!bytes) {
      throw new PortabilityError(
        "invalid_format",
        `The archive is missing verified media bytes for ${media.fileName}.`,
      );
    }
    if (bytes.byteLength !== media.byteSize || (await sha256Hex(bytes)) !== media.sha256) {
      throw new PortabilityError("checksum_mismatch", "A media file checksum does not match.");
    }
    files.set(`media/files/${media.sha256}`, bytes);
  }
  for (const sha256 of options.mediaFiles?.keys() ?? []) {
    if (!declaredMediaHashes.has(sha256)) {
      throw new PortabilityError(
        "invalid_schema",
        "The archive contains media bytes without a declared media descriptor.",
      );
    }
  }
  const noteCount = validated.decks.reduce((total, deck) => total + deck.notes.length, 0);
  const generatedCardCount = validated.decks.reduce(
    (total, deck) =>
      total + deck.notes.reduce((noteTotal, note) => noteTotal + note.generatedCards.length, 0),
    0,
  );
  const manifest = archiveManifestSchema.parse({
    applicationVersion: validated.sourceVersions?.application ?? "phase-06",
    archiveVersion: PORTABILITY_ARCHIVE_VERSION,
    createdAt: new Date().toISOString(),
    entryCounts: {
      cardEntries: noteCount,
      decks: validated.decks.length,
      generatedCards: generatedCardCount,
      mastery: validated.mastery.length,
      media: validated.media.length,
      noteTypes: validated.noteTypes.length,
      practice: validated.practice.length,
      reviews: validated.reviews.length,
      schedules: validated.schedules.length,
      versions: validated.revisions.length + (validated.deckVersions?.length ?? 0),
    },
    gradingVersion: validated.sourceVersions?.grading ?? "phase-04",
    graphSchemaVersion: 1,
    knownLosses: validated.loss.length,
    learningEngineVersion: validated.sourceVersions?.learningEngine ?? "phase-04",
    mediaCount: validated.media.length,
    noteCount,
    offlineProtocolVersion: validated.sourceVersions?.offlineProtocol ?? "1",
    resources: [...files.keys()].sort(),
    schedulerVersion: validated.sourceVersions?.scheduler ?? "ts-fsrs-pinned",
    source: {
      adapter: validated.provenance.adapter,
      format: validated.provenance.sourceFormat,
    },
    type: "lumen_portability_archive",
    warnings: validated.warnings.length,
  });
  files.set("manifest.json", jsonBytes(manifest));
  const checksums: Record<string, string> = {};
  for (const [path, bytes] of [...files.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    checksums[path] = await sha256Hex(bytes);
  }
  files.set(
    "checksums.json",
    jsonBytes(checksumInventorySchema.parse({ algorithm: "SHA-256", files: checksums })),
  );
  const bytes = createZip(files);
  return {
    bytes,
    diagnostics: [],
    fileName: `${safeFileName(options.fileName ?? "lumen-backup").replace(/\.lumen$/u, "")}.lumen`,
    format: "lumen_archive",
    loss: [],
    mimeType: "application/vnd.lumen.archive+zip",
    sha256: await sha256Hex(bytes),
  };
}

export async function readLumenArchiveBundle(bytes: Uint8Array): Promise<{
  readonly graph: NormalizedGraph;
  readonly manifest: ArchiveManifest;
  readonly mediaFiles: ReadonlyMap<string, Uint8Array>;
}> {
  const files = safeUnzip(bytes);
  const manifestBytes = files.get("manifest.json");
  const checksumBytes = files.get("checksums.json");
  const graphBytes = files.get("data/graph.json");
  if (!manifestBytes || !checksumBytes || !graphBytes) {
    throw new PortabilityError(
      "invalid_format",
      "The archive is missing its manifest, checksums, or graph.",
    );
  }
  let manifest: z.infer<typeof archiveManifestSchema>;
  let inventory: z.infer<typeof checksumInventorySchema>;
  try {
    manifest = archiveManifestSchema.parse(
      parseSafeJson(new TextDecoder().decode(manifestBytes), 100_000),
    );
    inventory = checksumInventorySchema.parse(
      parseSafeJson(new TextDecoder().decode(checksumBytes), 1_000_000),
    );
  } catch (error) {
    if (error instanceof PortabilityError) throw error;
    throw new PortabilityError("invalid_schema", "The archive manifest is invalid.");
  }
  const archivePaths = [...files.keys()].filter((path) => path !== "checksums.json").sort();
  const inventoryPaths = Object.keys(inventory.files).sort();
  if (
    archivePaths.length !== inventoryPaths.length ||
    archivePaths.some((path, index) => path !== inventoryPaths[index])
  ) {
    throw new PortabilityError(
      "checksum_mismatch",
      "The archive contains an unlisted, missing, or duplicated resource.",
    );
  }
  for (const path of archivePaths) {
    const resource = files.get(path);
    const expected = inventory.files[path];
    if (!resource || !expected || (await sha256Hex(resource)) !== expected) {
      throw new PortabilityError(
        "checksum_mismatch",
        "The archive checksum inventory does not match its contents.",
      );
    }
  }
  const listedResources = [...manifest.resources].sort();
  const expectedResources = archivePaths.filter((path) => path !== "manifest.json");
  if (
    listedResources.length !== expectedResources.length ||
    listedResources.some((path, index) => path !== expectedResources[index])
  ) {
    throw new PortabilityError(
      "checksum_mismatch",
      "The archive manifest resource list does not match the checksum inventory.",
    );
  }
  const graphValue = parseSafeJson(new TextDecoder().decode(graphBytes));
  const graph = normalizedGraphSchema.safeParse(graphValue);
  if (!graph.success) {
    throw new PortabilityError(
      "invalid_schema",
      `The archive graph is invalid: ${graph.error.issues[0]?.message ?? "unknown error"}`,
    );
  }
  assertNoSecretFields(graph.data.settings);
  const expectedCounts = {
    cardEntries: graph.data.decks.reduce((total, deck) => total + deck.notes.length, 0),
    decks: graph.data.decks.length,
    generatedCards: graph.data.decks.reduce(
      (total, deck) =>
        total + deck.notes.reduce((noteTotal, note) => noteTotal + note.generatedCards.length, 0),
      0,
    ),
    mastery: graph.data.mastery.length,
    media: graph.data.media.length,
    noteTypes: graph.data.noteTypes.length,
    practice: graph.data.practice.length,
    reviews: graph.data.reviews.length,
    schedules: graph.data.schedules.length,
    versions: graph.data.revisions.length + (graph.data.deckVersions?.length ?? 0),
  };
  if (
    Object.entries(expectedCounts).some(([key, value]) => manifest.entryCounts[key] !== value) ||
    manifest.mediaCount !== graph.data.media.length ||
    manifest.noteCount !== expectedCounts.cardEntries
  ) {
    throw new PortabilityError(
      "checksum_mismatch",
      "The archive manifest counts do not match the normalized graph.",
    );
  }
  const mediaFiles = new Map<string, Uint8Array>();
  const expectedMediaPaths = new Set(
    graph.data.media.map((media) => `media/files/${media.sha256}`),
  );
  const actualMediaPaths = archivePaths.filter((path) => path.startsWith("media/files/"));
  if (
    actualMediaPaths.length !== expectedMediaPaths.size ||
    actualMediaPaths.some((path) => !expectedMediaPaths.has(path))
  ) {
    throw new PortabilityError(
      "checksum_mismatch",
      "The archive media inventory does not match its media descriptors.",
    );
  }
  for (const media of graph.data.media) {
    const path = `media/files/${media.sha256}`;
    const contents = files.get(path);
    if (
      !contents ||
      contents.byteLength !== media.byteSize ||
      (await sha256Hex(contents)) !== media.sha256
    ) {
      throw new PortabilityError(
        "checksum_mismatch",
        "A media resource does not match its declared checksum and byte size.",
      );
    }
    mediaFiles.set(media.sha256, new Uint8Array(contents));
  }
  return { graph: graph.data, manifest, mediaFiles };
}

export async function readLumenArchive(bytes: Uint8Array): Promise<NormalizedGraph> {
  return (await readLumenArchiveBundle(bytes)).graph;
}
