import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  damerauLevenshtein,
  evaluateSafeMath,
  gradeAnswer,
  gradeAnswerWithOptionalSemantic,
  gradeSelection,
  mathEquivalent,
  normalizeAnswer,
  numericEquivalent,
  type SemanticGradingProvider,
} from "../src";

describe("deterministic grading", () => {
  it("normalizes Unicode, whitespace, punctuation, case, and accents by policy", () => {
    expect(
      normalizeAnswer("  Café—ＡＴＰ!  ", {
        accentSensitive: false,
        caseSensitive: false,
        punctuationSensitive: false,
      }),
    ).toBe("cafe atp");
    expect(
      normalizeAnswer("Café!", {
        accentSensitive: true,
        caseSensitive: true,
        punctuationSensitive: true,
      }),
    ).toBe("Café!");
  });

  it("keeps strict mode strict and accepts creator-authored aliases deterministically", () => {
    expect(
      gradeAnswer({ expected: "ATP", received: "atp", profile: { mode: "strict" } }).verdict,
    ).toBe("incorrect");
    expect(
      gradeAnswer({
        expected: "adenosine triphosphate",
        received: "ATP",
        profile: { mode: "moderate" },
        rules: { aliases: ["ATP"] },
      }),
    ).toMatchObject({ correctness: 1, matchedRule: "creator_alias", verdict: "correct" });
  });

  it("enforces required and forbidden concepts", () => {
    expect(
      gradeAnswer({
        expected: "mitochondria make ATP",
        received: "mitochondria make energy",
        profile: { mode: "moderate" },
        rules: { requiredKeywords: ["ATP"] },
      }),
    ).toMatchObject({ matchedRule: "required_keywords", verdict: "partial" });
    expect(
      gradeAnswer({
        expected: "plants are autotrophs",
        received: "plants are not autotrophs",
        profile: { mode: "relaxed" },
        rules: { forbiddenKeywords: ["not"] },
      }),
    ).toMatchObject({ correctness: 0, matchedRule: "forbidden_keyword", verdict: "incorrect" });
  });

  it("grades structured lists with aliases and optional order", () => {
    const unordered = gradeAnswer({
      expected: "cell organelles",
      received: "nucleus; power house",
      profile: { mode: "moderate" },
      rules: {
        list: {
          orderMatters: false,
          items: [{ answer: "nucleus" }, { answer: "mitochondria", aliases: ["power house"] }],
        },
      },
    });
    expect(unordered).toMatchObject({ correctness: 1, verdict: "correct" });

    const ordered = gradeAnswer({
      expected: "stages",
      received: "two, one",
      profile: { mode: "moderate" },
      rules: {
        list: {
          orderMatters: true,
          items: [{ answer: "one" }, { answer: "two" }],
        },
      },
    });
    expect(ordered.correctness).toBeLessThan(1);
    expect(ordered.verdict).toBe("partial");
  });

  it("awards multi-select partial credit while discouraging selecting every option", () => {
    const input = {
      correct: ["A", "C"],
      options: ["A", "B", "C", "D"],
    };
    expect(gradeSelection({ ...input, selected: ["A", "C"] })).toMatchObject({
      correctness: 1,
      verdict: "correct",
    });
    const partial = gradeSelection({ ...input, selected: ["A"] });
    const selectEverything = gradeSelection({ ...input, selected: input.options });
    expect(partial.verdict).toBe("partial");
    expect(selectEverything.correctness).toBe(0);
    expect(selectEverything.correctness).toBeLessThan(partial.correctness);
  });

  it("compares numbers with compatible units and bounded tolerances", () => {
    expect(numericEquivalent("1 m", "100 cm")).toBe(true);
    expect(numericEquivalent("1 kg", "1000 g")).toBe(true);
    expect(numericEquivalent("1 m", "1 s")).toBe(false);
    expect(
      gradeAnswer({
        expected: "3.00 m",
        received: "300 cm",
        profile: { mode: "strict" },
        rules: { numeric: { relativeTolerance: 0.001 } },
      }),
    ).toMatchObject({ matchedRule: "numeric", verdict: "correct" });
  });

  it("evaluates arithmetic without executing identifiers or JavaScript", () => {
    expect(evaluateSafeMath("2 * (3 + 4)^2")).toBe(98);
    expect(mathEquivalent("1/2", "0.5")).toBe(true);
    expect(evaluateSafeMath("globalThis.process.exit()")).toBeNull();
    expect(evaluateSafeMath("1 / 0")).toBeNull();
  });

  it("recognizes moderate transposition typos but not unrelated answers", () => {
    expect(
      gradeAnswer({
        expected: "mitochondria",
        received: "mitochodnria",
        profile: { mode: "moderate" },
      }),
    ).toMatchObject({ matchedRule: "edit_similarity", verdict: "correct" });
    expect(
      gradeAnswer({
        expected: "mitochondria",
        received: "chloroplast",
        profile: { mode: "relaxed" },
      }),
    ).toMatchObject({ verdict: "incorrect" });
  });

  it("never calls a disabled semantic provider and labels an enabled hook", async () => {
    const grade = vi.fn<SemanticGradingProvider["grade"]>();
    const disabled: SemanticGradingProvider = { enabled: false, grade };
    await expect(
      gradeAnswerWithOptionalSemantic(
        { expected: "gravity", received: "force", profile: { mode: "strict" } },
        disabled,
      ),
    ).resolves.toMatchObject({ matchedRule: "none" });
    expect(grade).not.toHaveBeenCalled();

    const enabled: SemanticGradingProvider = {
      enabled: true,
      grade: async (request) => ({
        ...request.deterministicResult,
        correctness: 0.6,
        verdict: "needs_review",
        confidence: 0.45,
        matchedRule: "provider_review",
        explanation: "A reviewer should decide.",
      }),
    };
    await expect(
      gradeAnswerWithOptionalSemantic(
        { expected: "gravity", received: "force", profile: { mode: "strict" } },
        enabled,
      ),
    ).resolves.toMatchObject({ matchedRule: "semantic:provider_review", verdict: "needs_review" });
  });

  it("keeps identical answers correct and every score bounded", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (answer) => {
        const grade = gradeAnswer({
          expected: answer,
          received: answer,
          profile: { mode: "strict" },
        });
        expect(grade.verdict).toBe("correct");
        expect(grade.correctness).toBeGreaterThanOrEqual(0);
        expect(grade.correctness).toBeLessThanOrEqual(1);
        expect(grade.confidence).toBeGreaterThanOrEqual(0);
        expect(grade.confidence).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("keeps Damerau-Levenshtein symmetric", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.string({ maxLength: 30 }), (left, right) => {
        expect(damerauLevenshtein(left, right)).toBe(damerauLevenshtein(right, left));
      }),
    );
  });
});
