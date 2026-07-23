"use client";

import { Button, Tabs } from "@lumen/ui";
import { useMemo, useState } from "react";

import type { StudyStatistics } from "@/lib/study/models";

function duration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function percent(value: number | null): string {
  return value === null ? "Not enough data" : `${Math.round(value * 100)}%`;
}

function DistributionChart({
  label,
  rows,
}: {
  readonly label: string;
  readonly rows: readonly { readonly count: number; readonly label: string }[];
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="stats-distribution">
      <div aria-label={label} className="stats-chart" role="img">
        {rows.map((row) => (
          <div className="stats-chart__item" key={row.label}>
            <span className="stats-chart__value">{row.count}</span>
            <span aria-hidden="true" className="stats-chart__track">
              <span style={{ height: `${Math.max(4, (row.count / maximum) * 100)}%` }} />
            </span>
            <span className="stats-chart__label">{row.label}</span>
          </div>
        ))}
      </div>
      <details className="stats-data-table">
        <summary>View as table</summary>
        <table className="stats-table">
          <caption>{label}</caption>
          <thead>
            <tr>
              <th>Group</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function StatisticsDashboard({ stats }: { readonly stats: StudyStatistics }) {
  const [range, setRange] = useState<"7" | "30" | "90" | "all">("30");
  const [deckId, setDeckId] = useState("all");
  const anchorDate = useMemo(() => {
    const dates = [
      ...stats.heatmap.map((day) => new Date(`${day.day}T23:59:59Z`).valueOf()),
      ...stats.timeline.map((review) => new Date(review.reviewedAt).valueOf()),
    ].filter(Number.isFinite);
    return Math.max(0, ...dates);
  }, [stats.heatmap, stats.timeline]);
  const cutoff = range === "all" ? 0 : anchorDate - Number(range) * 86_400_000;
  const filteredTimeline = stats.timeline.filter(
    (review) =>
      new Date(review.reviewedAt).valueOf() >= cutoff &&
      (deckId === "all" || review.deckId === deckId),
  );
  const filteredHeatmap =
    deckId === "all"
      ? stats.heatmap.filter((day) => new Date(`${day.day}T23:59:59Z`).valueOf() >= cutoff)
      : Object.values(
          filteredTimeline.reduce<
            Record<string, { count: number; day: string; durationMs: number }>
          >((days, review) => {
            const day = review.reviewedAt.slice(0, 10);
            const current = days[day] ?? { count: 0, day, durationMs: 0 };
            days[day] = { ...current, count: current.count + 1 };
            return days;
          }, {}),
        ).sort((left, right) => right.day.localeCompare(left.day));
  const stateRows = Object.entries(stats.cardsByState).map(([label, count]) => ({
    count,
    label: label === "relearning" ? "Relearning" : label.charAt(0).toUpperCase() + label.slice(1),
  }));
  const ratingRows = Object.entries(stats.ratingCounts).map(([label, count]) => ({
    count,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }));
  const sparse = stats.reviewCount < 5;

  if (stats.reviewCount === 0) {
    return (
      <div className="stats-dashboard stats-dashboard--empty" data-guide-id="statistics-overview">
        <header className="study-page-header">
          <div>
            <p className="eyebrow">Private statistics</p>
            <h1>Your review picture</h1>
            <p>Your learning history stays private to this learner profile.</p>
          </div>
        </header>
        <section className="stats-zero-state">
          <span aria-hidden="true" className="stats-zero-state__mark">
            ↗
          </span>
          <h2>Your first review will start the picture</h2>
          <p>
            After you rate cards, this page will show activity, recall patterns, upcoming work, and
            memory estimates. Practice-only sessions are intentionally excluded.
          </p>
          <a className="button" href="/app/study">
            Start studying
          </a>
        </section>
      </div>
    );
  }

  const overview = (
    <div className="stats-tab-panel">
      <dl className="stats-summary">
        <div>
          <dt>Due now</dt>
          <dd>{stats.dueToday}</dd>
        </div>
        <div>
          <dt>Reviews</dt>
          <dd>{stats.reviewCount}</dd>
        </div>
        <div>
          <dt>Study time</dt>
          <dd>{duration(stats.reviewTimeMs)}</dd>
        </div>
        <div>
          <dt>Recalled</dt>
          <dd>{percent(stats.recallRate)}</dd>
        </div>
      </dl>
      <p className="stats-explainer">
        Recalled means rated Hard, Good, or Easy. It is a study trend, not an exam score.
      </p>
      <div className="stats-feature-grid">
        <section>
          <div className="stats-section-heading">
            <h2>Recall ratings</h2>
            <p>How you rated canonical reviews</p>
          </div>
          <DistributionChart label="Canonical reviews by recall rating" rows={ratingRows} />
        </section>
        <section>
          <div className="stats-section-heading">
            <h2>Cards right now</h2>
            <p>Where cards are in the learning cycle</p>
          </div>
          <DistributionChart label="Cards by learning state" rows={stateRows} />
        </section>
      </div>
      {!sparse && stats.forecast.length > 0 && (
        <section className="stats-forecast">
          <div className="stats-section-heading">
            <h2>Next 14 days</h2>
            <p>Cards currently expected each day; future ratings can move them.</p>
          </div>
          <DistributionChart
            label="Forecasted cards by due date"
            rows={stats.forecast.map((row) => ({ count: row.count, label: row.day }))}
          />
        </section>
      )}
      {sparse && (
        <p className="stats-sparse-note">
          A few more reviews will unlock forecasts, answer-time patterns, and memory estimates.
        </p>
      )}
    </div>
  );

  const activity = (
    <div className="stats-tab-panel">
      <section>
        <div className="stats-section-heading">
          <h2>Review activity</h2>
          <p>{filteredTimeline.length} reviews match the activity filters.</p>
        </div>
        {filteredHeatmap.length > 0 ? (
          <div aria-label="Daily canonical review activity" className="stats-heatmap" role="img">
            {filteredHeatmap
              .slice(0, 90)
              .reverse()
              .map((day) => (
                <span
                  aria-label={`${day.day}: ${day.count} reviews${deckId === "all" ? `, ${duration(day.durationMs)}` : ""}`}
                  key={day.day}
                  style={{ "--activity": Math.min(1, day.count / 20) } as React.CSSProperties}
                  title={`${day.day}: ${day.count} reviews`}
                />
              ))}
          </div>
        ) : (
          <p>No activity matches this date range.</p>
        )}
      </section>
      <details className="stats-history">
        <summary>Recent review timeline</summary>
        {filteredTimeline.length > 0 ? (
          <ol className="stats-timeline">
            {filteredTimeline.slice(0, 50).map((review) => (
              <li key={`${review.cardId}:${review.reviewedAt}`}>
                <span>
                  <strong>{review.label}</strong>
                  <small>{review.rating}</small>
                </span>
                <time dateTime={review.reviewedAt}>
                  {new Date(review.reviewedAt).toLocaleString()}
                </time>
                {review.noteId ? (
                  <a href={`/app/decks/${review.deckId}/edit?note=${review.noteId}`}>Edit card</a>
                ) : (
                  <a href={`/app/decks/${review.deckId}`}>Open deck</a>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p>No reviews match these filters.</p>
        )}
      </details>
    </div>
  );

  const memory = (
    <div className="stats-tab-panel">
      <section className="stats-memory" aria-labelledby="memory-heading">
        <div className="stats-section-heading">
          <h2 id="memory-heading">Memory estimates</h2>
          <p>Rounded FSRS estimates from reviewed cards, not guarantees about any answer.</p>
        </div>
        <dl>
          <div>
            <dt>Estimated recall now</dt>
            <dd>{percent(stats.meanRetrievability)}</dd>
          </div>
          <div>
            <dt>Typical memory strength</dt>
            <dd>{stats.meanStability === null ? "—" : `${stats.meanStability.toFixed(1)} days`}</dd>
          </div>
          <div>
            <dt>Typical difficulty</dt>
            <dd>
              {stats.meanDifficulty === null ? "—" : `${stats.meanDifficulty.toFixed(1)} / 10`}
            </dd>
          </div>
          <div>
            <dt>Forgotten / difficult</dt>
            <dd>
              {stats.lapses} / {stats.leeches}
            </dd>
          </div>
          <div>
            <dt>Mature / young / new</dt>
            <dd>
              {stats.mature} / {stats.young} / {stats.newCards}
            </dd>
          </div>
        </dl>
      </section>
      <div className="stats-feature-grid">
        <section>
          <h2>Current intervals</h2>
          <DistributionChart
            label="Current scheduled interval distribution"
            rows={stats.intervalBuckets}
          />
        </section>
        <section>
          <h2>Answer time</h2>
          <DistributionChart
            label="Review answer-time distribution"
            rows={stats.answerTimeBuckets}
          />
        </section>
        <section>
          <h2>Memory strength</h2>
          <DistributionChart
            label="Current FSRS stability distribution"
            rows={stats.stabilityBuckets}
          />
        </section>
        <section>
          <h2>Card difficulty</h2>
          <DistributionChart
            label="Current FSRS difficulty distribution"
            rows={stats.difficultyBuckets}
          />
        </section>
      </div>
    </div>
  );

  const decks = (
    <div className="stats-tab-panel">
      <section>
        <div className="stats-section-heading">
          <h2>Deck activity</h2>
          <p>Canonical reviews and time by deck</p>
        </div>
        <table className="stats-table">
          <caption>Reviews and time by deck</caption>
          <thead>
            <tr>
              <th>Deck</th>
              <th>Reviews</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {stats.deckBreakdown.map((deck) => (
              <tr key={deck.deckId}>
                <th scope="row">
                  <a href={`/app/decks/${deck.deckId}`}>{deck.name}</a>
                </th>
                <td>{deck.reviews}</td>
                <td>{duration(deck.timeMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {stats.tagBreakdown.length > 0 && (
        <section>
          <div className="stats-section-heading">
            <h2>Tags</h2>
            <p>Activity grouped by the note’s current tags</p>
          </div>
          <table className="stats-table">
            <caption>Reviews and time by current note tag</caption>
            <thead>
              <tr>
                <th>Tag</th>
                <th>Reviews</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {stats.tagBreakdown.map((tag) => (
                <tr key={tag.name}>
                  <th scope="row">{tag.name}</th>
                  <td>{tag.reviews}</td>
                  <td>{duration(tag.timeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );

  return (
    <div className="stats-dashboard" data-guide-id="statistics-overview">
      <header className="study-page-header">
        <div>
          <p className="eyebrow">Private statistics</p>
          <h1>Your review picture</h1>
          <p>Canonical review history for this learner profile. Practice sessions stay separate.</p>
        </div>
        <a className="button" href="/app/study">
          Study now
        </a>
      </header>
      <div className="stats-filter-bar" aria-label="Activity filters">
        <label>
          Date range
          <select onChange={(event) => setRange(event.target.value as typeof range)} value={range}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All activity</option>
          </select>
        </label>
        <label>
          Deck
          <select onChange={(event) => setDeckId(event.target.value)} value={deckId}>
            <option value="all">All decks</option>
            {stats.deckBreakdown.map((deck) => (
              <option key={deck.deckId} value={deck.deckId}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>
        {(range !== "30" || deckId !== "all") && (
          <Button
            onClick={() => {
              setRange("30");
              setDeckId("all");
            }}
            size="sm"
            variant="ghost"
          >
            Clear filters
          </Button>
        )}
        <span>
          Activity: {range === "all" ? "all dates" : `last ${range} days`} ·{" "}
          {deckId === "all" ? "all decks" : "one deck"}
        </span>
      </div>
      <Tabs
        className="stats-tabs"
        defaultValue="overview"
        items={[
          { content: overview, label: "Overview", value: "overview" },
          { content: activity, label: "Activity", value: "activity" },
          ...(!sparse ? [{ content: memory, label: "Memory", value: "memory" }] : []),
          ...(stats.deckBreakdown.length > 0
            ? [{ content: decks, label: "Decks", value: "decks" }]
            : []),
        ]}
        label="Statistics views"
      />
    </div>
  );
}
