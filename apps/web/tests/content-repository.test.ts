// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createNextServerDatabaseClient: mocks.createClient,
}));

import { readDeckDetail, readLibrarySnapshot } from "../lib/server/content-repository";

type FakeRow = Readonly<Record<string, unknown>>;
interface FakeResult {
  readonly data: readonly FakeRow[];
  readonly error: null;
}

class FakeQuery implements PromiseLike<FakeResult> {
  readonly equalFilters = new Map<string, unknown>();
  readonly inFilters = new Map<string, readonly unknown[]>();
  readonly isFilters = new Map<string, unknown>();
  readonly notEqualFilters = new Map<string, unknown>();
  limitValue: number | null = null;

  constructor(
    readonly table: string,
    private readonly source: readonly FakeRow[],
  ) {}

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.equalFilters.set(column, value);
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.inFilters.set(column, values);
    return this;
  }

  is(column: string, value: unknown): this {
    this.isFilters.set(column, value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.notEqualFilters.set(column, value);
    return this;
  }

  order(_column: string, _options?: Readonly<Record<string, unknown>>): this {
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  async maybeSingle(): Promise<{ data: FakeRow | null; error: null }> {
    return { data: this.filtered()[0] ?? null, error: null };
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.filtered(), error: null } as const).then(
      onfulfilled,
      onrejected,
    );
  }

  private filtered(): readonly FakeRow[] {
    const filtered = this.source.filter((candidate) => {
      for (const [column, value] of this.equalFilters) {
        if (candidate[column] !== value) return false;
      }
      for (const [column, values] of this.inFilters) {
        if (!values.includes(candidate[column])) return false;
      }
      for (const [column, value] of this.isFilters) {
        if (candidate[column] !== value) return false;
      }
      for (const [column, value] of this.notEqualFilters) {
        if (candidate[column] === value) return false;
      }
      return true;
    });
    return this.limitValue === null ? filtered : filtered.slice(0, this.limitValue);
  }
}

function uuid(index: number): string {
  return `0190d9f0-2000-7000-8000-${String(index).padStart(12, "0")}`;
}

function richText(text: string) {
  return {
    attrs: { language: "en" },
    content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
    schemaVersion: 2,
    type: "doc",
  };
}

function clientFixture(
  tables: Readonly<Record<string, readonly FakeRow[]>>,
  counts: FakeRow,
): { client: unknown; queries: FakeQuery[] } {
  const queries: FakeQuery[] = [];
  return {
    client: {
      from(table: string) {
        const query = new FakeQuery(table, tables[table] ?? []);
        queries.push(query);
        return query;
      },
      rpc: vi.fn().mockResolvedValue({ data: [counts], error: null }),
    },
    queries,
  };
}

describe("content repository query bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bounds a 260-deck library and scopes dependent rows to the viewer and visible IDs", async () => {
    const accountId = uuid(900);
    const attackerId = uuid(901);
    const decks = Array.from({ length: 260 }, (_, index) => ({
      card_count: index + 1,
      description_plain: `Deck ${String(index + 1)}`,
      id: uuid(index + 1),
      note_count: index + 1,
      owner_account_id: uuid(800),
      public_id: null,
      published_version: null,
      slug: `deck-${String(index + 1)}`,
      status: "active",
      title: `Deck ${String(index + 1)}`,
      updated_at: new Date(2_000_000_000_000 - index * 1_000).toISOString(),
      version: 1,
      visibility: "private",
    }));
    const fixture = clientFixture(
      {
        deck_members: decks.flatMap((deck) => [
          { account_id: accountId, deck_id: deck.id, revoked_at: null, role: "editor" },
          { account_id: attackerId, deck_id: deck.id, revoked_at: null, role: "manager" },
        ]),
        decks,
        folder_items: decks.map((deck) => ({
          deck_id: deck.id,
          deleted_at: null,
          folder_id: uuid(700),
        })),
        folders: [
          {
            created_at: "2026-07-16T00:00:00.000Z",
            id: uuid(700),
            name: "Large library",
            parent_id: null,
            position: 0,
            status: "active",
            updated_at: "2026-07-16T00:00:00.000Z",
            version: 1,
          },
        ],
      },
      { active_decks: 260, archived_decks: 0, cards: 33_930, folders: 1, notes: 33_930 },
    );
    mocks.createClient.mockResolvedValue(fixture.client);

    const snapshot = await readLibrarySnapshot(accountId);

    expect(snapshot.decks).toHaveLength(200);
    expect(snapshot.counts.activeDecks).toBe(260);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.decks[0]?.role).toBe("editor");
    expect(fixture.queries.find((query) => query.table === "decks")?.limitValue).toBe(201);
    expect(fixture.queries.find((query) => query.table === "folders")?.limitValue).toBe(501);
    const folderItems = fixture.queries.find((query) => query.table === "folder_items");
    expect(folderItems?.inFilters.get("deck_id")).toHaveLength(200);
    expect(folderItems?.limitValue).toBe(200);
    const members = fixture.queries.find((query) => query.table === "deck_members");
    expect(members?.equalFilters.get("account_id")).toBe(accountId);
    expect(members?.inFilters.get("deck_id")).toHaveLength(200);
    expect(members?.limitValue).toBe(200);
  });

  it("scopes detail membership and tags and derives exact snapshot note diffs", async () => {
    const accountId = uuid(910);
    const attackerId = uuid(911);
    const deckId = uuid(920);
    const noteOne = uuid(930);
    const noteTwo = uuid(931);
    const noteThree = uuid(932);
    const tagId = uuid(940);
    const payload = {
      back: richText("Answer"),
      front: richText("Prompt"),
      kind: "basic",
      schemaVersion: 1,
    };
    const fixture = clientFixture(
      {
        cards: [],
        deck_members: [
          { account_id: accountId, deck_id: deckId, revoked_at: null, role: "editor" },
          { account_id: attackerId, deck_id: deckId, revoked_at: null, role: "manager" },
        ],
        deck_versions: [
          {
            change_kind: "edit",
            content_snapshot: {
              notes: [
                { contentHash: "old-one", id: noteOne },
                { contentHash: "old-two", id: noteTwo },
              ],
              schemaVersion: 1,
            },
            created_at: "2026-07-15T00:00:00.000Z",
            created_by: accountId,
            deck_id: deckId,
            id: uuid(950),
            summary: "Earlier content",
            version_number: 1,
          },
        ],
        decks: [
          {
            card_count: 0,
            cover_asset_id: null,
            description_plain: "Scoped detail",
            id: deckId,
            language_back: "en",
            language_front: "en",
            license: "all_rights_reserved",
            note_count: 2,
            owner_account_id: uuid(999),
            public_id: null,
            published_version: null,
            slug: "scoped-detail",
            status: "active",
            theme: "neutral",
            title: "Scoped detail",
            updated_at: "2026-07-16T00:00:00.000Z",
            version: 2,
            visibility: "private",
          },
        ],
        folder_items: [],
        note_tags: [
          { deleted_at: null, note_id: noteOne, tag_id: tagId },
          { deleted_at: null, note_id: uuid(998), tag_id: tagId },
        ],
        notes: [
          {
            card_payload: payload,
            content_hash: "current-one",
            deck_id: deckId,
            deleted_at: null,
            id: noteOne,
            source_reference: "Biology 201 lecture 4",
            sort_text: "Prompt one",
            updated_at: "2026-07-16T00:00:00.000Z",
            version: 2,
          },
          {
            card_payload: payload,
            content_hash: "current-three",
            deck_id: deckId,
            deleted_at: null,
            id: noteThree,
            sort_text: "Prompt three",
            updated_at: "2026-07-16T00:00:00.000Z",
            version: 1,
          },
        ],
        tags: [{ deck_id: deckId, deleted_at: null, id: tagId, name: "energy" }],
      },
      { active_decks: 1, archived_decks: 0, cards: 0, folders: 0, notes: 2 },
    );
    mocks.createClient.mockResolvedValue(fixture.client);

    const detail = await readDeckDetail(deckId, accountId);

    expect(detail?.role).toBe("editor");
    expect(detail?.notes.find((note) => note.id === noteOne)?.source).toBe("Biology 201 lecture 4");
    expect(detail?.notes.find((note) => note.id === noteOne)?.tags).toEqual(["energy"]);
    expect(detail?.versions[0]?.diffFromCurrent).toEqual({ added: 1, changed: 1, removed: 1 });
    const memberQuery = fixture.queries.find((query) => query.table === "deck_members");
    expect(memberQuery?.equalFilters.get("account_id")).toBe(accountId);
    const noteTags = fixture.queries.find((query) => query.table === "note_tags");
    expect(noteTags?.inFilters.get("note_id")).toEqual([noteOne, noteThree]);
  });
});
