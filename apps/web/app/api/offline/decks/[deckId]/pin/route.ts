import { z } from "zod";
import type { NextRequest } from "next/server";

import { apiError, apiSuccess, readBoundedJson } from "@/lib/server/api";
import { sha256Hex } from "@/lib/server/crypto";
import { collectMediaLinks } from "@/lib/content/media-links";
import { readDeckDetail } from "@/lib/server/content-repository";
import { createSrsRuntimeContext, isSrsRuntimeContext } from "@/lib/server/srs-context";

const requestSchema = z
  .object({
    includeAudio: z.boolean().default(false),
    includeImages: z.boolean().default(true),
  })
  .strict();

const deckIdSchema = z.uuid();

export async function POST(
  request: NextRequest,
  { params }: { readonly params: Promise<{ deckId: string }> },
) {
  const context = await createSrsRuntimeContext(request);
  if (!isSrsRuntimeContext(context)) return context;
  const deckId = deckIdSchema.safeParse((await params).deckId);
  const input = requestSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!deckId.success || !input.success) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "The offline pin request could not be validated.",
        retryable: false,
      }),
    );
  }
  const { data: learner, error: learnerError } = await context.database.client
    .from("learner_profiles")
    .select("kind")
    .eq("id", context.learnerProfileId)
    .single();
  if (learnerError || learner?.kind !== "self") {
    return context.applyCookies(
      apiError(403, {
        code: "FORBIDDEN",
        message: "This learner profile cannot pin account-private content.",
        retryable: false,
      }),
    );
  }
  const deck = await readDeckDetail(deckId.data, context.accountId);
  if (!deck || !["owner", "manager", "editor", "viewer", "study_only"].includes(deck.role)) {
    return context.applyCookies(
      apiError(404, {
        code: "NOT_FOUND",
        message: "This deck is unavailable or you no longer have permission to study it.",
        retryable: false,
      }),
    );
  }
  if (deck.cards.length > 10_000) {
    return context.applyCookies(
      apiError(422, {
        code: "INVALID_INPUT",
        message: "This deck is larger than the 10,000-card offline limit.",
        retryable: false,
      }),
    );
  }
  const schedules: unknown[] = [];
  const cardIds = deck.cards.filter((card) => card.active).map((card) => card.id);
  for (let index = 0; index < cardIds.length; index += 200) {
    const { data, error } = await context.database.client
      .from("card_schedules")
      .select(
        "card_id,algorithm,state,due,due_order,last_reviewed_at,stability,difficulty,elapsed_days,scheduled_days,learning_step,reps,lapses,version,content_version,preset_version,scheduler_version,starred,suspended,suspended_at,buried_until,leech",
      )
      .eq("learner_profile_id", context.learnerProfileId)
      .in("card_id", cardIds.slice(index, index + 200));
    if (error) {
      return context.applyCookies(
        apiError(500, {
          code: "INTERNAL",
          message: "The current review schedules could not be prepared for offline use.",
          retryable: true,
        }),
      );
    }
    schedules.push(...(data ?? []));
  }
  const mediaIds = [
    ...new Set(
      deck.notes.flatMap((note) =>
        collectMediaLinks(note.authoringData).map((link) => link.assetId),
      ),
    ),
  ];
  const media =
    mediaIds.length === 0
      ? []
      : ((
          await context.privileged
            .from("media_assets")
            .select("id,alt_text,byte_size,kind,mime_type,sha256")
            .eq("status", "ready")
            .in("id", mediaIds)
        ).data ?? []);
  if (media.length !== mediaIds.length) {
    return context.applyCookies(
      apiError(409, {
        code: "CONFLICT",
        message:
          "One or more required media files are unavailable. Refresh the deck before pinning.",
        retryable: true,
      }),
    );
  }
  const selectedMedia = media.filter((asset) =>
    asset.kind === "image" ? input.data.includeImages : input.data.includeAudio,
  );
  const pinnedAt = new Date().toISOString();
  const projection = {
    cards: deck.cards,
    deck: {
      cardCount: deck.cardCount,
      descriptionPlain: deck.descriptionPlain,
      id: deck.id,
      noteCount: deck.noteCount,
      title: deck.title,
      updatedAt: deck.updatedAt,
      version: deck.version,
    },
    includeAudio: input.data.includeAudio,
    includeImages: input.data.includeImages,
    media: selectedMedia.map((asset) => ({
      altText: asset.alt_text ?? "",
      byteSize: asset.byte_size,
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mime_type,
      sha256: asset.sha256,
    })),
    notes: deck.notes,
    pinnedAt,
    schedules,
  };
  const serialized = JSON.stringify(projection);
  const contentHash = await sha256Hex(serialized);
  const projectionBytes = new TextEncoder().encode(serialized).byteLength;
  const mediaBytes = selectedMedia.reduce((total, asset) => total + asset.byte_size, 0);
  return context.applyCookies(
    apiSuccess({
      data: projection,
      manifest: {
        cardCount: deck.cards.length,
        contentHash,
        deckId: deck.id,
        deckTitle: deck.title,
        estimatedBytes: projectionBytes + mediaBytes,
        includeAudio: input.data.includeAudio,
        includeImages: input.data.includeImages,
        mediaBytes,
        pinnedAt,
        status: "ready" as const,
        updatedAt: deck.updatedAt,
      },
    }),
  );
}
