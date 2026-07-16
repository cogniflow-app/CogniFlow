import { cardAuthoringSchema, type CardAuthoringData } from "@lumen/domain";
import { z } from "zod";

import type { DeckVisibility } from "./view-models";

export interface InputFailure {
  readonly ok: false;
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}

export interface InputSuccess<T> {
  readonly ok: true;
  readonly data: T;
}

export type InputResult<T> = InputFailure | InputSuccess<T>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const contentUuidSchema = z.string().regex(uuidPattern, "The identifier is invalid.");
const themeValues = new Set(["neutral", "ocean", "forest", "contrast"]);
const licenseValues = new Set(["all_rights_reserved", "cc0", "cc_by", "cc_by_sa"]);

function record(input: unknown): Readonly<Record<string, unknown>> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Readonly<Record<string, unknown>>)
    : null;
}

function text(input: unknown, minimum: number, maximum: number): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.normalize("NFKC").trim();
  return normalized.length >= minimum && normalized.length <= maximum ? normalized : null;
}

function optionalUuid(input: unknown): string | null | undefined {
  if (input === null || input === undefined || input === "" || input === "none") return null;
  return typeof input === "string" && uuidPattern.test(input) ? input : undefined;
}

function idempotencyKey(input: unknown): string | null {
  return typeof input === "string" && uuidPattern.test(input) ? input : null;
}

function failure(field: string, message: string): InputFailure {
  return { ok: false, fieldErrors: { [field]: [message] } };
}

export interface CreateDeckInput {
  readonly description: string;
  readonly folderId: string | null;
  readonly idempotencyKey: string;
  readonly title: string;
  readonly visibility: DeckVisibility;
}

export function parseCreateDeckInput(input: unknown): InputResult<CreateDeckInput> {
  const value = record(input);
  if (!value) return failure("root", "Expected an object.");
  const title = text(value.title, 1, 180);
  if (!title) return failure("title", "Enter a deck title between 1 and 180 characters.");
  const description =
    typeof value.description === "string" && value.description.length <= 20_000
      ? value.description.normalize("NFKC").trim()
      : null;
  if (description === null) return failure("description", "The description is too long.");
  const folderId = optionalUuid(value.folderId);
  if (folderId === undefined) return failure("folderId", "Choose a valid folder.");
  const key = idempotencyKey(value.idempotencyKey);
  if (!key) return failure("idempotencyKey", "A valid idempotency key is required.");
  const visibility = value.visibility;
  if (visibility !== "private" && visibility !== "public" && visibility !== "unlisted") {
    return failure("visibility", "Choose a valid visibility.");
  }
  return { ok: true, data: { title, description, folderId, idempotencyKey: key, visibility } };
}

export interface CreateFolderInput {
  readonly idempotencyKey: string;
  readonly name: string;
  readonly parentId: string | null;
}

export function parseCreateFolderInput(input: unknown): InputResult<CreateFolderInput> {
  const value = record(input);
  if (!value) return failure("root", "Expected an object.");
  const name = text(value.name, 1, 120);
  if (!name) return failure("name", "Enter a folder name between 1 and 120 characters.");
  const parentId = optionalUuid(value.parentId);
  if (parentId === undefined) return failure("parentId", "Choose a valid parent folder.");
  const key = idempotencyKey(value.idempotencyKey);
  if (!key) return failure("idempotencyKey", "A valid idempotency key is required.");
  return { ok: true, data: { name, parentId, idempotencyKey: key } };
}

export interface NoteMutationInput {
  readonly authoringData: CardAuthoringData;
  readonly expectedVersion: number | null;
  readonly idempotencyKey: string;
  readonly noteId: string | null;
  readonly source: string;
  readonly tags: readonly string[];
}

export function parseNoteMutationInput(input: unknown): InputResult<NoteMutationInput> {
  const value = record(input);
  if (!value) return failure("root", "Expected an object.");
  const parsedCard = cardAuthoringSchema.safeParse(value.authoringData);
  if (!parsedCard.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsedCard.issues) {
      const current = errors[issue.path] ?? [];
      current.push(issue.message);
      errors[issue.path] = current;
    }
    return { ok: false, fieldErrors: errors };
  }
  const noteId = optionalUuid(value.noteId);
  if (noteId === undefined) return failure("noteId", "The note identifier is invalid.");
  const expectedVersion =
    value.expectedVersion === undefined || value.expectedVersion === null
      ? null
      : typeof value.expectedVersion === "number" &&
          Number.isSafeInteger(value.expectedVersion) &&
          value.expectedVersion >= 1
        ? value.expectedVersion
        : undefined;
  if (expectedVersion === undefined)
    return failure("expectedVersion", "The expected version is invalid.");
  const source =
    typeof value.source === "string" && value.source.length <= 2_000
      ? value.source.normalize("NFKC").trim()
      : null;
  if (source === null) return failure("source", "The source is too long.");
  if (
    !Array.isArray(value.tags) ||
    value.tags.length > 100 ||
    value.tags.some((tag) => typeof tag !== "string" || tag.length > 100)
  ) {
    return failure("tags", "Use up to 100 tags of 100 characters each.");
  }
  const tags = [
    ...new Set(
      value.tags.map((tag) => tag.normalize("NFKC").trim().toLocaleLowerCase()).filter(Boolean),
    ),
  ];
  const key = idempotencyKey(value.idempotencyKey);
  if (!key) return failure("idempotencyKey", "A valid idempotency key is required.");
  return {
    ok: true,
    data: {
      authoringData: parsedCard.data,
      expectedVersion,
      idempotencyKey: key,
      noteId,
      source,
      tags,
    },
  };
}

export interface DeckCommandInput {
  readonly action:
    | "archive"
    | "delete"
    | "duplicate"
    | "publish"
    | "restore"
    | "restore_version"
    | "unpublish"
    | "update";
  readonly description?: string;
  readonly coverAssetId?: string | null;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly languageBack?: string;
  readonly languageFront?: string;
  readonly license?: "all_rights_reserved" | "cc0" | "cc_by" | "cc_by_sa";
  readonly theme?: string;
  readonly title?: string;
  readonly versionNumber?: number;
  readonly visibility?: DeckVisibility;
}

export function parseDeckCommandInput(input: unknown): InputResult<DeckCommandInput> {
  const value = record(input);
  if (!value) return failure("root", "Expected an object.");
  const actions = new Set([
    "archive",
    "delete",
    "duplicate",
    "publish",
    "restore",
    "restore_version",
    "unpublish",
    "update",
  ]);
  if (typeof value.action !== "string" || !actions.has(value.action))
    return failure("action", "Choose a valid deck action.");
  if (
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 1
  )
    return failure("expectedVersion", "The expected version is invalid.");
  const key = idempotencyKey(value.idempotencyKey);
  if (!key) return failure("idempotencyKey", "A valid idempotency key is required.");
  const output: Record<string, unknown> = {
    action: value.action,
    expectedVersion: value.expectedVersion,
    idempotencyKey: key,
  };
  if (value.title !== undefined) {
    const title = text(value.title, 1, 180);
    if (!title) return failure("title", "Enter a title between 1 and 180 characters.");
    output.title = title;
  }
  if (value.description !== undefined) {
    if (typeof value.description !== "string" || value.description.length > 20_000)
      return failure("description", "The description is too long.");
    output.description = value.description.normalize("NFKC").trim();
  }
  if (value.coverAssetId !== undefined) {
    const coverAssetId = optionalUuid(value.coverAssetId);
    if (coverAssetId === undefined) return failure("coverAssetId", "Choose a valid cover image.");
    output.coverAssetId = coverAssetId;
  }
  for (const field of ["languageFront", "languageBack"] as const) {
    const candidate = value[field];
    if (candidate !== undefined) {
      if (typeof candidate !== "string" || candidate.length < 2 || candidate.length > 35)
        return failure(field, "Use a valid language tag.");
      output[field] = candidate;
    }
  }
  if (value.theme !== undefined) {
    if (typeof value.theme !== "string" || !themeValues.has(value.theme))
      return failure("theme", "Choose a valid deck theme.");
    output.theme = value.theme;
  }
  if (value.license !== undefined) {
    if (typeof value.license !== "string" || !licenseValues.has(value.license))
      return failure("license", "Choose a valid license.");
    output.license = value.license;
  }
  if (value.visibility !== undefined) {
    if (
      value.visibility !== "private" &&
      value.visibility !== "public" &&
      value.visibility !== "unlisted"
    )
      return failure("visibility", "Choose a valid visibility.");
    output.visibility = value.visibility;
  }
  if (value.versionNumber !== undefined) {
    if (
      typeof value.versionNumber !== "number" ||
      !Number.isSafeInteger(value.versionNumber) ||
      value.versionNumber < 1
    )
      return failure("versionNumber", "Choose a valid version.");
    output.versionNumber = value.versionNumber;
  }
  return { ok: true, data: output as unknown as DeckCommandInput };
}

export function parseBulkNoteInput(
  input: unknown,
): InputResult<readonly (NoteMutationInput & { readonly clientId: string })[]> {
  const value = record(input);
  if (!value || !Array.isArray(value.notes) || value.notes.length < 1 || value.notes.length > 100)
    return failure("notes", "Submit 1 to 100 notes at a time.");
  const notes: Array<NoteMutationInput & { clientId: string }> = [];
  for (const [index, candidate] of value.notes.entries()) {
    const row = record(candidate);
    if (!row || typeof row.clientId !== "string" || !uuidPattern.test(row.clientId))
      return failure(`notes.${String(index)}.clientId`, "The row identifier is invalid.");
    const parsed = parseNoteMutationInput({
      ...row,
      expectedVersion: null,
      idempotencyKey: row.clientId,
      noteId: null,
      source: typeof row.source === "string" ? row.source : "",
    });
    if (!parsed.ok)
      return {
        ok: false,
        fieldErrors: Object.fromEntries(
          Object.entries(parsed.fieldErrors).map(([key, messages]) => [
            `notes.${String(index)}.${key}`,
            messages,
          ]),
        ),
      };
    notes.push({ ...parsed.data, clientId: row.clientId });
  }
  return { ok: true, data: notes };
}

const bulkNoteSelectionSchema = z
  .array(
    z
      .object({
        expectedVersion: z.number().int().positive(),
        id: contentUuidSchema,
      })
      .strict(),
  )
  .min(1, "Select at least one note.")
  .max(100, "Select no more than 100 notes.")
  .superRefine((notes, context) => {
    if (new Set(notes.map((note) => note.id)).size !== notes.length) {
      context.addIssue({ code: "custom", message: "Each selected note must be unique." });
    }
  });

const normalizedTagSchema = z
  .string()
  .transform((value) => value.normalize("NFKC").trim().toLocaleLowerCase())
  .refine((value) => value.length >= 1 && value.length <= 100, {
    message: "Tags must contain between 1 and 100 characters.",
  });

const bulkTagListSchema = z
  .array(normalizedTagSchema)
  .max(100, "Use no more than 100 tags.")
  .transform((tags) => [...new Set(tags)]);

export const bulkNoteActionSchema = z
  .discriminatedUnion("action", [
    z
      .object({
        action: z.literal("tag"),
        addTags: bulkTagListSchema,
        idempotencyKey: contentUuidSchema,
        notes: bulkNoteSelectionSchema,
        removeTags: bulkTagListSchema,
      })
      .strict(),
    z
      .object({
        action: z.literal("move"),
        idempotencyKey: contentUuidSchema,
        notes: bulkNoteSelectionSchema,
        targetDeckId: contentUuidSchema,
      })
      .strict(),
  ])
  .superRefine((input, context) => {
    if (input.action !== "tag") return;
    if (input.addTags.length === 0 && input.removeTags.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Add or remove at least one tag.",
        path: ["addTags"],
      });
    }
    const removed = new Set(input.removeTags);
    if (input.addTags.some((tag) => removed.has(tag))) {
      context.addIssue({
        code: "custom",
        message: "A tag cannot be added and removed in the same action.",
        path: ["removeTags"],
      });
    }
  });

export type BulkNoteActionInput = z.infer<typeof bulkNoteActionSchema>;

export function parseBulkNoteActionInput(input: unknown): InputResult<BulkNoteActionInput> {
  const parsed = bulkNoteActionSchema.safeParse(input);
  if (parsed.success) return { data: parsed.data, ok: true };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    fieldErrors[path] = [...(fieldErrors[path] ?? []), issue.message];
  }
  return { fieldErrors, ok: false };
}
