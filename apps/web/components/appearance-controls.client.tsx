"use client";

import { PaletteIcon } from "@lumen/ui";
import { useRef, type KeyboardEvent } from "react";

import { useAppearance, type ColorPreference } from "./appearance-provider.client";

export function AppearanceMenu({
  persistToAccount = false,
}: {
  readonly persistToAccount?: boolean;
}) {
  const { color, reduceMotion, seriousMode, setColor, setReduceMotion, setSeriousMode } =
    useAppearance();

  return (
    <div className="appearance-panel__menu">
      <label className="appearance-panel__row">
        <span>Color theme</span>
        <select
          aria-label="Color theme"
          value={color}
          onChange={(event) => setColor(event.target.value as ColorPreference, persistToAccount)}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label className="appearance-panel__row">
        <span>Reduce motion</span>
        <input
          checked={reduceMotion}
          onChange={(event) => setReduceMotion(event.target.checked, persistToAccount)}
          type="checkbox"
        />
      </label>
      <label className="appearance-panel__row">
        <span>Serious mode</span>
        <input
          checked={seriousMode}
          onChange={(event) => setSeriousMode(event.target.checked, persistToAccount)}
          type="checkbox"
        />
      </label>
    </div>
  );
}

export function AppearanceControls({
  className = "appearance-panel",
  persistToAccount = false,
}: {
  readonly className?: string;
  readonly persistToAccount?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !detailsRef.current?.open) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    detailsRef.current.open = false;
    detailsRef.current.querySelector("summary")?.focus();
  }

  return (
    <details ref={detailsRef} className={className} onKeyDown={handleKeyDown}>
      <summary aria-label="Appearance">
        <PaletteIcon aria-hidden="true" className="size-5" />
        <span>Appearance</span>
      </summary>
      <AppearanceMenu persistToAccount={persistToAccount} />
    </details>
  );
}
