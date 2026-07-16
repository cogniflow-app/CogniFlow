export type ColorPreference = "light" | "dark" | "system";

export interface AppearancePreferences {
  readonly color: ColorPreference;
  readonly reduceMotion: boolean;
  readonly seriousMode: boolean;
}

interface ActiveAppearanceInput {
  readonly learner: {
    readonly kind: "child" | "school_managed" | "self";
    readonly settings: Readonly<Record<string, unknown>>;
  };
  readonly profile: {
    readonly reducedMotion: boolean;
    readonly seriousMode: boolean;
    readonly theme: ColorPreference;
  };
}

function readColor(value: unknown): ColorPreference {
  return value === "dark" || value === "light" ? value : "system";
}

/**
 * Resolves the preference owner at the learner boundary. A self session uses
 * account preferences; a managed session uses only its learner settings and
 * fails closed to a low-stimulation experience when settings are absent.
 */
export function resolveActiveAppearancePreferences(
  input: ActiveAppearanceInput,
): AppearancePreferences {
  if (input.learner.kind === "self") {
    return {
      color: input.profile.theme,
      reduceMotion: input.profile.reducedMotion,
      seriousMode: input.profile.seriousMode,
    };
  }

  return {
    color: readColor(input.learner.settings.theme),
    reduceMotion: input.learner.settings.reduced_motion !== false,
    seriousMode: input.learner.settings.serious_mode !== false,
  };
}
