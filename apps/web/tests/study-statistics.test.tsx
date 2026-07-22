import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatisticsDashboard } from "../components/study/statistics-dashboard";
import type { StudyStatistics } from "../lib/study/models";

const empty: StudyStatistics = {
  answerTimeBuckets: [],
  cardsByState: { learning: 0, new: 0, relearning: 0, review: 0 },
  deckBreakdown: [],
  difficultyBuckets: [],
  dueToday: 0,
  forecast: [],
  heatmap: [],
  intervalBuckets: [],
  lapses: 0,
  leeches: 0,
  mature: 0,
  meanDifficulty: null,
  meanRetrievability: null,
  meanStability: null,
  newCards: 0,
  ratingCounts: { again: 0, easy: 0, good: 0, hard: 0 },
  recentDailyAverage: 0,
  recallRate: null,
  reviewCount: 0,
  reviewTimeMs: 0,
  stabilityBuckets: [],
  tagBreakdown: [],
  timeline: [],
  young: 0,
};

describe("private study statistics", () => {
  it("renders truthful empty alternatives without sample history", () => {
    render(<StatisticsDashboard stats={empty} />);

    expect(screen.getAllByText("Not enough data")).toHaveLength(2);
    expect(screen.getByText("No reviews yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Your calendar will fill in after the first canonical review."),
    ).toBeVisible();
  });

  it("provides accessible tables and a per-card canonical timeline", () => {
    render(
      <StatisticsDashboard
        stats={{
          ...empty,
          answerTimeBuckets: [{ count: 1, label: "Under 3s" }],
          cardsByState: { learning: 1, new: 2, relearning: 0, review: 3 },
          deckBreakdown: [{ deckId: "deck-1", name: "Biology", reviews: 1, timeMs: 2_000 }],
          dueToday: 2,
          forecast: [{ count: 2, day: "2026-07-22" }],
          heatmap: [{ count: 1, day: "2026-07-21", durationMs: 2_000 }],
          ratingCounts: { again: 0, easy: 0, good: 1, hard: 0 },
          recallRate: 1,
          reviewCount: 1,
          reviewTimeMs: 2_000,
          tagBreakdown: [{ name: "cell", reviews: 1, timeMs: 2_000 }],
          timeline: [
            {
              cardId: "card-1",
              deckId: "deck-1",
              label: "Cell energy",
              noteId: "note-1",
              rating: "good",
              reviewedAt: "2026-07-21T20:00:00.000Z",
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("table", { name: "Cards in each scheduling state" })).toBeVisible();
    expect(
      screen.getByRole("table", { name: "Cards currently forecast by due day" }),
    ).toBeVisible();
    const history = screen.getByText("Recent review timeline").closest("details");
    if (!history) throw new Error("Review timeline is missing.");
    history.open = true;
    expect(within(history).getByText(/Cell energy · 1 recent review/u)).toBeVisible();
    expect(within(history).getByRole("link", { name: "edit card" })).toHaveAttribute(
      "href",
      "/app/decks/deck-1/edit?note=note-1",
    );
  });
});
