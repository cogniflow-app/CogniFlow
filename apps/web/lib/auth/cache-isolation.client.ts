"use client";

import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance";

const privatePrefixes = ["lumen:learner:", "lumen:profile:", "lumen:private:"] as const;

function clearMatchingStorage(storage: Storage): void {
  const removals: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && privatePrefixes.some((prefix) => key.startsWith(prefix))) {
      removals.push(key);
    }
  }
  for (const key of removals) {
    storage.removeItem(key);
  }
}

function clearMatchingStorageBestEffort(readStorage: () => Storage): void {
  try {
    clearMatchingStorage(readStorage());
  } catch {
    // A denied or unavailable browser store must not block an identity boundary.
  }
}

async function clearMatchingCachesBestEffort(): Promise<void> {
  if (!("caches" in globalThis)) return;

  try {
    const names = await caches.keys();
    await Promise.allSettled(
      names
        .filter((name) => name.startsWith("lumen-private-") || name.startsWith("lumen-learner-"))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Cache discovery may be denied independently of Web Storage.
  }
}

export async function isolateBrowserLearnerContext(reason: string): Promise<void> {
  const pendingCleanup: Promise<unknown>[] = [];
  clearMatchingStorageBestEffort(() => window.localStorage);
  clearMatchingStorageBestEffort(() => window.sessionStorage);
  try {
    window.localStorage.removeItem(APPEARANCE_STORAGE_KEY);
  } catch {
    // Account appearance is private browser state and clears best effort.
  }
  await clearMatchingCachesBestEffort();
  try {
    window.dispatchEvent(
      new CustomEvent("lumen:identity-boundary", {
        detail: {
          reason,
          waitUntil(promise: Promise<unknown>) {
            pendingCleanup.push(promise);
          },
        },
      }),
    );
    await Promise.allSettled(pendingCleanup);
  } catch {
    // Navigation remains the final authority if an observer rejects the event.
  }
}

export function replaceWithActiveLearnerDocument(): void {
  window.location.replace("/app");
}
