import type { GradingMode, GradingNormalization, GradingProfile } from "./types";

const punctuation = /[\p{P}\p{S}]+/gu;
const combiningMarks = /\p{M}+/gu;

const modeDefaults: Record<Exclude<GradingMode, "custom">, GradingNormalization> = {
  strict: {
    caseSensitive: true,
    punctuationSensitive: true,
    accentSensitive: true,
  },
  moderate: {
    caseSensitive: false,
    punctuationSensitive: false,
    accentSensitive: true,
  },
  relaxed: {
    caseSensitive: false,
    punctuationSensitive: false,
    accentSensitive: false,
  },
};

export function resolveNormalization(profile: GradingProfile): GradingNormalization {
  const defaults = profile.mode === "custom" ? modeDefaults.moderate : modeDefaults[profile.mode];

  return {
    caseSensitive: profile.normalization?.caseSensitive ?? defaults.caseSensitive,
    punctuationSensitive:
      profile.normalization?.punctuationSensitive ?? defaults.punctuationSensitive,
    accentSensitive: profile.normalization?.accentSensitive ?? defaults.accentSensitive,
  };
}

export function normalizeAnswer(value: string, options: GradingNormalization): string {
  let normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!options.accentSensitive) {
    normalized = normalized.normalize("NFKD").replace(combiningMarks, "");
  }
  if (!options.punctuationSensitive) normalized = normalized.replace(punctuation, " ");
  normalized = normalized.trim().replace(/\s+/gu, " ");
  if (!options.caseSensitive) normalized = normalized.toLocaleLowerCase("und");
  return normalized;
}

export function normalizedTokens(value: string): readonly string[] {
  return value.split(/\s+/u).filter(Boolean);
}
