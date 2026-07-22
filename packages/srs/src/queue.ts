import { retrievability } from "./scheduler";
import type { QueueCandidate, QueuedCard, QueueOptions, QueueResult, ReviewOrder } from "./types";

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function randomRank(seed: string, id: string): number {
  let state = hashSeed(`${seed}:${id}`) || 1;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

function relativeOverdueness(card: QueueCandidate, nowMs: number): number {
  const overdueDays = Math.max(0, (nowMs - new Date(card.due).getTime()) / 86_400_000);
  return overdueDays / Math.max(1, card.intervalDays ?? 1);
}

function orderReviews(
  cards: QueuedCard[],
  order: ReviewOrder,
  nowMs: number,
  seed: string,
): QueuedCard[] {
  return cards.sort((left, right) => {
    if (order === "random") return randomRank(seed, left.cardId) - randomRank(seed, right.cardId);
    if (order === "relative_overdueness") {
      return (
        relativeOverdueness(right, nowMs) - relativeOverdueness(left, nowMs) ||
        left.cardId.localeCompare(right.cardId)
      );
    }
    if (order === "retrievability") {
      const leftValue = retrievability(
        {
          algorithm: left.algorithm ?? "fsrs",
          state: left.state,
          due: left.due,
          lastReviewedAt: left.lastReviewedAt ?? null,
          stability: left.stability,
          difficulty: left.difficulty ?? (left.stability === null ? null : 5),
          elapsedDays: 0,
          scheduledDays: left.intervalDays ?? 0,
          learningStep: 0,
          reps: 1,
          lapses: left.lapses ?? 0,
          legacyEaseFactor: left.algorithm === "sm2" ? 2_500 : null,
          schedulerVersion: "queue-estimate",
        },
        new Date(nowMs),
      );
      const rightValue = retrievability(
        {
          algorithm: right.algorithm ?? "fsrs",
          state: right.state,
          due: right.due,
          lastReviewedAt: right.lastReviewedAt ?? null,
          stability: right.stability,
          difficulty: right.difficulty ?? (right.stability === null ? null : 5),
          elapsedDays: 0,
          scheduledDays: right.intervalDays ?? 0,
          learningStep: 0,
          reps: 1,
          lapses: right.lapses ?? 0,
          legacyEaseFactor: right.algorithm === "sm2" ? 2_500 : null,
          schedulerVersion: "queue-estimate",
        },
        new Date(nowMs),
      );
      return (leftValue ?? 1) - (rightValue ?? 1) || left.cardId.localeCompare(right.cardId);
    }
    return (
      new Date(left.due).getTime() - new Date(right.due).getTime() ||
      left.cardId.localeCompare(right.cardId)
    );
  });
}

function matchesCustomFilter(card: QueueCandidate, options: QueueOptions, nowMs: number): boolean {
  if (options.tagQuery?.length && !options.tagQuery.every((tag) => card.tags?.includes(tag)))
    return false;
  if (options.stateFilter?.length && !options.stateFilter.includes(card.state)) return false;
  if (options.intervalRangeDays) {
    const interval = card.intervalDays ?? 0;
    if (interval < options.intervalRangeDays.min || interval > options.intervalRangeDays.max)
      return false;
  }

  switch (options.mode ?? "today") {
    case "new_only":
      return card.state === "new";
    case "due_only":
      return card.state !== "new" && new Date(card.due).getTime() <= nowMs;
    case "forgotten_today":
      return card.forgottenToday === true;
    case "leeches":
      return card.leech === true || (card.lapses ?? 0) >= options.preset.leechThreshold;
    case "starred":
      return card.starred === true;
    case "review_ahead":
      return (
        card.state !== "new" &&
        new Date(card.due).getTime() <= nowMs + (options.reviewAheadDays ?? 1) * 86_400_000
      );
    case "cram":
      return true;
    case "tag_query":
    case "interval_range":
    case "card_state":
      return true;
    case "folder":
    case "today":
      return card.state === "new" || new Date(card.due).getTime() <= nowMs;
  }
}

function mixCards(
  learning: QueuedCard[],
  reviews: QueuedCard[],
  newCards: QueuedCard[],
  options: QueueOptions,
): QueuedCard[] {
  if (options.preset.newReviewMix === "before") return [...learning, ...newCards, ...reviews];
  if (options.preset.newReviewMix === "after") return [...learning, ...reviews, ...newCards];

  const mixed: QueuedCard[] = [...learning];
  const count = Math.max(reviews.length, newCards.length);
  for (let index = 0; index < count; index += 1) {
    const review = reviews[index];
    const newCard = newCards[index];
    if (review) mixed.push(review);
    if (newCard) mixed.push(newCard);
  }
  return mixed;
}

export function buildDueQueue(
  candidates: readonly QueueCandidate[],
  options: QueueOptions,
): QueueResult {
  const now = options.now instanceof Date ? options.now : new Date(options.now);
  if (Number.isNaN(now.getTime())) throw new Error("Queue time must be a valid date.");
  const nowMs = now.getTime();
  const excluded = { inactive: 0, suspended: 0, buried: 0, future: 0, sibling: 0 };
  const selectedNotes = new Set<string>();
  const eligible: QueuedCard[] = [];

  const stableInput = [...candidates].sort((left, right) =>
    left.cardId.localeCompare(right.cardId),
  );
  for (const card of stableInput) {
    if (!card.active) {
      excluded.inactive += 1;
      continue;
    }
    if (card.suspended) {
      excluded.suspended += 1;
      continue;
    }
    if (card.buriedUntil && new Date(card.buriedUntil).getTime() > nowMs) {
      excluded.buried += 1;
      continue;
    }
    if (!matchesCustomFilter(card, options, nowMs)) {
      excluded.future += 1;
      continue;
    }
    if (options.preset.burySiblings && selectedNotes.has(card.noteId)) {
      excluded.sibling += 1;
      continue;
    }
    selectedNotes.add(card.noteId);
    eligible.push({
      ...card,
      kind:
        card.state === "new"
          ? "new"
          : card.state === "learning" || card.state === "relearning"
            ? "learning"
            : "review",
      rescheduling: options.rescheduling ?? (options.mode ?? "today") === "today",
    });
  }

  const learning = eligible
    .filter((card) => card.kind === "learning")
    .sort(
      (left, right) =>
        new Date(left.due).getTime() - new Date(right.due).getTime() ||
        left.cardId.localeCompare(right.cardId),
    );
  const unlimitedCustomModes = new Set([
    "card_state",
    "cram",
    "forgotten_today",
    "interval_range",
    "leeches",
    "review_ahead",
    "starred",
    "tag_query",
  ]);
  const ignoreDailyLimits = unlimitedCustomModes.has(options.mode ?? "today");
  const reviewLimit = ignoreDailyLimits
    ? Number.POSITIVE_INFINITY
    : Math.max(0, options.preset.reviewsPerDay - options.alreadyStudiedReviews);
  const reviews = orderReviews(
    eligible.filter((card) => card.kind === "review"),
    options.reviewOrderOverride ?? options.preset.reviewOrder,
    nowMs,
    options.seed,
  ).slice(0, reviewLimit);
  const newLimit = ignoreDailyLimits
    ? Number.POSITIVE_INFINITY
    : Math.max(0, options.preset.newCardsPerDay - options.alreadyStudiedNew);
  const newCards = eligible.filter((card) => card.kind === "new");
  newCards.sort((left, right) => {
    if (options.preset.newCardOrder === "random")
      return randomRank(options.seed, left.cardId) - randomRank(options.seed, right.cardId);
    if (options.preset.newCardOrder === "due") {
      const orderDifference =
        (left.dueOrder ?? Number.POSITIVE_INFINITY) - (right.dueOrder ?? Number.POSITIVE_INFINITY);
      if (orderDifference !== 0) return orderDifference;
    }
    const field = options.preset.newCardOrder === "due" ? "due" : "createdAt";
    return (
      new Date(left[field]).getTime() - new Date(right[field]).getTime() ||
      left.cardId.localeCompare(right.cardId)
    );
  });
  const limitedNew = newCards.slice(0, newLimit);
  const cards = mixCards(learning, reviews, limitedNew, options);

  return {
    cards,
    counts: {
      learning: learning.length,
      review: reviews.length,
      new: limitedNew.length,
      total: cards.length,
    },
    excluded,
  };
}
