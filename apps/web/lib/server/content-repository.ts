import "server-only";

import {
  cardAuthoringSchema,
  customFieldPlainText,
  extractRichDocumentText,
  generateCardBlueprints,
  type CardAuthoringData,
  type StudyRendererContract,
} from "@lumen/domain";
import { createPrivilegedDatabaseClient } from "@lumen/database/server";
import { cache } from "react";

import type {
  CardTypeCode,
  DeckDetail,
  DeckSummary,
  DeckTheme,
  DeckVersionNoteContent,
  DeckVersionSummary,
  FolderSummary,
  GeneratedCardSummary,
  LibrarySnapshot,
  NoteSummary,
  PublicCardView,
  PublicDeckView,
  PublicMediaView,
} from "@/lib/content/view-models";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

type UnknownRow = Readonly<Record<string, unknown>>;

function rows(value: unknown): readonly UnknownRow[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is UnknownRow => typeof row === "object" && row !== null && !Array.isArray(row),
      )
    : [];
}

function row(value: unknown): UnknownRow | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as UnknownRow;
  }
  return rows(value)[0] ?? null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolValue(value: unknown): boolean {
  return value === true;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function cardType(value: unknown): CardTypeCode {
  return typeof value === "string" &&
    [
      "basic",
      "basic_reversed",
      "optional_reversed",
      "bidirectional",
      "custom",
      "typed_answer",
      "cloze",
      "image_occlusion",
      "multiple_choice",
      "select_all",
      "true_false",
      "ordering",
      "list_answer",
      "diagram",
      "audio_prompt",
      "pronunciation",
      "drawing",
    ].includes(value)
    ? (value as CardTypeCode)
    : "basic";
}

function deckTheme(value: unknown): DeckTheme {
  return value === "ocean" || value === "forest" || value === "contrast" ? value : "neutral";
}

function deckSummary(
  deck: UnknownRow,
  accountId: string,
  folderByDeck: ReadonlyMap<string, string>,
  memberRoleByDeck: ReadonlyMap<string, DeckSummary["role"]>,
): DeckSummary {
  const id = stringValue(deck.id);
  const published = deck.published_version !== null && deck.published_version !== undefined;
  return Object.freeze({
    cardCount: numberValue(deck.card_count),
    descriptionPlain: stringValue(deck.description_plain),
    folderId: folderByDeck.get(id) ?? null,
    id,
    noteCount: numberValue(deck.note_count),
    publicId: published ? stringValue(deck.public_id) || null : null,
    publicSlug: published ? stringValue(deck.slug) || null : null,
    role:
      stringValue(deck.owner_account_id) === accountId
        ? "owner"
        : (memberRoleByDeck.get(id) ?? "viewer"),
    status: (["active", "archived", "deleted", "moderated"].includes(stringValue(deck.status))
      ? stringValue(deck.status)
      : "active") as DeckSummary["status"],
    title: stringValue(deck.title, "Untitled deck"),
    updatedAt: stringValue(deck.updated_at, new Date(0).toISOString()),
    version: numberValue(deck.version, 1),
    visibility: (["private", "public", "unlisted"].includes(stringValue(deck.visibility))
      ? stringValue(deck.visibility)
      : "private") as DeckSummary["visibility"],
  });
}

export const readLibrarySnapshot = cache(async (accountId: string): Promise<LibrarySnapshot> => {
  const client = await createNextServerDatabaseClient();
  const [folderResult, deckResult, countResult] = await Promise.all([
    client
      .from("folders")
      .select("id,parent_id,name,version,status,created_at,updated_at")
      .eq("status", "active")
      .order("position")
      .order("name")
      .limit(501),
    client
      .from("decks")
      .select(
        "id,public_id,owner_account_id,title,slug,description_plain,visibility,version,published_version,note_count,card_count,status,updated_at",
      )
      .in("status", ["active", "archived"])
      .order("updated_at", { ascending: false })
      .limit(201),
    client.rpc("current_get_library_counts"),
  ]);
  if (folderResult.error || deckResult.error || countResult.error) {
    throw new Error("CONTENT_LIBRARY_UNAVAILABLE");
  }
  const limitedDeckRows = rows(deckResult.data);
  const limitedFolderRows = rows(folderResult.data);
  const deckRows = limitedDeckRows.slice(0, 200);
  const folderRows = limitedFolderRows.slice(0, 500);
  const deckIds = deckRows.map((deck) => stringValue(deck.id)).filter(Boolean);
  const [folderItemResult, memberResult] = deckIds.length
    ? await Promise.all([
        client
          .from("folder_items")
          .select("folder_id,deck_id")
          .in("deck_id", deckIds)
          .is("deleted_at", null)
          .limit(200),
        client
          .from("deck_members")
          .select("deck_id,role")
          .eq("account_id", accountId)
          .in("deck_id", deckIds)
          .is("revoked_at", null)
          .limit(200),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (folderItemResult.error || memberResult.error) throw new Error("CONTENT_LIBRARY_UNAVAILABLE");
  const folderItems = rows(folderItemResult.data);
  const folderByDeck = new Map(
    folderItems.map((item) => [stringValue(item.deck_id), stringValue(item.folder_id)]),
  );
  const memberRoleByDeck = new Map<string, DeckSummary["role"]>();
  for (const member of rows(memberResult.data)) {
    const role = stringValue(member.role);
    memberRoleByDeck.set(
      stringValue(member.deck_id),
      role === "owner" || role === "manager" || role === "editor" || role === "viewer"
        ? role
        : "viewer",
    );
  }
  const decks = deckRows.map((deck) =>
    deckSummary(deck, accountId, folderByDeck, memberRoleByDeck),
  );
  const deckCountByFolder = new Map<string, number>();
  for (const item of folderItems) {
    const folderId = stringValue(item.folder_id);
    deckCountByFolder.set(folderId, (deckCountByFolder.get(folderId) ?? 0) + 1);
  }
  const folders: readonly FolderSummary[] = folderRows.map((folder) =>
    Object.freeze({
      createdAt: stringValue(folder.created_at),
      deckCount: deckCountByFolder.get(stringValue(folder.id)) ?? 0,
      id: stringValue(folder.id),
      name: stringValue(folder.name),
      parentId: stringValue(folder.parent_id) || null,
      updatedAt: stringValue(folder.updated_at),
      version: numberValue(folder.version, 1),
    }),
  );
  const active = decks.filter((deck) => deck.status === "active");
  const counts = row(countResult.data);
  if (!counts) throw new Error("CONTENT_LIBRARY_UNAVAILABLE");
  return Object.freeze({
    counts: Object.freeze({
      activeDecks: numberValue(counts.active_decks),
      archivedDecks: numberValue(counts.archived_decks),
      cards: numberValue(counts.cards),
      folders: numberValue(counts.folders),
      notes: numberValue(counts.notes),
    }),
    decks: Object.freeze(decks),
    folders: Object.freeze(folders),
    recentlyEdited: Object.freeze(active.slice(0, 6)),
    truncated: limitedDeckRows.length > 200 || limitedFolderRows.length > 500,
  });
});

function answerText(renderer: StudyRendererContract): string {
  switch (renderer.kind) {
    case "basic":
    case "basic_reversed":
    case "optional_reversed":
    case "bidirectional":
    case "typed_answer":
      return extractRichDocumentText(renderer.answer);
    case "custom":
      return Object.values(renderer.fields).map(customFieldPlainText).filter(Boolean).join(" · ");
    case "cloze": {
      const text = extractRichDocumentText(renderer.document);
      return renderer.activeCloze.ranges
        .map((range) => text.slice(range.from, range.to))
        .join(" · ");
    }
    case "image_occlusion":
      return renderer.regions.map((region) => region.label).join(" · ");
    case "multiple_choice":
    case "select_all":
      return renderer.choices
        .filter((choice) => choice.isCorrect)
        .map((choice) => extractRichDocumentText(choice.content))
        .join(" · ");
    case "true_false":
      return renderer.answer ? "True" : "False";
    case "ordering":
      return renderer.items.map((item) => extractRichDocumentText(item.content)).join(" → ");
    case "list_answer":
      return renderer.items.map((item) => item.answer).join(renderer.orderMatters ? " → " : ", ");
    case "diagram":
      return renderer.hotspot.label;
    case "audio_prompt":
      return extractRichDocumentText(renderer.answer);
    case "pronunciation":
      return renderer.fallbackAnswer ?? renderer.text;
    case "drawing":
      return renderer.fallbackAnswer;
  }
}

function generatedForNote(
  noteId: string,
  authoringData: CardAuthoringData,
  storedCards: readonly UnknownRow[],
): readonly GeneratedCardSummary[] {
  const blueprints = generateCardBlueprints(authoringData);
  const blueprintByKey = new Map(
    blueprints.map((blueprint) => [blueprint.generationKey, blueprint]),
  );
  return storedCards.flatMap((stored): readonly GeneratedCardSummary[] => {
    const blueprint = blueprintByKey.get(stringValue(stored.generation_key));
    if (!blueprint) return [];
    return [
      Object.freeze({
        active: boolValue(stored.active),
        cardType: blueprint.cardKind,
        generationKey: blueprint.generationKey,
        id: stringValue(stored.id),
        noteId,
        ordinal: numberValue(stored.ordinal),
        previewBack: answerText(blueprint.renderer),
        previewFront: blueprint.renderer.accessibility.promptText,
        renderer: blueprint.renderer,
      }),
    ];
  });
}

interface DiffableNote {
  readonly content: DeckVersionNoteContent;
  readonly contentHash: string;
}

function diffableNote(
  authoringData: CardAuthoringData,
  source: string,
  tags: readonly string[],
): DeckVersionNoteContent {
  const first = generateCardBlueprints(authoringData)[0];
  return Object.freeze({
    answer: first ? answerText(first.renderer) : "",
    cardType: authoringData.kind,
    prompt: first?.renderer.accessibility.promptText ?? "",
    source,
    tags: Object.freeze([...tags].sort()),
  });
}

function snapshotNotes(value: unknown): ReadonlyMap<string, DiffableNote> {
  const snapshot = row(value);
  if (!snapshot) return new Map();
  const notes = new Map<string, DiffableNote>();
  for (const note of rows(snapshot.notes)) {
    const id = stringValue(note.id);
    if (!id) continue;
    const parsed = cardAuthoringSchema.safeParse(note.cardPayload);
    const content = parsed.success
      ? diffableNote(parsed.data, stringValue(note.sourceReference), stringArray(note.tagNames))
      : Object.freeze({
          answer: "",
          cardType: cardType(row(note.cardPayload)?.kind),
          prompt: stringValue(note.sortText),
          source: stringValue(note.sourceReference),
          tags: Object.freeze([...stringArray(note.tagNames)].sort()),
        });
    notes.set(id, Object.freeze({ content, contentHash: stringValue(note.contentHash) }));
  }
  return notes;
}

function changedAreas(version: DeckVersionNoteContent, current: DeckVersionNoteContent): string[] {
  const areas: string[] = [];
  if (version.cardType !== current.cardType) areas.push("Card type");
  if (version.prompt !== current.prompt) areas.push("Prompt");
  if (version.answer !== current.answer) areas.push("Answer");
  if (version.source !== current.source) areas.push("Source");
  if (JSON.stringify(version.tags) !== JSON.stringify(current.tags)) areas.push("Tags");
  return areas;
}

function diffNotes(
  snapshot: ReadonlyMap<string, DiffableNote>,
  current: ReadonlyMap<string, DiffableNote>,
): DeckVersionSummary["diffFromCurrent"] {
  const changes: DeckVersionSummary["diffFromCurrent"]["changes"][number][] = [];
  for (const [id, currentNote] of current) {
    const versionNote = snapshot.get(id);
    if (!versionNote) {
      changes.push({
        changedAreas: Object.freeze(["Added note"]),
        current: currentNote.content,
        kind: "added",
        noteId: id,
        version: null,
      });
    } else {
      const areas = changedAreas(versionNote.content, currentNote.content);
      if (versionNote.contentHash !== currentNote.contentHash || areas.length > 0) {
        changes.push({
          changedAreas: Object.freeze(areas.length ? areas : ["Structured card content"]),
          current: currentNote.content,
          kind: "changed",
          noteId: id,
          version: versionNote.content,
        });
      }
    }
  }
  for (const [id, versionNote] of snapshot) {
    if (!current.has(id)) {
      changes.push({
        changedAreas: Object.freeze(["Removed note"]),
        current: null,
        kind: "removed",
        noteId: id,
        version: versionNote.content,
      });
    }
  }
  return Object.freeze({
    added: changes.filter((change) => change.kind === "added").length,
    changed: changes.filter((change) => change.kind === "changed").length,
    changes: Object.freeze(changes.map((change) => Object.freeze(change))),
    removed: changes.filter((change) => change.kind === "removed").length,
  });
}

export const readDeckDetail = cache(
  async (deckId: string, accountId: string): Promise<DeckDetail | null> => {
    const client = await createNextServerDatabaseClient();
    const deckResult = await client.from("decks").select("*").eq("id", deckId).maybeSingle();
    if (deckResult.error) throw new Error("DECK_UNAVAILABLE");
    if (!deckResult.data) return null;
    const [folderResult, memberResult, noteResult, tagResult, versionResult] = await Promise.all([
      client
        .from("folder_items")
        .select("folder_id,deck_id")
        .eq("deck_id", deckId)
        .is("deleted_at", null)
        .maybeSingle(),
      client
        .from("deck_members")
        .select("deck_id,role")
        .eq("deck_id", deckId)
        .eq("account_id", accountId)
        .is("revoked_at", null)
        .maybeSingle(),
      client
        .from("notes")
        .select("id,version,sort_text,content_hash,source_reference,card_payload,updated_at")
        .eq("deck_id", deckId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
      client.from("tags").select("id,name").eq("deck_id", deckId).is("deleted_at", null),
      client
        .from("deck_versions")
        .select("id,version_number,change_kind,summary,created_at,created_by,content_snapshot")
        .eq("deck_id", deckId)
        .order("version_number", { ascending: false })
        .limit(100),
    ]);
    if (
      folderResult.error ||
      memberResult.error ||
      noteResult.error ||
      tagResult.error ||
      versionResult.error
    )
      throw new Error("DECK_DETAIL_UNAVAILABLE");
    const noteRows = rows(noteResult.data);
    const noteIds = noteRows.map((note) => stringValue(note.id));
    const [actualCards, noteTagResult] = noteIds.length
      ? await Promise.all([
          client
            .from("cards")
            .select("id,note_id,ordinal,card_kind,generation_key,active")
            .in("note_id", noteIds)
            .is("deleted_at", null)
            .order("ordinal"),
          client
            .from("note_tags")
            .select("note_id,tag_id")
            .in("note_id", noteIds)
            .is("deleted_at", null),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (actualCards.error || noteTagResult.error) throw new Error("DECK_CARDS_UNAVAILABLE");
    const tagsById = new Map(
      rows(tagResult.data).map((tag) => [stringValue(tag.id), stringValue(tag.name)]),
    );
    const tagNamesByNote = new Map<string, string[]>();
    for (const relation of rows(noteTagResult.data)) {
      const noteId = stringValue(relation.note_id);
      const tag = tagsById.get(stringValue(relation.tag_id));
      if (tag) tagNamesByNote.set(noteId, [...(tagNamesByNote.get(noteId) ?? []), tag]);
    }
    const storedCards = rows(actualCards.data);
    const cards: GeneratedCardSummary[] = [];
    const notes: NoteSummary[] = [];
    for (const note of noteRows) {
      const parsed = cardAuthoringSchema.safeParse(note.card_payload);
      if (!parsed.success) continue;
      const noteId = stringValue(note.id);
      const siblings = generatedForNote(
        noteId,
        parsed.data,
        storedCards.filter((card) => stringValue(card.note_id) === noteId),
      );
      cards.push(...siblings);
      notes.push(
        Object.freeze({
          authoringData: parsed.data,
          cardCount: siblings.filter((card) => card.active).length,
          cardType: parsed.data.kind,
          contentHash: stringValue(note.content_hash),
          id: noteId,
          preview: stringValue(note.sort_text) || siblings[0]?.previewFront || "",
          source: stringValue(note.source_reference),
          tags: Object.freeze((tagNamesByNote.get(noteId) ?? []).sort()),
          updatedAt: stringValue(note.updated_at),
          version: numberValue(note.version, 1),
        }),
      );
    }
    const folderByDeck = new Map<string, string>();
    if (folderResult.data)
      folderByDeck.set(deckId, stringValue((folderResult.data as UnknownRow).folder_id));
    const roleByDeck = new Map<string, DeckSummary["role"]>();
    if (memberResult.data)
      roleByDeck.set(
        deckId,
        stringValue((memberResult.data as UnknownRow).role) as DeckSummary["role"],
      );
    const base = deckSummary(deckResult.data as UnknownRow, accountId, folderByDeck, roleByDeck);
    const currentNotes = new Map(
      notes.map((note) => [
        note.id,
        Object.freeze({
          content: diffableNote(note.authoringData, note.source, note.tags),
          contentHash: note.contentHash,
        }),
      ]),
    );
    const versions: readonly DeckVersionSummary[] = rows(versionResult.data).map((version) =>
      Object.freeze({
        changeKind: (["create", "edit", "publish", "restore", "structure"].includes(
          stringValue(version.change_kind),
        )
          ? stringValue(version.change_kind)
          : "edit") as DeckVersionSummary["changeKind"],
        createdAt: stringValue(version.created_at),
        createdByLabel: stringValue(version.created_by) === accountId ? "You" : "Collaborator",
        deckVersion: numberValue(version.version_number),
        diffFromCurrent: diffNotes(snapshotNotes(version.content_snapshot), currentNotes),
        id: stringValue(version.id),
        summary: stringValue(version.summary),
      }),
    );
    const deck = deckResult.data as UnknownRow;
    return Object.freeze({
      ...base,
      cards: Object.freeze(cards),
      coverAssetId: stringValue(deck.cover_asset_id) || null,
      languageBack: stringValue(deck.language_back, "en"),
      languageFront: stringValue(deck.language_front, "en"),
      license: (["all_rights_reserved", "cc0", "cc_by", "cc_by_sa"].includes(
        stringValue(deck.license),
      )
        ? stringValue(deck.license)
        : "all_rights_reserved") as DeckDetail["license"],
      notes: Object.freeze(notes),
      supportedCardTypes: Object.freeze([...new Set(notes.map((note) => note.cardType))]),
      theme: deckTheme(deck.theme),
      versions: Object.freeze(versions),
    });
  },
);

export const readPublicDeck = cache(async (identifier: string): Promise<PublicDeckView | null> => {
  const client = await createNextServerDatabaseClient();
  const uuid = /^[0-9a-f-]{36}$/iu.test(identifier);
  // Exact-link RPCs intentionally expose public and unlisted frozen snapshots without
  // granting anonymous callers an enumerable table read for unlisted publications.
  const deckResult = uuid
    ? await client.rpc("get_public_deck", { p_public_id: identifier }).maybeSingle()
    : await client.rpc("get_public_deck_by_slug", { p_slug: identifier }).maybeSingle();
  if (deckResult.error) throw new Error("PUBLIC_DECK_UNAVAILABLE");
  if (!deckResult.data) return null;
  const deck = deckResult.data as UnknownRow;
  const publicId = stringValue(deck.public_id);
  const privileged = createPrivilegedDatabaseClient();
  const [cardResult, mediaResult, locatorResult] = await Promise.all([
    client.rpc("get_public_deck_cards", { p_public_id: publicId }),
    client.rpc("get_public_deck_media", { p_public_id: publicId }),
    privileged.rpc("admin_get_public_deck_media_storage", { p_public_id: publicId }),
  ]);
  if (cardResult.error) throw new Error("PUBLIC_CARDS_UNAVAILABLE");
  if (mediaResult.error || locatorResult.error) throw new Error("PUBLIC_MEDIA_UNAVAILABLE");
  const metadataById = new Map(
    rows(mediaResult.data).map((media) => [stringValue(media.media_public_id), media]),
  );
  const publicMedia: PublicMediaView[] = [];
  for (const locator of rows(locatorResult.data)) {
    const id = stringValue(locator.media_public_id);
    const metadata = metadataById.get(id);
    if (!metadata) continue;
    const signed = await privileged.storage
      .from(stringValue(locator.storage_bucket))
      .createSignedUrl(stringValue(locator.storage_path), 900);
    if (signed.error || !signed.data.signedUrl) continue;
    publicMedia.push(
      Object.freeze({
        altText: stringValue(metadata.alt_text),
        id,
        kind: stringValue(metadata.kind) === "audio" ? "audio" : "image",
        mimeType: stringValue(metadata.mime_type),
        signedUrl: signed.data.signedUrl,
      }),
    );
  }
  const mediaById = new Map(publicMedia.map((media) => [media.id, media]));
  const cards: PublicCardView[] = [];
  for (const published of rows(cardResult.data)) {
    const payloadRecord =
      typeof published.card_payload === "object" && published.card_payload !== null
        ? (published.card_payload as UnknownRow)
        : {};
    const parsed = cardAuthoringSchema.safeParse(
      payloadRecord.authoringData ?? published.card_payload,
    );
    if (!parsed.success) continue;
    const blueprint = generateCardBlueprints(parsed.data).find(
      (candidate) => candidate.generationKey === stringValue(published.generation_key),
    );
    if (!blueprint) continue;
    const cardMediaIds = new Set<string>();
    function collectMedia(value: unknown) {
      if (Array.isArray(value)) {
        value.forEach(collectMedia);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const child of Object.values(value)) {
        if (typeof child === "string" && mediaById.has(child)) cardMediaIds.add(child);
        else collectMedia(child);
      }
    }
    collectMedia(blueprint.renderer);
    cards.push(
      Object.freeze({
        back: answerText(blueprint.renderer),
        cardType: blueprint.cardKind,
        front: blueprint.renderer.accessibility.promptText,
        id: stringValue(published.card_public_id),
        media: Object.freeze(
          [...cardMediaIds].flatMap((id) => {
            const media = mediaById.get(id);
            return media ? [media] : [];
          }),
        ),
        nonvisualFallback: blueprint.renderer.accessibility.nonvisualAlternative,
        renderer: blueprint.renderer,
      }),
    );
  }
  const coverMedia = mediaById.get(stringValue(deck.cover_media_public_id)) ?? null;
  return Object.freeze({
    cardCount: numberValue(deck.card_count),
    cards: Object.freeze(cards),
    coverMedia,
    creator: Object.freeze({
      displayName: stringValue(deck.creator_display_name, "Deck creator"),
      handle: stringValue(deck.creator_handle) || null,
    }),
    description: stringValue(deck.description_plain),
    license: stringValue(deck.license, "all_rights_reserved") as PublicDeckView["license"],
    publicId: stringValue(deck.public_id),
    slug: stringValue(deck.slug),
    supportedCardTypes: Object.freeze(stringArray(deck.card_kinds).map(cardType)),
    theme: deckTheme(deck.theme),
    title: stringValue(deck.title, "Published deck"),
    updatedAt: stringValue(deck.updated_at),
    visibility: stringValue(deck.visibility, "unlisted") as PublicDeckView["visibility"],
  });
});
