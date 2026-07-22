import type { StudyStatistics } from "@/lib/study/models";

function duration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function percent(value: number | null): string {
  return value === null ? "Not enough data" : `${Math.round(value * 100)}%`;
}

function BarTable({
  caption,
  rows,
}: {
  readonly caption: string;
  readonly rows: readonly { readonly count: number; readonly label: string }[];
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <table className="stats-table">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>
              <span aria-hidden="true" className="stats-bar">
                <span style={{ width: `${String((row.count / maximum) * 100)}%` }} />
              </span>
            </td>
            <td>{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatisticsDashboard({ stats }: { readonly stats: StudyStatistics }) {
  const stateRows = Object.entries(stats.cardsByState).map(([label, count]) => ({
    count,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }));
  const ratingRows = Object.entries(stats.ratingCounts).map(([label, count]) => ({
    count,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  }));
  const timelineByCard = [...new Set(stats.timeline.map((review) => review.cardId))].map(
    (cardId) => ({
      cardId,
      reviews: stats.timeline.filter((review) => review.cardId === cardId),
    }),
  );
  return (
    <div className="stats-dashboard">
      <header className="study-page-header">
        <div>
          <p className="eyebrow">Private statistics</p>
          <h1>Your review picture</h1>
          <p>Based only on canonical review history for the active learner profile.</p>
        </div>
        <a className="button" href="/app/study">
          Study now
        </a>
      </header>
      <dl className="stats-summary">
        <div>
          <dt>Due now</dt>
          <dd>{stats.dueToday}</dd>
        </div>
        <div>
          <dt>Reviews recorded</dt>
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
        “Recalled” is the share rated Hard, Good, or Easy—not an exam score. Retrievability is a
        model estimate, not a measured probability for any one answer.
      </p>
      <div className="stats-grid">
        <section>
          <h2>Cards by state</h2>
          <BarTable caption="Cards in each scheduling state" rows={stateRows} />
        </section>
        <section>
          <h2>Rating history</h2>
          <BarTable caption="Canonical reviews by rating" rows={ratingRows} />
        </section>
        <section>
          <h2>Intervals</h2>
          <BarTable
            caption="Current scheduled interval distribution"
            rows={stats.intervalBuckets}
          />
        </section>
        <section>
          <h2>Answer time</h2>
          <BarTable caption="Review answer-time distribution" rows={stats.answerTimeBuckets} />
        </section>
        <section>
          <h2>Stability</h2>
          <BarTable caption="Current FSRS stability distribution" rows={stats.stabilityBuckets} />
        </section>
        <section>
          <h2>Difficulty</h2>
          <BarTable caption="Current FSRS difficulty distribution" rows={stats.difficultyBuckets} />
        </section>
      </div>
      <section className="stats-memory" aria-labelledby="memory-heading">
        <div>
          <h2 id="memory-heading">Memory estimates</h2>
          <p>Rounded summaries from reviewed FSRS cards.</p>
        </div>
        <dl>
          <div>
            <dt>Retrievability</dt>
            <dd>{percent(stats.meanRetrievability)}</dd>
          </div>
          <div>
            <dt>Stability</dt>
            <dd>{stats.meanStability === null ? "—" : `${stats.meanStability.toFixed(1)} days`}</dd>
          </div>
          <div>
            <dt>Difficulty</dt>
            <dd>
              {stats.meanDifficulty === null ? "—" : `${stats.meanDifficulty.toFixed(1)} / 10`}
            </dd>
          </div>
          <div>
            <dt>Lapses / leeches</dt>
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
      <p className="workload-estimate">
        <strong>Recent workload:</strong> about {stats.recentDailyAverage} canonical reviews per
        calendar day across the available history window. Retention changes can be modeled in
        Scheduling before saving.
      </p>
      <section aria-labelledby="forecast-heading">
        <h2 id="forecast-heading">14-day forecast</h2>
        {stats.forecast.length ? (
          <BarTable
            caption="Cards currently forecast by due day"
            rows={stats.forecast.map((row) => ({ count: row.count, label: row.day }))}
          />
        ) : (
          <p>No scheduled reviews fall in the next 14 days yet.</p>
        )}
      </section>
      <section aria-labelledby="tags-stats-heading">
        <h2 id="tags-stats-heading">Tag breakdown</h2>
        {stats.tagBreakdown.length ? (
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
        ) : (
          <p>No tagged review history yet.</p>
        )}
      </section>
      <section aria-labelledby="calendar-heading">
        <h2 id="calendar-heading">Review calendar</h2>
        {stats.heatmap.length ? (
          <table className="stats-table">
            <caption>Daily review activity, newest first</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reviews</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {stats.heatmap.slice(0, 90).map((day) => (
                <tr key={day.day}>
                  <th scope="row">{day.day}</th>
                  <td>{day.count}</td>
                  <td>{duration(day.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Your calendar will fill in after the first canonical review.</p>
        )}
      </section>
      <section aria-labelledby="decks-stats-heading">
        <h2 id="decks-stats-heading">Deck breakdown</h2>
        {stats.deckBreakdown.length ? (
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
        ) : (
          <p>No deck review history yet.</p>
        )}
      </section>
      <details className="stats-history">
        <summary>Recent review timeline</summary>
        {timelineByCard.length ? (
          <div className="stats-card-timelines">
            {timelineByCard.map(({ cardId, reviews }) => {
              const first = reviews[0];
              if (!first) return null;
              return (
                <details key={cardId}>
                  <summary>
                    {first.label} · {reviews.length} recent review
                    {reviews.length === 1 ? "" : "s"}
                  </summary>
                  <ol>
                    {reviews.map((review) => (
                      <li key={`${review.cardId}:${review.reviewedAt}`}>
                        <time dateTime={review.reviewedAt}>
                          {new Date(review.reviewedAt).toLocaleString()}
                        </time>{" "}
                        · {review.rating} ·{" "}
                        {review.noteId ? (
                          <a href={`/app/decks/${review.deckId}/edit?note=${review.noteId}`}>
                            edit card
                          </a>
                        ) : (
                          <a href={`/app/decks/${review.deckId}`}>open deck</a>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              );
            })}
          </div>
        ) : (
          <p>No reviews yet.</p>
        )}
      </details>
    </div>
  );
}
