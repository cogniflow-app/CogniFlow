"use client";

import { Button, Input } from "@lumen/ui";
import { useState } from "react";

interface ExamPlanDay {
  readonly estimatedMinutes: number;
  readonly focus: "learn" | "mixed" | "recall" | "light_review";
  readonly items: number;
  readonly studyDay: string;
}

interface ExamPlanResult {
  readonly daysAvailable: number;
  readonly days: readonly ExamPlanDay[];
  readonly feasible: boolean;
  readonly recommendedItemsPerDay: number;
  readonly totalEstimatedMinutes: number;
  readonly warning: string | null;
}

interface ApiResponse {
  readonly data?: { readonly plan?: ExamPlanResult };
  readonly message?: string;
}

export function ExamPlanner({
  currentDue,
  decks,
}: {
  readonly currentDue: number;
  readonly decks: readonly { readonly id: string; readonly name: string; readonly total: number }[];
}) {
  const [name, setName] = useState("Upcoming exam");
  const [examAt, setExamAt] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [includeWeekends, setIncludeWeekends] = useState(true);
  const [selectedDeckIds, setSelectedDeckIds] = useState<readonly string[]>([]);
  const [plan, setPlan] = useState<ExamPlanResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDeck(id: string) {
    setSelectedDeckIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function createPlan() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/practice/exam-plans", {
      body: JSON.stringify({
        ...(selectedDeckIds.length ? { deckIds: selectedDeckIds } : {}),
        examAt: new Date(examAt).toISOString(),
        examPlanId: crypto.randomUUID(),
        expectedVersion: 0,
        includeWeekends,
        minutesAvailablePerDay: minutes,
        name,
        status: "active",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json().catch(() => ({}))) as ApiResponse;
    if (!response.ok || !payload.data?.plan)
      setError(payload.message ?? "The plan could not be created.");
    else setPlan(payload.data.plan);
    setPending(false);
  }

  return (
    <main className="exam-planner" data-guide-id="exam-planner">
      <a className="practice-back-link" href="/app/study">
        ← Study
      </a>
      <header className="exam-planner__header">
        <p className="eyebrow">Exam planning</p>
        <h1>Turn an exam date into a daily practice plan</h1>
        <p>
          Lumen combines current mastery, cards in scope, and available time. This is a planning
          estimate—not a grade promise.
        </p>
      </header>
      <div className="exam-planner__layout">
        <section className="practice-setup-card" aria-labelledby="exam-details-heading">
          <h2 id="exam-details-heading">Plan assumptions</h2>
          <div className="practice-setup-fields">
            <label>
              <span>Plan name</span>
              <Input onChange={(event) => setName(event.target.value)} value={name} />
            </label>
            <label>
              <span>Exam date and time</span>
              <Input
                onChange={(event) => setExamAt(event.target.value)}
                type="datetime-local"
                value={examAt}
              />
            </label>
            <label>
              <span>Minutes available each day</span>
              <Input
                max={1440}
                min={5}
                onChange={(event) => setMinutes(Number(event.target.value))}
                type="number"
                value={minutes}
              />
            </label>
            <label className="practice-switch-row">
              <input
                checked={includeWeekends}
                onChange={(event) => setIncludeWeekends(event.target.checked)}
                type="checkbox"
              />
              <span>Include weekends</span>
            </label>
          </div>
          <fieldset className="exam-deck-scope">
            <legend>Decks (leave empty for all)</legend>
            {decks.map((deck) => (
              <label key={deck.id}>
                <input
                  checked={selectedDeckIds.includes(deck.id)}
                  onChange={() => toggleDeck(deck.id)}
                  type="checkbox"
                />
                <span>{deck.name}</span>
                <small>{deck.total}</small>
              </label>
            ))}
          </fieldset>
          <div className="exam-current-load">
            <span>Canonical reviews due now</span>
            <strong>{currentDue}</strong>
            <p>These due reviews remain distinct from extra exam practice.</p>
          </div>
          <Button
            disabled={pending || !name.trim() || !examAt || decks.length === 0}
            onClick={() => void createPlan()}
          >
            {pending ? "Calculating…" : "Create daily plan"}
          </Button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <section
          className="exam-plan-preview"
          aria-live="polite"
          aria-labelledby="exam-preview-heading"
        >
          <div>
            <p className="eyebrow">Adaptive recommendation</p>
            <h2 id="exam-preview-heading">
              {plan
                ? `${plan.recommendedItemsPerDay} items per study day`
                : "Your plan will appear here"}
            </h2>
          </div>
          {plan ? (
            <>
              <dl>
                <div>
                  <dt>Study days</dt>
                  <dd>{plan.daysAvailable}</dd>
                </div>
                <div>
                  <dt>Estimated total</dt>
                  <dd>{plan.totalEstimatedMinutes} min</dd>
                </div>
                <div>
                  <dt>Fits current time</dt>
                  <dd>{plan.feasible ? "Yes" : "Not yet"}</dd>
                </div>
              </dl>
              {plan.warning && <p className="exam-plan-warning">{plan.warning}</p>}
              <ol>
                {plan.days.slice(0, 10).map((day) => (
                  <li key={day.studyDay}>
                    <time dateTime={day.studyDay}>
                      {new Date(`${day.studyDay}T12:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </time>
                    <span>{day.focus.replaceAll("_", " ")}</span>
                    <strong>
                      {day.items} items · {day.estimatedMinutes} min
                    </strong>
                  </li>
                ))}
              </ol>
              {plan.days.length > 10 && (
                <p>
                  Plus {plan.days.length - 10} later study days; the plan recalculates as work is
                  completed.
                </p>
              )}
              <div className="exam-plan-actions">
                <a
                  className="button-link"
                  href={`/app/study/mode/learn${selectedDeckIds.length === 1 ? `?deck=${selectedDeckIds[0]}` : ""}`}
                >
                  Start today&apos;s practice
                </a>
                <a className="button-link button-link--secondary" href="/app/study">
                  Review due cards
                </a>
              </div>
            </>
          ) : (
            <div className="exam-plan-empty">
              <span aria-hidden="true">◎</span>
              <p>Choose a future date, your available minutes, and the material in scope.</p>
              <small>
                The planner favors weaker recall as the exam approaches and leaves SRS due work
                clearly separate.
              </small>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
