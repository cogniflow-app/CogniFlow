import { emptyRichDocument } from "@lumen/domain";
import type { NextRequest } from "next/server";

import { parseDeckCommandInput, type DeckCommandInput } from "@/lib/content/inputs";
import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import {
  contentDatabaseError,
  createContentMutationContext,
  isMutationContext,
} from "@/lib/server/content-route";
import { nullableRpcArgument, toDatabaseJson } from "@/lib/server/database-arguments";

function settingsPatch(input: DeckCommandInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) {
    patch.descriptionPlain = input.description;
    const document = emptyRichDocument(input.languageFront ?? "en");
    patch.descriptionDoc = input.description
      ? {
          ...document,
          content: [
            {
              content: [{ text: input.description, type: "text" }],
              type: "paragraph",
            },
          ],
        }
      : document;
  }
  if (input.coverAssetId !== undefined) patch.coverAssetId = input.coverAssetId;
  if (input.languageFront !== undefined) patch.languageFront = input.languageFront;
  if (input.languageBack !== undefined) patch.languageBack = input.languageBack;
  if (input.license !== undefined) patch.license = input.license;
  if (input.theme !== undefined) patch.theme = input.theme;
  return patch;
}

async function childIdempotencyKey(parent: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`lumen:deck-settings-before-publication:v1:${parent}`),
    ),
  );
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const value = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function PATCH(
  request: NextRequest,
  { params }: { readonly params: Promise<{ deckId: string }> },
) {
  const context = await createContentMutationContext(request);
  if (!isMutationContext(context)) return context;
  const parsed = parseDeckCommandInput(await readBoundedJson(request).catch(() => null));
  if (!parsed.ok)
    return apiError(422, {
      code: "INVALID_INPUT",
      fieldErrors: parsed.fieldErrors,
      message: "Review the deck change.",
      retryable: false,
    });
  const { deckId } = await params;
  const input = parsed.data;
  const patch = settingsPatch(input);
  let expectedVersion = input.expectedVersion;
  if (
    (input.action === "publish" || input.action === "unpublish") &&
    Object.keys(patch).length > 0
  ) {
    const settingsResult = await context.database.client.rpc("current_update_deck", {
      p_deck_id: deckId,
      p_expected_version: expectedVersion,
      p_idempotency_key: await childIdempotencyKey(input.idempotencyKey),
      p_patch: toDatabaseJson(patch),
    });
    if (settingsResult.error || !settingsResult.data)
      return contentDatabaseError(
        settingsResult.error ?? {},
        "The deck settings could not be saved before publication changed.",
      );
    expectedVersion = settingsResult.data.version;
  }
  let result;
  if (input.action === "archive") {
    result = await context.database.client.rpc("current_archive_deck", {
      p_deck_id: deckId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
  } else if (input.action === "restore") {
    result = await context.database.client.rpc("current_restore_deck", {
      p_deck_id: deckId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
  } else if (input.action === "delete") {
    result = await context.database.client.rpc("current_delete_deck", {
      p_deck_id: deckId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
  } else if (input.action === "duplicate") {
    result = await context.database.client.rpc("current_duplicate_deck", {
      p_folder_id: nullableRpcArgument<string>(null),
      p_idempotency_key: input.idempotencyKey,
      p_source_deck_id: deckId,
      p_title: input.title ?? "Deck copy",
    });
  } else if (input.action === "publish") {
    result = await context.database.client.rpc("current_publish_deck", {
      p_deck_id: deckId,
      p_expected_version: expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_visibility: input.visibility === "public" ? "public" : "unlisted",
    });
  } else if (input.action === "unpublish") {
    result = await context.database.client.rpc("current_unpublish_deck", {
      p_deck_id: deckId,
      p_expected_version: expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    });
  } else if (input.action === "restore_version") {
    result = await context.database.client.rpc("current_restore_deck_version", {
      p_deck_id: deckId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_version_number: input.versionNumber ?? 0,
    });
  } else {
    if (Object.keys(patch).length === 0)
      return apiError(422, {
        code: "INVALID_INPUT",
        fieldErrors: { root: ["Change at least one deck detail."] },
        message: "Publication visibility changes only when you publish or unpublish.",
        retryable: false,
      });
    result = await context.database.client.rpc("current_update_deck", {
      p_deck_id: deckId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_patch: toDatabaseJson(patch),
    });
  }
  if (result.error || !result.data)
    return contentDatabaseError(result.error ?? {}, "The deck could not be changed.");
  const data = result.data;
  return context.database.applyCookies(
    apiSuccess({
      data: {
        cardCount: data.card_count,
        descriptionPlain: data.description_plain,
        folderId: null,
        id: data.id,
        noteCount: data.note_count,
        publicId: data.published_version ? data.public_id : null,
        publicSlug: data.published_version ? data.slug : null,
        role: "owner" as const,
        status: data.status,
        title: data.title,
        updatedAt: data.updated_at,
        version: data.version,
        visibility: data.visibility,
      },
      status:
        input.action === "delete"
          ? ("deleted" as const)
          : input.action === "restore"
            ? ("restored" as const)
            : ("updated" as const),
    }),
  );
}
