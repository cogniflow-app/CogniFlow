import type {
  DeckDetail,
  DeckSummary,
  FolderSummary,
  LibrarySnapshot,
  PublicDeckView,
} from "../../lib/content/view-models";
import {
  generateCardBlueprints,
  type CardAuthoringData,
  type RichDocument,
  type StudyRendererContract,
} from "@lumen/domain";

const NOW = "2026-07-16T15:00:00.000Z";

function firstRenderer(data: CardAuthoringData): StudyRendererContract {
  const renderer = generateCardBlueprints(data)[0]?.renderer;
  if (!renderer) throw new Error("Fixture card did not generate a renderer.");
  return renderer;
}

export const biologyFolder: FolderSummary = {
  createdAt: NOW,
  deckCount: 1,
  id: "0190d9f0-0000-7000-8000-000000000001",
  name: "Biology",
  parentId: null,
  updatedAt: NOW,
  version: 1,
};

export const languageFolder: FolderSummary = {
  createdAt: NOW,
  deckCount: 1,
  id: "0190d9f0-0000-7000-8000-000000000002",
  name: "Languages",
  parentId: null,
  updatedAt: NOW,
  version: 1,
};

export const activeDeck: DeckSummary = {
  cardCount: 12,
  descriptionPlain: "Cell structures and their functions",
  folderId: biologyFolder.id,
  id: "0190d9f0-0000-7000-8000-000000000011",
  noteCount: 8,
  publicId: null,
  publicSlug: null,
  role: "owner",
  status: "active",
  title: "Cell biology",
  updatedAt: NOW,
  version: 4,
  visibility: "private",
};

export const archivedDeck: DeckSummary = {
  cardCount: 4,
  descriptionPlain: "Common Spanish verbs",
  folderId: languageFolder.id,
  id: "0190d9f0-0000-7000-8000-000000000012",
  noteCount: 4,
  publicId: "0190d9f0-0000-7000-8000-000000000021",
  publicSlug: "spanish-verbs",
  role: "owner",
  status: "archived",
  title: "Spanish verbs",
  updatedAt: "2026-07-15T15:00:00.000Z",
  version: 2,
  visibility: "unlisted",
};

export const emptyLibrarySnapshot: LibrarySnapshot = {
  counts: {
    activeDecks: 0,
    archivedDecks: 0,
    cards: 0,
    folders: 0,
    notes: 0,
  },
  decks: [],
  folders: [],
  recentlyEdited: [],
  truncated: false,
};

export const populatedLibrarySnapshot: LibrarySnapshot = {
  counts: {
    activeDecks: 1,
    archivedDecks: 1,
    cards: 16,
    folders: 2,
    notes: 12,
  },
  decks: [activeDeck, archivedDeck],
  folders: [biologyFolder, languageFolder],
  recentlyEdited: [activeDeck, archivedDeck],
  truncated: false,
};

export function largeLibrarySnapshot(totalDecks = 260): LibrarySnapshot {
  const allDecks: DeckSummary[] = Array.from({ length: totalDecks }, (_, index) => ({
    ...activeDeck,
    cardCount: index + 1,
    descriptionPlain: `Bounded library deck ${String(index + 1)}`,
    folderId: null,
    id: `0190d9f0-1000-7000-8000-${String(index + 1).padStart(12, "0")}`,
    noteCount: index + 1,
    title: `Deck ${String(index + 1).padStart(3, "0")}`,
    updatedAt: new Date(Date.parse(NOW) - index * 60_000).toISOString(),
  }));
  return {
    counts: {
      activeDecks: totalDecks,
      archivedDecks: 0,
      cards: allDecks.reduce((total, deck) => total + deck.cardCount, 0),
      folders: 0,
      notes: allDecks.reduce((total, deck) => total + deck.noteCount, 0),
    },
    decks: allDecks.slice(0, 200),
    folders: [],
    recentlyEdited: allDecks.slice(0, 6),
    truncated: totalDecks > 200,
  };
}

export const publicDeck: PublicDeckView = {
  cardCount: 2,
  cards: [
    {
      back: "The cell's usable energy carrier",
      cardType: "basic",
      front: "What is ATP?",
      id: "public-card-1",
      media: [],
      nonvisualFallback: "Prompt: What is ATP? Answer: The cell's usable energy carrier",
      renderer: firstRenderer({
        back: richText("The cell's usable energy carrier"),
        front: richText("What is ATP?"),
        kind: "basic",
        schemaVersion: 1,
      }),
    },
    {
      back: "Mitochondrion",
      cardType: "typed_answer",
      front: "Which organelle produces most ATP?",
      id: "public-card-2",
      media: [],
      nonvisualFallback: "A text prompt with a typed-answer fallback",
      renderer: firstRenderer({
        acceptedAnswers: ["Mitochondrion"],
        answer: richText("Mitochondrion"),
        caseSensitive: false,
        kind: "typed_answer",
        language: "en",
        prompt: richText("Which organelle produces most ATP?"),
        schemaVersion: 1,
      }),
    },
  ],
  creator: {
    displayName: "Ari Learner",
    handle: "ari_learns",
  },
  coverMedia: null,
  description: "A published introduction to cell energy.",
  license: "cc_by",
  publicId: "public-deck-id",
  slug: "cell-energy",
  supportedCardTypes: ["basic", "typed_answer"],
  theme: "ocean",
  title: "Cell energy",
  updatedAt: NOW,
  visibility: "public",
};

function richText(text: string): RichDocument {
  return {
    attrs: { language: "en" },
    content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
    schemaVersion: 2,
    type: "doc",
  };
}

export const deckDetail: DeckDetail = {
  ...activeDeck,
  cardCount: 1,
  cards: [
    {
      active: true,
      cardType: "basic",
      generationKey: "g1:basic:forward",
      id: "0190d9f0-0000-7000-8000-000000000031",
      noteId: "0190d9f0-0000-7000-8000-000000000041",
      ordinal: 0,
      previewBack: "The cell's usable energy carrier",
      previewFront: "What is ATP?",
      renderer: {
        accessibility: {
          instructions: "Recall the answer, then reveal it.",
          nonvisualAlternative: "Question and answer text are available.",
          promptText: "What is ATP?",
        },
        answer: richText("The cell's usable energy carrier"),
        direction: "front_to_back",
        generationKey: "g1:basic:forward",
        kind: "basic",
        prompt: richText("What is ATP?"),
        schemaVersion: 1,
        semanticKey: "forward",
      },
    },
  ],
  coverAssetId: null,
  languageBack: "en",
  languageFront: "en",
  license: "all_rights_reserved",
  noteCount: 1,
  notes: [
    {
      authoringData: {
        back: richText("The cell's usable energy carrier"),
        front: richText("What is ATP?"),
        kind: "basic",
        schemaVersion: 1,
      },
      cardCount: 1,
      cardType: "basic",
      contentHash: "sha256-content-fixture",
      id: "0190d9f0-0000-7000-8000-000000000041",
      preview: "What is ATP?",
      source: "Biology 201 lecture 4",
      tags: ["cells", "energy"],
      updatedAt: NOW,
      version: 3,
    },
  ],
  publicId: "0190d9f0-0000-7000-8000-000000000021",
  publicSlug: "cell-energy",
  supportedCardTypes: ["basic"],
  theme: "neutral",
  versions: [
    {
      changeKind: "edit",
      createdAt: NOW,
      createdByLabel: "Ari Learner",
      deckVersion: 4,
      diffFromCurrent: { added: 0, changed: 0, changes: [], removed: 0 },
      id: "0190d9f0-0000-7000-8000-000000000051",
      summary: "Updated one note",
    },
    {
      changeKind: "create",
      createdAt: "2026-07-15T15:00:00.000Z",
      createdByLabel: "Ari Learner",
      deckVersion: 1,
      diffFromCurrent: {
        added: 1,
        changed: 0,
        changes: [
          {
            changedAreas: ["Added note"],
            current: {
              answer: "The cell's usable energy carrier",
              cardType: "basic",
              prompt: "What is ATP?",
              source: "Biology 201 lecture 4",
              tags: ["cells", "energy"],
            },
            kind: "added",
            noteId: "0190d9f0-0000-7000-8000-000000000041",
            version: null,
          },
        ],
        removed: 0,
      },
      id: "0190d9f0-0000-7000-8000-000000000052",
      summary: "Created deck",
    },
  ],
  visibility: "public",
};
