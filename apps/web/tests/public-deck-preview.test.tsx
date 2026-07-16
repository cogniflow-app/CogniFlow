import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  PublicDeckAttribution,
  PublicDeckPreview,
} from "../components/content/public-deck-preview.client";
import { publicDeck } from "./fixtures/content";

describe("public deck preview", () => {
  it("flips and traverses a frozen public projection without implying study progress", async () => {
    const user = userEvent.setup();
    render(<PublicDeckPreview deck={publicDeck} />);

    expect(screen.getAllByText("1 of 2")[0]).toBeVisible();
    const card = screen.getByRole("region", { name: "Prompt card preview" });
    expect(card).toHaveTextContent("What is ATP?");
    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
    expect(
      screen.getByText(/does not create learner progress, history, scheduling state/i),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByRole("region", { name: "Answer card preview" })).toHaveTextContent(
      "The cell's usable energy carrier",
    );

    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getAllByText("2 of 2")[0]).toBeVisible();
    expect(screen.getByRole("region", { name: /Prompt card preview/i })).toHaveTextContent(
      "Which organelle produces most ATP?",
    );
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("supports the documented keyboard flip and navigation controls", () => {
    render(<PublicDeckPreview deck={publicDeck} />);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(screen.getAllByText("2 of 2")[0]).toBeVisible();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
    expect(screen.getByRole("region", { name: /Answer card preview/i })).toHaveTextContent(
      "Mitochondrion",
    );
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })));
    expect(screen.getAllByText("1 of 2")[0]).toBeVisible();
    expect(screen.getByRole("region", { name: /Prompt card preview/i })).toHaveTextContent(
      "What is ATP?",
    );
  });

  it("does not hijack keyboard input or double-toggle nested interactive controls", async () => {
    const user = userEvent.setup();
    render(<PublicDeckPreview deck={publicDeck} />);

    await user.click(screen.getByRole("button", { name: /Next/i }));
    const answer = screen.getByRole("textbox", { name: "Typed answer preview" });
    answer.focus();
    fireEvent.keyDown(answer, { key: " " });
    fireEvent.keyDown(answer, { key: "Enter" });
    expect(screen.getByRole("region", { name: "Prompt card preview" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByRole("region", { name: "Answer card preview" })).toBeVisible();
  });

  it("shows creator attribution, license, public card types, and safe return-aware auth links", () => {
    render(<PublicDeckAttribution deck={publicDeck} />);

    expect(screen.getByRole("heading", { level: 2, name: "Ari Learner" })).toBeVisible();
    expect(screen.getByText("@ari_learns")).toBeVisible();
    expect(screen.getByText("CC BY")).toBeVisible();
    expect(screen.getByText("basic, typed answer")).toBeVisible();
    expect(screen.getByRole("link", { name: "Create your own deck" })).toHaveAttribute(
      "href",
      "/auth/sign-up?returnTo=%2Fdeck%2Fcell-energy",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in?returnTo=%2Fdeck%2Fcell-energy",
    );
    expect(screen.queryByText(publicDeck.publicId)).not.toBeInTheDocument();
  });

  it("handles a published deck with no cards as an honest empty preview", () => {
    render(
      <PublicDeckPreview
        deck={{ ...publicDeck, cardCount: 0, cards: [], supportedCardTypes: [] }}
      />,
    );

    expect(screen.getByText("No cards")).toBeVisible();
    expect(screen.getByText("This published deck has no cards.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });
});
