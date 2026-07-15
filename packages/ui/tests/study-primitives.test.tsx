import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CardFlip,
  DataTableSortButton,
  ScoreDisplay,
  StreakDisplay,
  TimerProgress,
  formatDuration,
} from "../src";

describe("study and game primitives", () => {
  afterEach(() => {
    delete document.documentElement.dataset.motion;
    delete document.documentElement.dataset.seriousMode;
  });

  it("flips a card using native keyboard button behavior", async () => {
    const user = userEvent.setup();
    function CardExample() {
      const [flipped, setFlipped] = useState(false);
      return (
        <CardFlip
          front="What is retrieval practice?"
          back="Recalling knowledge without looking."
          flipped={flipped}
          onFlippedChange={setFlipped}
        />
      );
    }
    render(<CardExample />);

    const card = screen.getByRole("button", { name: /prompt side/i });
    card.focus();
    await user.keyboard(" ");
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveAccessibleName(/answer side/i);
    expect(
      screen.getByText("Recalling knowledge without looking.").closest("[aria-hidden]"),
    ).toHaveAttribute("aria-hidden", "false");
  });

  it("reports timer progress with text and patterns in addition to color", () => {
    render(<TimerProgress elapsedMs={45_000} totalMs={60_000} />);
    expect(screen.getByRole("timer")).toHaveTextContent("0:15");
    expect(screen.getByRole("progressbar", { name: "Time remaining" })).toHaveAttribute(
      "aria-valuetext",
      "0:15 remaining, 25 percent",
    );
    expect(screen.getByText("25% of the time remains")).toBeVisible();
  });

  it("uses a single static face for an explicit reduced-motion preference", () => {
    document.documentElement.dataset.motion = "reduce";
    render(
      <CardFlip
        front="What is retrieval practice?"
        back="Recalling knowledge without looking."
        flipped
        onFlippedChange={vi.fn()}
      />,
    );

    const frontFace = screen.getByText("What is retrieval practice?").closest("[aria-hidden]");
    const backFace = screen
      .getByText("Recalling knowledge without looking.")
      .closest("[aria-hidden]");
    expect(frontFace).toHaveAttribute("hidden");
    expect(backFace).not.toHaveAttribute("hidden");
    expect(frontFace?.parentElement).toHaveAttribute("data-motion-mode", "reduced");
  });

  it("announces score and streak values independently", () => {
    render(
      <>
        <ScoreDisplay value={1250} delta={100} />
        <StreakDisplay count={4} personalBest />
      </>,
    );
    expect(
      screen.getByRole("status", { name: /correct answer streak: 4 answers, personal best/i }),
    ).toBeVisible();
    expect(screen.getByLabelText("Score: 1,250")).toBeVisible();
    expect(screen.getByText("increased by")).toHaveClass("sr-only");
  });

  it("gives sortable columns a complete accessible action label", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DataTableSortButton label="Accuracy" direction="ascending" onClick={onClick} />);
    await user.click(
      screen.getByRole("button", { name: /accuracy, sorted ascending.*sort descending/i }),
    );
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("formats durations without negative values", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(-1)).toBe("0:00");
  });
});
