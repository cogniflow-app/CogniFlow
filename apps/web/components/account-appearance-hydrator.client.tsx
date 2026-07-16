"use client";

import { useEffect } from "react";

import type { AppearancePreferences } from "@/lib/appearance";

import { synchronizeAppearancePreferences } from "./appearance-provider.client";

export function AccountAppearanceHydrator({
  preferences,
}: {
  readonly preferences: AppearancePreferences;
}) {
  const { color, reduceMotion, seriousMode } = preferences;
  useEffect(() => {
    synchronizeAppearancePreferences({ color, reduceMotion, seriousMode });
  }, [color, reduceMotion, seriousMode]);

  return null;
}
