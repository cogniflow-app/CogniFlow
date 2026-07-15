"use client";

import { useAppearance, type ColorPreference } from "./appearance-provider.client";

export function AppearanceControls() {
  const { color, reduceMotion, seriousMode, setColor, setReduceMotion, setSeriousMode } =
    useAppearance();

  return (
    <details className="appearance-panel">
      <summary aria-label="Open appearance preferences">
        <span aria-hidden="true">◐</span>
        <span>Appearance</span>
      </summary>
      <div className="appearance-panel__menu">
        <label className="appearance-panel__row">
          <span>Color theme</span>
          <select
            aria-label="Color theme"
            value={color}
            onChange={(event) => setColor(event.target.value as ColorPreference)}
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
            onChange={(event) => setReduceMotion(event.target.checked)}
            type="checkbox"
          />
        </label>
        <label className="appearance-panel__row">
          <span>Serious mode</span>
          <input
            checked={seriousMode}
            onChange={(event) => setSeriousMode(event.target.checked)}
            type="checkbox"
          />
        </label>
      </div>
    </details>
  );
}
