import { z } from "zod";

import { mathEquivalent } from "./math";
import { normalizeAnswer, resolveNormalization } from "./normalization";
import { numericEquivalent } from "./numeric";
import { editSimilarity, tokenSimilarity } from "./similarity";
import {
  gradingModes,
  type GradeAnswerInput,
  type GradeResult,
  type GradeSelectionInput,
  type GradingProfile,
  type GradingVerdict,
  type SemanticGradingProvider,
} from "./types";

export const gradingProfileSchema = z
  .object({
    mode: z.enum(gradingModes),
    normalization: z
      .object({
        caseSensitive: z.boolean().optional(),
        punctuationSensitive: z.boolean().optional(),
        accentSensitive: z.boolean().optional(),
      })
      .strict()
      .optional(),
    typoSimilarityThreshold: z.number().min(0).max(1).optional(),
    tokenSimilarityThreshold: z.number().min(0).max(1).optional(),
    partialThreshold: z.number().min(0).max(1).optional(),
  })
  .strict();

interface Thresholds {
  readonly typo: number;
  readonly token: number;
  readonly partial: number;
}

export function gradeSelection(input: GradeSelectionInput): GradeResult {
  const normalization = resolveNormalization({ mode: "moderate" });
  const correct = new Set(input.correct.map((value) => normalizeAnswer(value, normalization)));
  const options = new Set(input.options.map((value) => normalizeAnswer(value, normalization)));
  const selected = new Set(input.selected.map((value) => normalizeAnswer(value, normalization)));
  const validCorrect = [...correct].filter((value) => options.has(value));
  const incorrectOptions = [...options].filter((value) => !correct.has(value));
  const truePositiveRate = validCorrect.length
    ? validCorrect.filter((value) => selected.has(value)).length / validCorrect.length
    : 0;
  const falsePositiveRate = incorrectOptions.length
    ? incorrectOptions.filter((value) => selected.has(value)).length / incorrectOptions.length
    : 0;
  const score = bounded(truePositiveRate * (1 - falsePositiveRate));
  const exact =
    selected.size === validCorrect.length && validCorrect.every((value) => selected.has(value));
  return result(
    exact ? 1 : score,
    exact ? "correct" : score > 0 ? "partial" : "incorrect",
    1,
    "multi_select",
    exact
      ? "Every correct option was selected, with no extra choices."
      : `${String(validCorrect.filter((value) => selected.has(value)).length)} of ${String(validCorrect.length)} correct options selected; extra choices reduce partial credit.`,
    validCorrect,
    [...selected].join(", "),
  );
}

function thresholds(profile: GradingProfile): Thresholds {
  const defaults =
    profile.mode === "strict"
      ? { typo: 1, token: 1, partial: 0.75 }
      : profile.mode === "relaxed"
        ? { typo: 0.72, token: 0.72, partial: 0.45 }
        : { typo: 0.86, token: 0.84, partial: 0.55 };
  return {
    typo: profile.typoSimilarityThreshold ?? defaults.typo,
    token: profile.tokenSimilarityThreshold ?? defaults.token,
    partial: profile.partialThreshold ?? defaults.partial,
  };
}

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function result(
  correctness: number,
  verdict: GradingVerdict,
  confidence: number,
  matchedRule: string,
  explanation: string,
  normalizedExpected: readonly string[],
  normalizedReceived: string,
): GradeResult {
  return Object.freeze({
    correctness: bounded(correctness),
    verdict,
    confidence: bounded(confidence),
    matchedRule,
    explanation,
    normalizedExpected: Object.freeze([...normalizedExpected]),
    normalizedReceived,
    overrideAllowed: verdict !== "correct",
  });
}

function containsKeyword(value: string, keyword: string): boolean {
  return ` ${value} `.includes(` ${keyword} `) || value === keyword;
}

function gradeList(
  received: string,
  input: GradeAnswerInput,
  normalizedExpected: readonly string[],
): GradeResult | null {
  const list = input.rules?.list;
  if (!list) return null;
  const normalization = resolveNormalization(input.profile);
  const normalizedReceived = normalizeAnswer(received, normalization);
  const receivedItems = received
    .split(/[\n,;]+/u)
    .map((item) => normalizeAnswer(item, normalization))
    .filter(Boolean);
  const expectedItems = list.items.map((item) => ({
    accepted: [item.answer, ...(item.aliases ?? [])].map((answer) =>
      normalizeAnswer(answer, normalization),
    ),
    required: item.required ?? true,
  }));

  const matched = new Set<number>();
  let matches = 0;
  let ordered = true;
  let previousIndex = -1;
  for (const item of expectedItems) {
    const index = receivedItems.findIndex(
      (receivedItem, candidateIndex) =>
        !matched.has(candidateIndex) && item.accepted.includes(receivedItem),
    );
    if (index >= 0) {
      matched.add(index);
      matches += 1;
      if (index < previousIndex) ordered = false;
      previousIndex = index;
    }
  }

  const requiredCount = expectedItems.filter((item) => item.required).length;
  const denominator = Math.max(1, expectedItems.length);
  let score = matches / denominator;
  if (list.orderMatters && !ordered) score *= 0.75;
  const complete = matches === expectedItems.length && (!list.orderMatters || ordered);
  if (complete) {
    return result(
      1,
      "correct",
      0.99,
      "list",
      "Every required list item matched.",
      normalizedExpected,
      normalizedReceived,
    );
  }
  const verdict =
    matches >= requiredCount && matches > 0
      ? "partial"
      : score >= thresholds(input.profile).partial
        ? "partial"
        : "incorrect";
  return result(
    score,
    verdict,
    0.94,
    "list",
    `${String(matches)} of ${String(expectedItems.length)} list items matched${list.orderMatters && !ordered ? "; order also differed" : ""}.`,
    normalizedExpected,
    normalizedReceived,
  );
}

export function gradeAnswer(input: GradeAnswerInput): GradeResult {
  gradingProfileSchema.parse(input.profile);
  const profile = input.profile;
  const normalization = resolveNormalization(profile);
  const expectedValues = Array.isArray(input.expected) ? [...input.expected] : [input.expected];
  const normalizedExpected = expectedValues.map((value) => normalizeAnswer(value, normalization));
  const normalizedReceived = normalizeAnswer(input.received, normalization);
  const gradingThresholds = thresholds(profile);

  const listResult = gradeList(input.received, input, normalizedExpected);
  if (listResult) return listResult;

  const forbidden = (input.rules?.forbiddenKeywords ?? []).map((keyword) =>
    normalizeAnswer(keyword, normalization),
  );
  const forbiddenMatch = forbidden.find((keyword) => containsKeyword(normalizedReceived, keyword));
  if (forbiddenMatch) {
    return result(
      0,
      "incorrect",
      0.99,
      "forbidden_keyword",
      "The response contains a creator-marked contradiction.",
      normalizedExpected,
      normalizedReceived,
    );
  }

  const required = (input.rules?.requiredKeywords ?? []).map((keyword) =>
    normalizeAnswer(keyword, normalization),
  );
  const missingRequired = required.filter(
    (keyword) => !containsKeyword(normalizedReceived, keyword),
  );

  const aliases = [
    ...(input.rules?.aliases ?? []),
    ...Object.values(input.rules?.synonyms ?? {}).flat(),
  ].map((alias) => normalizeAnswer(alias, normalization));
  const accepted = [...normalizedExpected, ...aliases];
  if (accepted.includes(normalizedReceived) && missingRequired.length === 0) {
    return result(
      1,
      "correct",
      1,
      normalizedExpected.includes(normalizedReceived) ? "exact" : "creator_alias",
      normalizedExpected.includes(normalizedReceived)
        ? "The response matches the expected answer."
        : "The response matches a creator-authored accepted answer.",
      normalizedExpected,
      normalizedReceived,
    );
  }

  if (input.rules?.numeric) {
    const numericMatch = expectedValues.some((expected) =>
      numericEquivalent(expected, input.received, input.rules?.numeric),
    );
    if (numericMatch && missingRequired.length === 0) {
      return result(
        1,
        "correct",
        0.99,
        "numeric",
        "The numeric value and unit are equivalent.",
        normalizedExpected,
        normalizedReceived,
      );
    }
  }

  if (input.rules?.allowMath) {
    const mathMatch = expectedValues.some((expected) => mathEquivalent(expected, input.received));
    if (mathMatch && missingRequired.length === 0) {
      return result(
        1,
        "correct",
        0.98,
        "safe_math",
        "The arithmetic expressions are equivalent.",
        normalizedExpected,
        normalizedReceived,
      );
    }
  }

  let bestEdit = 0;
  let bestToken = 0;
  for (const expected of accepted) {
    bestEdit = Math.max(bestEdit, editSimilarity(expected, normalizedReceived));
    bestToken = Math.max(bestToken, tokenSimilarity(expected, normalizedReceived));
  }
  let score = Math.max(bestEdit, bestToken);
  if (missingRequired.length > 0) score = Math.min(score, 0.5);

  if (missingRequired.length === 0 && bestEdit >= gradingThresholds.typo) {
    return result(
      score,
      "correct",
      0.86,
      "edit_similarity",
      "The response differs only by a permitted small typo.",
      normalizedExpected,
      normalizedReceived,
    );
  }
  if (missingRequired.length === 0 && bestToken >= gradingThresholds.token) {
    return result(
      score,
      "correct",
      0.82,
      "token_similarity",
      "The response contains the expected terms.",
      normalizedExpected,
      normalizedReceived,
    );
  }
  if (score >= gradingThresholds.partial || (missingRequired.length > 0 && score >= 0.3)) {
    return result(
      score,
      "partial",
      0.78,
      missingRequired.length > 0 ? "required_keywords" : "similarity",
      missingRequired.length > 0
        ? `The response is missing ${String(missingRequired.length)} required concept${missingRequired.length === 1 ? "" : "s"}.`
        : "The response overlaps with the expected answer but is incomplete.",
      normalizedExpected,
      normalizedReceived,
    );
  }
  return result(
    0,
    "incorrect",
    0.9,
    "none",
    "The response does not match the deterministic answer rules.",
    normalizedExpected,
    normalizedReceived,
  );
}

export async function gradeAnswerWithOptionalSemantic(
  input: GradeAnswerInput,
  provider?: SemanticGradingProvider,
): Promise<GradeResult> {
  const deterministicResult = gradeAnswer(input);
  if (!provider?.enabled || deterministicResult.verdict === "correct") return deterministicResult;
  const semanticResult = await provider.grade({
    expected: deterministicResult.normalizedExpected,
    received: deterministicResult.normalizedReceived,
    deterministicResult,
  });
  return result(
    semanticResult.correctness,
    semanticResult.verdict,
    semanticResult.confidence,
    `semantic:${semanticResult.matchedRule}`,
    semanticResult.explanation,
    deterministicResult.normalizedExpected,
    deterministicResult.normalizedReceived,
  );
}
