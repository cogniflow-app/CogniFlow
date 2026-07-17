import {
  APPEARANCE_ACCOUNT_WRITE_MAX_AGE_MS,
  APPEARANCE_STORAGE_KEY,
  type AppearancePreferences,
} from "./appearance";

/**
 * Produces the parser-executed account projection used by the protected server
 * layout. Keep this helper server-safe: the client synchronizer must never
 * render a script element during hydration or a client transition.
 */
export function createAccountAppearanceBootstrapScript(preferences: AppearancePreferences): string {
  const projection = JSON.stringify(preferences).replaceAll("<", "\\u003c");
  return `
(() => {
  try {
    const projection = ${projection};
    const raw = JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)}) || "null");
    const valid = raw && ["light", "dark", "system"].includes(raw.color) && typeof raw.reduceMotion === "boolean" && typeof raw.seriousMode === "boolean";
    const write = valid && raw.accountWrite;
    const freshWrite = write && typeof write.id === "string" && typeof write.requestedAt === "number" && ["pending", "confirmed"].includes(write.status) && Date.now() - write.requestedAt <= ${APPEARANCE_ACCOUNT_WRITE_MAX_AGE_MS};
    const differs = valid && (raw.color !== projection.color || raw.reduceMotion !== projection.reduceMotion || raw.seriousMode !== projection.seriousMode);
    const chosen = freshWrite && differs ? raw : projection;
    const dark = chosen.color === "dark" || (chosen.color === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const reduced = chosen.reduceMotion || chosen.seriousMode || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.colorPreference = chosen.color;
    root.dataset.motion = reduced ? "reduce" : "full";
    root.dataset.seriousMode = String(chosen.seriousMode);
    if (chosen === projection) localStorage.setItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)}, JSON.stringify(projection));
  } catch {}
})();`;
}
