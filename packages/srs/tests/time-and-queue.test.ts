import { describe, expect, it } from "vitest";

import {
  DEFAULT_FSRS_PRESET,
  buildDueQueue,
  nextStudyDayBoundary,
  studyDayBoundaryFor,
  studyDayFor,
  type QueueCandidate,
} from "../src";

describe("study days", () => {
  const options = { timezone: "America/Chicago", studyDayStartMinutes: 240 };

  it("honors the cutoff through daylight-saving transitions", () => {
    expect(studyDayFor("2026-03-08T08:30:00.000Z", options)).toBe("2026-03-07");
    expect(studyDayFor("2026-03-08T10:30:00.000Z", options)).toBe("2026-03-08");
    expect(studyDayFor("2026-11-01T08:30:00.000Z", options)).toBe("2026-10-31");
    expect(studyDayFor("2026-11-01T10:30:00.000Z", options)).toBe("2026-11-01");
  });

  it("finds the next local study-day boundary", () => {
    expect(nextStudyDayBoundary("2026-03-08T08:30:00.000Z", options).toISOString()).toBe(
      "2026-03-08T09:00:00.000Z",
    );
  });

  it("resolves named study-day boundaries without flattening DST", () => {
    expect(studyDayBoundaryFor("2026-03-08", options).toISOString()).toBe(
      "2026-03-08T09:00:00.000Z",
    );
    expect(studyDayBoundaryFor("2026-11-01", options).toISOString()).toBe(
      "2026-11-01T10:00:00.000Z",
    );
  });
});

describe("due queue", () => {
  const now = "2026-07-21T15:00:00.000Z";
  const candidate = (overrides: Partial<QueueCandidate>): QueueCandidate => ({
    cardId: "card-1",
    noteId: "note-1",
    deckId: "deck-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    due: now,
    state: "review",
    stability: 4,
    lastReviewedAt: "2026-07-17T15:00:00.000Z",
    suspended: false,
    buriedUntil: null,
    active: true,
    intervalDays: 4,
    ...overrides,
  });

  it("honors daily limits, excludes unsafe cards, and separates siblings", () => {
    const queue = buildDueQueue(
      [
        candidate({}),
        candidate({ cardId: "card-2", noteId: "note-1" }),
        candidate({ cardId: "card-3", noteId: "note-3", state: "new" }),
        candidate({ cardId: "card-4", noteId: "note-4", suspended: true }),
        candidate({ cardId: "card-5", noteId: "note-5", active: false }),
        candidate({ cardId: "card-6", noteId: "note-6", buriedUntil: "2026-07-22T15:00:00.000Z" }),
      ],
      {
        now,
        studyDay: "2026-07-21",
        preset: { ...DEFAULT_FSRS_PRESET, newCardsPerDay: 1, reviewsPerDay: 1 },
        alreadyStudiedNew: 0,
        alreadyStudiedReviews: 0,
        seed: "stable-session",
      },
    );
    expect(queue.counts).toEqual({ learning: 0, review: 1, new: 1, total: 2 });
    expect(queue.excluded).toMatchObject({ inactive: 1, suspended: 1, buried: 1, sibling: 1 });
  });

  it("makes custom preview sessions non-rescheduling and deterministic", () => {
    const input = [
      candidate({ cardId: "a", noteId: "a", starred: true }),
      candidate({ cardId: "b", noteId: "b", starred: true }),
      candidate({ cardId: "c", noteId: "c", starred: false }),
    ];
    const options = {
      now,
      studyDay: "2026-07-21",
      preset: { ...DEFAULT_FSRS_PRESET, reviewOrder: "random" as const },
      alreadyStudiedNew: 0,
      alreadyStudiedReviews: 0,
      seed: "same-seed",
      mode: "starred" as const,
      rescheduling: false,
    };
    const first = buildDueQueue(input, options);
    expect(first.cards).toHaveLength(2);
    expect(first.cards.every((card) => !card.rescheduling)).toBe(true);
    expect(buildDueQueue(input, options)).toEqual(first);
  });

  it("supports evidence-backed tag, interval, state, forgotten, and leech filters", () => {
    const input = [
      candidate({ cardId: "tagged", noteId: "tagged", tags: ["biology"], intervalDays: 12 }),
      candidate({ cardId: "forgotten", noteId: "forgotten", forgottenToday: true }),
      candidate({ cardId: "leech", noteId: "leech", leech: true }),
      candidate({ cardId: "learning", noteId: "learning", state: "relearning" }),
    ];
    const base = {
      alreadyStudiedNew: 20,
      alreadyStudiedReviews: 200,
      now,
      preset: { ...DEFAULT_FSRS_PRESET, newCardsPerDay: 0, reviewsPerDay: 0 },
      rescheduling: false,
      seed: "filter-seed",
      studyDay: "2026-07-21",
    };

    expect(
      buildDueQueue(input, { ...base, mode: "tag_query", tagQuery: ["biology"] }).cards.map(
        (card) => card.cardId,
      ),
    ).toEqual(["tagged"]);
    expect(
      buildDueQueue(input, {
        ...base,
        intervalRangeDays: { min: 10, max: 20 },
        mode: "interval_range",
      }).cards.map((card) => card.cardId),
    ).toEqual(["tagged"]);
    expect(
      buildDueQueue(input, { ...base, mode: "card_state", stateFilter: ["relearning"] }).cards.map(
        (card) => card.cardId,
      ),
    ).toEqual(["learning"]);
    expect(
      buildDueQueue(input, { ...base, mode: "forgotten_today" }).cards.map((card) => card.cardId),
    ).toEqual(["forgotten"]);
    expect(
      buildDueQueue(input, { ...base, mode: "leeches" }).cards.map((card) => card.cardId),
    ).toEqual(["leech"]);
  });

  it("covers Today, New, Due, review-ahead, cram, and starred selections", () => {
    const input = [
      candidate({ cardId: "new", noteId: "new", state: "new" }),
      candidate({ cardId: "due", noteId: "due" }),
      candidate({
        cardId: "future",
        due: "2026-07-22T14:00:00.000Z",
        noteId: "future",
        starred: true,
      }),
    ];
    const base = {
      alreadyStudiedNew: 0,
      alreadyStudiedReviews: 0,
      now,
      preset: DEFAULT_FSRS_PRESET,
      seed: "mode-matrix",
      studyDay: "2026-07-21",
    };
    expect(
      buildDueQueue(input, { ...base, mode: "today" }).cards.map((card) => card.cardId),
    ).toEqual(["due", "new"]);
    expect(
      buildDueQueue(input, { ...base, mode: "new_only" }).cards.map((card) => card.cardId),
    ).toEqual(["new"]);
    expect(
      buildDueQueue(input, { ...base, mode: "due_only" }).cards.map((card) => card.cardId),
    ).toEqual(["due"]);
    expect(
      buildDueQueue(input, { ...base, mode: "review_ahead" }).cards.map((card) => card.cardId),
    ).toEqual(["due", "future"]);
    expect(buildDueQueue(input, { ...base, mode: "cram", rescheduling: false }).cards).toHaveLength(
      3,
    );
    expect(
      buildDueQueue(input, { ...base, mode: "starred", rescheduling: false }).cards.map(
        (card) => card.cardId,
      ),
    ).toEqual(["future"]);
  });

  it("honors explicit New due order and deterministic review-order overrides", () => {
    const newQueue = buildDueQueue(
      [
        candidate({ cardId: "new-later", noteId: "new-later", state: "new", dueOrder: 20 }),
        candidate({ cardId: "new-first", noteId: "new-first", state: "new", dueOrder: 1 }),
      ],
      {
        alreadyStudiedNew: 0,
        alreadyStudiedReviews: 0,
        now,
        preset: { ...DEFAULT_FSRS_PRESET, newCardOrder: "due" },
        seed: "due-order",
        studyDay: "2026-07-21",
      },
    );
    expect(newQueue.cards.map((card) => card.cardId)).toEqual(["new-first", "new-later"]);

    const reviews = [
      candidate({ cardId: "review-a", noteId: "review-a", due: "2026-07-10T15:00:00.000Z" }),
      candidate({ cardId: "review-b", noteId: "review-b", due: "2026-07-20T15:00:00.000Z" }),
    ];
    const options = {
      alreadyStudiedNew: 0,
      alreadyStudiedReviews: 0,
      now,
      preset: DEFAULT_FSRS_PRESET,
      reviewOrderOverride: "relative_overdueness" as const,
      seed: "review-override",
      studyDay: "2026-07-21",
    };
    expect(buildDueQueue(reviews, options).cards.map((card) => card.cardId)).toEqual([
      "review-a",
      "review-b",
    ]);
    expect(buildDueQueue(reviews, { ...options, reviewOrderOverride: "random" })).toEqual(
      buildDueQueue(reviews, { ...options, reviewOrderOverride: "random" }),
    );
  });

  it("constructs typical and large deterministic domain queues within local budgets", () => {
    const candidates = Array.from({ length: 10_000 }, (_, index) =>
      candidate({
        cardId: `card-${index.toString().padStart(5, "0")}`,
        noteId: `note-${index.toString().padStart(5, "0")}`,
      }),
    );
    const options = {
      alreadyStudiedNew: 0,
      alreadyStudiedReviews: 0,
      now,
      preset: { ...DEFAULT_FSRS_PRESET, reviewsPerDay: 10_000 },
      seed: "performance-seed",
      studyDay: "2026-07-21",
    };
    const typicalStarted = performance.now();
    expect(buildDueQueue(candidates.slice(0, 200), options).cards).toHaveLength(200);
    const typicalMilliseconds = performance.now() - typicalStarted;
    const largeStarted = performance.now();
    expect(buildDueQueue(candidates, options).cards).toHaveLength(10_000);
    const largeMilliseconds = performance.now() - largeStarted;
    process.stdout.write(
      `SRS_DOMAIN_QUEUE_200_MS=${typicalMilliseconds.toFixed(3)} SRS_DOMAIN_QUEUE_10000_MS=${largeMilliseconds.toFixed(3)}\n`,
    );
    expect(typicalMilliseconds).toBeLessThan(250);
    expect(largeMilliseconds).toBeLessThan(1_000);
  });
});
