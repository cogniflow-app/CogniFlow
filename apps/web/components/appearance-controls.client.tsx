"use client";

import { useRef, type KeyboardEvent } from "react";

import { useAppearance, type ColorPreference } from "./appearance-provider.client";

export function AppearanceControls({
  className = "appearance-panel",
  persistToAccount = false,
}: {
  readonly className?: string;
  readonly persistToAccount?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const { color, reduceMotion, seriousMode, setColor, setReduceMotion, setSeriousMode } =
    useAppearance();

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
      <summary>
        <span aria-hidden="true">◐</span>
        <span>Appearance</span>
      </summary>
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
    </details>
  );
}
