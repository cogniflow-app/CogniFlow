export const gradingModes = ["strict", "moderate", "relaxed", "custom"] as const;
export type GradingMode = (typeof gradingModes)[number];

export const gradingVerdicts = ["correct", "partial", "incorrect", "needs_review"] as const;
export type GradingVerdict = (typeof gradingVerdicts)[number];

export interface GradingNormalization {
  readonly caseSensitive: boolean;
  readonly punctuationSensitive: boolean;
  readonly accentSensitive: boolean;
}

export interface NumericRule {
  readonly absoluteTolerance?: number;
  readonly relativeTolerance?: number;
  readonly expectedUnit?: string;
}

export interface ListRuleItem {
  readonly answer: string;
  readonly aliases?: readonly string[];
  readonly required?: boolean;
}

export interface ListRule {
  readonly items: readonly ListRuleItem[];
  readonly orderMatters: boolean;
}

export interface GradingRules {
  readonly aliases?: readonly string[];
  readonly synonyms?: Readonly<Record<string, readonly string[]>>;
  readonly requiredKeywords?: readonly string[];
  readonly forbiddenKeywords?: readonly string[];
  readonly list?: ListRule;
  readonly numeric?: NumericRule;
  readonly allowMath?: boolean;
}

export interface GradingProfile {
  readonly mode: GradingMode;
  readonly normalization?: Partial<GradingNormalization>;
  readonly typoSimilarityThreshold?: number;
  readonly tokenSimilarityThreshold?: number;
  readonly partialThreshold?: number;
}

export interface GradeAnswerInput {
  readonly expected: string | readonly string[];
  readonly received: string;
  readonly profile: GradingProfile;
  readonly rules?: GradingRules;
}

export interface GradeSelectionInput {
  readonly correct: readonly string[];
  readonly options: readonly string[];
  readonly selected: readonly string[];
}

export interface GradeResult {
  readonly correctness: number;
  readonly verdict: GradingVerdict;
  readonly confidence: number;
  readonly matchedRule: string;
  readonly explanation: string;
  readonly normalizedExpected: readonly string[];
  readonly normalizedReceived: string;
  readonly overrideAllowed: boolean;
}

export interface SemanticGradeRequest {
  readonly expected: readonly string[];
  readonly received: string;
  readonly deterministicResult: GradeResult;
}

export interface SemanticGradingProvider {
  readonly enabled: boolean;
  grade(request: SemanticGradeRequest): Promise<GradeResult>;
}
