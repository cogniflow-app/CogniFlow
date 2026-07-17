"use client";

import { useServerInsertedHTML } from "next/navigation";
import { useLayoutEffect } from "react";

import { createAccountAppearanceBootstrapScript } from "@/lib/account-appearance-bootstrap";
import type { AppearancePreferences } from "@/lib/appearance";

import { reconcileAccountAppearancePreferences } from "./appearance-provider.client";

export function AccountAppearanceHydrator({
  preferences,
}: {
  readonly preferences: AppearancePreferences;
}) {
  const { color, reduceMotion, seriousMode } = preferences;
  useServerInsertedHTML(() => (
    <script
      data-lumen-account-appearance=""
      dangerouslySetInnerHTML={{
        __html: createAccountAppearanceBootstrapScript({ color, reduceMotion, seriousMode }),
      }}
    />
  ));
  useLayoutEffect(() => {
    reconcileAccountAppearancePreferences({ color, reduceMotion, seriousMode });
  }, [color, reduceMotion, seriousMode]);

  return null;
}
