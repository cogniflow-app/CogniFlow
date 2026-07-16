"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { AppearancePreferences, ColorPreference } from "@/lib/appearance";

export type { AppearancePreferences, ColorPreference } from "@/lib/appearance";

interface AppearanceContextValue extends AppearancePreferences {
  setColor: (color: ColorPreference) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setSeriousMode: (seriousMode: boolean) => void;
}

const STORAGE_KEY = "lumen:appearance:v1";
const SYNC_EVENT = "lumen:appearance-sync";
const defaults: AppearancePreferences = {
  color: "system",
  reduceMotion: false,
  seriousMode: false,
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function isColorPreference(value: unknown): value is ColorPreference {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredPreferences(): AppearancePreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaults };

    const candidate = parsed as Partial<AppearancePreferences>;
    return {
      color: isColorPreference(candidate.color) ? candidate.color : defaults.color,
      reduceMotion:
        typeof candidate.reduceMotion === "boolean"
          ? candidate.reduceMotion
          : defaults.reduceMotion,
      seriousMode:
        typeof candidate.seriousMode === "boolean" ? candidate.seriousMode : defaults.seriousMode,
    };
  } catch {
    return { ...defaults };
  }
}

function isAppearancePreferences(value: unknown): value is AppearancePreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppearancePreferences>;
  return (
    isColorPreference(candidate.color) &&
    typeof candidate.reduceMotion === "boolean" &&
    typeof candidate.seriousMode === "boolean"
  );
}

export function applyAppearancePreferences(preferences: AppearancePreferences) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const systemReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resolvedColor =
    preferences.color === "system" ? (systemDark ? "dark" : "light") : preferences.color;
  const root = document.documentElement;

  const resolvedMotion =
    preferences.reduceMotion || systemReduced || preferences.seriousMode ? "reduce" : "full";
  const seriousMode = String(preferences.seriousMode);
  const colorChanged = root.dataset.theme !== resolvedColor;

  if (colorChanged) {
    root.dataset.themeChanging = "true";
    root.dataset.theme = resolvedColor;
  }
  if (root.dataset.colorPreference !== preferences.color) {
    root.dataset.colorPreference = preferences.color;
  }
  if (root.dataset.motion !== resolvedMotion) root.dataset.motion = resolvedMotion;
  if (root.dataset.seriousMode !== seriousMode) root.dataset.seriousMode = seriousMode;

  if (colorChanged) {
    // Commit the new semantic colors while transitions are disabled. Otherwise
    // foreground/background pairs can briefly cross a low-contrast midpoint.
    void root.offsetWidth;
    delete root.dataset.themeChanging;
  }
}

function preferencesMatch(left: AppearancePreferences, right: AppearancePreferences): boolean {
  return (
    left.color === right.color &&
    left.reduceMotion === right.reduceMotion &&
    left.seriousMode === right.seriousMode
  );
}

/**
 * Applies a trusted preference projection and keeps the global provider in
 * sync. Signed-in server projections and successful settings mutations use
 * this path so browser-local state cannot override the active learner.
 */
export function synchronizeAppearancePreferences(preferences: AppearancePreferences): void {
  applyAppearancePreferences(preferences);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: preferences }));
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(defaults);
  const skipInitialPreferenceCommit = useRef(true);

  useEffect(() => {
    const synchronize = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (!isAppearancePreferences(next)) return;
      setPreferences((current) => (preferencesMatch(current, next) ? current : next));
    };
    window.addEventListener(SYNC_EVENT, synchronize);
    const restore = window.setTimeout(() => setPreferences(readStoredPreferences()), 0);
    return () => {
      window.clearTimeout(restore);
      window.removeEventListener(SYNC_EVENT, synchronize);
    };
  }, []);

  useEffect(() => {
    if (skipInitialPreferenceCommit.current) {
      skipInitialPreferenceCommit.current = false;
      return;
    }

    synchronizeAppearancePreferences(preferences);

    const colorQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reapply = () => applyAppearancePreferences(preferences);
    colorQuery.addEventListener("change", reapply);
    motionQuery.addEventListener("change", reapply);
    return () => {
      colorQuery.removeEventListener("change", reapply);
      motionQuery.removeEventListener("change", reapply);
    };
  }, [preferences]);

  const setColor = useCallback((color: ColorPreference) => {
    setPreferences((current) => ({ ...current, color }));
  }, []);
  const setReduceMotion = useCallback((reduceMotion: boolean) => {
    setPreferences((current) => ({ ...current, reduceMotion }));
  }, []);
  const setSeriousMode = useCallback((seriousMode: boolean) => {
    setPreferences((current) => ({ ...current, seriousMode }));
  }, []);

  const value = useMemo(
    () => ({ ...preferences, setColor, setReduceMotion, setSeriousMode }),
    [preferences, setColor, setReduceMotion, setSeriousMode],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used within AppearanceProvider.");
  return value;
}
