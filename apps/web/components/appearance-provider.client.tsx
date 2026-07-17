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

import {
  APPEARANCE_ACCOUNT_WRITE_MAX_AGE_MS,
  APPEARANCE_STORAGE_KEY,
  type AppearancePreferences,
  type ColorPreference,
} from "@/lib/appearance";

export type { AppearancePreferences, ColorPreference } from "@/lib/appearance";

interface AppearanceContextValue extends AppearancePreferences {
  setColor: (color: ColorPreference, persistToAccount?: boolean) => void;
  setReduceMotion: (reduceMotion: boolean, persistToAccount?: boolean) => void;
  setSeriousMode: (seriousMode: boolean, persistToAccount?: boolean) => void;
}

interface AccountAppearanceWrite {
  readonly id: string;
  readonly requestedAt: number;
  readonly status: "confirmed" | "pending";
}

interface StoredAppearanceState extends AppearancePreferences {
  readonly accountWrite?: AccountAppearanceWrite;
}

type AccountPersistenceOutcome = "confirmed" | "obsolete" | "rejected" | "retry";

const SYNC_EVENT = "lumen:appearance-sync";
const defaults: AppearancePreferences = {
  color: "system",
  reduceMotion: false,
  seriousMode: false,
};
let fallbackWriteSequence = 0;
let accountPersistenceQueue: Promise<unknown> = Promise.resolve();

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function isColorPreference(value: unknown): value is ColorPreference {
  return value === "light" || value === "dark" || value === "system";
}

function isAccountAppearanceWrite(value: unknown): value is AccountAppearanceWrite {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AccountAppearanceWrite>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.requestedAt === "number" &&
    Number.isFinite(candidate.requestedAt) &&
    (candidate.status === "confirmed" || candidate.status === "pending")
  );
}

function parseStoredAppearanceState(value: unknown): StoredAppearanceState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredAppearanceState>;
  if (
    !isColorPreference(candidate.color) ||
    typeof candidate.reduceMotion !== "boolean" ||
    typeof candidate.seriousMode !== "boolean"
  ) {
    return null;
  }
  return {
    color: candidate.color,
    reduceMotion: candidate.reduceMotion,
    seriousMode: candidate.seriousMode,
    ...(isAccountAppearanceWrite(candidate.accountWrite)
      ? { accountWrite: candidate.accountWrite }
      : {}),
  };
}

function parseStoredAppearanceJson(raw: string | null): StoredAppearanceState | null {
  if (!raw) return null;
  try {
    return parseStoredAppearanceState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function readStoredAppearanceState(): StoredAppearanceState {
  try {
    return (
      parseStoredAppearanceJson(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)) ?? {
        ...defaults,
      }
    );
  } catch {
    return { ...defaults };
  }
}

function preferencesFrom(state: StoredAppearanceState): AppearancePreferences {
  return {
    color: state.color,
    reduceMotion: state.reduceMotion,
    seriousMode: state.seriousMode,
  };
}

function preferencesMatch(left: AppearancePreferences, right: AppearancePreferences): boolean {
  return (
    left.color === right.color &&
    left.reduceMotion === right.reduceMotion &&
    left.seriousMode === right.seriousMode
  );
}

function writeStoredAppearanceState(state: StoredAppearanceState): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Applying a preference must continue when storage is denied.
  }
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: state }));
}

export function applyAppearancePreferences(preferences: AppearancePreferences): void {
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
    void root.offsetWidth;
    delete root.dataset.themeChanging;
  }
}

function publishStoredAppearanceState(state: StoredAppearanceState): void {
  applyAppearancePreferences(preferencesFrom(state));
  writeStoredAppearanceState(state);
}

/** Applies a trusted account projection and removes obsolete browser write metadata. */
export function synchronizeAppearancePreferences(preferences: AppearancePreferences): void {
  publishStoredAppearanceState(preferences);
}

function createAccountWrite(): AccountAppearanceWrite {
  fallbackWriteSequence += 1;
  return {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${fallbackWriteSequence}`,
    requestedAt: Date.now(),
    status: "pending",
  };
}

async function persistAccountAppearance(writeId: string): Promise<AccountPersistenceOutcome> {
  const current = readStoredAppearanceState();
  if (current.accountWrite?.id !== writeId) return "obsolete";
  if (current.accountWrite.status === "confirmed") return "confirmed";

  try {
    const response = await fetch("/api/settings/appearance", {
      body: JSON.stringify({
        reduceMotion: current.reduceMotion,
        seriousMode: current.seriousMode,
        theme: current.color,
      }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Lumen-CSRF": "1" },
      keepalive: true,
      method: "PATCH",
    });
    const latest = readStoredAppearanceState();
    if (latest.accountWrite?.id !== writeId) return "obsolete";

    if (response.ok) {
      publishStoredAppearanceState({
        ...preferencesFrom(latest),
        accountWrite: { ...latest.accountWrite, status: "confirmed" },
      });
      return "confirmed";
    }
    if ([400, 401, 403, 404, 422].includes(response.status)) {
      publishStoredAppearanceState(preferencesFrom(latest));
      return "rejected";
    }
    return "retry";
  } catch {
    return "retry";
  }
}

function queueAccountAppearancePersistence(writeId: string): Promise<AccountPersistenceOutcome> {
  const task = accountPersistenceQueue
    .catch(() => undefined)
    .then(() => persistAccountAppearance(writeId));
  accountPersistenceQueue = task;
  return task;
}

/**
 * Reconciles a protected-route projection before the interactive shell mounts.
 * A fresh pending/confirmed mutation is the sole temporary exception to server
 * precedence; it prevents an in-flight account write from being replaced by
 * the stale projection generated by the same navigation.
 */
export function reconcileAccountAppearancePreferences(projection: AppearancePreferences): void {
  const stored = readStoredAppearanceState();
  const write = stored.accountWrite;
  const writeIsFresh =
    write !== undefined && Date.now() - write.requestedAt <= APPEARANCE_ACCOUNT_WRITE_MAX_AGE_MS;

  if (writeIsFresh && !preferencesMatch(stored, projection)) {
    publishStoredAppearanceState(stored);
    if (write.status === "pending") {
      void queueAccountAppearancePersistence(write.id).then((outcome) => {
        if (outcome === "rejected") synchronizeAppearancePreferences(projection);
      });
    }
    return;
  }

  synchronizeAppearancePreferences(projection);
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(defaults);
  const preferencesRef = useRef<AppearancePreferences>(defaults);

  useEffect(() => {
    const adopt = (state: StoredAppearanceState) => {
      const next = preferencesFrom(state);
      preferencesRef.current = next;
      setPreferences((current) => (preferencesMatch(current, next) ? current : next));
      applyAppearancePreferences(next);
    };
    const synchronize = (event: Event) => {
      const next = parseStoredAppearanceState((event as CustomEvent<unknown>).detail);
      if (next) adopt(next);
    };
    const synchronizeStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY) return;
      adopt(parseStoredAppearanceJson(event.newValue) ?? { ...defaults });
    };
    const resetAtIdentityBoundary = () => {
      preferencesRef.current = defaults;
      setPreferences(defaults);
      applyAppearancePreferences(defaults);
    };
    const colorQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reapply = () => applyAppearancePreferences(preferencesRef.current);
    const retryPendingAccountWrite = () => {
      const pending = readStoredAppearanceState().accountWrite;
      if (pending?.status === "pending") void queueAccountAppearancePersistence(pending.id);
    };

    adopt(readStoredAppearanceState());
    retryPendingAccountWrite();
    window.addEventListener(SYNC_EVENT, synchronize);
    window.addEventListener("storage", synchronizeStorage);
    window.addEventListener("lumen:identity-boundary", resetAtIdentityBoundary);
    window.addEventListener("online", retryPendingAccountWrite);
    colorQuery.addEventListener("change", reapply);
    motionQuery.addEventListener("change", reapply);
    return () => {
      window.removeEventListener(SYNC_EVENT, synchronize);
      window.removeEventListener("storage", synchronizeStorage);
      window.removeEventListener("lumen:identity-boundary", resetAtIdentityBoundary);
      window.removeEventListener("online", retryPendingAccountWrite);
      colorQuery.removeEventListener("change", reapply);
      motionQuery.removeEventListener("change", reapply);
    };
  }, []);

  const commit = useCallback((next: AppearancePreferences, persistToAccount: boolean) => {
    preferencesRef.current = next;
    setPreferences(next);
    if (!persistToAccount) {
      publishStoredAppearanceState(next);
      return;
    }

    const accountWrite = createAccountWrite();
    publishStoredAppearanceState({ ...next, accountWrite });
    void queueAccountAppearancePersistence(accountWrite.id);
  }, []);

  const setColor = useCallback(
    (color: ColorPreference, persistToAccount = false) => {
      commit({ ...preferencesRef.current, color }, persistToAccount);
    },
    [commit],
  );
  const setReduceMotion = useCallback(
    (reduceMotion: boolean, persistToAccount = false) => {
      commit({ ...preferencesRef.current, reduceMotion }, persistToAccount);
    },
    [commit],
  );
  const setSeriousMode = useCallback(
    (seriousMode: boolean, persistToAccount = false) => {
      commit({ ...preferencesRef.current, seriousMode }, persistToAccount);
    },
    [commit],
  );

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
