import "server-only";

import { extractRichDocumentText } from "@lumen/domain";
import { buildChoiceQuestion, emptyMastery, type MasteryState } from "@lumen/learning-engine";

import type {
  PracticeCardView,
  PracticeHubSnapshot,
  PracticeMasteryView,
  PracticeMode,
  PracticeModePreference,
  PracticeSessionConfig,
  PracticeSessionSummary,
} from "@/lib/practice/models";
import { createNextServerDatabaseClient } from "@/lib/supabase/server";

import { readDeckDetail } from "./content-repository";

type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function practiceConfig(value: unknown): PracticeSessionConfig {
  const input = record(value);
  const direction = string(input.answerDirection);
  const mode = string(input.gradingMode);
  const hints = string(input.hints);
  const goal = record(input.goal);
  const testOptions = record(input.testOptions);
  const goalKind = string(goal.kind);
  return Object.freeze({
    audio: boolean(input.audio, true),
    answerDirection:
      direction === "answer_prompt" || direction === "mixed" ? direction : "prompt_answer",
    autoplay: boolean(input.autoplay),
    gradingMode: mode === "strict" || mode === "relaxed" || mode === "custom" ? mode : "moderate",
    goal: {
      examAt: string(goal.examAt) || null,
      id: string(goal.id) || null,
      kind: ["time", "count", "mastery", "new", "due", "weak", "starred", "exam"].includes(goalKind)
        ? (goalKind as PracticeSessionConfig["goal"]["kind"])
        : "recommended",
      masteryTarget: typeof goal.masteryTarget === "number" ? number(goal.masteryTarget) : null,
      timeMinutes: typeof goal.timeMinutes === "number" ? number(goal.timeMinutes) : null,
    },
    hints: hints === "off" ? "off" : "on_request",
    language: string(input.language, "en-US").slice(0, 35),
    questionTypes: Object.freeze(
      Array.isArray(input.questionTypes)
        ? input.questionTypes
            .filter((item): item is string => typeof item === "string")
            .slice(0, 20)
        : [],
    ),
    retypeCorrect: boolean(input.retypeCorrect, true),
    targetCount: Math.max(1, Math.min(10_000, Math.floor(number(input.targetCount, 12)))),
    tags: Object.freeze(
      Array.isArray(input.tags)
        ? input.tags.filter((item): item is string => typeof item === "string").slice(0, 50)
        : [],
    ),
    testOptions: {
      layout:
        testOptions.layout === "one_page" ? ("one_page" as const) : ("one_at_a_time" as const),
      partialCredit: boolean(testOptions.partialCredit, true),
      pauseAllowed: boolean(testOptions.pauseAllowed, true),
      reviewPolicy:
        testOptions.reviewPolicy === "after_each" ? ("after_each" as const) : ("end" as const),
    },
    testAttemptId: string(input.testAttemptId) || null,
    testDefinitionId: string(input.testDefinitionId) || null,
    timerSeconds:
      input.timerSeconds === null
        ? null
        : Math.max(30, Math.min(14_400, Math.floor(number(input.timerSeconds, 600)))),
  });
}

function mastery(value: unknown, contentVersion: number): PracticeMasteryView {
  const input = record(value);
  const empty = emptyMastery(contentVersion);
  const stages = new Set([
    "unseen",
    "introduced",
    "recognition",
    "guided_recall",
    "free_recall",
    "mastered",
    "needs_refresh",
  ]);
  return Object.freeze({
    recognition: number(input.recognition, empty.recognition),
    recall: number(input.recall, empty.recall),
    overall: number(input.overall, empty.overall),
    stage: stages.has(string(input.stage))
      ? (string(input.stage) as MasteryState["stage"])
      : empty.stage,
    evidenceCount: number(input.evidence_count, empty.evidenceCount),
    spacedRecallSuccesses: number(input.spaced_recall_successes, empty.spacedRecallSuccesses),
    lastEvidenceAt: string(input.last_evidence_at) || null,
    contentVersion: number(input.content_version, contentVersion),
    version: number(input.version, 0),
  });
}

function questionReason(level: string, attemptCount: number): string {
  if (attemptCount > 0)
    return "This concept returned after earlier practice so you can strengthen it.";
  if (level === "introduction") return "This is a brief introduction before recall practice.";
  if (level === "recognition") return "Recognition is the right next step for this concept.";
  if (level === "guided_recall")
    return "A guided prompt bridges recognition and independent recall.";
  if (level === "delayed_retest")
    return "A delayed retest checks that recall survived intervening items.";
  return "Unaided recall provides strong, explainable mastery evidence.";
}

export async function readPracticeHub(learnerProfileId: string): Promise<PracticeHubSnapshot> {
  const client = await createNextServerDatabaseClient();
  const [sessions, masteries, goals, examPlans] = await Promise.all([
    client
      .from("practice_sessions")
      .select("id,mode,total_items,completed_items,status,last_activity_at,completed_at")
      .eq("learner_profile_id", learnerProfileId)
      .order("last_activity_at", { ascending: false })
      .limit(8),
    client
      .from("concept_mastery")
      .select("overall,stage")
      .eq("learner_profile_id", learnerProfileId),
    client
      .from("learning_goals")
      .select("id", { count: "exact", head: true })
      .eq("learner_profile_id", learnerProfileId)
      .eq("status", "active"),
    client
      .from("exam_plans")
      .select("id,name,exam_at,plan")
      .eq("learner_profile_id", learnerProfileId)
      .eq("status", "active")
      .order("exam_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (sessions.error || masteries.error || goals.error || examPlans.error)
    throw new Error("PRACTICE_HUB_UNAVAILABLE");
  const masteryRows = masteries.data ?? [];
  const resumable = sessions.data?.find(
    (session) => session.status === "active" || session.status === "paused",
  );
  return Object.freeze({
    averageMastery: masteryRows.length
      ? masteryRows.reduce((sum, row) => sum + row.overall, 0) / masteryRows.length
      : 0,
    activeExamPlan: examPlans.data
      ? {
          examAt: examPlans.data.exam_at,
          id: examPlans.data.id,
          name: examPlans.data.name,
          plan: record(examPlans.data.plan),
        }
      : null,
    activeGoalCount: goals.count ?? 0,
    masteredCount: masteryRows.filter((row) => row.stage === "mastered").length,
    recentSessions: Object.freeze(
      (sessions.data ?? [])
        .filter((session) => session.status === "completed")
        .slice(0, 5)
        .map((session) => ({
          completed: session.completed_items,
          completedAt: session.completed_at,
          id: session.id,
          mode: session.mode as PracticeMode,
          total: session.total_items,
        })),
    ),
    resumableSession: resumable
      ? {
          completed: resumable.completed_items,
          id: resumable.id,
          mode: resumable.mode as PracticeMode,
          total: resumable.total_items,
        }
      : null,
    weakCount: masteryRows.filter((row) => row.overall < 0.5).length,
  });
}

export async function readPracticeModePreference(
  learnerProfileId: string,
  mode: PracticeMode,
): Promise<PracticeModePreference | null> {
  const client = await createNextServerDatabaseClient();
  const { data, error } = await client
    .from("practice_mode_preferences")
    .select("config,version")
    .eq("learner_profile_id", learnerProfileId)
    .eq("mode", mode)
    .maybeSingle();
  if (error) throw new Error("PRACTICE_PREFERENCE_UNAVAILABLE");
  return data ? Object.freeze({ config: record(data.config), version: data.version }) : null;
}

export async function readPracticeCard(
  sessionId: string,
  accountId: string,
  learnerProfileId: string,
  requestedPosition?: number,
): Promise<PracticeCardView | null> {
  const client = await createNextServerDatabaseClient();
  const { data: session, error: sessionError } = await client
    .from("practice_sessions")
    .select("id,mode,status,config,total_items,completed_items,version")
    .eq("id", sessionId)
    .eq("learner_profile_id", learnerProfileId)
    .maybeSingle();
  if (sessionError || !session || session.status === "completed" || session.status === "abandoned")
    return null;
  const { data: items, error: itemError } = await client
    .from("practice_session_items")
    .select("position,card_id,question_level,question_kind,attempt_count,status")
    .eq("practice_session_id", sessionId)
    .order("position");
  const availableItems = (items ?? []).filter(
    (candidate) => candidate.status === "pending" || candidate.status === "shown",
  );
  const item =
    (requestedPosition === undefined
      ? undefined
      : availableItems.find((candidate) => candidate.position === requestedPosition)) ??
    availableItems[0];
  if (itemError || !item) return null;
  const { data: card, error: cardError } = await client
    .from("cards")
    .select("id,note_id,content_version,notes!inner(deck_id)")
    .eq("id", item.card_id)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (cardError || !card) return null;
  const joinedNote = Array.isArray(card.notes) ? card.notes[0] : card.notes;
  const deckId = joinedNote?.deck_id;
  if (!deckId) return null;
  const deck = await readDeckDetail(deckId, accountId);
  const rendered = deck?.cards.find((candidate) => candidate.id === card.id && candidate.active);
  if (!deck || !rendered) return null;
  const [masteryResult, rulesResult, scheduleResult] = await Promise.all([
    client
      .from("concept_mastery")
      .select("*")
      .eq("learner_profile_id", learnerProfileId)
      .eq("card_id", card.id)
      .maybeSingle(),
    client
      .from("accepted_answer_rules")
      .select("rules")
      .eq("card_id", card.id)
      .is("deleted_at", null)
      .maybeSingle(),
    client
      .from("card_schedules")
      .select("due,state,starred,version")
      .eq("learner_profile_id", learnerProfileId)
      .eq("card_id", card.id)
      .maybeSingle(),
  ]);
  if (masteryResult.error || rulesResult.error || scheduleResult.error)
    throw new Error("PRACTICE_CARD_STATE_UNAVAILABLE");
  const config = practiceConfig(session.config);
  const reverse =
    config.answerDirection === "answer_prompt" ||
    (config.answerDirection === "mixed" && item.position % 2 === 1);
  const basePrompt = reverse ? rendered.previewBack : rendered.previewFront;
  const baseAnswer = reverse ? rendered.previewFront : rendered.previewBack;
  const generatedChoices = buildChoiceQuestion(
    {
      answer: baseAnswer,
      cardId: rendered.id,
      difficulty: masteryResult.data?.overall ?? 0.5,
      siblingKey: rendered.noteId,
    },
    deck.cards
      .filter((candidate) => candidate.active)
      .map((candidate) => ({
        answer: reverse ? candidate.previewFront : candidate.previewBack,
        cardId: candidate.id,
        difficulty: 0.5,
        siblingKey: candidate.noteId,
      })),
    `${sessionId}:${String(item.position)}`,
  ).options.map((choice) => choice.answer);
  const authoredChoices =
    rendered.renderer.kind === "multiple_choice" || rendered.renderer.kind === "select_all"
      ? rendered.renderer.choices.map((choice) => extractRichDocumentText(choice.content))
      : null;
  const choices = authoredChoices?.length ? authoredChoices : generatedChoices;
  const trueFalseAnswer =
    item.question_kind === "true_false"
      ? item.position % 2 === 0
        ? baseAnswer
        : (choices.find((option) => option !== baseAnswer) ?? `${baseAnswer} (changed)`)
      : null;
  const prompt =
    trueFalseAnswer === null ? basePrompt : `${basePrompt}\n\nClaim: ${trueFalseAnswer}`;
  const answer =
    trueFalseAnswer === null ? baseAnswer : trueFalseAnswer === baseAnswer ? "True" : "False";
  const storedRules = record(rulesResult.data?.rules);
  const derivedRules: Readonly<Record<string, unknown>> =
    rendered.renderer.kind === "typed_answer"
      ? { aliases: rendered.renderer.acceptedAnswers }
      : rendered.renderer.kind === "list_answer"
        ? {
            list: {
              items: rendered.renderer.items.map((entry) => ({
                aliases: entry.aliases,
                answer: entry.answer,
                required: entry.required,
              })),
              orderMatters: rendered.renderer.orderMatters,
            },
          }
        : {};
  return Object.freeze({
    answer,
    answerRules: Object.freeze({ ...derivedRules, ...storedRules }),
    cardId: card.id,
    choices: item.question_kind === "true_false" ? ["True", "False"] : choices,
    correctChoices:
      item.question_kind === "select_all" && rendered.renderer.kind === "select_all"
        ? rendered.renderer.choices
            .filter((choice) => choice.isCorrect)
            .map((choice) => extractRichDocumentText(choice.content))
        : item.question_kind === "select_all"
          ? [answer]
          : [],
    contentVersion: card.content_version,
    deckId,
    deckTitle: deck.title,
    item: {
      attemptCount: item.attempt_count,
      position: item.position,
      questionKind: item.question_kind,
      questionLevel: item.question_level as PracticeCardView["item"]["questionLevel"],
    },
    mastery: mastery(masteryResult.data, card.content_version),
    noteId: card.note_id,
    prompt,
    renderer: rendered.renderer,
    schedule: scheduleResult.data
      ? {
          due: scheduleResult.data.due,
          starred: scheduleResult.data.starred,
          state: scheduleResult.data.state,
          version: scheduleResult.data.version,
        }
      : null,
    selectionReason: questionReason(item.question_level, item.attempt_count),
    session: {
      completed: session.completed_items,
      config,
      id: session.id,
      items: Object.freeze(
        (items ?? []).map((candidate) => ({
          position: candidate.position,
          status: candidate.status,
        })),
      ),
      mode: session.mode as PracticeMode,
      status: session.status as "active" | "paused",
      total: session.total_items,
      version: session.version,
    },
  });
}

export async function readPracticeSessionSummary(
  sessionId: string,
  accountId: string,
  learnerProfileId: string,
): Promise<PracticeSessionSummary | null> {
  const client = await createNextServerDatabaseClient();
  const [sessionResult, attemptsResult, itemsResult, bestResult] = await Promise.all([
    client
      .from("practice_sessions")
      .select("id,mode,status,total_items,completed_items,completed_at,config")
      .eq("id", sessionId)
      .eq("learner_profile_id", learnerProfileId)
      .maybeSingle(),
    client
      .from("practice_attempts")
      .select("item_position,correctness,verdict,duration_ms,card_id,response_text,explanation")
      .eq("practice_session_id", sessionId)
      .eq("learner_profile_id", learnerProfileId)
      .order("occurred_at"),
    client
      .from("practice_session_items")
      .select("position,card_id,question_kind")
      .eq("practice_session_id", sessionId)
      .order("position"),
    client
      .from("personal_bests")
      .select("value")
      .eq("learner_profile_id", learnerProfileId)
      .eq("mode", "match")
      .eq("metric", "completion_ms")
      .eq("source_practice_session_id", sessionId)
      .maybeSingle(),
  ]);
  if (
    sessionResult.error ||
    attemptsResult.error ||
    itemsResult.error ||
    bestResult.error ||
    !sessionResult.data
  )
    return null;
  const attempts = attemptsResult.data ?? [];
  const attemptedCardIds = [...new Set(attempts.map((attempt) => attempt.card_id))];
  const [masteryRows, cardRows] = attemptedCardIds.length
    ? await Promise.all([
        client
          .from("concept_mastery")
          .select("card_id,stage")
          .eq("learner_profile_id", learnerProfileId)
          .in("card_id", attemptedCardIds),
        client.from("cards").select("id,notes!inner(deck_id)").in("id", attemptedCardIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (masteryRows.error || cardRows.error) return null;
  const deckIdByCard = new Map(
    (cardRows.data ?? []).flatMap((card) => {
      const joinedNote = Array.isArray(card.notes) ? card.notes[0] : card.notes;
      return joinedNote?.deck_id ? [[card.id, joinedNote.deck_id] as const] : [];
    }),
  );
  const deckEntries = await Promise.all(
    [...new Set(deckIdByCard.values())].map(
      async (deckId) => [deckId, await readDeckDetail(deckId, accountId)] as const,
    ),
  );
  const deckById = new Map(
    deckEntries.flatMap(([deckId, deck]) => (deck ? [[deckId, deck] as const] : [])),
  );
  const renderedByCard = new Map(
    attemptedCardIds.flatMap((cardId) => {
      const deckId = deckIdByCard.get(cardId);
      const rendered = deckId
        ? deckById.get(deckId)?.cards.find((card) => card.id === cardId)
        : null;
      return rendered ? [[cardId, rendered] as const] : [];
    }),
  );
  const itemByPosition = new Map((itemsResult.data ?? []).map((item) => [item.position, item]));
  const config = practiceConfig(sessionResult.data.config);
  const questionReview = attempts.map((attempt) => {
    const item = itemByPosition.get(attempt.item_position);
    const rendered = renderedByCard.get(attempt.card_id);
    const reverse =
      config.answerDirection === "answer_prompt" ||
      (config.answerDirection === "mixed" && attempt.item_position % 2 === 1);
    return Object.freeze({
      correctness: attempt.correctness,
      expectedAnswer: rendered
        ? reverse
          ? rendered.previewFront
          : rendered.previewBack
        : "Answer unavailable",
      explanation: attempt.explanation,
      position: attempt.item_position,
      prompt: rendered
        ? reverse
          ? rendered.previewBack
          : rendered.previewFront
        : "Question unavailable",
      questionKind: item?.question_kind ?? "question",
      response: attempt.response_text,
      verdict: attempt.verdict,
    });
  });
  return Object.freeze({
    accuracy: attempts.length
      ? attempts.reduce((sum, attempt) => sum + attempt.correctness, 0) / attempts.length
      : 0,
    answered: attempts.length,
    completedAt: sessionResult.data.completed_at,
    correct: attempts.filter((attempt) => attempt.verdict === "correct").length,
    durationMs: attempts.reduce((sum, attempt) => sum + attempt.duration_ms, 0),
    mastered: (masteryRows.data ?? []).filter((row) => row.stage === "mastered").length,
    mode: sessionResult.data.mode as PracticeMode,
    needsWork: new Set(
      attempts.filter((attempt) => attempt.correctness < 0.8).map((attempt) => attempt.card_id),
    ).size,
    personalBestMs: bestResult.data?.value ?? null,
    questionReview: Object.freeze(questionReview),
    sessionId: sessionResult.data.id,
    status: sessionResult.data.status,
    total: sessionResult.data.total_items,
  });
}
