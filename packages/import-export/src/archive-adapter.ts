import { PortabilityError } from "./errors";
import type {
  ExportAdapter,
  ImportAdapter,
  ImportProgress,
  PortabilityInspection,
} from "./schemas";
import { portabilitySourceSchema } from "./schemas";
import { createLumenArchive, readLumenArchive } from "./archive";
import { decryptArchive, isEncryptedArchive } from "./crypto";
import { STRUCTURED_CAPABILITIES, countGraphItems } from "./shared";
import { safeUnzip } from "./zip";

const archiveAdapterDefinition: ImportAdapter & ExportAdapter = {
  capabilities: STRUCTURED_CAPABILITIES,
  code: "lumen_archive",
  formats: Object.freeze(["lumen_archive", "encrypted_lumen_archive"] as const),
  async detect(source) {
    if (!source.bytes) return 0;
    if (isEncryptedArchive(source.bytes)) return 1;
    try {
      const files = safeUnzip(source.bytes);
      return files.has("manifest.json") && files.has("data/graph.json") ? 1 : 0;
    } catch {
      return 0;
    }
  },
  async *execute(plan, sink): AsyncIterable<ImportProgress> {
    const graph = await archiveAdapterDefinition.map(plan.source, plan);
    yield {
      completedItems: 0,
      diagnostics: graph.warnings,
      phase: "validate",
      totalItems: countGraphItems(graph),
    };
    if (await sink.isCancelled())
      throw new PortabilityError("cancelled", "The restore was cancelled.");
    await sink.writeGraph(graph);
    yield {
      completedItems: countGraphItems(graph),
      diagnostics: graph.warnings,
      phase: "finalize",
      totalItems: countGraphItems(graph),
    };
  },
  async export(plan) {
    return createLumenArchive(plan.graph, {
      fileName: plan.fileName,
      ...(plan.mediaFiles ? { mediaFiles: plan.mediaFiles } : {}),
    });
  },
  async inspect(source): Promise<PortabilityInspection> {
    const graph = await archiveAdapterDefinition.map(source, {
      adapterCode: "lumen_archive",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    return {
      adapterCode: "lumen_archive",
      capabilities: STRUCTURED_CAPABILITIES,
      detectedFormat:
        source.bytes && isEncryptedArchive(source.bytes)
          ? "encrypted_lumen_archive"
          : "lumen_archive",
      diagnostics: graph.warnings,
      estimatedItems: countGraphItems(graph),
      loss: graph.loss,
      sample: graph.decks.slice(0, 10).map((deck) => ({
        cards: deck.notes.length,
        title: deck.title,
      })),
    };
  },
  async map(source) {
    const parsed = portabilitySourceSchema.parse(source);
    if (!parsed.bytes) throw new PortabilityError("invalid_format", "Upload a Lumen archive.");
    const bytes = isEncryptedArchive(parsed.bytes)
      ? await decryptArchive(
          parsed.bytes,
          parsed.archivePassphrase ??
            (() => {
              throw new PortabilityError(
                "encrypted_archive_invalid",
                "Enter the archive passphrase to inspect this backup.",
              );
            })(),
        )
      : parsed.bytes;
    return readLumenArchive(bytes);
  },
};

export const archiveAdapter: ImportAdapter & ExportAdapter =
  Object.freeze(archiveAdapterDefinition);
