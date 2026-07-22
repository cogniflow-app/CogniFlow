import "server-only";

import {
  DEFAULT_FSRS_PRESET,
  buildDueQueue,
  retrievability,
  studyDayFor,
  type QueueCandidate,
  type QueueOptions,
  type QueueResult,
  type SchedulerPreset,
} from "@lumen/srs";
import { cache } from "react";

import type {
  ReviewCardView,
  StudyDashboardSnapshot,
  StudyDeckRow,
  StudyStatistics,
} from "@/lib/study/models";
import { studyFilterDefinitionSchema } from "@/lib/study/custom-filter";
import { presetFromDatabase, scheduleFromDatabase } from "@/lib/study/srs-mapping";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

import { readDeckDetail, readLibrarySnapshot } from "./content-repository";
import { readAllForIds, readAllPages } from "./paginated-query";

type UnknownRow = Readonly<Record<string, unknown>>;

function rows(value: unknown): UnknownRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is UnknownRow => typeof item === "object" && item !== null)
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function record(value: unknown): UnknownRow {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRow)
    : {};
}

export interface StudyQueueRequest {
  readonly deckId?: string | undefined;
  readonly deckIds?: readonly string[] | undefined;
  readonly intervalRangeDays?: { readonly max: number; readonly min: number } | undefined;
  readonly mode: NonNullable<QueueOptions["mode"]>;
  readonly rescheduling: boolean;
  readonly reviewOrder?: QueueOptions["reviewOrderOverride"];
  readonly seed: string;
  readonly stateFilter?: QueueOptions["stateFilter"];
  readonly tagQuery?: readonly string[] | undefined;
}

export interface StudyQueuePlan {
  readonly cards: readonly QueueResult["cards"][number][];
  readonly counts: QueueResult["counts"];
}

interface StudyUniverse {
  readonly candidatesByDeck: ReadonlyMap<string, readonly QueueCandidate[]>;
  readonly deckNames: ReadonlyMap<string, string>;
  readonly completedToday: number;
  readonly folders: readonly {
    readonly deckIds: readonly string[];
    readonly id: string;
    readonly name: string;
  }[];
  readonly presetsByDeck: ReadonlyMap<string, SchedulerPreset>;
  readonly savedFilters: StudyDashboardSnapshot["savedFilters"];
  readonly studiedNewByDeck: ReadonlyMap<string, number>;
  readonly studiedReviewsByDeck: ReadonlyMap<string, number>;
  readonly tags: readonly string[];
}

async function readUniverse(
  accountId: string,
  learnerProfileId: string,
  studyDay: string,
): Promise<StudyUniverse> {
  const client = await createNextServerDatabaseClient();
  const library = await readLibrarySnapshot(accountId);
  const decks = library.decks.filter((deck) => deck.status === "active");
  const deckIds = decks.map((deck) => deck.id);
  if (deckIds.length === 0) {
    return {
      candidatesByDeck: new Map(),
      completedToday: 0,
      deckNames: new Map(),
      folders: [],
      presetsByDeck: new Map(),
      savedFilters: [],
      studiedNewByDeck: new Map(),
      studiedReviewsByDeck: new Map(),
      tags: [],
    };
  }
  const [notes, presets, settings, reviews, filters] = await Promise.all([
    readAllForIds(deckIds, async (ids, from, to) => {
      const result = await client
        .from("notes")
        .select("id,deck_id,sort_text")
        .in("deck_id", ids)
        .is("deleted_at", null)
        .order("id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    readAllPages(async (from, to) => {
      const result = await client
        .from("srs_presets")
        .select("*")
        .eq("learner_profile_id", learnerProfileId)
        .is("deleted_at", null)
        .order("id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    readAllPages(async (from, to) => {
      const result = await client
        .from("deck_srs_settings")
        .select("deck_id,preset_id")
        .eq("learner_profile_id", learnerProfileId)
        .order("deck_id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    readAllPages(async (from, to) => {
      const result = await client
        .from("review_logs")
        .select("id,card_id,deck_id,rating,schedule_before")
        .eq("learner_profile_id", learnerProfileId)
        .eq("study_day", studyDay)
        .order("id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    readAllPages(async (from, to) => {
      const result = await client
        .from("study_filters")
        .select("id,name,definition,version")
        .eq("learner_profile_id", learnerProfileId)
        .is("deleted_at", null)
        .order("name")
        .order("id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
  ]).catch(() => {
    throw new Error("STUDY_UNIVERSE_UNAVAILABLE");
  });
  const noteIds = notes.map((note) => text(note.id));
  const noteDeck = new Map(notes.map((note) => [text(note.id), text(note.deck_id)]));
  const noteLabel = new Map(notes.map((note) => [text(note.id), text(note.sort_text)]));
  const [cards, tagLinks] = await Promise.all([
    readAllForIds(noteIds, async (ids, from, to) => {
      const result = await client
        .from("cards")
        .select("id,note_id,created_at,content_version,active")
        .in("note_id", ids)
        .is("deleted_at", null)
        .order("id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    readAllForIds(noteIds, async (ids, from, to) => {
      const result = await client
        .from("note_tags")
        .select("note_id,tag_id")
        .in("note_id", ids)
        .is("deleted_at", null)
        .order("note_id")
        .order("tag_id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
  ]).catch(() => {
    throw new Error("STUDY_CARDS_UNAVAILABLE");
  });
  const cardIds = cards.map((card) => text(card.id));
  const tagIds = tagLinks.map((link) => text(link.tag_id));
  const [scheduleRows, tagRows] = await Promise.all([
    readAllForIds(cardIds, async (ids, from, to) => {
      const result = await client
        .from("card_schedules")
        .select("*")
        .eq("learner_profile_id", learnerProfileId)
        .in("card_id", ids)
        .order("card_id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    readAllForIds(tagIds, async (ids, from, to) => {
      const result = await client
        .from("tags")
        .select("id,name")
        .in("id", ids)
        .is("deleted_at", null)
        .order("id")
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
  ]).catch(() => {
    throw new Error("STUDY_SCHEDULES_UNAVAILABLE");
  });
  const scheduleByCard = new Map(
    scheduleRows.map((schedule) => [text(schedule.card_id), schedule]),
  );
  const tagNameById = new Map(tagRows.map((tag) => [text(tag.id), text(tag.name)]));
  const tagsByNote = new Map<string, string[]>();
  for (const link of tagLinks) {
    const name = tagNameById.get(text(link.tag_id));
    const noteId = text(link.note_id);
    if (name) tagsByNote.set(noteId, [...(tagsByNote.get(noteId) ?? []), name]);
  }
  const candidatesByDeck = new Map<string, QueueCandidate[]>();
  const forgottenToday = new Set(
    reviews
      .filter((review) => text(review.rating) === "again")
      .map((review) => text(review.card_id)),
  );
  for (const card of cards) {
    const cardId = text(card.id);
    const noteId = text(card.note_id);
    const deckId = noteDeck.get(noteId);
    if (!deckId) continue;
    const stored = scheduleByCard.get(cardId);
    const schedule = scheduleFromDatabase(stored);
    const target = candidatesByDeck.get(deckId) ?? [];
    target.push({
      active: card.active === true,
      algorithm: schedule?.algorithm ?? "fsrs",
      buriedUntil: stored ? text(stored.buried_until) || null : null,
      cardId,
      createdAt: text(card.created_at),
      deckId,
      due: schedule?.due ?? text(card.created_at),
      dueOrder: stored ? number(stored.due_order) : null,
      difficulty: schedule?.difficulty ?? null,
      intervalDays: schedule?.scheduledDays ?? 0,
      label: noteLabel.get(noteId) || "Card",
      forgottenToday: forgottenToday.has(cardId),
      lapses: schedule?.lapses ?? 0,
      lastReviewedAt: schedule?.lastReviewedAt ?? null,
      noteId,
      scheduleVersion: stored ? number(stored.version) : 0,
      stability: schedule?.stability ?? null,
      leech: stored?.leech === true,
      starred: stored?.starred === true,
      state: schedule?.state ?? "new",
      suspended: stored?.suspended === true,
      tags: tagsByNote.get(noteId) ?? [],
    });
    candidatesByDeck.set(deckId, target);
  }
  const presetById = new Map(
    presets.map((preset) => [text(preset.id), presetFromDatabase(preset)]),
  );
  const defaultPreset = presets.find((preset) => preset.is_default === true);
  const defaultValue = presetFromDatabase(defaultPreset);
  const settingByDeck = new Map(
    settings.map((setting) => [text(setting.deck_id), text(setting.preset_id)]),
  );
  const presetsByDeck = new Map(
    deckIds.map((deckId) => [
      deckId,
      presetById.get(settingByDeck.get(deckId) ?? "") ?? defaultValue,
    ]),
  );
  const studiedNewByDeck = new Map<string, number>();
  const studiedReviewsByDeck = new Map<string, number>();
  for (const review of reviews) {
    const deckId = text(review.deck_id);
    const state = text(record(review.schedule_before).state);
    if (state === "new") studiedNewByDeck.set(deckId, (studiedNewByDeck.get(deckId) ?? 0) + 1);
    else if (state === "review")
      studiedReviewsByDeck.set(deckId, (studiedReviewsByDeck.get(deckId) ?? 0) + 1);
  }
  const folderParent = new Map(library.folders.map((folder) => [folder.id, folder.parentId]));
  const folderContains = (candidateId: string | null, targetId: string): boolean => {
    let current = candidateId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (current === targetId) return true;
      visited.add(current);
      current = folderParent.get(current) ?? null;
    }
    return false;
  };
  return {
    candidatesByDeck,
    completedToday: reviews.length,
    deckNames: new Map(decks.map((deck) => [deck.id, deck.title])),
    folders: library.folders
      .map((folder) => ({
        deckIds: decks
          .filter((deck) => folderContains(deck.folderId, folder.id))
          .map((deck) => deck.id)
          .sort(),
        id: folder.id,
        name: folder.name,
      }))
      .filter((folder) => folder.deckIds.length > 0),
    presetsByDeck,
    savedFilters: filters.flatMap((filter) => {
      const definition = studyFilterDefinitionSchema.safeParse(filter.definition);
      return definition.success
        ? [
            {
              definition: definition.data,
              id: text(filter.id),
              name: text(filter.name),
              version: number(filter.version),
            },
          ]
        : [];
    }),
    studiedNewByDeck,
    studiedReviewsByDeck,
    tags: [...new Set([...tagsByNote.values()].flat())].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

export async function buildStudyQueuePlan(
  accountId: string,
  learnerProfileId: string,
  timezone: string,
  studyDayStartMinutes: number,
  request: StudyQueueRequest,
  now = new Date(),
): Promise<StudyQueuePlan> {
  const studyDay = studyDayFor(now, { timezone, studyDayStartMinutes });
  const universe = await readUniverse(accountId, learnerProfileId, studyDay);
  const requestedDeckIds = request.deckId
    ? [request.deckId]
    : request.deckIds
      ? [...new Set(request.deckIds)]
      : [...universe.candidatesByDeck.keys()];
  const deckIds = requestedDeckIds.filter((deckId) => universe.candidatesByDeck.has(deckId)).sort();
  const allCards: QueueResult["cards"][number][] = [];
  let learning = 0;
  let review = 0;
  let newCount = 0;
  for (const deckId of deckIds) {
    const preset = universe.presetsByDeck.get(deckId) ?? { ...DEFAULT_FSRS_PRESET };
    const result = buildDueQueue(universe.candidatesByDeck.get(deckId) ?? [], {
      alreadyStudiedNew: universe.studiedNewByDeck.get(deckId) ?? 0,
      alreadyStudiedReviews: universe.studiedReviewsByDeck.get(deckId) ?? 0,
      ...(request.intervalRangeDays
        ? {
            intervalRangeDays: {
              max: request.intervalRangeDays.max,
              min: request.intervalRangeDays.min,
            },
          }
        : {}),
      mode: request.mode,
      now,
      preset,
      rescheduling: request.rescheduling,
      ...(request.reviewOrder ? { reviewOrderOverride: request.reviewOrder } : {}),
      seed: `${request.seed}:${deckId}`,
      ...(request.stateFilter ? { stateFilter: [...request.stateFilter] } : {}),
      studyDay,
      ...(request.tagQuery ? { tagQuery: [...request.tagQuery] } : {}),
    });
    allCards.push(...result.cards);
    learning += result.counts.learning;
    review += result.counts.review;
    newCount += result.counts.new;
  }
  return {
    cards: Object.freeze(allCards),
    counts: { learning, review, new: newCount, total: allCards.length },
  };
}

export const readStudyDashboard = cache(
  async (
    accountId: string,
    learnerProfileId: string,
    timezone: string,
    studyDayStartMinutes: number,
  ): Promise<StudyDashboardSnapshot> => {
    const now = new Date();
    const studyDay = studyDayFor(now, { timezone, studyDayStartMinutes });
    const universe = await readUniverse(accountId, learnerProfileId, studyDay);
    const decks: StudyDeckRow[] = [];
    for (const [deckId, candidates] of universe.candidatesByDeck) {
      const available = candidates.filter(
        (card) =>
          card.active &&
          !card.suspended &&
          (!card.buriedUntil || new Date(card.buriedUntil) <= now),
      );
      decks.push({
        buried: candidates.filter((card) => card.buriedUntil && new Date(card.buriedUntil) > now)
          .length,
        deckId,
        due: available.filter((card) => card.state === "review" && new Date(card.due) <= now)
          .length,
        learning: available.filter(
          (card) => ["learning", "relearning"].includes(card.state) && new Date(card.due) <= now,
        ).length,
        name: universe.deckNames.get(deckId) ?? "Deck",
        new: available.filter((card) => card.state === "new").length,
        suspended: candidates.filter((card) => card.suspended).length,
        total: candidates.filter((card) => card.active).length,
      });
    }
    decks.sort(
      (left, right) =>
        right.due + right.learning + right.new - (left.due + left.learning + left.new) ||
        left.name.localeCompare(right.name),
    );
    const client = await createNextServerDatabaseClient();
    const { data: sessions, error } = await client
      .from("study_sessions")
      .select("id,status,total_items,completed_items,completed_at,last_activity_at")
      .eq("learner_profile_id", learnerProfileId)
      .order("last_activity_at", { ascending: false })
      .limit(10);
    if (error) throw new Error("STUDY_SESSIONS_UNAVAILABLE");
    const sessionRows = rows(sessions);
    const resume = sessionRows.find(
      (session) =>
        ["active", "paused"].includes(text(session.status)) &&
        number(session.completed_items) < number(session.total_items),
    );
    const recent = sessionRows.find((session) => text(session.status) === "completed");
    return {
      completedToday: universe.completedToday,
      decks: Object.freeze(decks),
      folders: universe.folders,
      due: decks.reduce((sum, deck) => sum + deck.due, 0),
      learning: decks.reduce((sum, deck) => sum + deck.learning, 0),
      new: decks.reduce((sum, deck) => sum + deck.new, 0),
      recentSession: recent
        ? { completed: number(recent.completed_items), completedAt: text(recent.completed_at) }
        : null,
      resumableSession: resume
        ? {
            completed: number(resume.completed_items),
            id: text(resume.id),
            total: number(resume.total_items),
          }
        : null,
      savedFilters: universe.savedFilters,
      total: decks.reduce((sum, deck) => sum + deck.total, 0),
      tags: universe.tags,
    };
  },
);

export async function readReviewCard(
  sessionId: string,
  accountId: string,
  learnerProfileId: string,
): Promise<ReviewCardView | null> {
  const client = await createNextServerDatabaseClient();
  const { data: session, error: sessionError } = await client
    .from("study_sessions")
    .select(
      "id,mode,source,rescheduling,status,total_items,completed_items,timezone,study_day_start",
    )
    .eq("id", sessionId)
    .eq("learner_profile_id", learnerProfileId)
    .maybeSingle();
  if (sessionError || !session) return null;
  const { data: item, error: itemError } = await client
    .from("study_session_items")
    .select("position,card_id,schedule_version_at_enqueue,status")
    .eq("study_session_id", sessionId)
    .in("status", ["pending", "shown"])
    .order("position")
    .limit(1)
    .maybeSingle();
  if (itemError || !item) return null;
  const { data: card, error: cardError } = await client
    .from("cards")
    .select("id,note_id,content_version,active,notes!inner(deck_id)")
    .eq("id", item.card_id)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (cardError || !card) return null;
  const joinedNote = Array.isArray(card.notes) ? card.notes[0] : card.notes;
  const deckId = joinedNote?.deck_id;
  if (!deckId) return null;
  const deck = await readDeckDetail(deckId, accountId);
  const rendered = deck?.cards.find(
    (candidate) => candidate.id === item.card_id && candidate.active,
  );
  if (!deck || !rendered) return null;
  const [scheduleResult, settingResult, lastReviewResult] = await Promise.all([
    client
      .from("card_schedules")
      .select("*")
      .eq("learner_profile_id", learnerProfileId)
      .eq("card_id", item.card_id)
      .maybeSingle(),
    client
      .from("deck_srs_settings")
      .select("preset_id")
      .eq("learner_profile_id", learnerProfileId)
      .eq("deck_id", deckId)
      .maybeSingle(),
    client
      .from("review_logs")
      .select("id")
      .eq("study_session_id", sessionId)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (scheduleResult.error || settingResult.error || lastReviewResult.error)
    throw new Error("REVIEW_SCHEDULE_UNAVAILABLE");
  let preset: SchedulerPreset = { ...DEFAULT_FSRS_PRESET };
  if (settingResult.data?.preset_id) {
    const { data: presetRow, error: presetError } = await client
      .from("srs_presets")
      .select("*")
      .eq("id", settingResult.data.preset_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (presetError) throw new Error("REVIEW_PRESET_UNAVAILABLE");
    preset = presetFromDatabase(presetRow as UnknownRow | null);
  }
  const schedule = scheduleFromDatabase(scheduleResult.data as UnknownRow | null);
  return {
    cardId: item.card_id,
    contentMismatch: Boolean(
      scheduleResult.data && scheduleResult.data.content_version !== card.content_version,
    ),
    deckId,
    deckTitle: deck.title,
    lastReviewId: lastReviewResult.data?.id ?? null,
    noteId: card.note_id,
    position: item.position,
    preset,
    renderer: rendered.renderer,
    schedule,
    scheduleVersion: scheduleResult.data?.version ?? 0,
    starred: scheduleResult.data?.starred ?? false,
    session: {
      completed: session.completed_items,
      id: session.id,
      mode: session.mode,
      rescheduling: session.rescheduling,
      source: session.source,
      studyDayStart: session.study_day_start,
      timezone: session.timezone,
      total: session.total_items,
    },
  };
}

function bucket(value: number, boundaries: readonly { max: number; label: string }[]): string {
  return (
    boundaries.find((boundary) => value <= boundary.max)?.label ??
    boundaries.at(-1)?.label ??
    "Other"
  );
}

export const readStudyStatistics = cache(
  async (accountId: string, learnerProfileId: string): Promise<StudyStatistics> => {
    const client = await createNextServerDatabaseClient();
    const [library, universe] = await Promise.all([
      readLibrarySnapshot(accountId),
      readUniverse(accountId, learnerProfileId, new Date().toISOString().slice(0, 10)),
    ]);
    const deckName = new Map(library.decks.map((deck) => [deck.id, deck.title]));
    const [schedulesForLearner, logs, counters] = await Promise.all([
      readAllPages(async (from, to) => {
        const result = await client
          .from("card_schedules")
          .select("*")
          .eq("learner_profile_id", learnerProfileId)
          .order("card_id")
          .range(from, to);
        return { data: result.data, error: result.error };
      }),
      readAllPages(
        async (from, to) => {
          const result = await client
            .from("review_logs")
            .select("id,card_id,deck_id,rating,reviewed_at,duration_ms")
            .eq("learner_profile_id", learnerProfileId)
            .order("reviewed_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to);
          return { data: result.data, error: result.error };
        },
        { maximumRows: 10_000 },
      ),
      readAllPages(
        async (from, to) => {
          const result = await client
            .from("daily_study_counters")
            .select("study_day,new_reviewed,learning_reviewed,review_reviewed,total_duration_ms")
            .eq("learner_profile_id", learnerProfileId)
            .order("study_day", { ascending: false })
            .range(from, to);
          return { data: result.data, error: result.error };
        },
        { maximumRows: 365 },
      ),
    ]).catch(() => {
      throw new Error("STUDY_STATS_UNAVAILABLE");
    });
    const candidates = [...universe.candidatesByDeck.values()].flat().filter((card) => card.active);
    const activeCardIds = new Set(candidates.map((card) => card.cardId));
    const candidateByCard = new Map(candidates.map((card) => [card.cardId, card]));
    const schedules = schedulesForLearner.filter((schedule) =>
      activeCardIds.has(text(schedule.card_id)),
    );
    const states = { learning: 0, new: 0, relearning: 0, review: 0 };
    const ratingCounts = { again: 0, easy: 0, good: 0, hard: 0 };
    for (const schedule of schedules) {
      const state = text(schedule.state) as keyof typeof states;
      if (state in states) states[state] += 1;
    }
    states.new += candidates.filter((card) => (card.scheduleVersion ?? 0) === 0).length;
    for (const log of logs) {
      const rating = text(log.rating) as keyof typeof ratingCounts;
      if (rating in ratingCounts) ratingCounts[rating] += 1;
    }
    const now = new Date();
    const retrieval = schedules.flatMap((row) => {
      const schedule = scheduleFromDatabase(row);
      const value = schedule ? retrievability(schedule, now) : null;
      return value === null ? [] : [value];
    });
    const forecastMap = new Map<string, number>();
    for (const schedule of schedules) {
      if (
        schedule.suspended === true ||
        text(schedule.state) === "new" ||
        (schedule.buried_until && new Date(text(schedule.buried_until)) > now)
      )
        continue;
      const due = new Date(text(schedule.due));
      const delta = Math.floor((due.getTime() - now.getTime()) / 86_400_000);
      if (delta >= 0 && delta < 14) {
        const day = due.toISOString().slice(0, 10);
        forecastMap.set(day, (forecastMap.get(day) ?? 0) + 1);
      }
    }
    const intervalLabels = [
      { max: 1, label: "1 day" },
      { max: 7, label: "2–7 days" },
      { max: 30, label: "8–30 days" },
      { max: 90, label: "1–3 months" },
      { max: Number.POSITIVE_INFINITY, label: "Over 3 months" },
    ];
    const timeLabels = [
      { max: 3_000, label: "Under 3s" },
      { max: 8_000, label: "3–8s" },
      { max: 20_000, label: "8–20s" },
      { max: Number.POSITIVE_INFINITY, label: "Over 20s" },
    ];
    const stabilityLabels = [
      { max: 1, label: "Up to 1 day" },
      { max: 7, label: "1–7 days" },
      { max: 30, label: "1–4 weeks" },
      { max: 180, label: "1–6 months" },
      { max: Number.POSITIVE_INFINITY, label: "Over 6 months" },
    ];
    const difficultyLabels = [
      { max: 2, label: "1–2" },
      { max: 4, label: "2–4" },
      { max: 6, label: "4–6" },
      { max: 8, label: "6–8" },
      { max: 10, label: "8–10" },
    ];
    const countBuckets = (
      values: readonly number[],
      boundaries: readonly { max: number; label: string }[],
    ) =>
      boundaries.map(({ label }) => ({
        label,
        count: values.filter((value) => bucket(value, boundaries) === label).length,
      }));
    const deckBreakdownMap = new Map<string, { reviews: number; timeMs: number }>();
    const tagBreakdownMap = new Map<string, { reviews: number; timeMs: number }>();
    for (const log of logs) {
      const deckId = text(log.deck_id);
      const current = deckBreakdownMap.get(deckId) ?? { reviews: 0, timeMs: 0 };
      current.reviews += 1;
      current.timeMs += number(log.duration_ms);
      deckBreakdownMap.set(deckId, current);
      for (const tag of candidateByCard.get(text(log.card_id))?.tags ?? []) {
        const tagCurrent = tagBreakdownMap.get(tag) ?? { reviews: 0, timeMs: 0 };
        tagCurrent.reviews += 1;
        tagCurrent.timeMs += number(log.duration_ms);
        tagBreakdownMap.set(tag, tagCurrent);
      }
    }
    const recalled = ratingCounts.hard + ratingCounts.good + ratingCounts.easy;
    const fsrsRows = schedules.filter(
      (row) => text(row.algorithm) === "fsrs" && number(row.reps) > 0,
    );
    return {
      answerTimeBuckets: countBuckets(
        logs.map((log) => number(log.duration_ms)),
        timeLabels,
      ),
      cardsByState: states,
      deckBreakdown: [...deckBreakdownMap]
        .map(([deckId, values]) => ({ deckId, name: deckName.get(deckId) ?? "Deck", ...values }))
        .sort((a, b) => b.reviews - a.reviews),
      difficultyBuckets: countBuckets(
        fsrsRows.map((row) => number(row.difficulty)),
        difficultyLabels,
      ),
      dueToday: schedules.filter(
        (row) =>
          !row.suspended &&
          text(row.state) !== "new" &&
          (!row.buried_until || new Date(text(row.buried_until)) <= now) &&
          new Date(text(row.due)) <= now,
      ).length,
      forecast: [...forecastMap]
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      heatmap: counters.map((counter) => ({
        count:
          number(counter.new_reviewed) +
          number(counter.learning_reviewed) +
          number(counter.review_reviewed),
        day: text(counter.study_day),
        durationMs: number(counter.total_duration_ms),
      })),
      intervalBuckets: countBuckets(
        schedules
          .filter((row) => number(row.scheduled_days) > 0)
          .map((row) => number(row.scheduled_days)),
        intervalLabels,
      ),
      lapses: schedules.reduce((sum, row) => sum + number(row.lapses), 0),
      leeches: schedules.filter((row) => row.leech === true).length,
      mature: schedules.filter((row) => number(row.scheduled_days) >= 21).length,
      meanDifficulty: fsrsRows.length
        ? fsrsRows.reduce((sum, row) => sum + number(row.difficulty), 0) / fsrsRows.length
        : null,
      meanRetrievability: retrieval.length
        ? retrieval.reduce((sum, value) => sum + value, 0) / retrieval.length
        : null,
      meanStability: fsrsRows.length
        ? fsrsRows.reduce((sum, row) => sum + number(row.stability), 0) / fsrsRows.length
        : null,
      newCards: states.new,
      ratingCounts,
      recentDailyAverage: counters.length
        ? Math.round(
            counters.reduce(
              (sum, day) =>
                sum +
                number(day.new_reviewed) +
                number(day.learning_reviewed) +
                number(day.review_reviewed),
              0,
            ) /
              Math.min(
                365,
                Math.max(
                  1,
                  Math.ceil(
                    (now.getTime() - new Date(text(counters.at(-1)?.study_day)).getTime()) /
                      86_400_000,
                  ) + 1,
                ),
              ),
          )
        : 0,
      recallRate: logs.length ? recalled / logs.length : null,
      reviewCount: logs.length,
      reviewTimeMs: logs.reduce((sum, log) => sum + number(log.duration_ms), 0),
      stabilityBuckets: countBuckets(
        fsrsRows.map((row) => number(row.stability)),
        stabilityLabels,
      ),
      tagBreakdown: [...tagBreakdownMap]
        .map(([name, values]) => ({ name, ...values }))
        .sort((left, right) => right.reviews - left.reviews || left.name.localeCompare(right.name)),
      timeline: logs.slice(0, 50).map((log) => ({
        cardId: text(log.card_id),
        deckId: text(log.deck_id),
        label: candidateByCard.get(text(log.card_id))?.label ?? "Card",
        noteId: candidateByCard.get(text(log.card_id))?.noteId ?? "",
        rating: text(log.rating) as "again" | "easy" | "good" | "hard",
        reviewedAt: text(log.reviewed_at),
      })),
      young: schedules.filter(
        (row) => number(row.scheduled_days) > 0 && number(row.scheduled_days) < 21,
      ).length,
    };
  },
);
