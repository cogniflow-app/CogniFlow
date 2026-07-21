import type { CardAuthoringData, StudyRendererContract } from "@lumen/domain";

export const CARD_TYPE_CODES = [
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
] as const;

export type CardTypeCode = (typeof CARD_TYPE_CODES)[number];

export interface FolderSummary {
  readonly createdAt: string;
  readonly deckCount: number;
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly updatedAt: string;
  readonly version: number;
}

export type DeckVisibility = "private" | "public" | "unlisted";
export type DeckStatus = "active" | "archived" | "deleted" | "moderated";
export type DeckTheme = "contrast" | "forest" | "neutral" | "ocean";

export interface DeckSummary {
  readonly cardCount: number;
  readonly descriptionPlain: string;
  readonly folderId: string | null;
  readonly id: string;
  readonly noteCount: number;
  readonly publicId: string | null;
  readonly publicSlug: string | null;
  readonly role: "editor" | "manager" | "owner" | "viewer";
  readonly status: DeckStatus;
  readonly title: string;
  readonly theme?: DeckTheme;
  readonly updatedAt: string;
  readonly version: number;
  readonly visibility: DeckVisibility;
}

export interface LibrarySnapshot {
  readonly counts: {
    readonly activeDecks: number;
    readonly archivedDecks: number;
    readonly cards: number;
    readonly folders: number;
    readonly notes: number;
  };
  readonly decks: readonly DeckSummary[];
  readonly folders: readonly FolderSummary[];
  readonly recentlyEdited: readonly DeckSummary[];
  readonly truncated: boolean;
}

export interface NoteSummary {
  readonly authoringData: CardAuthoringData;
  readonly cardCount: number;
  readonly cardType: CardTypeCode;
  readonly contentHash: string;
  readonly id: string;
  readonly preview: string;
  readonly source: string;
  readonly tags: readonly string[];
  readonly updatedAt: string;
  readonly version: number;
}

export interface GeneratedCardSummary {
  readonly active: boolean;
  readonly cardType: CardTypeCode;
  readonly generationKey: string;
  readonly id: string;
  readonly noteId: string;
  readonly ordinal: number;
  readonly previewBack: string;
  readonly previewFront: string;
  readonly renderer: StudyRendererContract;
}

export interface DeckVersionSummary {
  readonly changeKind: "create" | "edit" | "publish" | "restore" | "structure";
  readonly createdAt: string;
  readonly createdByLabel: string;
  readonly deckVersion: number;
  readonly diffFromCurrent: {
    readonly added: number;
    readonly changed: number;
    readonly changes: readonly DeckVersionNoteChange[];
    readonly removed: number;
  };
  readonly id: string;
  readonly summary: string;
}

export interface DeckVersionNoteContent {
  readonly answer: string;
  readonly cardType: CardTypeCode;
  readonly prompt: string;
  readonly source: string;
  readonly tags: readonly string[];
}

export interface DeckVersionNoteChange {
  readonly changedAreas: readonly string[];
  readonly current: DeckVersionNoteContent | null;
  readonly kind: "added" | "changed" | "removed";
  readonly noteId: string;
  readonly version: DeckVersionNoteContent | null;
}

export interface DeckDetail extends DeckSummary {
  readonly cards: readonly GeneratedCardSummary[];
  readonly coverAssetId: string | null;
  readonly languageBack: string;
  readonly languageFront: string;
  readonly license: "all_rights_reserved" | "cc0" | "cc_by" | "cc_by_sa";
  readonly notes: readonly NoteSummary[];
  readonly supportedCardTypes: readonly CardTypeCode[];
  readonly theme: DeckTheme;
  readonly versions: readonly DeckVersionSummary[];
}

export interface PublicCardView {
  readonly back: string;
  readonly cardType: CardTypeCode;
  readonly front: string;
  readonly id: string;
  readonly media: readonly PublicMediaView[];
  readonly nonvisualFallback: string;
  readonly renderer: StudyRendererContract;
}

export interface PublicMediaView {
  readonly altText: string;
  readonly id: string;
  readonly kind: "audio" | "image";
  readonly mimeType: string;
  readonly signedUrl: string;
}

export interface PublicDeckView {
  readonly cardCount: number;
  readonly cards: readonly PublicCardView[];
  readonly coverMedia: PublicMediaView | null;
  readonly creator: {
    readonly displayName: string;
    readonly handle: string | null;
  };
  readonly description: string;
  readonly license: DeckDetail["license"];
  readonly publicId: string;
  readonly slug: string;
  readonly supportedCardTypes: readonly CardTypeCode[];
  readonly theme: DeckTheme;
  readonly title: string;
  readonly updatedAt: string;
  readonly visibility: Exclude<DeckVisibility, "private">;
}

export interface ContentApiError {
  readonly code:
    | "CONFLICT"
    | "FORBIDDEN"
    | "INTERNAL"
    | "INVALID_INPUT"
    | "NOT_FOUND"
    | "QUOTA_EXCEEDED"
    | "UNAUTHENTICATED";
  readonly currentVersion?: number;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ContentMutationResult<T> {
  readonly data: T;
  readonly status: "created" | "deleted" | "restored" | "updated";
}
